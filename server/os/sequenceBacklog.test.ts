import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CRISIS_FOLLOWUP_HOURLY_SLICE,
  DRAINABLE_HEALTHY_MAX,
  PAUSE_T1_WHEN_DRAINABLE_AT,
  drainPlanDays,
  followUpHourlySlice,
  isStaleSilentLead,
  secondTouchCopyKind,
  sequenceEngineCheck,
  shouldCrisisUnlockTouch2,
  shouldPauseTouch1,
  shouldSkipTouch2ForPriceEra,
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

  it('unlocks remaining approved T2 during operating crisis without waiting for the Aug-3 hold flag', () => {
    expect(shouldCrisisUnlockTouch2(true, false)).toBe(true)
    expect(shouldCrisisUnlockTouch2(false, true)).toBe(true)
    expect(shouldCrisisUnlockTouch2(false, false)).toBe(false)
  })

  it('plans drain days at the Dex follow-up cap, not a burst', () => {
    expect(drainPlanDays(0)).toBe(0)
    expect(drainPlanDays(1565, 50)).toBe(32)
    expect(drainPlanDays(100, 50)).toBe(2)
    expect(followUpHourlySlice(true, 3)).toBe(CRISIS_FOLLOWUP_HOURLY_SLICE)
    expect(followUpHourlySlice(false, 3)).toBe(3)
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
    expect(hb).toContain('runSequenceDrainTick')
    expect(hb).toContain('sequenceEngineCheck')
    expect(hb).toContain('includeTouch2: true')
    expect(hb).toContain('HEARTBEAT_TOUCH2_MAX')
  })

  it('sequence-touch2 eligible includes post-cutoff T1 after 5 days (live empty-eligible fix)', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toMatch(/touch1_sent_at >= '\$\{TOUCH2_COPY_ERA_CUTOFF\}'::timestamptz/)
    expect(seq).toContain('seq_t3_as_t2')
    expect(seq).toContain('secondTouchCopyKind')
    expect(seq).toContain('touch2_sent_at=${ts}, touch3_sent_at=${ts}')
  })
})
