// PS-AUTONOMY-BRIDGE-01 — the pure promotion decision. These prove the l4 failure mode
// (promote on zero clean days) cannot recur, that promotion is one-rung-per-cycle, that the
// floor (L1=manual) and cap (l5) hold, and that a breaker trip demotes.
import { describe, it, expect } from 'vitest'
import { decidePromotion, CLEAN_DAYS_PER_RUNG, AUTONOMY_FLOOR } from './autonomyPromotion'

const base = { breakerOpen: false, trust: 0 }

describe('decidePromotion (pure)', () => {
  it('(a) at the floor with 0 clean days → HOLD (the l4 failure mode cannot happen)', () => {
    const d = decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: 0 })
    expect(d.action).toBe('hold')
    expect(d.to).toBe('manual')
    expect(d.reason).toBe(`building_0_of_${CLEAN_DAYS_PER_RUNG}_clean_days`)
  })

  it('holds at 4 clean days — one short of the requirement', () => {
    expect(decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: 4 }).action).toBe('hold')
  })

  it('(b) manual + a fresh 5-clean-day cycle → PROMOTE exactly one rung (manual→l2)', () => {
    const d = decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: 5 })
    expect(d.action).toBe('promote')
    expect(d.to).toBe('l2')
    expect(d.reason).toBe('earned_5_clean_days')
  })

  it('promotes only ONE rung even with a huge streak (l2→l3, never l2→l4)', () => {
    const d = decidePromotion({ ...base, level: 'l2', cleanSinceLastGrant: 40 })
    expect(d.action).toBe('promote')
    expect(d.to).toBe('l3')
  })

  it('no over-promotion: right after a grant the cycle resets to 0 → HOLD', () => {
    // runAutonomyPromotion writes a grant, so the next computed cleanSinceLastGrant is 0.
    expect(decidePromotion({ ...base, level: 'l2', cleanSinceLastGrant: 0 }).action).toBe('hold')
  })

  it('cap holds: at l5 with a full cycle → HOLD (no promotion above l5)', () => {
    const d = decidePromotion({ ...base, level: 'l5', cleanSinceLastGrant: 99 })
    expect(d.action).toBe('hold')
    expect(d.reason).toBe('at_cap_l5')
  })

  it('breaker trip → DEMOTE one rung', () => {
    const d = decidePromotion({ ...base, breakerOpen: true, level: 'l3', cleanSinceLastGrant: 99 })
    expect(d.action).toBe('demote')
    expect(d.to).toBe('l2')
  })

  it('a breaker trip beats any clean streak (safety wins over promotion)', () => {
    expect(decidePromotion({ ...base, breakerOpen: true, level: 'l4', cleanSinceLastGrant: 100 }).action).toBe('demote')
  })

  it('floor holds: breaker open at the floor → HOLD, never demote below manual', () => {
    const d = decidePromotion({ ...base, breakerOpen: true, level: AUTONOMY_FLOOR, cleanSinceLastGrant: 0 })
    expect(d.action).toBe('hold')
    expect(d.to).toBe('manual')
  })

  it('walks the whole ladder one rung at a time, capping at l5', () => {
    const path: string[] = []
    let level: any = 'manual'
    for (let i = 0; i < 8; i++) {
      const d = decidePromotion({ ...base, level, cleanSinceLastGrant: 5 })
      if (d.action !== 'promote') break
      path.push(d.to)
      level = d.to
    }
    expect(path).toEqual(['l2', 'l3', 'l4', 'l5'])
  })
})
