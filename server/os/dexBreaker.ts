// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEX-BREAKER-01 — the bounce breaker threshold, owned by Dex and DERIVED, never constant.
//
//  THE FINDING THIS CLOSES
//    The breaker sat at a hardcoded 0.08. Against the true current-pipeline bounce rate of 1.55%
//    (11/710) that is 5.2x too loose: bounce would have to more than quintuple before the breaker
//    noticed. A threshold set against a constant is not a safety device, it is a decoration that
//    reads as one — which is worse, because it occupies the slot where a real one would go.
//
//    It looked like only 2x too loose while the rate was reported as the BLENDED 4.07%. Separating
//    the cohorts is what made the real size of the gap visible.
//
//  DERIVED FROM THE SANITIZED COHORT ONLY. THIS IS THE LOAD-BEARING PART.
//    The derivation reads current-pipeline sends exclusively. The legacy pre-sanitizer cohort
//    bounced at 12.11%, and if it could enter this calculation it would derive a threshold of ~24%
//    — a legacy tail would LOOSEN the live breaker, which is precisely backwards: the worse the dead
//    data, the more permissive the live guard. A test drives 10,000 legacy bounces through the
//    function and asserts the output does not move.
//
//  ASYMMETRIC APPLICATION — the same doctrine the Sales agent uses on suppression.
//    TIGHTENING and LOOSENING are not equally safe:
//      · tighter  -> we stop sending sooner than strictly needed. Recoverable, costs a pause.
//      · looser   -> we keep sending into a deliverability problem. Costs domain reputation, which
//                    is the one asset here that does not come back.
//    So a tightening derivation auto-applies behind the L4 gate. A LOOSENING one NEVER auto-applies
//    at any autonomy level — it is surfaced to Kaan as a proposal. Dex may make the guard stricter
//    on his own; only a human may make it weaker.
//
//  BOUNDS ARE HARD, AND CLAMPING IS REPORTED
//    Even a tightening derivation is clamped to [FLOOR, CEIL]. A derivation that wanted to go
//    outside is not silently clipped — the clamp is recorded and surfaced, because "the formula
//    wanted 0.9% and we held at 2%" is a fact about the formula worth seeing.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { assertAutonomyAllows, isAutonomyDenied, getAutonomyLevel, type GetLevel } from './autonomyGate'
import { COMPANY_ID } from './version'

/** janet_memory operating key. Stored in the DB so it can change without a redeploy. */
export const BREAKER_KEY = 'bounce_breaker_threshold'

/** Used only when the DB holds no value yet. Deliberately the TIGHT end, not the old 0.08. */
export const BREAKER_DEFAULT = 0.03

/** Never tighter than this — below 2% ordinary list decay would trip the breaker constantly. */
export const BREAKER_FLOOR = 0.02
/** Never looser than this, whatever the formula says. 5% sustained is already reputation damage. */
export const BREAKER_CEIL = 0.05

/** Headroom over the measured rate. 2x absorbs normal variance without hiding a real doubling. */
export const HEADROOM_MULTIPLIER = 2
/** Rounded DOWN to this step — when in doubt the threshold should be tighter, not looser. */
export const ROUND_STEP = 0.005
/** No derivation below this many current-pipeline sends. A thin window is not a measurement. */
export const MIN_DERIVE_N = 30

export type Derivation = {
  /** null when there is not enough current-pipeline data to derive anything. */
  value: number | null
  measuredRate: number | null
  contacted: number
  bounced: number
  clamped: 'floor' | 'ceil' | null
  reason: string
}

/**
 * Derive the threshold from CURRENT-COHORT sends. Pure — no I/O, exhaustively testable.
 *
 * Callers must pass sanitized-cohort counts. The function cannot verify that itself, so the
 * guarantee is enforced at the call site (reconcileBreaker reads Rex's `current` cohort) and pinned
 * by a test that proves legacy volume cannot move the result.
 */
