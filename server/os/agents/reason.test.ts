import { describe, expect, it } from 'vitest'
import { wantsWarmConversion, shouldFireConversionShift, CONVERSION_AGENTS } from './reason'

describe('wantsWarmConversion', () => {
  it('lets Janet, Mason, Aria, and Vera fire a Dex-gated trial CTA / nudge', () => {
    expect([...CONVERSION_AGENTS].sort()).toEqual(['aria', 'janet', 'mason', 'vera'])
    expect(wantsWarmConversion('mason', 'ACTION: convert_warm: hottest')).toBe(true)
    expect(wantsWarmConversion('aria', 'Send the 30-day trial CTA to warm leads')).toBe(true)
    expect(wantsWarmConversion('janet', 'convert the hottest MSPs to a no-card trial')).toBe(true)
    expect(wantsWarmConversion('vera', 'convert_warm: hottest')).toBe(true)
  })

  it('does not invent conversion work for other agents or empty actions', () => {
    expect(wantsWarmConversion('rex', 'convert_warm: hottest')).toBe(false)
    expect(wantsWarmConversion('marcus', 'queue a trial CTA')).toBe(false)
    expect(wantsWarmConversion('mason', 'none')).toBe(false)
    expect(wantsWarmConversion('mason', '')).toBe(false)
    expect(wantsWarmConversion('aria', 'write a blog post about pricing')).toBe(false)
  })
})

describe('shouldFireConversionShift — idle conversion agents still convert', () => {
  it('fires convert_warm when Mason/Aria/Janet/Vera say none', () => {
    expect(shouldFireConversionShift('mason', 'none')).toBe(true)
    expect(shouldFireConversionShift('aria', '')).toBe(true)
    expect(shouldFireConversionShift('janet', 'none')).toBe(true)
    expect(shouldFireConversionShift('vera', 'none')).toBe(true)
    expect(shouldFireConversionShift('rex', 'none')).toBe(false)
  })
})
