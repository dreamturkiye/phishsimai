/**
 * Sequence-engine backlog — WHY ~1565 leads sit "unsent >5d" and how to drain them
 * without inventing cold copy or bypassing Dex / CAN-SPAM / geo / hard stops.
 *
 * Root causes (code, 2026-09-14):
 *   1. Heartbeat flags T1-without-T2 after 5 days.
 *   2. Touch-2 has its own batch path that HOLDS after 150 sends (PS-TOUCH2-PRICE-01,
 *      Aug 3) until janet_memory touch2_scale_approved='1'. Dual crisis + owner mandate
 *      now unlocks that remainder — still Dex-capped (≤10/run, ≤50 T2/day, ≤100 combined).
 *   3. touch2Eligible() historically only selected T1 BEFORE TOUCH2_COPY_ERA_CUTOFF
 *      (compliance-era). Price-led T1 after that cutoff was excluded from T2 (same
 *      pitch — correct) AND could not enter T3 because T3 required touch2_sent_at.
 *      Live 2026-09-14: /api/os/sequence-touch2 attempted:0 sent:0 headroom:10
 *      holding:false — pre-cutoff eligible exhausted; ~1565 stalled were POST-cutoff.
 *   4. Hourly follow-up slice is ceil(50/24)=3, and T3 finds zero rows while T2 is held.
 *
 * Drain doctrine: resume approved T2 copy for pre-cutoff ICP; for post-cutoff T1 after
 * ≥5 days send the EXISTING approved SEQUENCE touch-3 (value re-frame, not a same-day
 * double price-pitch) via runTouch2Batch and stamp touch2_sent_at (and touch3_sent_at
 * so the T3 loop does not re-send the same copy). T4 after T3+6d. Suppress silent stale.
 * Pause new T1 while the overdue drainable pool is large. No invented cold copy.
 */

/** Instant PS-COPY-PRICE-01 (price-led touch-1) reached production. Canonical copy lives in sequences.ts. */
export const TOUCH2_COPY_ERA_CUTOFF = '2026-08-03T01:36:00Z'

export const SEQUENCE_STALL_DAYS = 5
export const STALE_SILENT_DAYS = 45
export const DRAINABLE_HEALTHY_MAX = 10
export const PAUSE_T1_WHEN_DRAINABLE_AT = 50
/** Dual-crisis T1 is a drip, not a zero. Live 2026-09-17: 40 qev_valid sendable, pauseNewTouch1=true, sent=0. */
export const CRISIS_T1_DRIP_MAX = 10
/** Crisis T3/T4 hourly slice — Dex daily cap still binds. Was 3/hour, which cannot drain 1565. */
export const CRISIS_FOLLOWUP_HOURLY_SLICE = 15
export const FOLLOWUP_DAILY_CAP = 50
export const DRAIN_STALE_MARK_CAP = 40

/**
 * Measured post-cutoff second-touch batch (O.32.11). Independent of the Aug-3
 * TOUCH2_EPOCH (796 already sent) and of janet_memory touch2_scale_approved='1'.
 * That flag unlocked the *price* T2 on the pre-cutoff 797 — it is NOT permission
 * to dump ~1601 price-era T1 in a day. Confirmed prod 2026-09-14: stalled_pre=0,
 * stalled_post≈1601, touch2_eligible=0, scale='1'.
 */
export const TOUCH2_POST_ERA_EPOCH = '2026-09-14T22:00:00Z'
export const TOUCH2_POST_ERA_BATCH1_LIMIT = 150
export const TOUCH2_POST_ERA_SCALE_KEY = 'touch2_post_cutoff_scale_approved'

export type SequenceBacklogCensus = {
  rawUnsentTouch2Over5d: number
  drainableOverdue: number
  waitingTouch2: number
  waitingTouch3SkipT2: number
  waitingTouch3AfterT2: number
  waitingTouch4: number
  staleSilent: number
  geoOrSuppressed: number
}

