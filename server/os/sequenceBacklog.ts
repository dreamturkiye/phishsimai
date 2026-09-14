/**
 * Sequence-engine backlog — WHY ~1565 leads sit "unsent >5d" and how to drain them
 * without inventing cold copy or bypassing Dex / CAN-SPAM / geo / hard stops.
 *
 * Root causes (code, 2026-09-14):
 *   1. Heartbeat flags T1-without-T2 after 5 days.
 *   2. Touch-2 has its own batch path that HOLDS after 150 sends (PS-TOUCH2-PRICE-01,
 *      Aug 3) until janet_memory touch2_scale_approved='1'. Dual crisis + owner mandate
 *      now unlocks that remainder — still Dex-capped (≤10/run, ≤50 T2/day, ≤100 combined).
 *   3. touch2Eligible() only selects T1 BEFORE TOUCH2_COPY_ERA_CUTOFF (compliance-era).
 *      Price-led T1 after that cutoff is excluded from T2 (same pitch) AND cannot enter
 *      T3 because T3 required touch2_sent_at. Those leads are permanently stalled.
 *   4. Hourly follow-up slice is ceil(50/24)=3, and T3 finds zero rows while T2 is held.
 *
 * Drain doctrine: resume approved T2 for pre-cutoff ICP; skip T2 and send approved T3
 * for post-cutoff T1 after 5 days; T4 after T3+6d; suppress silent stale; pause new T1
 * while the overdue drainable pool is large. No new cold copy.
 */

/** Instant PS-COPY-PRICE-01 (price-led touch-1) reached production. Canonical copy lives in sequences.ts. */
export const TOUCH2_COPY_ERA_CUTOFF = '2026-08-03T01:36:00Z'

export const SEQUENCE_STALL_DAYS = 5
export const STALE_SILENT_DAYS = 45
export const DRAINABLE_HEALTHY_MAX = 10
export const PAUSE_T1_WHEN_DRAINABLE_AT = 50
/** Crisis T3/T4 hourly slice — Dex daily cap still binds. Was 3/hour, which cannot drain 1565. */
export const CRISIS_FOLLOWUP_HOURLY_SLICE = 15
export const FOLLOWUP_DAILY_CAP = 50
export const DRAIN_STALE_MARK_CAP = 40

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

/** Price-led T1 (on/after cutoff) must not get the same T2 pitch — they skip to T3. */
export function shouldSkipTouch2ForPriceEra(touch1SentAt: string | Date, copyEraCutoff = TOUCH2_COPY_ERA_CUTOFF): boolean {
  const t1 = new Date(touch1SentAt).getTime()
  const cut = Date.parse(copyEraCutoff)
  return Number.isFinite(t1) && t1 >= cut
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

export function shouldPauseTouch1(drainableOverdue: number, operatingCrisis: boolean): boolean {
  return operatingCrisis && drainableOverdue >= PAUSE_T1_WHEN_DRAINABLE_AT
}

/** Dual crisis + owner 2026-09-14 mandate: drain remaining approved T2. Dex caps still bind. */
export function shouldCrisisUnlockTouch2(operatingCrisis: boolean, scaleApproved: boolean): boolean {
  return operatingCrisis || scaleApproved
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
