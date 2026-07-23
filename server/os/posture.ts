// ─────────────────────────────────────────────────────────────────────────────
//  PS-POSTURE-01 — KAAN_AI_OS_V7.3 maturity posture (L5.7 → L5.8).
//
//  Two axes, kept separate on purpose:
//    os_autonomy_state.level  — WHAT an agent may do now (gate; auto-promoted; manual..l5)
//    os_posture_state.posture — WHETHER the system has PROVEN it runs unattended (declared)
//
//  The spec (Section A) defines the second axis and its exit criteria:
//    L5.7 "unattended-safe"  — 5 consecutive clean days + ≥1 breaker trip handled cleanly,
//                              where a clean day is: zero unhandled task failures, zero
//                              fabricated metrics, zero blind deploys.
//    L5.8 "self-improving"   — a 15-day offline drill passed portfolio-wide: MRR non-negative
//                              drift, error rate non-increasing, ≥3 self-originated
//                              improvements shipped with proof, zero hard-stop violations.
//    Drills stage 3 → 7 → 15 days.
//
//  Three rules this module will not bend:
//
//  1. GRADUATION IS DECLARED, NOT AUTO-PROMOTED. Nothing here writes `posture` on a schedule.
//     evaluatePosture() reports eligibility; declarePosture() requires a human declarer. That
//     is the 07-18 lesson — a level nobody chose is a level nobody trusts.
//  2. UNMEASURED IS NOT CLEAN. A criterion we cannot read blocks, exactly as a violation does.
//     Every failure in this OS has taken the same shape: an instrument that reported nothing,
//     and a reader that scored the silence as a pass.
//  3. HARD STOPS SURVIVE GRADUATION. "Zero hard-stop violations" is itself an L5.8 exit
//     criterion — you pass by never violating them, so nothing un-gates on the way up.
// ─────────────────────────────────────────────────────────────────────────────
import type { SqlLike } from './cleanDays'

export type Posture = 'pre_l5_7' | 'l5_7' | 'drill_3' | 'drill_7' | 'drill_15' | 'l5_8'
export const POSTURE_ORDER: readonly Posture[] = ['pre_l5_7', 'l5_7', 'drill_3', 'drill_7', 'drill_15', 'l5_8'] as const

/** Human-facing labels. `pre_l5_7` is honest about what it is: not yet L5.7. */
export const POSTURE_LABEL: Record<Posture, string> = {
  pre_l5_7: 'pre-L5.7',
  l5_7: 'L5.7',
  drill_3: 'L5.7 + 3-day drill',
  drill_7: 'L5.7 + 7-day drill',
  drill_15: 'L5.7 + 15-day drill',
  l5_8: 'L5.8',
}

/** Spec Section A: 5 consecutive clean days, and ≥1 breaker trip handled inside that window. */
export const L5_7_CLEAN_DAYS = 5
export const L5_7_HANDLED_TRIPS = 1
/** Spec: staged 3-day (Phase 2 exit) → 7-day → 15-day (L5.8 exit). */
export const DRILL_DAYS: Record<'drill_3' | 'drill_7' | 'drill_15', number> = { drill_3: 3, drill_7: 7, drill_15: 15 }

/**
 * Which products a posture must hold across, per spec.
 *   L5.7 — "5 consecutive days on ScrollFuel" (the reference implementation)
 *   L5.8 — "15-day offline drill passed portfolio-wide"
 *
 * This instance's database contains ONLY phishsimai (ScrollFuel lives on a different Neon
 * project entirely — see CLAUDE.md). The mechanism below is scope-aware and will evaluate any
 * product that has rows; a product in scope with NO rows is reported as an unverifiable blocker
 * rather than skipped. That is the difference between "the portfolio passed" and "the one
 * product I can see passed, and I called it the portfolio".
 */
export const PORTFOLIO: readonly string[] = ['phishsimai', 'scrollfuel', 'vellachat']

