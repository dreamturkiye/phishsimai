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
//
// PS-AUTONOMY-CRITERIA-01 (2026-07-23) — this job and the posture tracker read the SAME table,
// autonomy_clean_days, and used to apply different rigor to it. posture.ts filters to
// `criteria_version >= 2 AND day >= baseline_from`; this job filtered by nothing, so it counted v1
// rows — including 2026-07-18, the unearned-l4 incident day that v1's three-check version scored
// clean. The level climbed to l5 on criteria the posture tracker had already been rebuilt to
// distrust, and the two surfaces then disagreed (streak 5 vs 0) with no way to tell which ladder a
// number belonged to. Every clean-day read below now goes through the same v2 + baseline filter,
// and every streak written is stamped with the version that produced it.
import { getSql } from './conn'
import { CRITERIA_VERSION, getPostureState, currentStreak } from './posture'
import { COMPANY_ID } from './version'
import { sendTelegram } from './telegram'

// Matches os_autonomy_state CHECK + autonomyGate LEVEL_ORDER. Index 0 ('manual') is L1, the floor.
const ORDER = ['manual', 'l2', 'l3', 'l4', 'l5'] as const
export type EnfLevel = (typeof ORDER)[number]
export const AUTONOMY_FLOOR: EnfLevel = 'manual' // Kaan's L1 — never demote below this
// PS-AUTONOMY-RATE-01 (2026-07-20, founder-directed): one rung per clean day (was 5). This changes
// the RATE only — promotion still fires ONLY on genuinely-earned clean days, still through the
// audited grant-token path, still never below the floor, still demotes on a breaker trip.
//
// PS-AUTONOMY-ONERUNG-01 (2026-07-26, founder-directed): a run now applies AT MOST ONE rung.
// The previous behaviour spent the whole earned-but-ungranted budget in a single run, so a level
// sitting at the floor with 3 unspent clean days climbed manual→l2→l3→l4 in one cron tick. That is
// not "earning a rung per clean day" — it is banking days and skipping the earning, and it crosses
// acting levels without a single day of observation at any rung in between. One rung per RUN, on a
// genuinely clean day, is what makes the ladder observable: each level gets at least one real day
// of production behaviour before the next is even considered.
export const CLEAN_DAYS_PER_RUNG = 1 // the ladder's criterion: 1 consecutive clean day per rung
const TRUST_STEP = 0.2
const rankOf = (l: string): number => Math.max(0, (ORDER as readonly string[]).indexOf(l))

// PS-MARCUS-WATCHERGATE-01 — the first ACTING level. At l3 architectPending stops handing the
// external watcher an empty queue and starts giving it real tasks to apply, so l3 is the rung where
// generated code can actually reach production.
//
// SENTRY_DSN is NOT what makes that dangerous, and gating on it would be the wrong control:
// queueJanetArchitectTask has seven callers (architectAgent, janet standup, janetReport,
// agentWatchdog, janetHQActions, l5Autonomy, routes), and all of them can fill the queue at l3 with
// Sentry switched off entirely. The queue is empty today only because 'manual' denies all seven.
//
// So the gate binds on LEVEL, and it is independent of clean days: no number of clean days may carry
// Marcus into an acting level while the component that actually writes and deploys files — the
// external watcher — has not been audited. Clean days can still earn him to l2.
export const FIRST_ACTING_LEVEL: EnfLevel = 'l3'