export function deriveThreshold(bounced: number, contacted: number): Derivation {
  if (contacted < MIN_DERIVE_N) {
    return {
      value: null,
      measuredRate: contacted > 0 ? bounced / contacted : null,
      contacted,
      bounced,
      clamped: null,
      reason: `insufficient data — ${contacted} current-pipeline send(s), below n=${MIN_DERIVE_N}. Threshold left unchanged.`,
    }
  }
  const measuredRate = bounced / contacted
  const raw = measuredRate * HEADROOM_MULTIPLIER
  // Round DOWN: of two candidate thresholds the tighter one is the safer default.
  const rounded = Math.floor(raw / ROUND_STEP) * ROUND_STEP
  let value = rounded
  let clamped: Derivation['clamped'] = null
  if (value < BREAKER_FLOOR) { value = BREAKER_FLOOR; clamped = 'floor' }
  if (value > BREAKER_CEIL) { value = BREAKER_CEIL; clamped = 'ceil' }
  // Kill float noise (0.1+0.2 problems) before this becomes a stored config value.
  value = Number(value.toFixed(4))

  return {
    value,
    measuredRate,
    contacted,
    bounced,
    clamped,
    reason:
      `derived from CURRENT-cohort ${bounced}/${contacted} (${(measuredRate * 100).toFixed(2)}%) ` +
      `x${HEADROOM_MULTIPLIER} headroom, rounded down to ${(ROUND_STEP * 100).toFixed(1)}%` +
      (clamped ? `, CLAMPED at the ${clamped} of [${BREAKER_FLOOR}, ${BREAKER_CEIL}]` : '') +
      `. Legacy pre-sanitizer sends are excluded by construction.`,
  }
}

/** Which way a change moves the guard. Tightening is safe; loosening is a human decision. */
export type Direction = 'tighten' | 'loosen' | 'unchanged'

