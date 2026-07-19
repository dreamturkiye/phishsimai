// PS-AUTONOMY-BRIDGE-01 — the ONLY legitimate writer of os_autonomy_state.
//
// The l4 incident exposed the gap: cleanDays.ts computes a ladder level but never writes the
// enforcement table, so the only thing that ever moved the level was a hand-write. This module
// closes it: it reads the ladder's real criteria (a fresh 5-clean-day cycle) + the breaker, and
// promotes ONE rung per earned cycle by writing an autonomy_grants token THEN the level change.
// The 0009 guard trigger honours a raise only when that token exists — a hand-write with no token
// stays blocked. Demotion (breaker trip) routes through the same audited path, symmetric.
//
// L1 == enforcement 'manual' (the floor Kaan starts from). Promotes manual->l2->l3->l4->l5.
import { getSql } from './conn'
import { getCleanStreak } from './cleanDays'
import { COMPANY_ID } from './version'

// Matches os_autonomy_state CHECK + autonomyGate LEVEL_ORDER. Index 0 ('manual') is L1, the floor.
const ORDER = ['manual', 'l2', 'l3', 'l4', 'l5'] as const
export type EnfLevel = (typeof ORDER)[number]
export const AUTONOMY_FLOOR: EnfLevel = 'manual' // Kaan's L1 — never demote below this
export const CLEAN_DAYS_PER_RUNG = 5 // the ladder's real criterion: 5 consecutive clean days per rung
const TRUST_STEP = 0.2
const rankOf = (l: string): number => Math.max(0, (ORDER as readonly string[]).indexOf(l))

export interface DecisionInput {
  level: EnfLevel
  cleanSinceLastGrant: number // consecutive clean days earned SINCE the last grant (the cycle)
  breakerOpen: boolean
  trust: number
}
export interface AutonomyDecision extends DecisionInput {
  action: 'promote' | 'demote' | 'hold'
  from: EnfLevel
  to: EnfLevel
  reason: string
  cleanStreak?: number
}

// ── PURE decision — no I/O, exhaustively unit-testable. This is the guard against the l4 failure
// mode (promoting on zero clean days) and against over-promotion (more than one rung per cycle). ──
export function decidePromotion(input: DecisionInput): AutonomyDecision {
  const { level, cleanSinceLastGrant, breakerOpen, trust } = input
  const base = { ...input, from: level }
  const r = rankOf(level)

  // DEMOTE first: a breaker trip is a safety signal — step down exactly one rung, never below floor.
  if (breakerOpen && r > rankOf(AUTONOMY_FLOOR)) {
    return { ...base, action: 'demote', to: ORDER[r - 1], reason: 'breaker_open' }
  }
  // PROMOTE: breaker closed, below cap, and a FRESH full clean cycle earned. Exactly one rung.
  // cleanSinceLastGrant resets to 0 after every grant, so this cannot fire twice on one cycle.
  if (!breakerOpen && r < rankOf('l5') && cleanSinceLastGrant >= CLEAN_DAYS_PER_RUNG) {
    return { ...base, action: 'promote', to: ORDER[r + 1], reason: `earned_${cleanSinceLastGrant}_clean_days` }
  }
  // HOLD — with an explicit reason (never a silent no-op).
  const reason = breakerOpen
    ? 'breaker_open_at_floor'
    : r >= rankOf('l5')
      ? 'at_cap_l5'
      : `building_${cleanSinceLastGrant}_of_${CLEAN_DAYS_PER_RUNG}_clean_days`
  return { ...base, action: 'hold', to: level, reason }
}

// ── I/O: read the live inputs the pure decision needs. ──
async function readState(sql: any, companyId: string): Promise<{ level: EnfLevel; trust: number }> {
  const r = (await sql`SELECT level, trust FROM os_autonomy_state WHERE company_id=${companyId}`) as any[]
  return { level: (r[0]?.level ?? 'manual') as EnfLevel, trust: Number(r[0]?.trust ?? 0) }
}

// Consecutive clean CALENDAR days strictly AFTER the most recent grant — the earning cycle. This is
// what enforces one-rung-per-cycle: right after a promotion this is 0 and must rebuild to 5.
async function cleanDaysSinceLastGrant(sql: any, companyId: string): Promise<number> {
  const g = (await sql`SELECT created_at FROM autonomy_grants WHERE company_id=${companyId} ORDER BY created_at DESC LIMIT 1`) as any[]
  const sinceMs = g[0]?.created_at ? new Date(new Date(g[0].created_at).toISOString().split('T')[0]).getTime() : null
  const rows = (await sql`SELECT day, clean FROM autonomy_clean_days WHERE product_id=${companyId} ORDER BY day DESC LIMIT 40`) as any[]
  let n = 0
  let prevMs: number | null = null
  for (const row of rows) {
    const ms = new Date(new Date(row.day).toISOString().split('T')[0]).getTime()
    if (sinceMs !== null && ms <= sinceMs) break // only days after the last grant count toward the new cycle
    if (!row.clean) break
    if (prevMs !== null && prevMs - ms !== 86_400_000) break // calendar-consecutive
    n++
    prevMs = ms
  }
  return n
}

async function breakerOpen(sql: any, companyId: string): Promise<boolean> {
  const r = (await sql`SELECT 1 FROM circuit_breaker_state WHERE product_id=${companyId} AND state='open' LIMIT 1`) as any[]
  return r.length > 0
}

export async function computeAutonomyDecision(companyId = COMPANY_ID, sqlOverride?: any): Promise<AutonomyDecision> {
  const sql = sqlOverride ?? getSql()
  const { level, trust } = await readState(sql, companyId)
  const [cleanSinceLastGrant, open, streak] = await Promise.all([
    cleanDaysSinceLastGrant(sql, companyId),
    breakerOpen(sql, companyId),
    getCleanStreak(sql, companyId).then((s) => s.streakDays).catch(() => 0),
  ])
  return { ...decidePromotion({ level, cleanSinceLastGrant, breakerOpen: open, trust }), cleanStreak: streak }
}

// Apply a decision through the AUDITED, token-gated path: write the grant token FIRST (the 0009
// trigger requires it to honour a raise), then the level change. Idempotent on 'hold'.
export async function runAutonomyPromotion(companyId = COMPANY_ID, sqlOverride?: any) {
  const sql = sqlOverride ?? getSql()
  const d = await computeAutonomyDecision(companyId, sql)
  if (d.action === 'hold') return { ...d, applied: false }

  await sql`INSERT INTO autonomy_grants (company_id, from_level, to_level, direction, reason, clean_days, trust, created_by)
            VALUES (${companyId}, ${d.from}, ${d.to}, ${d.action}, ${d.reason}, ${d.cleanSinceLastGrant}, ${d.trust}, 'autonomy_promotion_job')`
  const newTrust = d.action === 'promote' ? d.trust + TRUST_STEP : Math.max(0, d.trust - TRUST_STEP)
  await sql`UPDATE os_autonomy_state SET level=${d.to}, trust=${newTrust}, clean_day_streak=${d.cleanStreak ?? 0}, updated_at=NOW() WHERE company_id=${companyId}`
  return { ...d, applied: true, newTrust }
}

// Cron handler — DELIBERATELY NOT wired into api/handler.ts or vercel.json yet. Enable only after
// founder approval (add the route + a daily schedule AFTER the daily clean-day compute at 10 0).
export async function cronAutonomyPromotion(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers?.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const result = await runAutonomyPromotion(COMPANY_ID)
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
