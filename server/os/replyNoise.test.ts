// ─────────────────────────────────────────────────────────────────────────────
//  PS-REPLY-NOISE-01 — synthetic/unknown inbound must never reach the live channel.
//
//  A synthetic liveness probe (.invalid, "liveness-probe") POSTed to the reply
//  webhook fired the founder's real Telegram, because the handler notified on
//  EVERY processed inbound — even a no-lead-match. Same class as the false posture
//  alarm: test events on a live channel. The gate: obviously-synthetic senders and
//  unknown (non-prospect) senders are dropped before any classify or notify.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { isSyntheticSender, processReply } from './replyParser'

describe('isSyntheticSender — reserved/test/probe addresses', () => {
  it('drops the exact liveness probe that paged the founder', () => {
    expect(isSyntheticSender('liveness-probe-1784924386@example.invalid')).toBe(true)
  })

  it('drops reserved TLDs (RFC 2606 / 6761) and example domains', () => {
    for (const e of ['x@foo.invalid', 'x@foo.test', 'x@host.example', 'x@example.com', 'x@example.net', 'a@localhost'])
      expect(isSyntheticSender(e)).toBe(true)
  })

  it('drops probe/healthcheck/synthetic local-parts', () => {
    for (const e of ['probe@acme.com', 'healthcheck@acme.com', 'synthetic.test@acme.com', 'liveness@acme.com'])
      expect(isSyntheticSender(e)).toBe(true)
  })

  it('does NOT drop a real prospect address', () => {
    for (const e of ['dylan@go2techs.net', 'jane.smith@acme.com', 'owner@netitude.co.uk', 'contact@realmsp.com'])
      expect(isSyntheticSender(e)).toBe(false)
  })
})

describe('processReply — a synthetic sender is inert (no DB, no LLM, no Telegram)', () => {
  it('returns matched:false and never touches getSql (would throw without DATABASE_URL)', async () => {
    // The synthetic gate runs BEFORE getSql(); if it did not, this would throw "DATABASE_URL not set".
    const saved = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const r = await processReply('liveness-probe-1@example.invalid', 'ping', 'is this alive')
      expect(r.matched).toBe(false)
      expect(r.intent).toBeNull()
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved
    }
  })
})
