// PS-RAMP-HOLD-01 — the ramp is gated on lead SUPPLY, not just elapsed days. Day 8 (2026-07-26)
// would have stepped 50 -> 100/day against a 475-lead buffer that the refill does not maintain
// (sanitizeRefill tops up to dailySendCap() and no further). This pins the hold so the step to 100
// cannot return by accident — only by a reviewed change with supply evidence.
import { describe, it, expect } from 'vitest'
import { dailySendCap } from './sequences'

const at = (iso: string) => new Date(iso + 'T09:00:00Z')

describe('PS-RAMP-HOLD-01 (supply-gated send cap)', () => {
  it('warm-up steps still hold: 20/day for days 1-3', () => {
    expect(dailySendCap(at('2026-07-19'))).toBe(20)
    expect(dailySendCap(at('2026-07-21'))).toBe(20)
  })
  it('50/day for days 4-7', () => {
    expect(dailySendCap(at('2026-07-22'))).toBe(50)
    expect(dailySendCap(at('2026-07-25'))).toBe(50)
  })
  it('day 8+ HOLDS at 50 — does not step to 100 while supply is unproven', () => {
    expect(dailySendCap(at('2026-07-26'))).toBe(50) // the day it would have doubled
    expect(dailySendCap(at('2026-08-15'))).toBe(50)
  })
  it('never exceeds 50/day anywhere on the curve', () => {
    for (let d = 0; d < 120; d++) {
      const day = new Date(Date.parse('2026-07-19T09:00:00Z') + d * 86_400_000)
      expect(dailySendCap(day)).toBeLessThanOrEqual(50)
    }
  })
})