export const EMPTY_SEQUENCE_BACKLOG: SequenceBacklogCensus = {
  rawUnsentTouch2Over5d: 0,
  drainableOverdue: 0,
  waitingTouch2: 0,
  waitingTouch3SkipT2: 0,
  waitingTouch3AfterT2: 0,
  waitingTouch4: 0,
  staleSilent: 0,
  geoOrSuppressed: 0,
}

export type SequenceEngineCheck = {
  ok: boolean
  detail: string
  draining: boolean
}

/** Price-led T1 (on/after cutoff) must not get the same T2 pitch — they get approved T3 copy as the second email. */
export function shouldSkipTouch2ForPriceEra(touch1SentAt: string | Date, copyEraCutoff = TOUCH2_COPY_ERA_CUTOFF): boolean {
  const t1 = new Date(touch1SentAt).getTime()
  const cut = Date.parse(copyEraCutoff)
  return Number.isFinite(t1) && t1 >= cut
}

export type SecondTouchCopyKind = 'approved_t2_price' | 'approved_t3_value_reframe'

/**
 * Safety: post-cutoff T1 already received the price-led pitch. A second email is allowed
 * only with the DISTINCT founder-approved T3 value-reframe, and only after SEQUENCE_STALL_DAYS.
 * Pre-cutoff T1 still gets the approved T2 price follow-up (PS-TOUCH2-PRICE-01).
 */
export function secondTouchCopyKind(touch1SentAt: string | Date, copyEraCutoff = TOUCH2_COPY_ERA_CUTOFF): SecondTouchCopyKind {
  return shouldSkipTouch2ForPriceEra(touch1SentAt, copyEraCutoff)
    ? 'approved_t3_value_reframe'
    : 'approved_t2_price'
}

export function isStaleSilentLead(opts: {
  touch1AgeDays: number
  openCount?: number | null
  replied?: boolean
  engaged?: boolean
  staleDays?: number
}): boolean {
  if (opts.replied || opts.engaged) return false
  const opens = Number(opts.openCount ?? 0) || 0
  if (opens > 0) return false
  return opts.touch1AgeDays >= (opts.staleDays ?? STALE_SILENT_DAYS)
}

export function shouldPauseTouch1(
  drainableOverdue: number,
  operatingCrisis: boolean,
  opts?: { t1Starved?: boolean },
): boolean {
  // Live 2026-09-17: pauseNewTouch1=true with drainableOverdue=1120 WHILE sanitized T1 pool=0.
  // Pausing new T1 was meant to drain follow-ups when T1 was still sending. With sendable=0 it
  // guarantees the money path stays dead. Never pause T1 when the sanitized untouched pool is empty.
  if (opts?.t1Starved) return false
  return operatingCrisis && drainableOverdue >= PAUSE_T1_WHEN_DRAINABLE_AT
}

/** Hourly T1 cap during dual-crisis pause: HOURLY_SLICE, never above CRISIS_T1_DRIP_MAX (Dex rails). */
export function crisisTouch1DripCap(hourlySlice: number, dripMax = CRISIS_T1_DRIP_MAX): number {
  const slice = Math.max(1, Math.floor(hourlySlice) || 1)
  const max = Math.max(1, Math.floor(dripMax) || CRISIS_T1_DRIP_MAX)
  return Math.min(slice, max)
}

/**
 * Per-run T1 cap. Pause still prefers follow-up drain (flag stays true) but MUST NOT zero
 * freshly-verified never-touched leads. Dex daily allowance still binds.
 */
export function touch1RunCap(opts: {
  pauseNewTouch1: boolean
  dailyAllowance: number
  hourlySlice: number
}): number {
  const allowance = Math.max(0, Math.floor(opts.dailyAllowance) || 0)
  const slice = Math.max(1, Math.floor(opts.hourlySlice) || 1)
  if (!opts.pauseNewTouch1) return Math.min(allowance, slice)
  return Math.min(allowance, crisisTouch1DripCap(slice))
}

/** Dual crisis + owner 2026-09-14 mandate: drain remaining approved T2. Dex caps still bind. */
export function shouldCrisisUnlockTouch2(operatingCrisis: boolean, scaleApproved: boolean): boolean {
  return operatingCrisis || scaleApproved
}

