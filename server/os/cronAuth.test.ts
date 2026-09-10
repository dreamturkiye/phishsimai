import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTrustedCronRequest, requireTrustedCron } from './cronAuth'

describe('trusted cron authentication', () => {
  const originalCron = process.env.CRON_SECRET
  const originalHq = process.env.HQ_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.HQ_SECRET = 'hq-secret'
  })

  afterEach(() => {
    if (originalCron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCron
    if (originalHq === undefined) delete process.env.HQ_SECRET
    else process.env.HQ_SECRET = originalHq
  })

  it('accepts the Vercel-compatible bearer CRON_SECRET', () => {
    expect(isTrustedCronRequest({ headers: { authorization: 'Bearer cron-secret' } })).toBe(true)
  })

  it('accepts header-only HQ authentication', () => {
    expect(isTrustedCronRequest({ headers: { authorization: 'Bearer hq-secret' } })).toBe(true)
    expect(isTrustedCronRequest({ headers: { 'x-hq-secret': 'hq-secret' } })).toBe(true)
  })

  it('rejects spoofed Vercel metadata without a bearer secret', () => {
    expect(isTrustedCronRequest({ headers: { 'x-vercel-cron': '1' } })).toBe(false)
  })

  it('rejects legacy secret headers and missing configured secrets', () => {
    expect(isTrustedCronRequest({ headers: { 'x-cron-secret': 'cron-secret' } })).toBe(false)
    delete process.env.CRON_SECRET
    delete process.env.HQ_SECRET
    expect(isTrustedCronRequest({ headers: { authorization: 'Bearer ' } })).toBe(false)
  })

  it('fails closed with one 401 response', () => {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    expect(requireTrustedCron({ headers: {} }, { status })).toBe(false)
    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' })
  })
})
