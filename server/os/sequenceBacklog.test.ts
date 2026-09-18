import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CRISIS_FOLLOWUP_HOURLY_SLICE,
  DRAINABLE_HEALTHY_MAX,
  PAUSE_T1_WHEN_DRAINABLE_AT,
  T1_QUALITY_REFILL_MAX,
  drainPlanDays,
  followUpHourlySlice,
  isSmallQualityT1Refill,
  isStaleSilentLead,
  postCutoffBatchHeadroom,
  secondTouchCopyKind,
  sequenceEngineCheck,
  shouldCrisisUnlockTouch2,
  shouldPauseTouch1,
  shouldSkipTouch2ForPriceEra,
  t1CanUseLeftoverDexHeadroom,
  TOUCH2_POST_ERA_BATCH1_LIMIT,
  TOUCH2_POST_ERA_EPOCH,
  TOUCH2_POST_ERA_SCALE_KEY,
} from './sequenceBacklog'
import { TOUCH2_COPY_ERA_CUTOFF } from './sequenceBacklog'
import {
  COMBINED_DAILY_CAP,
  NEW_TOUCH_DAILY_CAP,
  SECOND_TOUCH_DAILY_CAP,
  newTouchAllowance,
} from './outreachThrottle'

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

  it('does NOT pause T1 for a small quality refill (≤150) during crisis drain (live after #320)', () => {
    // ~40 qev_valid sendable + drainableOverdue≈1100 + operatingCrisis still zeroed dailyAllowance.
    expect(T1_QUALITY_REFILL_MAX).toBe(150)
    expect(isSmallQualityT1Refill(40)).toBe(true)
    expect(isSmallQualityT1Refill(150)).toBe(true)
    expect(isSmallQualityT1Refill(0)).toBe(false)
    expect(isSmallQualityT1Refill(151)).toBe(false)
    expect(shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 40 })).toBe(false)
    expect(shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 1 })).toBe(false)
    expect(shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 150 })).toBe(false)
    expect(shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 151 })).toBe(true)
    expect(shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 400 })).toBe(true)
    // Mass scale without an eligible count still pauses (legacy callers).
    expect(shouldPauseTouch1(1100, true, { t1Starved: false })).toBe(true)
  })

  it('does NOT pause T1 when T2 day-cap is exhausted and leftover combined can only go to T1 (live 2026-09-18)', () => {
    // Live: sanitizedEligible=151 (one over small-refill), drainable≈775, crisis,
    // T2=50/50 rem0, T1=36/50 rem14, combined 86/100 rem14. Pause zeroed dailyAllowance.
    expect(NEW_TOUCH_DAILY_CAP).toBe(50)
    expect(SECOND_TOUCH_DAILY_CAP).toBe(50)
    expect(COMBINED_DAILY_CAP).toBe(100)
    const live = {
      t1Starved: false,
      sanitizedEligible: 151,
      newSentToday: 36,
      secondSentToday: SECOND_TOUCH_DAILY_CAP,
    }
    expect(t1CanUseLeftoverDexHeadroom(live)).toBe(true)
    expect(shouldPauseTouch1(775, true, live)).toBe(false)
    expect(newTouchAllowance({ newSentToday: 36, secondSentToday: 50 })).toBeGreaterThan(0)
    expect(newTouchAllowance({ newSentToday: 36, secondSentToday: 50 })).toBe(14)
  })

  it('still pauses T1 when T2 has Dex headroom so overdue drain prefers follow-ups', () => {
    const draining = {
      t1Starved: false,
      sanitizedEligible: 151,
      newSentToday: 36,
      secondSentToday: 20,
    }
    expect(t1CanUseLeftoverDexHeadroom(draining)).toBe(false)
    expect(shouldPauseTouch1(775, true, draining)).toBe(true)
    expect(shouldPauseTouch1(1100, true, {
      t1Starved: false,
      sanitizedEligible: 400,
      newSentToday: 10,
      secondSentToday: 5,
    })).toBe(true)
  })

  it('does not unpause when T2 is full but T1/combined rem is also 0', () => {
    expect(shouldPauseTouch1(775, true, {
      t1Starved: false,
      sanitizedEligible: 151,
      newSentToday: 50,
      secondSentToday: 50,
    })).toBe(true)
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
    expect(seq).toContain('sanitizedEligible: t1Health?.sanitizedEligible ?? 0')
    expect(seq).toContain('secondSentToday: throttleCounts.secondSentToday')
    expect(seq).toContain('newSentToday: throttleCounts.newSentToday')
    const pauseAt = seq.indexOf('shouldPauseTouch1(backlog')
    const countsAt = seq.lastIndexOf('const throttleCounts = await sentTodayCounts(sql)', pauseAt)
    expect(pauseAt).toBeGreaterThan(-1)
    expect(countsAt).toBeGreaterThan(-1)
    expect(countsAt).toBeLessThan(pauseAt)
    expect(seq).toMatch(/secondSentToday: t1\.secondSentToday/)
    expect(seq).not.toMatch(/WARM_CTA_TOUCHES = \[[^\]]*93/)
    expect(seq).toMatch(/export const DAILY_SEND_LIMIT = 20/)
    expect(hb).toContain('runSequenceDrainTick')
    expect(hb).toContain('sequenceEngineCheck')
    expect(hb).toContain('includeTouch2: true')
    expect(hb).toContain('HEARTBEAT_TOUCH2_MAX')
  })

  it('sequence-touch2 eligible includes post-cutoff T1 after 5 days (live empty-eligible fix)', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toContain('seq_t3_as_t2')
    expect(seq).toContain('secondTouchCopyKind')
    expect(seq).toContain('touch2PostEraHeadroom')
    expect(seq).toContain('TOUCH2_POST_ERA_EPOCH')
    expect(seq).toContain('includePostCutoff')
    expect(seq).toContain('AND l.touch3_sent_at IS NULL')
    const backlog = readFileSync('server/os/sequenceBacklog.ts', 'utf8')
    expect(backlog).toMatch(/AND touch3_sent_at IS NULL\s+AND touch1_sent_at < NOW\(\) - INTERVAL '5 days'/)
  })

  it('skip-T2 T3 stamps T3 only; runTouch2Batch T3-as-T2 is the sole dual-stamp (T1 starve 2026-09-17)', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    const dual = seq.match(/touch2_sent_at=\$\{ts\}, touch3_sent_at=\$\{ts\}/g) || []
    expect(dual).toHaveLength(1)
    expect(seq).toMatch(/T3-only stamp/)
    expect(seq).not.toMatch(/Skip-T2 path: this T3 copy IS the second email — stamp T2/)
  })
})
