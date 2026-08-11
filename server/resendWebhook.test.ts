// 1b — Resend delivery webhook. The security boundary is verifySvix: an unverified POST could
// forge "delivered" for mail that bounced, or "bounced" for mail that arrived. These tests build a
// genuine Svix signature and assert only authentic, in-tolerance messages pass.
import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySvix, applyResendEvent } from './email/resendWebhook'

const SECRET = 'whsec_' + Buffer.from('super-secret-signing-key-0123456789').toString('base64')

function sign(id: string, tsSec: number, body: string, secret = SECRET): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return createHmac('sha256', secretBytes).update(`${id}.${tsSec}.${body}`).digest('base64')
}

function headers(id: string, tsSec: number, sig: string): Record<string, string> {
  return { 'svix-id': id, 'svix-timestamp': String(tsSec), 'svix-signature': `v1,${sig}` }
}

describe('verifySvix', () => {
  const now = 1_700_000_000_000
  const tsSec = Math.floor(now / 1000)
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } })
  const raw = Buffer.from(body)

  it('accepts an authentic, in-tolerance signature', () => {
    const h = headers('msg_1', tsSec, sign('msg_1', tsSec, body))
    expect(verifySvix(raw, h, SECRET, now)).toBe(true)
  })

  it('rejects a tampered body (signature no longer matches)', () => {
    const h = headers('msg_1', tsSec, sign('msg_1', tsSec, body))
    expect(verifySvix(Buffer.from(body + 'x'), h, SECRET, now)).toBe(false)
  })

  it('rejects a signature made with the wrong secret', () => {
    const wrong = 'whsec_' + Buffer.from('attacker-key').toString('base64')
    const h = headers('msg_1', tsSec, sign('msg_1', tsSec, body, wrong))
    expect(verifySvix(raw, h, SECRET, now)).toBe(false)
  })

  it('rejects a stale timestamp (replay outside the 5-min window)', () => {
    const oldTs = tsSec - 10 * 60
    const h = headers('msg_1', oldTs, sign('msg_1', oldTs, body))
    expect(verifySvix(raw, h, SECRET, now)).toBe(false)
  })

  it('rejects when signature headers are missing', () => {
    expect(verifySvix(raw, {}, SECRET, now)).toBe(false)
    expect(verifySvix(raw, { 'svix-id': 'x', 'svix-timestamp': String(tsSec) }, SECRET, now)).toBe(false)
  })

  it('rejects when no secret is configured (fail closed)', () => {
    const h = headers('msg_1', tsSec, sign('msg_1', tsSec, body))
    expect(verifySvix(raw, h, '', now)).toBe(false)
  })

  it('accepts when one of several space-separated signatures matches', () => {
    const good = sign('msg_1', tsSec, body)
    const h = { 'svix-id': 'msg_1', 'svix-timestamp': String(tsSec), 'svix-signature': `v1,AAAA v1,${good}` }
    expect(verifySvix(raw, h, SECRET, now)).toBe(true)
  })
})

describe('applyResendEvent — event routing', () => {
  it('ignores events with no email_id and never touches the DB', async () => {
    const out = await applyResendEvent({ type: 'email.delivered', data: {} }, '2026-07-22T00:00:00Z')
    expect(out).toEqual({ matched: false, type: 'email.delivered' })
  })

  it('ignores untracked event types (opens/clicks come from our own pixel)', async () => {
    const out = await applyResendEvent({ type: 'email.opened', data: { email_id: 'abc' } }, '2026-07-22T00:00:00Z')
    expect(out.matched).toBe(false)
  })

  it('routes a delivered event to an UPDATE and reports the match count', async () => {
    const execute = vi.fn().mockResolvedValue({ rowCount: 1 })
    vi.doMock('./db', () => ({ getDb: vi.fn().mockResolvedValue({ execute }) }))
    vi.resetModules()
    const { applyResendEvent: apply } = await import('./email/resendWebhook')
    const out = await apply({ type: 'email.delivered', data: { email_id: 'abc' } }, '2026-07-22T00:00:00Z')
    expect(execute).toHaveBeenCalledOnce()
    expect(out).toEqual({ matched: true, type: 'email.delivered' })
    vi.doUnmock('./db')
  })
})
