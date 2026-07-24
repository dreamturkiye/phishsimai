// ─────────────────────────────────────────────────────────────────────────────
//  PS-PHANTOM-02 — an unverified 0% reply rate is not a messaging failure.
//
//  The phantom-task pattern the founder named: a structurally/unverified-zero
//  metric → an agent infers a fault → the wrong work gets assigned. Live instance:
//  `replied` is only ever written on capture, so metrics.replies === 0 cannot
//  distinguish "no prospect replied" from "the inbound relay is dead". The old
//  rule fired "reply rate under threshold" (→ Aria rewrites hooks) off that zero.
//  The guard: with ZERO replies ever captured, reason toward VERIFYING the relay,
//  not fixing the copy. Only once capture is proven does the rate mean messaging.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { deterministicReasoning, zeroMetrics } from './os6Autonomy'

describe('deterministicReasoning — reply rate is only a messaging signal once capture is proven', () => {
  it('0% reply rate with ZERO replies ever → UNVERIFIED relay, not a messaging failure', () => {
    const m = { ...zeroMetrics(), touched: 273, replies: 0, replyRate: 0 }
    const out = deterministicReasoning(m, {})
    expect(out).toMatch(/UNVERIFIED inbound relay/)
    expect(out).not.toMatch(/under the minimum viable outbound threshold/)
  })

  it('low reply rate WITH at least one captured reply → real messaging constraint', () => {
    const m = { ...zeroMetrics(), touched: 273, replies: 2, replyRate: 0.7 }
    const out = deterministicReasoning(m, {})
    expect(out).toMatch(/under the minimum viable outbound threshold/)
    expect(out).not.toMatch(/UNVERIFIED inbound relay/)
  })

  it('a healthy reply rate raises neither', () => {
    const m = { ...zeroMetrics(), touched: 273, replies: 30, replyRate: 11 }
    const out = deterministicReasoning(m, {})
    expect(out).not.toMatch(/reply rate/)
    expect(out).not.toMatch(/UNVERIFIED inbound relay/)
  })

  it('below the touched floor (≤20) does not judge the reply rate at all', () => {
    const m = { ...zeroMetrics(), touched: 5, replies: 0, replyRate: 0 }
    const out = deterministicReasoning(m, {})
    expect(out).not.toMatch(/reply rate/)
    expect(out).not.toMatch(/UNVERIFIED inbound relay/)
  })
})