export type DayCounters = {
  failed_actions: number
  compliance_rejections: number
  open_breakers: number
  hard_stop_violations: number
  ungranted_level_changes: number
  incidents: number
  deploy_mismatches: number
}
export type DayVerdict = { clean: boolean; counters: DayCounters; violations: string[]; unmeasured: string[] }

const ZERO: DayCounters = {
  failed_actions: 0, compliance_rejections: 0, open_breakers: 0,
  hard_stop_violations: 0, ungranted_level_changes: 0, incidents: 0, deploy_mismatches: 0,
}

/** Criteria version stamped onto every row this module judges. v1 = the old 3-check version. */
export const CRITERIA_VERSION = 2

/**
 * The counter classes, counted for one day, from live tables.
 *
 * Each probe reports EITHER a count OR an unmeasured reason — never a silent zero. A query that
 * throws means we could not see that class, and that blocks the day exactly as a violation does.
 *
 * A caveat worth keeping in view: v1 marks 2026-07-18 clean — the day of the unearned-l4 incident
 * and 20 un-gated sends — and re-judging that day under v2 ALSO returns clean. The classes that
 * would catch it (ungranted_level_changes) read from the guard trigger, which was not installed
 * until 2026-07-19. Broader criteria do not reach backwards. This tracker earns its credibility
 * forward from `baseline_from`, which is why pre-baseline days are never credited.
 */
export async function computeDayCounters(sql: SqlLike, productId: string, dayIso: string): Promise<DayVerdict> {
  const counters: DayCounters = { ...ZERO }
  const violations: string[] = []
  const unmeasured: string[] = []

  const probe = async (label: string, fn: () => Promise<number>, onCount: (n: number) => void) => {
    try { onCount(await fn()) } catch (e: any) { unmeasured.push(`${label}: ${String(e?.message || e).slice(0, 120)}`) }
  }
  const one = async (rows: Promise<any>): Promise<number> => Number(((await rows) as any[])[0]?.n ?? 0)

  // 1. Failed actions — agent work and architect work that ended in failure.
  await probe('failed_actions', async () => await one(sql`
    SELECT (SELECT count(*) FROM agent_tasks WHERE status='failed' AND COALESCE(updated_at, created_at)::date = ${dayIso}::date)
         + (SELECT count(*) FROM os_architect_tasks WHERE status='failed' AND updated_at::date = ${dayIso}::date) AS n`),
    n => { counters.failed_actions = n; if (n) violations.push(`${n} failed action(s)`) })

  // 2. Compliance rejections — the send/compliance guard refusing work.
  await probe('compliance_rejections', async () => await one(sql`
    SELECT count(*) AS n FROM audit_log
    WHERE actor='compliance_guard' AND created_at::date = ${dayIso}::date
      AND (action ILIKE '%deny%' OR action ILIKE '%reject%' OR action ILIKE '%block%' OR action ILIKE '%refus%')`),
    n => { counters.compliance_rejections = n; if (n) violations.push(`${n} compliance rejection(s)`) })

  // 3. Open breakers — a breaker still open at day end is an unhandled failure by definition.
  await probe('open_breakers', async () => await one(sql`
    SELECT count(*) AS n FROM circuit_breaker_state
    WHERE product_id=${productId} AND state='open' AND updated_at::date <= ${dayIso}::date`),
    n => { counters.open_breakers = n; if (n) violations.push(`${n} breaker(s) left open`) })

  // 4. Hard-stop violations — a hard stop that was ALLOWED rather than denied. decideAutonomy
  //    makes this structurally impossible, so a non-zero count means something bypassed the gate.
  //    Counted anyway: the value of this number is entirely in the day it stops being zero.
  await probe('hard_stop_violations', async () => await one(sql`
    SELECT count(*) AS n FROM audit_log
    WHERE actor='autonomy_gate' AND created_at::date = ${dayIso}::date
      AND action <> 'denied' AND detail->>'reason' = 'hard_stop'`),
    n => { counters.hard_stop_violations = n; if (n) violations.push(`${n} HARD-STOP VIOLATION(S)`) })

  // 5. Ungranted level changes — someone tried to hand-write the autonomy level, or deleted the
  //    state row. This is the 2026-07-18 incident's exact signature: a bare off-repo
  //    `UPDATE os_autonomy_state SET level='l4'` with trust=0 and streak=0.
  //
  //    HONEST LIMIT: this cannot catch 07-18 retroactively. The guard trigger that records these
  //    events was installed 2026-07-19T03:05Z — the day AFTER. Re-judging 07-18 under v2 still
  //    returns clean, because the evidence was never written. What this class buys is that a
  //    REPEAT is caught, from now on. Counting a thing starts the day you start counting it;
  //    claiming otherwise would be the same backfill fiction this tracker exists to prevent.
  await probe('ungranted_level_changes', async () => await one(sql`
    SELECT count(*) AS n FROM audit_log
    WHERE actor='autonomy_guard' AND created_at::date = ${dayIso}::date
      AND action IN ('raise_refused', 'row_deleted')`),
    n => { counters.ungranted_level_changes = n; if (n) violations.push(`${n} ungranted autonomy level change attempt(s)`) })

  // 6. Filed incidents — any agent or human may void a day, by design.
  await probe('incidents', async () => await one(sql`
    SELECT count(*) AS n FROM autonomy_incidents WHERE product_id=${productId} AND day = ${dayIso}::date`),
    n => { counters.incidents = n; if (n) violations.push(`${n} filed incident(s)`) })

  // 7. Blind deploys (spec: "zero blind deploys") — deploy-target verification mismatches.
  await probe('deploy_mismatches', async () => await one(sql`
    SELECT count(*) AS n FROM deploy_verifications
    WHERE product_id=${productId} AND match=false AND checked_at::date = ${dayIso}::date`),
    n => { counters.deploy_mismatches = n; if (n) violations.push(`${n} unverified deploy(s)`) })

  // 8. Fabricated metrics (spec: "every dashboard number real-or-null"). We cannot detect a
  //    fabricated number after the fact; what we CAN check is that the day was snapshotted at
  //    all. A missing snapshot is not fabrication — it is an unmeasured day, and unmeasured
  //    blocks. metricsSnapshot's own contract is to refuse rather than invent.
  try {
    const n = await one(sql`SELECT count(*) AS n FROM metrics_daily WHERE product_id=${productId} AND snapshot_date::date = ${dayIso}::date`)
    if (n === 0) unmeasured.push('metrics: no metrics_daily snapshot for this day')
  } catch (e: any) {
    unmeasured.push(`metrics: ${String(e?.message || e).slice(0, 120)}`)
  }

  return { clean: violations.length === 0 && unmeasured.length === 0, counters, violations, unmeasured }
}

