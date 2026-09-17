import { describe, expect, it } from 'vitest'
import {
  TRIAL_CTA_PATH,
  TRIAL_CTA_URL,
  isTrialStartPath,
  parseSignupAttribution,
  signupAttrMemoryKey,
  trialCtaUrl,
} from './trialCta'

describe('trialCtaUrl', () => {
  it('lands on /trial with UTM, not the login wall', () => {
    expect(TRIAL_CTA_PATH).toBe('/trial')
    expect(TRIAL_CTA_URL).toBe('https://phishsimai.com/trial')
    expect(TRIAL_CTA_URL).not.toMatch(/login/)
    const url = trialCtaUrl({ source: 'warm_cta', medium: 'email', campaign: 'convert_warm', email: 'Pat@MSP.com' })
    expect(url).toContain('https://phishsimai.com/trial?')
    expect(url).toContain('utm_source=warm_cta')
    expect(url).toContain('utm_medium=email')
    expect(url).toContain('utm_campaign=convert_warm')
    expect(url).toContain('email=pat%40msp.com')
  })

  it('drops an invalid email prefill and sanitizes UTM', () => {
    const url = trialCtaUrl({ source: 'warm cta!', email: 'not-an-email' })
    expect(url).toContain('utm_source=warm_cta')
    expect(url).not.toContain('email=')
  })
})

describe('parseSignupAttribution', () => {
  it('reads UTM from the register body', () => {
    expect(parseSignupAttribution({
      utm_source: 'warm_cta',
      utm_medium: 'email',
      utm_campaign: 'convert_warm',
    })).toEqual({
      source: 'warm_cta',
      utm_source: 'warm_cta',
      utm_medium: 'email',
      utm_campaign: 'convert_warm',
    })
  })

  it('returns empty for missing/blank fields', () => {
    expect(parseSignupAttribution({})).toEqual({})
    expect(parseSignupAttribution(null)).toEqual({})
  })
})

describe('trial-start paths', () => {
  it('treats /trial /signup /register as the trial form, not /setup', () => {
    expect(isTrialStartPath('/trial')).toBe(true)
    expect(isTrialStartPath('/signup')).toBe(true)
    expect(isTrialStartPath('/register')).toBe(true)
    expect(isTrialStartPath('/login')).toBe(false)
    expect(isTrialStartPath('/setup')).toBe(false)
    expect(signupAttrMemoryKey('Pat@MSP.com')).toBe('signup_attr:pat@msp.com')
  })
})
