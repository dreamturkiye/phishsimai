import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isDatabaseUnavailable } from '../_core/registerResult'

describe('signup honesty + trial JSON (operator briefing 2026-09-14)', () => {
  const oauth = readFileSync('server/_core/oauth.ts', 'utf8')

  it('register JSON includes ok:true and the trial org step', () => {
    expect(oauth).toContain('registerResponseBody')
    expect(oauth).toMatch(/await startProductTrial/)
    const helper = readFileSync('server/_core/registerResult.ts', 'utf8')
    expect(helper).toContain('ok: true')
    expect(helper).toContain('trial')
    expect(helper).toContain('trial_org_not_created')
  })

  it('register does not require card, captcha, or email verify', () => {
    expect(oauth).not.toMatch(/captcha|recaptcha/i)
    expect(oauth).not.toMatch(/stripe/i)
    expect(oauth).not.toMatch(/verif(y|ication).*email|email.*verif/i)
    expect(oauth).toContain('parseSignupAttribution')
    const app = readFileSync('client/src/App.tsx', 'utf8')
    expect(app).toMatch(/path="\/trial"/)
    expect(app).toMatch(/path="\/signup"/)
    expect(app).toMatch(/path="\/register"/)
    expect(app).toContain('TrialStart')
  })

  it('register and login return 503 when the database is unreachable', () => {
    expect(oauth).toContain('isDatabaseUnavailable')
    expect(oauth).toMatch(/status\(503\)[\s\S]*Registration unavailable/)
    expect(oauth).toMatch(/status\(503\)[\s\S]*Login unavailable/)
    expect(isDatabaseUnavailable(new Error('Neon ECONNREFUSED'))).toBe(true)
  })
})

describe('Janet D0 welcome uses the mobile-optimized trial template', () => {
  it('sendWelcomeEmail calls trialStartedEmail, not a one-off HTML string', () => {
    const janet = readFileSync('server/email/janet.ts', 'utf8')
    expect(janet).toContain("import { trialStartedEmail } from './mobileOptimizedTemplates'")
    expect(janet).toMatch(/export async function sendWelcomeEmail[\s\S]*trialStartedEmail\(/)
    const templates = readFileSync('server/email/mobileOptimizedTemplates.ts', 'utf8')
    expect(templates).toContain('export function trialStartedEmail')
    expect(templates).toContain('export function passwordResetEmail')
  })
})