/** Judge a day and persist it, stamped with the criteria version that judged it. */
export async function recordDay(sql: SqlLike, productId: string, dayIso: string): Promise<DayVerdict> {
  const v = await computeDayCounters(sql, productId, dayIso)
  const notes = [...v.violations, ...v.unmeasured.map(u => `unmeasured — ${u}`)]
  await sql`
    INSERT INTO autonomy_clean_days (product_id, day, clean, violations, criteria_version, counters)
    VALUES (${productId}, ${dayIso}::date, ${v.clean}, ${JSON.stringify(notes)}::jsonb, ${CRITERIA_VERSION}, ${JSON.stringify(v.counters)}::jsonb)
    ON CONFLICT (product_id, day) DO UPDATE SET
      clean = EXCLUDED.clean, violations = EXCLUDED.violations,
      criteria_version = EXCLUDED.criteria_version, counters = EXCLUDED.counters, computed_at = now()`
  return v
}

export type PostureState = { product_id: string; posture: Posture; entered_at: string; declared_by: string | null; baseline_from: string; notes: string | null }

export async function getPostureState(sql: SqlLike, productId: string): Promise<PostureState | null> {
  const rows = (await sql`SELECT product_id, posture, entered_at, declared_by, baseline_from::text AS baseline_from, notes
                          FROM os_posture_state WHERE product_id=${productId}`) as any[]
  return rows[0] ?? null
}

