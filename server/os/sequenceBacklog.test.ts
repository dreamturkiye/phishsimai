import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CRISIS_FOLLOWUP_HOURLY_SLICE,
  CRISIS_T1_DRIP_MAX,
  DRAINABLE_HEALTHY_MAX,
  PAUSE_T1_WHEN_DRAINABLE_AT,
  crisisTouch1DripCap,
  drainPlanDays,
  followUpHourlySlice,
  isStaleSilentLead,
  postCutoffBatchHeadroom,
  secondTouchCopyKind,
  sequenceEngineCheck,
  shouldCrisisUnlockTouch2,
  shouldPauseTouch1,
  shouldSkipTouch2ForPriceEra,
  touch1RunCap,
  TOUCH2_POST_ERA_BATCH1_LIMIT,
  TOUCH2_POST_ERA_EPOCH,
  TOUCH2_POST_ERA_SCALE_KEY,
} from './sequenceBacklog'
import { TOUCH2_COPY_ERA_CUTOFF } from './sequenceBacklog'

describe('sequence backlog routing (no invented copy)', () => {
  it('skips the T2 price pitch for price-era T1 (second email uses approved T3 copy)', () => {
    expect(shouldSkipTouch2ForPriceEra('2026-08-03T01:36:00Z')).toBe(true)
    expect(shouldSkipTouch2ForPriceEra('2026-09-14T00:00:00Z')).toBe(true)
    expect(shouldSkipTouch2ForPriceEra('2026-08-02T12:00:00Z')).toBe(false)
    expect(TOUCH2_COPY_ERA_CUTOFF).toBe('2026-08-03T01:36:00Z')
    expect(secondTouchCopyKind('2026-08-02T12:00:00Z')).toBe('approved_t2_price')
    expect(secondTouchCopyKind('2026-08-04T00:00:00Z')).toBe('approved_t3_value_reframe')
  })

  it('marks silent 45d+ no-open unreplied leads stale, not recently-touched ICP', () => {
    expect(isStaleSilentLead({ touch1AgeDays: 50, openCount: 0, replied: false })).toBe(true)
    expect(isStaleSilentLead({ touch1AgeDays: 50, openCount: 2, replied: false })).toBe(false)
    expect(isStaleSilentLead({ touch1AgeDays: 50, openCount: 0, replied: true })).toBe(false)
    expect(isStaleSilentLead({ touch1AgeDays: 10, openCount: 0, replied: false })).toBe(false)
    expect(isStaleSilentLead({ touch1AgeDays: 60, openCount: 0, engaged: true })).toBe(false)
  })

  it('pauses new T1 while dual crisis + drainable overdue is large', () => {
    expect(shouldPauseTouch1(1565, true)).toBe(true)
    expect(shouldPauseTouch1(PAUSE_T1_WHEN_DRAINABLE_AT, true)).toBe(true)
    expect(shouldPauseTouch1(10, true)).toBe(false)
    expect(shouldPauseTouch1(1565, false)).toBe(false)
  })

  it('does NOT pause new T1 when the sanitized untouched pool is starved (live 2026-09-17)', () => {
    // pauseNewTouch1=true with drainableOverdue=1120 AND sendable=0 froze the money path.
    // The pause exists to drain follow-ups when T1 is still feeding; with T1 starved it is a lock.
    expect(shouldPauseTouch1(1120, true, { t1Starved: true })).toBe(false)
    expect(shouldPauseTouch1(1120, true, { t1Starved: false })).toBe(true)
    expect(shouldPauseTouch1(PAUSE_T1_WHEN_DRAINABLE_AT, true, { t1Starved: true })).toBe(false)
  })

  it('crisis pause still drips T1 up to HOURLY_SLICE (≤10), never zeroes freshly verified leads', () => {
    // Live: 40 qev_valid sendable, pauseNewTouch1=true, drainableOverdue≈1112, sent=0.
    expect(shouldPauseTouch1(1112, true, { t1Starved: false })).toBe(true)
    expect(crisisTouch1DripCap(3)).toBe(3)
    expect(crisisTouch1DripCap(24)).toBe(CRISIS_T1_DRIP_MAX)
    expect(CRISIS_T1_DRIP_MAX).toBe(10)
    expect(touch1RunCap({ pauseNewTouch1: true, dailyAllowance: 50, hourlySlice: 3 })).toBe(3)
    expect(touch1RunCap({ pauseNewTouch1: true, dailyAllowance: 50, hourlySlice: 24 })).toBe(10)
    expect(touch1RunCap({ pauseNewTouch1: true, dailyAllowance: 0, hourlySlice: 3 })).toBe(0)
    expect(touch1RunCap({ pauseNewTouch1: false, dailyAllowance: 50, hourlySlice: 3 })).toBe(3)
    expect(touch1RunCap({ pauseNewTouch1: false, dailyAllowance: 50, hourlySlice: 24 })).toBe(24)
  })

  it('unlocks remaining approved T2 during operating crisis without waiting for the Aug-3 hold flag', () => {
    expect(shouldCrisisUnlockTouch2(true, false)).toBe(true)
    expect(shouldCrisisUnlockTouch2(false, true)).toBe(true)
    expect(shouldCrisisUnlockTouch2(false, false)).toBe(false)
  })

  it('plans drain days at the Dex follow-up cap, not a burst', () => {
    expect(drainPlanDays(0)).toBe(0)
    expect(drainPlanDays(1565, 50)).toBe(32)
    expect(drainPlanDays(1601, 50)).toBe(33)
    expect(followUpHourlySlice(true, 3)).toBe(CRISIS_FOLLOWUP_HOURLY_SLICE)
    expect(followUpHourlySlice(false, 3)).toBe(3)
  })
})

