import { describe, expect, it } from 'vitest'
import { wantsWarmConversion, shouldFireConversionShift, CONVERSION_AGENTS, resolveRuntimeAction } from './reason'

describe('wantsWarmConversion', () => {
  it('lets Janet, Mason, Aria, Nova, and Vera fire a Dex-gated trial CTA / nudge', () => {
    expect([...CONVERSION_AGENTS].sort()).toEqual(['aria', 'janet', 'mason', 'nova', 'vera'])
    expect(wantsWarmConversion('mason', 'ACTION: convert_warm: hottest')).toBe(true)
    expect(wantsWarmConversion('aria', 'Send the 30-day trial CTA to warm leads')).toBe(true)
    expect(wantsWarmConversion('janet', 'convert the hottest MSPs to a no-card trial')).toBe(true)
    expect(wantsWarmConversion('vera', 'convert_warm: hottest')).toBe(true)
    expect(wantsWarmConversion('nova', 'convert_warm: hottest')).toBe(true)
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
  it('fires convert_warm when Mason/Aria/Janet/Vera/Nova say none', () => {
    expect(shouldFireConversionShift('mason', 'none')).toBe(true)
    expect(shouldFireConversionShift('aria', '')).toBe(true)
    expect(shouldFireConversionShift('janet', 'none')).toBe(true)
    expect(shouldFireConversionShift('vera', 'none')).toBe(true)
    expect(shouldFireConversionShift('nova', 'none')).toBe(true)
    expect(shouldFireConversionShift('rex', 'none')).toBe(false)
  })

  it('fires convert_warm during operating crisis even if the agent said analyze', () => {
    expect(shouldFireConversionShift('mason', 'analyze the funnel', true)).toBe(true)
    expect(shouldFireConversionShift('aria', 'write a blog post about pricing', true)).toBe(true)
    expect(shouldFireConversionShift('rex', 'analyze the funnel', true)).toBe(false)
    expect(shouldFireConversionShift('mason', 'analyze the funnel', false)).toBe(false)
  })
})

describe('resolveRuntimeAction — refuse idle none during operating crisis', () => {
  it('rewrites none to the lane mandate for every runtime agent', () => {
    expect(resolveRuntimeAction('mason', 'none', true)).toEqual({
      action: 'convert_warm: hottest',
      rewritten: true,
    })
    expect(resolveRuntimeAction('scout', '', true).rewritten).toBe(true)
    expect(resolveRuntimeAction('scout', '', true).action).toMatch(/trial starts/)
    expect(resolveRuntimeAction('dex', 'none', true).action).toMatch(/trial CTAs/)
    expect(resolveRuntimeAction('rex', 'none', true).action).toMatch(/TRUE-trial/)
  })

  it('does not rewrite when not in crisis or when already acting', () => {
    expect(resolveRuntimeAction('mason', 'none', false)).toEqual({ action: 'none', rewritten: false })
    expect(resolveRuntimeAction('mason', 'convert_warm: hottest', true)).toEqual({
      action: 'convert_warm: hottest',
      rewritten: false,
    })
  })

  it('rewrites idle none away from convert_warm when the warm pool is exhausted', () => {
    const warm = {
      replied: 15, engaged: 14, sendable: 14, eligible: 0,
      cooldown: 0, exhausted: 12, suppressed: 2, autoReplyPending: 0,
    }
    const mason = resolveRuntimeAction('mason', 'none', true, warm)
    expect(mason.rewritten).toBe(true)
    expect(mason.action).not.toMatch(/convert_warm:\s*hottest/)
    expect(mason.action).toMatch(/Grey Box|MSP harvest/)
    const aria = resolveRuntimeAction('aria', '', true, warm)
    expect(aria.action).toMatch(/LinkedIn/)
    expect(aria.action).toMatch(/Do not convert_warm/)
  })
})