/**
 * Consecutive clean days ending at the most recent judged day, counting ONLY days judged under
 * the current criteria version and at/after the baseline. A v1 'clean' does not become a v2
 * 'clean' by being old.
 */
export async function currentStreak(sql: SqlLike, productId: string, baselineFrom: string): Promise<{ streak: number; lastDay: string | null; firstDay: string | null }> {
  const rows = (await sql`
    SELECT day::text AS day, clean FROM autonomy_clean_days
    WHERE product_id=${productId} AND criteria_version >= ${CRITERIA_VERSION} AND day >= ${baselineFrom}::date
    ORDER BY day DESC LIMIT 60`) as any[]
  if (!rows.length) return { streak: 0, lastDay: null, firstDay: null }
  const DAY = 86_400_000
  let streak = 0, prev: number | null = null, firstDay: string | null = null
  for (const r of rows) {
    if (!r.clean) break
    const ms = new Date(`${r.day}T00:00:00Z`).getTime()
    if (prev !== null && prev - ms !== DAY) break // a gap breaks the run; a missing day is not a clean one
    streak++; prev = ms; firstDay = r.day
  }
  return { streak, lastDay: rows[0].day, firstDay }
}

/**
 * Breaker trips that OPENED and were brought back closed within the window — "handled cleanly",
 * the second half of the spec's L5.7 gate.
 *
 * PS-POSTURE-02. The obvious query is the one cleanDays.getBreakerHandledCount used, and it is
 * unsatisfiable:
 *
 *   WHERE state='closed' AND opened_at IS NOT NULL      -- can never be true
 *
 * Closing a breaker (applyOutcome on success, and manualClose) sets `openedAt: null` along with
 * `state:'closed'`. So the moment a trip is handled, the row stops matching — and an UNhandled
 * trip is still 'open', which also does not match. The predicate describes a state the schema
 * never holds, so it returned 0 forever and made the criterion impossible to satisfy by doing
 * the right thing. A gate nobody can pass is not a strict gate, it is a broken one.
 *
 * Count the PERSISTENT evidence instead: a trip raises an `escalations` row (category
 * 'breaker_trip', payload.fingerprint), and that row survives the close. A trip is "handled"
 * when its escalation exists in the window AND its breaker is now closed.
 */
export async function handledTrips(sql: SqlLike, productId: string, sinceIso: string): Promise<number | null> {
  try {
    const rows = (await sql`
      SELECT count(*) AS n FROM escalations e
      WHERE e.product_id=${productId} AND e.category='breaker_trip' AND e.created_at >= ${sinceIso}::date
        AND EXISTS (
          SELECT 1 FROM circuit_breaker_state b
          WHERE b.fingerprint = e.payload->>'fingerprint' AND b.state = 'closed'
        )`) as any[]
    return Number(rows[0]?.n ?? 0)
  } catch { return null } // null = could not measure; the caller must treat that as blocking
}

export type Evaluation = {
  posture: Posture
  label: string
  baselineFrom: string
  streak: number
  lastJudgedDay: string | null
  needDays: number
  handled: number | null
  needHandled: number
  eligibleFor: Posture | null
  blockers: string[]
  nextStep: string
  drill: { kind: number; started_on: string; ends_on: string; daysDone: number; status: string } | null
}

/**
 * Report where the product stands and what is left. NEVER writes `posture`.
 *
 * Cross-product scope is enforced here rather than assumed: for a posture the spec measures
 * across products, every product in PORTFOLIO with no rows becomes an explicit blocker. The
 * tracker would rather say "I cannot see ScrollFuel" than quietly grade the portfolio on the
 * one product it happens to share a database with.
 */
