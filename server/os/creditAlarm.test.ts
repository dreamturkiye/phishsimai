// ─────────────────────────────────────────────────────────────────────────────
//  PS-CREDIT-ALARM-01 — a shared-pool balance pages, it doesn't just print.
//
//  Icypeas is ~2 days of runway on a pool shared with ScrollFuel. The funnel
//  already prints the balance; printing is not alarming. Three page-worthy
//  shapes, each its own loud 🚨: UNREADABLE (blind), BELOW FLOOR, RUNWAY ≤ N.
//  Silence means the balance is healthy AND readable.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildCreditAlarms, CREDIT_RUNWAY_ALARM_DAYS } from './agents/mspHubHarvest'

const read = (over: Partial<{ provider: string; floor: number; current: number | null; daysLeft: number | null }>) =>
  ({ provider: 'Icypeas', floor: 200, current: 538, daysLeft: 30, ...over })

describe('buildCreditAlarms — silence means healthy + readable', () => {
  it('is silent when the balance is high, above floor, with long runway', () => {
    expect(buildCreditAlarms([read({})])).toEqual([])
  })

  it('pages when the balance is UNREADABLE — a silent meter is not a full one', () => {
    const out = buildCreditAlarms([read({ current: null, daysLeft: null })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/UNREADABLE/)
  })

  it('pages BELOW FLOOR before runway (floor is the harder signal)', () => {
    const out = buildCreditAlarms([read({ current: 150, daysLeft: 1 })])
    expect(out[0]).toMatch(/below floor/)
    expect(out[0]).toContain('150')
    expect(out[0]).toContain('200')
  })

  it('pages on short RUNWAY even while still above the floor', () => {
    const out = buildCreditAlarms([read({ current: 400, daysLeft: CREDIT_RUNWAY_ALARM_DAYS })])
    expect(out[0]).toMatch(/runway/)
    expect(out[0]).toContain(String(CREDIT_RUNWAY_ALARM_DAYS))
  })

  it('does NOT page when runway is one day beyond the threshold', () => {
    expect(buildCreditAlarms([read({ current: 400, daysLeft: CREDIT_RUNWAY_ALARM_DAYS + 1 })])).toEqual([])
  })

  it('handles a null daysLeft (no prior reading to compute burn) without a false page', () => {
    expect(buildCreditAlarms([read({ current: 538, daysLeft: null })])).toEqual([])
  })

  it('pages per provider independently', () => {
    const out = buildCreditAlarms([
      read({ provider: 'Icypeas', current: 538, daysLeft: 30 }), // fine
      read({ provider: 'MEV', floor: 1000, current: 800, daysLeft: 40 }), // below its floor
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('MEV')
  })
})