/**
 * Headroom for T3-as-T2 on post-copy-era leads. Old touch2_scale_approved is intentionally
 * not a parameter — that unlock spent the pre-cutoff list (796/797). Batch 1 = 150 of the
 * DISTINCT approved T3 copy, Dex ≤10/run ≤50/day. After 150: HOLD unless dual crisis
 * (continue at Dex caps, never a 1600 blast) or touch2_post_cutoff_scale_approved='1'.
 */
export function postCutoffBatchHeadroom(opts: {
  sentInPostEraBatch: number
  postCutoffScaleApproved: boolean
  operatingCrisis: boolean
  batchLimit?: number
}): { headroom: number; sentInBatch: number; holding: boolean; crisisDrain: boolean } {
  const limit = Math.max(1, Math.floor(opts.batchLimit ?? TOUCH2_POST_ERA_BATCH1_LIMIT) || TOUCH2_POST_ERA_BATCH1_LIMIT)
  const sent = Math.max(0, Number(opts.sentInPostEraBatch) || 0)
  const remaining = Math.max(0, limit - sent)
  if (opts.postCutoffScaleApproved) {
    return { headroom: Number.MAX_SAFE_INTEGER, sentInBatch: sent, holding: false, crisisDrain: false }
  }
  if (remaining > 0) {
    return { headroom: remaining, sentInBatch: sent, holding: false, crisisDrain: false }
  }
  if (opts.operatingCrisis) {
    return { headroom: Number.MAX_SAFE_INTEGER, sentInBatch: sent, holding: false, crisisDrain: true }
  }
  return { headroom: 0, sentInBatch: sent, holding: true, crisisDrain: false }
}

export function drainPlanDays(drainableOverdue: number, dailyCap = FOLLOWUP_DAILY_CAP): number {
  const cap = Math.max(1, Math.floor(dailyCap) || FOLLOWUP_DAILY_CAP)
  if (drainableOverdue <= 0) return 0
  return Math.ceil(drainableOverdue / cap)
}

export function followUpHourlySlice(operatingCrisis: boolean, defaultSlice: number): number {
  if (!operatingCrisis) return Math.max(1, defaultSlice)
  return Math.max(defaultSlice, CRISIS_FOLLOWUP_HOURLY_SLICE)
}

/**
 * sequence_engine is healthy when the SENDABLE overdue pool is small, OR this tick
 * actually drained (honest draining plan — not "healthy" while 1565 sit untouched).
 * A tripped breaker is never healthy.
 */
export function sequenceEngineCheck(input: {
  drainableOverdue: number
  rawUnsentTouch2Over5d?: number
  drainSent: number
  staleMarked?: number
  tripped?: boolean
  dailyCap?: number
}): SequenceEngineCheck {
  const drainable = Math.max(0, Number(input.drainableOverdue) || 0)
  const raw = Math.max(0, Number(input.rawUnsentTouch2Over5d ?? drainable) || 0)
  const sent = Math.max(0, Number(input.drainSent) || 0)
  const stale = Math.max(0, Number(input.staleMarked) || 0)
  const days = drainPlanDays(drainable, input.dailyCap)
  const draining = sent > 0 || stale > 0
  if (input.tripped) {
    return {
      ok: false,
      draining: false,
      detail: `${drainable} drainable overdue; bounce breaker TRIPPED — drain stood down. raw T1-no-T2>5d=${raw}`,
    }
  }
  const ok = drainable < DRAINABLE_HEALTHY_MAX || draining
  const plan = drainable >= DRAINABLE_HEALTHY_MAX
    ? ` drain plan ~${days}d at ≤${input.dailyCap ?? FOLLOWUP_DAILY_CAP}/day (pause new T1 while overdue≥${PAUSE_T1_WHEN_DRAINABLE_AT})`
    : ''
  return {
    ok,
    draining,
    detail:
      `${drainable} drainable next-touch overdue (raw T1-no-T2>5d=${raw}); ` +
      `this tick sent=${sent} staleMarked=${stale}.${plan}`,
  }
}

