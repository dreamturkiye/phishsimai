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
import { sendTelegram } from './telegram'

// Matches os_autonomy_state CHECK + autonomyGate LEVEL_ORDER. Index 0 ('manual') is L1, the floor.
const ORDER = ['manual', 'l2', 'l3', 'l4', 'l5'] as const
export type EnfLevel = (typeof ORDER)[number]
export const AUTONOMY_FLOOR: EnfLevel = 'manual' // Kaan's L1 — never demote below this
// PS-AUTONOMY-RATE-01 (2026-07-20, founder-directed): one rung per clean day (was 5). This changes
// the RATE only — promotion still fires ONLY on genuinely-earned clean days, still through the
// audited grant-token path, still never below the floor, still demotes on a breaker trip. A run
// now applies EVERY rung the earned-but-ungranted clean days have bought (see runAutonomyPromotion),
// so the level reaches what the clean days earned instead of crawling one rung per cron.
export const CLEAN_DAYS_PER_RUNG = 1 // the ladder's criterion: 1 consecutive clean day per rung
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

// Apply the earned decision(s) through the AUDITED, token-gated path. For EACH rung we write the
// grant token FIRST (the 0009 trigger honours a raise only against a matching, fresh, unconsumed
// promote token) THEN the single-rung level change the trigger consumes. Applying one rung per
// UPDATE is what keeps a multi-rung catch-up auditable — it lands as a manual→l2→l3→l4 grant trail,
// never one blind manual→l4 write the trigger would (correctly) refuse.
//
// At CLEAN_DAYS_PER_RUNG=1 a single run applies every rung the earned-but-ungranted clean days have
// bought (budget = clean days strictly after the last grant), so PhishSim reaches the level it has
// earned in one run rather than crawling one rung per future cron. The budget is consumed one rung
// at a time, so the loop stops EXACTLY at the earned level (or the l5 cap) — it cannot over-promote
// past what was earned. A breaker trip demotes exactly one rung then stops (safety, no cascade).
// Idempotent when nothing is owed: no grant, no write.
export async function runAutonomyPromotion(companyId = COMPANY_ID, sqlOverride?: any) {
  const sql = sqlOverride ?? getSql()
  const { level, trust } = await readState(sql, companyId)
  const [budget0, open, streak] = await Promise.all([
    cleanDaysSinceLastGrant(sql, companyId),
    breakerOpen(sql, companyId),
    getCleanStreak(sql, companyId).then((s) => s.streakDays).catch(() => 0),
  ])

  let curLevel = level
  let curTrust = trust
  let budget = budget0
  const trail: Array<{ from: EnfLevel; to: EnfLevel; action: 'promote' | 'demote'; reason: string }> = []

  // Decide the NEXT single rung from the live in-memory state, commit it through the audited path,
  // then repeat. A promote spends CLEAN_DAYS_PER_RUNG of the earned budget (so the loop halts at the
  // earned level / l5 cap); a demote fires once and breaks. The pure decidePromotion still enforces
  // the l4 failure-mode guard (budget 0 → hold), the floor, and the cap on every iteration.
  while (true) {
    const d = decidePromotion({ level: curLevel, cleanSinceLastGrant: budget, breakerOpen: open, trust: curTrust })
    if (d.action === 'hold') break

    await sql`INSERT INTO autonomy_grants (company_id, from_level, to_level, direction, reason, clean_days, trust, created_by)
              VALUES (${companyId}, ${d.from}, ${d.to}, ${d.action}, ${d.reason}, ${budget}, ${curTrust}, 'autonomy_promotion_job')`
    curTrust = d.action === 'promote' ? curTrust + TRUST_STEP : Math.max(0, curTrust - TRUST_STEP)
    await sql`UPDATE os_autonomy_state SET level=${d.to}, trust=${curTrust}, clean_day_streak=${streak}, updated_at=NOW() WHERE company_id=${companyId}`

    trail.push({ from: d.from, to: d.to, action: d.action as 'promote' | 'demote', reason: d.reason })
    curLevel = d.to
    if (d.action === 'demote') break // a breaker trip steps down exactly one rung — never a cascade
    budget -= CLEAN_DAYS_PER_RUNG // this rung consumed its earned clean day(s)
  }

  const netAction: 'promote' | 'demote' | 'hold' =
    trail.length === 0 ? 'hold' : trail[trail.length - 1].action === 'demote' ? 'demote' : 'promote'
  const reason =
    trail.length === 0
      ? decidePromotion({ level, cleanSinceLastGrant: budget0, breakerOpen: open, trust }).reason
      : netAction === 'demote'
        ? trail[trail.length - 1].reason
        : `earned_${trail.length}_rung${trail.length === 1 ? '' : 's'}_from_${budget0}_clean_days`
  return {
    action: netAction,
    from: level,
    to: curLevel,
    reason,
    cleanSinceLastGrant: budget0,
    breakerOpen: open,
    trust,
    cleanStreak: streak,
    applied: trail.length > 0,
    rungs: trail.length,
    trail,
    newTrust: curTrust,
  }
}

// Latest finalized clean-day result (the compute cron writes YESTERDAY once the day is over).
async function latestCleanDay(sql: any, companyId: string): Promise<{ day: string | null; clean: boolean | null; violations: string[] }> {
  const r = (await sql`SELECT day, clean, violations FROM autonomy_clean_days WHERE product_id=${companyId} ORDER BY day DESC LIMIT 1`) as any[]
  const row = r[0]
  if (!row) return { day: null, clean: null, violations: [] }
  const v = Array.isArray(row.violations) ? row.violations : (typeof row.violations === 'string' ? JSON.parse(row.violations || '[]') : [])
  return { day: new Date(row.day).toISOString().split('T')[0], clean: row.clean, violations: v }
}

// Map enforcement level -> Kaan's L-label for the daily line (L1==manual).
function lLabel(level: string): string {
  return level === 'manual' ? 'L1 (manual)' : `L${ORDER.indexOf(level as EnfLevel) + 1} (${level})`
}

// Daily autonomy cron. Wired live (api/handler.ts + vercel.json), scheduled AFTER the clean-day
// compute (10 0) so it reads the finalized result. Runs the token-audited promotion/demotion and
// emits ONE Telegram line: current level, streak, today clean-or-dirty (+ reason if dirty).
export async function cronAutonomyPromotion(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET
  if (!okCron && !okHq) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const sql = getSql()
    const result = await runAutonomyPromotion(COMPANY_ID, sql)
    const cd = await latestCleanDay(sql, COMPANY_ID)
    const dayState = cd.clean === null ? 'not yet computed' : cd.clean ? 'clean ✅' : `dirty ⚠️ (${cd.violations.slice(0, 2).join('; ') || 'see clean-day log'})`
    const move =
      result.action === 'promote' ? `PROMOTED ${result.from} → ${result.to} (earned)`
      : result.action === 'demote' ? `DEMOTED ${result.from} → ${result.to} (${result.reason})`
      : `held at ${lLabel(result.to)} — ${result.reason}`
    await sendTelegram(
      `🎖️ <b>PhishSim Autonomy</b>\n` +
      `Level: ${lLabel(result.to)} · clean-day streak: ${result.cleanStreak ?? 0}\n` +
      `${cd.day ?? 'today'}: ${dayState}\n` +
      `Today: ${move}`,
    ).catch(() => {})
    return res.json({ ok: true, ...result, latestCleanDay: cd })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