describe('post-cutoff measured batch (prod SQL: pre=0 post=1601 eligible=0 scale=1)', () => {
  it('does not treat old touch2_scale_approved as a 1600 unlock', () => {
    expect(TOUCH2_POST_ERA_EPOCH).toBe('2026-09-14T22:00:00Z')
    expect(TOUCH2_POST_ERA_BATCH1_LIMIT).toBe(150)
    expect(TOUCH2_POST_ERA_SCALE_KEY).toBe('touch2_post_cutoff_scale_approved')
    const first = postCutoffBatchHeadroom({
      sentInPostEraBatch: 0, postCutoffScaleApproved: false, operatingCrisis: true,
    })
    expect(first.holding).toBe(false)
    expect(first.crisisDrain).toBe(false)
    expect(first.headroom).toBe(150)
    expect(first.headroom).not.toBe(Number.MAX_SAFE_INTEGER)
  })

  it('holds after 150 unless dual crisis (Dex drain) or the NEW scale key', () => {
    const hold = postCutoffBatchHeadroom({
      sentInPostEraBatch: 150, postCutoffScaleApproved: false, operatingCrisis: false,
    })
    expect(hold).toMatchObject({ headroom: 0, holding: true, crisisDrain: false })
    const crisis = postCutoffBatchHeadroom({
      sentInPostEraBatch: 150, postCutoffScaleApproved: false, operatingCrisis: true,
    })
    expect(crisis.holding).toBe(false)
    expect(crisis.crisisDrain).toBe(true)
    const scaled = postCutoffBatchHeadroom({
      sentInPostEraBatch: 150, postCutoffScaleApproved: true, operatingCrisis: false,
    })
    expect(scaled.holding).toBe(false)
    expect(scaled.crisisDrain).toBe(false)
  })

  it('never returns 1601 as a single-run headroom during batch 1', () => {
    const h = postCutoffBatchHeadroom({
      sentInPostEraBatch: 0, postCutoffScaleApproved: false, operatingCrisis: true,
    })
    expect(h.headroom).toBeLessThanOrEqual(TOUCH2_POST_ERA_BATCH1_LIMIT)
    expect(h.headroom).toBe(150)
  })
})

describe('sequence_engine honesty', () => {
  it('is unhealthy when 1565 sit untouched and this tick sent nothing', () => {
    const c = sequenceEngineCheck({ drainableOverdue: 1565, drainSent: 0 })
    expect(c.ok).toBe(false)
    expect(c.draining).toBe(false)
    expect(c.detail).toMatch(/1565/)
    expect(c.detail).toMatch(/drain plan/)
  })

  it('is healthy (draining) when this tick sent, even if the pool is still large', () => {
    const c = sequenceEngineCheck({ drainableOverdue: 1565, rawUnsentTouch2Over5d: 1565, drainSent: 12, staleMarked: 8 })
    expect(c.ok).toBe(true)
    expect(c.draining).toBe(true)
    expect(c.detail).toMatch(/sent=12/)
  })

  it('is healthy when drainable overdue is under the floor', () => {
    const c = sequenceEngineCheck({ drainableOverdue: DRAINABLE_HEALTHY_MAX - 1, drainSent: 0 })
    expect(c.ok).toBe(true)
  })

  it('never calls a tripped breaker healthy', () => {
    const c = sequenceEngineCheck({ drainableOverdue: 12, drainSent: 12, tripped: true })
    expect(c.ok).toBe(false)
    expect(c.detail).toMatch(/TRIPPED/)
  })
})

describe('drain is wired onto live send paths', () => {
  it('heartbeat and sequence cron execute the drain tick', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    const hb = readFileSync('server/os/heartbeat.ts', 'utf8')
    expect(seq).toContain('runSequenceDrainTick')
    expect(seq).toContain('shouldCrisisUnlockTouch2')
    expect(seq).toContain('TOUCH2_COPY_ERA_CUTOFF')
    expect(seq).toMatch(/touch1_sent_at >= \$\{TOUCH2_COPY_ERA_CUTOFF\}/)
    expect(seq).toContain('loadTouch1HealthForPause')
    expect(seq).toContain('t1Starved')
    expect(seq).toContain('touch1RunCap')
    expect(seq).toContain("sanitize_reason IN ('qev_valid','mev_valid')")
    expect(hb).toContain('runSequenceDrainTick')
    expect(hb).toContain('sequenceEngineCheck')
    expect(hb).toContain('includeTouch2: true')
    expect(hb).toContain('HEARTBEAT_TOUCH2_MAX')
  })

  it('sequence-touch2 eligible includes post-cutoff T1 after 5 days (live empty-eligible fix)', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toContain('seq_t3_as_t2')
    expect(seq).toContain('secondTouchCopyKind')
    expect(seq).toContain('touch2_sent_at=${ts}, touch3_sent_at=${ts}')
    expect(seq).toContain('touch2PostEraHeadroom')
    expect(seq).toContain('TOUCH2_POST_ERA_EPOCH')
    expect(seq).toContain('includePostCutoff')
  })
})