export async function evaluatePosture(sql: SqlLike, productId: string): Promise<Evaluation> {
  const state = (await getPostureState(sql, productId)) ?? {
    product_id: productId, posture: 'pre_l5_7' as Posture, entered_at: new Date().toISOString(),
    declared_by: null, baseline_from: new Date().toISOString().slice(0, 10), notes: null,
  }
  const posture = state.posture
  const baselineFrom = String(state.baseline_from).slice(0, 10)
  const { streak, lastDay, firstDay } = await currentStreak(sql, productId, baselineFrom)
  const blockers: string[] = []

  // ── pre-L5.7 → L5.7: 5 consecutive clean days + ≥1 handled breaker trip in that window ──
  if (posture === 'pre_l5_7') {
    const trips = firstDay ? await handledTrips(sql, productId, firstDay) : 0
    if (streak < L5_7_CLEAN_DAYS) blockers.push(`${streak}/${L5_7_CLEAN_DAYS} consecutive clean days`)
    if (trips === null) blockers.push('handled breaker trips: UNMEASURABLE (circuit_breaker_state unreadable)')
    else if (trips < L5_7_HANDLED_TRIPS) blockers.push(`${trips}/${L5_7_HANDLED_TRIPS} breaker trip handled cleanly (inject one per spec Section A)`)
    return {
      posture, label: POSTURE_LABEL[posture], baselineFrom, streak, lastJudgedDay: lastDay,
      needDays: L5_7_CLEAN_DAYS, handled: trips, needHandled: L5_7_HANDLED_TRIPS,
      eligibleFor: blockers.length ? null : 'l5_7',
      blockers,
      nextStep: blockers.length ? `building toward L5.7 — ${blockers.join('; ')}` : 'ELIGIBLE for L5.7 — declare to advance',
      drill: null,
    }
  }

  // ── L5.7 → start the 3-day drill ──
  if (posture === 'l5_7') {
    return {
      posture, label: POSTURE_LABEL[posture], baselineFrom, streak, lastJudgedDay: lastDay,
      needDays: DRILL_DAYS.drill_3, handled: null, needHandled: 0,
      eligibleFor: 'drill_3', blockers: [],
      nextStep: 'L5.7 held — start the 3-day drill to begin the L5.8 track',
      drill: null,
    }
  }

  // ── inside a drill ──
  const kind = DRILL_DAYS[posture as 'drill_3' | 'drill_7' | 'drill_15']
  const drills = (await sql`SELECT id, kind, started_on::text AS started_on, ends_on::text AS ends_on, status
                            FROM os_posture_drills WHERE product_id=${productId} AND status='running'
                            ORDER BY started_on DESC LIMIT 1`) as any[]
  const active = drills[0] ?? null
  if (!active) blockers.push(`posture is ${POSTURE_LABEL[posture]} but no drill row is running — start one`)

  let daysDone = 0
  if (active) {
    const rows = (await sql`SELECT count(*) AS n FROM autonomy_clean_days
      WHERE product_id=${productId} AND criteria_version >= ${CRITERIA_VERSION}
        AND clean = true AND day >= ${active.started_on}::date AND day <= ${active.ends_on}::date`) as any[]
    daysDone = Number(rows[0]?.n ?? 0)
    if (daysDone < kind) blockers.push(`${daysDone}/${kind} clean drill days`)

    const hs = (await sql`SELECT COALESCE(sum((counters->>'hard_stop_violations')::int), 0) AS n
      FROM autonomy_clean_days WHERE product_id=${productId}
        AND day >= ${active.started_on}::date AND day <= ${active.ends_on}::date`) as any[]
    if (Number(hs[0]?.n ?? 0) > 0) blockers.push(`${hs[0].n} hard-stop violation(s) — drill FAILS per spec`)
  }

  // The 15-day drill is the L5.8 exit and carries the two criteria this instance cannot see.
  if (posture === 'drill_15') {
    for (const p of PORTFOLIO.filter(p => p !== productId)) {
      const rows = (await sql`SELECT count(*) AS n FROM autonomy_clean_days WHERE product_id=${p}`) as any[]
      if (Number(rows[0]?.n ?? 0) === 0) blockers.push(`portfolio scope: no data for '${p}' in this database — cannot verify portfolio-wide`)
    }
    blockers.push('≥3 self-originated improvements with commit-SHA proof: not tracked in this database')
  }

  const nextPosture: Posture | null =
    posture === 'drill_3' ? 'drill_7' : posture === 'drill_7' ? 'drill_15' : posture === 'drill_15' ? 'l5_8' : null

  return {
    posture, label: POSTURE_LABEL[posture], baselineFrom, streak, lastJudgedDay: lastDay,
    needDays: kind ?? 0, handled: null, needHandled: 0,
    eligibleFor: blockers.length || !nextPosture ? null : nextPosture,
    blockers,
    nextStep: blockers.length
      ? `${POSTURE_LABEL[posture]} in progress — ${blockers.join('; ')}`
      : `ELIGIBLE for ${nextPosture ? POSTURE_LABEL[nextPosture] : 'next stage'} — declare to advance`,
    drill: active ? { kind: active.kind, started_on: active.started_on, ends_on: active.ends_on, daysDone, status: active.status } : null,
  }
}

