import { describe, expect, it } from 'vitest'
import { isProviderRefusal } from './llmChat'

describe('isProviderRefusal', () => {
  it('catches GLM/Cerebras HTTP-200 body refusals', () => {
    expect(isProviderRefusal('FORBIDDEN')).toBe(true)
    expect(isProviderRefusal('forbidden')).toBe(true)
    expect(isProviderRefusal('FORBIDDEN.')).toBe(true)
    expect(isProviderRefusal('UNAUTHORIZED')).toBe(true)
    expect(isProviderRefusal('DENIED')).toBe(true)
  })

  it('does not treat real assistant copy as a refusal', () => {
    expect(isProviderRefusal("I'm here to help you launch your first campaign.")).toBe(false)
    expect(isProviderRefusal('Access is forbidden on that page — go to /targets instead.')).toBe(false)
    expect(isProviderRefusal('')).toBe(false)
  })
})