export interface DecisionInput {
  level: EnfLevel
  cleanSinceLastGrant: number // consecutive clean days earned SINCE the last grant (the cycle)
  breakerOpen: boolean
  trust: number
  /**
   * Has the external Marcus watcher been audited? FAIL CLOSED — callers must pass the real
   * answer, and an absent/unknown audit record must arrive here as `false`. Blocks promotion
   * into FIRST_ACTING_LEVEL and above; has no effect on demotion, which must always be able
   * to run. Optional in the type only so existing callers keep compiling; `undefined` is
   * treated as NOT audited.
   */
  watcherAudited?: boolean
}
export interface AutonomyDecision extends DecisionInput {
  action: 'promote' | 'demote' | 'hold'
  from: EnfLevel
  to: EnfLevel
  reason: string
  cleanStreak?: number
  /** Which autonomy_clean_days.criteria_version produced cleanStreak. Never read the number without it. */
  cleanStreakCriteria?: number
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
    const target = ORDER[r + 1]
    // WATCHER-AUDIT HARD GATE. Checked here, inside the pure decision, so it is unit-testable and
    // so EVERY promotion path is covered rather than just the one caller. Written as `>= rank of
    // the first acting level` rather than `target === 'l3'` so it still holds if the rung vocabulary
    // changes or if multi-rung promotion is ever reintroduced.
    if (rankOf(target) >= rankOf(FIRST_ACTING_LEVEL) && input.watcherAudited !== true) {
      return { ...base, action: 'hold', to: level, reason: `watcher_audit_required_for_${target}` }
    }
    return { ...base, action: 'promote', to: target, reason: `earned_${cleanSinceLastGrant}_clean_days` }
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
async function readState(
  sql: any,
  companyId: string,
): Promise<{ level: EnfLevel; trust: number; storedStreak: { days: number; criteria: number | null } }> {
  const r = (await sql`SELECT level, trust, clean_day_streak, clean_day_streak_criteria
                       FROM os_autonomy_state WHERE company_id=${companyId}`) as any[]
  return {
    level: (r[0]?.level ?? 'manual') as EnfLevel,
    trust: Number(r[0]?.trust ?? 0),
    storedStreak: {
      days: Number(r[0]?.clean_day_streak ?? 0),
      criteria: r[0]?.clean_day_streak_criteria == null ? null : Number(r[0].clean_day_streak_criteria),
    },
  }
}

/**
 * The posture baseline this product is judged from — the same `os_posture_state.baseline_from`
 * posture.ts uses, so neither ladder can credit a day the other refuses.
 *
 * Returns null when it cannot be read. Callers must treat that as BLOCKING, never as "no baseline,
 * count everything": an unreadable baseline is exactly the silence this OS keeps scoring as a pass.
 */
async function readBaseline(sql: any, companyId: string): Promise<string | null> {
  try {
    const state = await getPostureState(sql, companyId)
    return state?.baseline_from ? String(state.baseline_from).slice(0, 10) : null
  } catch {
    return null
  }
}

// PS-MARCUS-WATCHERGATE-01 — has the external Marcus watcher been audited?
//
// FAIL CLOSED, and deliberately so: this returns false when the row is absent, when the value is
// anything other than the exact literal 'passed', and when the query throws. Every failure mode of
// this function must read as "not audited", because the cost of a false negative is a ladder that
// pauses at l2 until someone records the audit, and the cost of a false positive is Marcus crossing
// into an acting level with the one component that has real hands still unexamined.
//
// Stored in janet_memory (the codebase's convention for operating state) rather than an env var:
// an env var is invisible in the audit trail, and a level-changing control that leaves no record is
// the exact failure 0012 was written to close.
//
//   INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
//   VALUES ('phishsimai', 'operating', 'watcher_audit', 'passed', 1, 'founder');
export const WATCHER_AUDIT_KEY = 'watcher_audit'

export async function isWatcherAudited(sql: any, companyId: string): Promise<boolean> {
  try {
    const rows = (await sql`SELECT value FROM janet_memory
                            WHERE company_id=${companyId} AND type='operating' AND key=${WATCHER_AUDIT_KEY}
                            LIMIT 1`) as any[]
    return String(rows?.[0]?.value ?? '').trim().toLowerCase() === 'passed'
  } catch {
    return false // unreadable audit record is NOT an audit
  }
}

// Consecutive clean CALENDAR days strictly AFTER the most recent grant — the earning cycle. This is
// what enforces one-rung-per-cycle: right after a promotion this is 0 and must rebuild.
//
// PS-AUTONOMY-CRITERIA-01: only days judged under the CURRENT criteria version and at/after the
// posture baseline are countable. A v1 'clean' does not become a v2 'clean' by being old — the same
// rule posture.currentStreak() enforces, now applied to the ladder that actually moves the gate.
// A missing baseline returns 0, which decidePromotion turns into a HOLD: fail-closed, never a
// promotion on days we cannot vouch for, and never a demotion either (only an open breaker demotes).
async function cleanDaysSinceLastGrant(sql: any, companyId: string): Promise<number> {
  const baselineFrom = await readBaseline(sql, companyId)
  if (!baselineFrom) return 0
  const g = (await sql`SELECT created_at FROM autonomy_grants WHERE company_id=${companyId} ORDER BY created_at DESC LIMIT 1`) as any[]
  const sinceMs = g[0]?.created_at ? new Date(new Date(g[0].created_at).toISOString().split('T')[0]).getTime() : null
  const rows = (await sql`SELECT day, clean FROM autonomy_clean_days
                          WHERE product_id=${companyId}
                            AND criteria_version >= ${CRITERIA_VERSION}
                            AND day >= ${baselineFrom}::date
                          ORDER BY day DESC LIMIT 40`) as any[]
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

/**
 * The streak stored on os_autonomy_state, computed by the SAME function the posture tracker uses.
 * Returns the version alongside the number so the stored value is never ambiguous about its origin.
 * Unreadable baseline → 0 at the current version (fail-closed), consistent with the promotion path.
 */
async function v2Streak(sql: any, companyId: string): Promise<{ days: number; criteria: number }> {
  try {
    const baselineFrom = await readBaseline(sql, companyId)
    if (!baselineFrom) return { days: 0, criteria: CRITERIA_VERSION }
    const { streak } = await currentStreak(sql, companyId, baselineFrom)
    return { days: streak, criteria: CRITERIA_VERSION }
  } catch {
    return { days: 0, criteria: CRITERIA_VERSION }
  }
}

async function breakerOpen(sql: any, companyId: string): Promise<boolean> {
  const r = (await sql`SELECT 1 FROM circuit_breaker_state WHERE product_id=${companyId} AND state='open' LIMIT 1`) as any[]
  return r.length > 0
}

export async function computeAutonomyDecision(companyId = COMPANY_ID, sqlOverride?: any): Promise<AutonomyDecision> {
  const sql = sqlOverride ?? getSql()
  const { level, trust } = await readState(sql, companyId)
  // Reads the watcher-audit flag too, so this read-only preview reports what the job WILL do rather
  // than a rosier answer. A preview that says 'promote' while the job holds is worse than no preview.
  const [cleanSinceLastGrant, open, streak, watcherAudited] = await Promise.all([
    cleanDaysSinceLastGrant(sql, companyId),
    breakerOpen(sql, companyId),
    v2Streak(sql, companyId),
    isWatcherAudited(sql, companyId),
  ])
  return {
    ...decidePromotion({ level, cleanSinceLastGrant, breakerOpen: open, trust, watcherAudited }),
    cleanStreak: streak.days,
    cleanStreakCriteria: streak.criteria,
  }
}

// Apply the earned decision(s) through the AUDITED, token-gated path. For EACH rung we write the
// grant token FIRST (the 0009 trigger honours a raise only against a matching, fresh, unconsumed
// promote token) THEN the single-rung level change the trigger consumes. Applying one rung per
// UPDATE is what keeps a multi-rung catch-up auditable — it lands as a manual→l2→l3→l4 grant trail,
// never one blind manual→l4 write the trigger would (correctly) refuse.
//
// PS-AUTONOMY-ONERUNG-01: a run applies AT MOST ONE rung. This previously looped, spending the whole
// earned-but-ungranted budget in one tick — a floor-level product with 3 unspent clean days climbed
// manual→l2→l3→l4 in a single cron, crossing acting levels with zero days of observation at any rung
// in between. Banking days and cashing them in a burst is not earning. One rung per run means every
// level gets at least one real production day before the next is considered.
//
// The loop is retained (not flattened to a single call) so the demote path keeps its own explicit
// break and so the shape stays honest about applying rungs one at a time; it just cannot iterate
// past a single applied change now. The budget arithmetic is likewise kept: it is what the emitted
// reason strings report, and it documents how much was earned but deliberately not spent.
//
// A breaker trip still demotes exactly one rung then stops (safety, no cascade).
// Idempotent when nothing is owed: no grant, no write.
export async function runAutonomyPromotion(companyId = COMPANY_ID, sqlOverride?: any) {
  const sql = sqlOverride ?? getSql()
  const { level, trust, storedStreak } = await readState(sql, companyId)
  const [budget0, open, streak, watcherAudited] = await Promise.all([
    cleanDaysSinceLastGrant(sql, companyId),
    breakerOpen(sql, companyId),
    v2Streak(sql, companyId),
    isWatcherAudited(sql, companyId),
  ])

  let curLevel = level
  let curTrust = trust
  let budget = budget0
  const trail: Array<{ from: EnfLevel; to: EnfLevel; action: 'promote' | 'demote'; reason: string }> = []

  // Decide the NEXT single rung from the live in-memory state and commit it through the audited path.
  // The pure decidePromotion enforces the l4 failure-mode guard (budget 0 → hold), the floor, the cap,
  // and the watcher-audit gate on entry to any acting level.
  while (true) {
    const d = decidePromotion({ level: curLevel, cleanSinceLastGrant: budget, breakerOpen: open, trust: curTrust, watcherAudited })
    if (d.action === 'hold') break

    await sql`INSERT INTO autonomy_grants (company_id, from_level, to_level, direction, reason, clean_days, trust, created_by)
              VALUES (${companyId}, ${d.from}, ${d.to}, ${d.action}, ${d.reason}, ${budget}, ${curTrust}, 'autonomy_promotion_job')`
    curTrust = d.action === 'promote' ? curTrust + TRUST_STEP : Math.max(0, curTrust - TRUST_STEP)
    await sql`UPDATE os_autonomy_state SET level=${d.to}, trust=${curTrust},
                     clean_day_streak=${streak.days}, clean_day_streak_criteria=${streak.criteria},
                     updated_at=NOW()
               WHERE company_id=${companyId}`

    trail.push({ from: d.from, to: d.to, action: d.action as 'promote' | 'demote', reason: d.reason })
    curLevel = d.to
    if (d.action === 'demote') break // a breaker trip steps down exactly one rung — never a cascade
    budget -= CLEAN_DAYS_PER_RUNG // this rung consumed its earned clean day(s)
    break // PS-AUTONOMY-ONERUNG-01 — at most ONE rung per run; the rest of the budget is not spent
  }

  // PS-AUTONOMY-CRITERIA-01 — keep the stored streak honest even when nothing moved. Before this,
  // clean_day_streak was only ever written alongside a rung, so at the l5 cap (where no rung can
  // ever land again) it froze at whatever the last promotion saw — a v1 5 sitting next to the
  // posture tracker's v2 0, on the same table, forever. Sync it on the hold path too.
  //
  // Deliberately narrow: this touches ONLY the two streak columns, never `level` or `trust`. It
  // cannot promote and cannot demote — the level is not in the statement. It is also conditional,
  // so an unchanged streak writes nothing and does not spend an audit row per day.
  const streakStale = !trail.length && (storedStreak.days !== streak.days || storedStreak.criteria !== streak.criteria)
  if (streakStale) {
    await sql`UPDATE os_autonomy_state
                 SET clean_day_streak=${streak.days}, clean_day_streak_criteria=${streak.criteria}
               WHERE company_id=${companyId}`
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
    cleanStreak: streak.days,
    cleanStreakCriteria: streak.criteria,
    applied: trail.length > 0,
    rungs: trail.length,
    trail,
    newTrust: curTrust,
  }
}

// Latest finalized clean-day result (the compute cron writes YESTERDAY once the day is over).
// PS-AUTONOMY-CRITERIA-01: same v2 + baseline filter as the promotion decision, so the day the
// Telegram line reports is the day the ladder actually counted. Reporting a v1 row here while
// promoting on v2 rows would put a "clean ✅" next to a hold nobody could explain.
async function latestCleanDay(sql: any, companyId: string): Promise<{ day: string | null; clean: boolean | null; violations: string[]; criteriaVersion: number | null }> {
  const baselineFrom = await readBaseline(sql, companyId)
  if (!baselineFrom) return { day: null, clean: null, violations: [], criteriaVersion: null }
  const r = (await sql`SELECT day, clean, violations, criteria_version FROM autonomy_clean_days
                       WHERE product_id=${companyId}
                         AND criteria_version >= ${CRITERIA_VERSION}
                         AND day >= ${baselineFrom}::date
                       ORDER BY day DESC LIMIT 1`) as any[]
  const row = r[0]
  if (!row) return { day: null, clean: null, violations: [], criteriaVersion: null }
  const v = Array.isArray(row.violations) ? row.violations : (typeof row.violations === 'string' ? JSON.parse(row.violations || '[]') : [])
  return { day: new Date(row.day).toISOString().split('T')[0], clean: row.clean, violations: v, criteriaVersion: Number(row.criteria_version) }
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
    // The streak carries its criteria version inline. This surface and the posture line read the
    // same table, and an unlabelled number here is what made "5" and "0" look contradictory when
    // they were simply answers to two different questions.
    await sendTelegram(
      `🎖️ <b>PhishSim Autonomy</b>\n` +
      `Level: ${lLabel(result.to)} · clean-day streak: ${result.cleanStreak ?? 0} (criteria v${result.cleanStreakCriteria ?? '?'})\n` +
      `${cd.day ?? 'no v' + CRITERIA_VERSION + ' day judged yet'}: ${dayState}\n` +
      `Today: ${move}`,
    ).catch(() => {})
    return res.json({ ok: true, ...result, latestCleanDay: cd })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