export function directionOf(current: number, next: number): Direction {
  if (Math.abs(next - current) < 1e-9) return 'unchanged'
  return next < current ? 'tighten' : 'loosen'
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────

/**
 * The STORED value, or null when nothing has been persisted yet.
 *
 * The distinction matters and was a real gap in the first cut: with no row, readBreakerThreshold()
 * returns the code default, so a derivation equal to that default reads as "unchanged" and never
 * writes — leaving the threshold permanently code-owned while the report claims Dex owns it. That
 * is a read surface with no writer, in config form, in the very module built to remove one.
 */
export async function readStoredThreshold(sql: any = getSql()): Promise<number | null> {
  try {
    const r = (await sql`SELECT value FROM janet_memory
      WHERE company_id=${COMPANY_ID} AND type='operating' AND key=${BREAKER_KEY} LIMIT 1`) as any[]
    if (!r.length) return null
    const v = Number(r[0]?.value)
    if (!Number.isFinite(v) || v <= 0) return null
    // Even a stored value is clamped on read: a bad row must not be able to disable the breaker.
    return Math.min(Math.max(v, BREAKER_FLOOR), BREAKER_CEIL)
  } catch {
    return null
  }
}

/** The live threshold. Any failure falls back to the tight default, never to the old 0.08. */
export async function readBreakerThreshold(sql: any = getSql()): Promise<number> {
  return (await readStoredThreshold(sql)) ?? BREAKER_DEFAULT
}

async function persist(sql: any, value: number, reason: string): Promise<void> {
  await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
            VALUES (${COMPANY_ID}, 'operating', ${BREAKER_KEY}, ${String(value)}, 1, 'dex_breaker')
            ON CONFLICT (company_id, type, key) DO UPDATE SET value=EXCLUDED.value, source='dex_breaker'`
  await sql`INSERT INTO audit_log (actor, action, target, detail)
            VALUES ('dex_breaker','deliverability_config',${COMPANY_ID},
                    ${JSON.stringify({ threshold: value, reason })}::jsonb)`.catch(() => {})
}

// ─── RECONCILE ───────────────────────────────────────────────────────────────

export type BreakerRun = {
  current: number
  derived: number | null
  applied: boolean
  direction: Direction
  gate: 'allowed' | 'denied' | 'not_attempted'
  surfacedToKaan: boolean
  reason: string
  line: string
}

/**
 * Re-derive and, if it TIGHTENS, apply. Called on Dex's daily cron.
 *
 * `cohort` must be the sanitized/current-pipeline counts — see the module header for why that is
 * the whole point rather than a detail.
 */
export async function reconcileBreaker(opts: {
  sql?: any
  cohort: { bounced: number; contacted: number }
  companyId?: string
  dryRun?: boolean
  /** Injectable for tests, exactly as autonomyGate does it. Defaults to the real DB reader. */
  getLevel?: GetLevel
}): Promise<BreakerRun> {
  const sql = opts.sql ?? getSql()
  const companyId = opts.companyId ?? COMPANY_ID
  const stored = await readStoredThreshold(sql)
  const current = stored ?? BREAKER_DEFAULT
  // Nothing persisted yet: the first successful derivation INITIALISES the stored value, so the
  // threshold becomes genuinely Dex-owned rather than remaining a code constant that happens to
  // agree with him.
  const uninitialised = stored === null
  const d = deriveThreshold(opts.cohort.bounced, opts.cohort.contacted)

  if (d.value === null) {
    return {
      current, derived: null, applied: false, direction: 'unchanged', gate: 'not_attempted',
      surfacedToKaan: false, reason: d.reason,
      line: `Bounce breaker held at ${(current * 100).toFixed(2)}% — ${d.reason}`,
    }
  }

  const direction = directionOf(current, d.value)

  if (direction === 'unchanged' && !uninitialised) {
    return {
      current, derived: d.value, applied: false, direction, gate: 'not_attempted', surfacedToKaan: false,
      reason: d.reason,
      line: `Bounce breaker steady at ${(current * 100).toFixed(2)}% — re-derivation agrees. ${d.reason}`,
    }
  }

  // Initialisation is never "loosening": it can only write a value at or below the tight default.
  if (direction === 'loosen' && !uninitialised) {
    // NEVER autonomous. Loosening the guard is the direction that costs reputation.
    return {
      current, derived: d.value, applied: false, direction, gate: 'not_attempted', surfacedToKaan: true,
      reason: d.reason,
      line:
        `Bounce breaker would LOOSEN ${(current * 100).toFixed(2)}% -> ${(d.value * 100).toFixed(2)}% ` +
        `— NOT APPLIED. Dex may tighten the guard autonomously; only Kaan may weaken it. ${d.reason}`,
    }
  }

  if (opts.dryRun) {
    return {
      current, derived: d.value, applied: false, direction, gate: 'not_attempted', surfacedToKaan: false,
      reason: d.reason,
      line: `DRY RUN: would tighten ${(current * 100).toFixed(2)}% -> ${(d.value * 100).toFixed(2)}%. ${d.reason}`,
    }
  }

  try {
    await assertAutonomyAllows('deliverability_config', companyId, opts.getLevel ?? getAutonomyLevel)
  } catch (e) {
    if (!isAutonomyDenied(e)) throw e
    return {
      current, derived: d.value, applied: false, direction, gate: 'denied', surfacedToKaan: true,
      reason: d.reason,
      line:
        `Bounce breaker tightening ${(current * 100).toFixed(2)}% -> ${(d.value * 100).toFixed(2)}% ` +
        `BLOCKED by the autonomy gate (${(e as any).reason}). Nothing written.`,
    }
  }

  await persist(sql, d.value, d.reason)
  return {
    current, derived: d.value, applied: true, direction, gate: 'allowed', surfacedToKaan: false,
    reason: d.reason,
    line: uninitialised
      ? `Bounce breaker INITIALISED to ${(d.value * 100).toFixed(2)}% and is now Dex-owned in janet_memory ` +
        `(gated, L4) — it was a code constant until this write. ${d.reason}`
      : `Bounce breaker TIGHTENED ${(current * 100).toFixed(2)}% -> ${(d.value * 100).toFixed(2)}% ` +
        `(gated, L4). ${d.reason}`,
  }
}
