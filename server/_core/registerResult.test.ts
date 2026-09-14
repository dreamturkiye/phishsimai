import { describe, expect, it } from 'vitest'
import { isDatabaseUnavailable, registerResponseBody } from './registerResult'

describe('isDatabaseUnavailable', () => {
  it('detects Neon / connection failures', () => {
    expect(isDatabaseUnavailable(new Error('Neon connection refused'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('ETIMEDOUT'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('password authentication failed for user'))).toBe(true)
  })

  it('does not treat a duplicate-email 409-class error as an outage', () => {
    expect(isDatabaseUnavailable(new Error('An account with this email already exists'))).toBe(false)
    expect(isDatabaseUnavailable(new Error('password must be at least 8 characters'))).toBe(false)
  })
})

describe('registerResponseBody', () => {
  const user = { id: 7, email: 'pat@acme.com', name: 'Pat' }

  it('returns ok:true plus the trial org when startProductTrial succeeded', () => {
    expect(registerResponseBody(user, { orgId: 42, name: 'Acme MSP', created: true })).toEqual({
      ok: true,
      success: true,
      user: { id: 7, email: 'pat@acme.com', name: 'Pat' },
      trial: { ok: true, orgId: 42, name: 'Acme MSP', created: true },
    })
  })

  it('keeps the account ok:true when the org/trial step misses', () => {
    expect(registerResponseBody(user, null).ok).toBe(true)
    expect(registerResponseBody(user, null).trial).toEqual({
      ok: false,
      reason: 'trial_org_not_created',
    })
  })
})