/**
 * Advance the posture. Requires a named human declarer and refuses unless evaluatePosture()
 * already says eligible — so a declaration can confirm earned progress but never manufacture it.
 * This is the whole reason the posture axis exists separately from the auto-promoted gate.
 */
export async function declarePosture(
  sql: SqlLike, productId: string, to: Posture, declaredBy: string, opts: { force?: boolean } = {},
): Promise<{ ok: boolean; from: Posture; to: Posture; reason: string }> {
  const ev = await evaluatePosture(sql, productId)
  if (!declaredBy?.trim()) return { ok: false, from: ev.posture, to, reason: 'declared_by is required — a posture is declared by someone, never by nobody' }
  if (ev.eligibleFor !== to && !opts.force) {
    return { ok: false, from: ev.posture, to, reason: ev.eligibleFor ? `eligible for ${ev.eligibleFor}, not ${to}` : `not eligible: ${ev.blockers.join('; ')}` }
  }
  await sql`UPDATE os_posture_state SET posture=${to}, entered_at=now(), declared_by=${declaredBy}, updated_at=now()
            WHERE product_id=${productId}`
  await sql`INSERT INTO audit_log (actor, action, target, detail) VALUES ('posture_tracker', 'posture_declared', ${productId},
            ${JSON.stringify({ from: ev.posture, to, declared_by: declaredBy, forced: !!opts.force, blockers: ev.blockers })}::jsonb)`.catch(() => {})
  // Starting a drill posture opens its window.
  if (to === 'drill_3' || to === 'drill_7' || to === 'drill_15') {
    const days = DRILL_DAYS[to]
    await sql`UPDATE os_posture_drills SET status='passed', resolved_at=now() WHERE product_id=${productId} AND status='running'`.catch(() => {})
    await sql`INSERT INTO os_posture_drills (product_id, kind, started_on, ends_on, declared_by)
              VALUES (${productId}, ${days}, CURRENT_DATE, CURRENT_DATE + ${days}, ${declaredBy})`.catch(() => {})
  }
  return { ok: true, from: ev.posture, to, reason: opts.force ? 'declared (FORCED past blockers)' : 'declared' }
}

/**
 * The one line on the daily brief. Deliberately shows the denominator and what is left, so the
 * founder watches it graduate instead of discovering it graduated.
 */
export function postureLine(ev: Evaluation): string {
  const head = `🎖 Posture: ${ev.label}`
  if (ev.posture === 'pre_l5_7') {
    const trips = ev.handled === null ? '?' : ev.handled
    return `${head} · ${ev.streak}/${ev.needDays} clean days · breaker trips ${trips}/${ev.needHandled} · ${ev.eligibleFor ? 'ELIGIBLE — declare L5.7' : `next: ${ev.blockers[0] ?? 'building'}`}`
  }
  if (ev.drill) {
    return `${head} · drill day ${ev.drill.daysDone}/${ev.drill.kind} · ${ev.eligibleFor ? 'ELIGIBLE — declare to advance' : `next: ${ev.blockers[0] ?? 'running'}`}`
  }
  return `${head} · ${ev.nextStep}`
}