export async function countSequenceBacklog(sql: any): Promise<SequenceBacklogCensus> {
  const empty = { ...EMPTY_SEQUENCE_BACKLOG }
  if (!sql) return empty
  const rows = (await sql`
    SELECT
      count(*) FILTER (
        WHERE touch1_sent_at IS NOT NULL
          AND touch2_sent_at IS NULL
          AND touch1_sent_at < NOW() - INTERVAL '5 days'
          AND COALESCE(replied, false) = false
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
      )::int AS raw_t2,
      count(*) FILTER (
        WHERE touch1_sent_at IS NOT NULL
          AND touch2_sent_at IS NULL
          AND touch1_sent_at < ${TOUCH2_COPY_ERA_CUTOFF}::timestamptz
          AND touch1_sent_at < NOW() - INTERVAL '5 days'
          AND COALESCE(replied, false) = false
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND country = ANY(ARRAY['US','GB','AU']::text[])
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(ps_outreach_leads.email))
          AND NOT (
            COALESCE(open_count, 0) = 0
            AND touch1_sent_at < NOW() - INTERVAL '45 days'
          )
      )::int AS wait_t2,
      count(*) FILTER (
        WHERE touch1_sent_at IS NOT NULL
          AND touch2_sent_at IS NULL
          AND touch3_sent_at IS NULL
          AND touch1_sent_at >= ${TOUCH2_COPY_ERA_CUTOFF}::timestamptz
          AND touch1_sent_at < NOW() - INTERVAL '5 days'
          AND COALESCE(replied, false) = false
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND country = ANY(ARRAY['US','GB','AU']::text[])
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(ps_outreach_leads.email))
          AND NOT (
            COALESCE(open_count, 0) = 0
            AND touch1_sent_at < NOW() - INTERVAL '45 days'
          )
      )::int AS wait_t3_skip,
      count(*) FILTER (
        WHERE touch2_sent_at IS NOT NULL
          AND touch3_sent_at IS NULL
          AND touch2_sent_at < NOW() - INTERVAL '5 days'
          AND COALESCE(replied, false) = false
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND country = ANY(ARRAY['US','GB','AU']::text[])
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(ps_outreach_leads.email))
      )::int AS wait_t3_after,
      count(*) FILTER (
        WHERE touch3_sent_at IS NOT NULL
          AND touch4_sent_at IS NULL
          AND touch3_sent_at < NOW() - INTERVAL '6 days'
          AND COALESCE(replied, false) = false
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND country = ANY(ARRAY['US','GB','AU']::text[])
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(ps_outreach_leads.email))
      )::int AS wait_t4,
      count(*) FILTER (
        WHERE touch1_sent_at IS NOT NULL
          AND COALESCE(replied, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test','engaged')
          AND COALESCE(open_count, 0) = 0
          AND touch1_sent_at < NOW() - INTERVAL '45 days'
          AND COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
      )::int AS stale_silent
    FROM ps_outreach_leads
  `.catch(() => [])) as any[]
  const r = rows[0] || {}
  const waitingTouch2 = Number(r.wait_t2 ?? 0) || 0
  const waitingTouch3SkipT2 = Number(r.wait_t3_skip ?? 0) || 0
  const waitingTouch3AfterT2 = Number(r.wait_t3_after ?? 0) || 0
  const waitingTouch4 = Number(r.wait_t4 ?? 0) || 0
  const drainableOverdue = waitingTouch2 + waitingTouch3SkipT2 + waitingTouch3AfterT2 + waitingTouch4
  const raw = Number(r.raw_t2 ?? 0) || 0
  return {
    rawUnsentTouch2Over5d: raw,
    drainableOverdue,
    waitingTouch2,
    waitingTouch3SkipT2,
    waitingTouch3AfterT2,
    waitingTouch4,
    staleSilent: Number(r.stale_silent ?? 0) || 0,
    geoOrSuppressed: Math.max(0, raw - drainableOverdue),
  }
}
