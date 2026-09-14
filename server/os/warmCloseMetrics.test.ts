import { describe, expect, it } from 'vitest'
import { computeWarmCtaTrialRate, formatWarmCtaTrialRate } from './warmCloseMetrics'
import { isNonCustomerOrg } from './trueTrials'

describe('warm CTA → TRUE trial rate', () => {
  it('is null when no CTAs (no invented 0%)', () => {
    const r = computeWarmCtaTrialRate(0, 0)
    expect(r.rate).toBeNull()
    expect(formatWarmCtaTrialRate(r)).toMatch(/no data/)
  })

  it('counts 1 TRUE trial from 8 CTAs as 12.5%, not canary inflation', () => {
    const r = computeWarmCtaTrialRate(8, 1)
    expect(r.rate).toBeCloseTo(0.125)
    expect(formatWarmCtaTrialRate(r)).toMatch(/1\/8/)
    expect(isNonCustomerOrg({ name: 'Signup Canary\'s organization', adminEmail: 'x@phishsimai.com' })).toBe(true)
    expect(isNonCustomerOrg({ name: 'Grey Box Consulting', adminEmail: 'ops@greybox.example' })).toBe(false)
  })
})
