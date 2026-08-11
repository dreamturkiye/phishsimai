// ─────────────────────────────────────────────────────────────────────────────
//  PS-CHECKOUT-GATE-01 — no prospect gets an outbound (least of all a LIVE Stripe
//  checkout link) without the founder's explicit approval.
//
//  The costly error is firing a payment link at someone who DECLINED; the cheap
//  error is holding a genuine yes for a human glance. So the policy is biased hard:
//    · a checkout is HELD, and only when the classifier is confident (≥0.85);
//    · a low-confidence "interested" is demoted to a held text reply — never a
//      checkout;
//    · out_of_office / unknown / unsubscribe can NEVER reach checkout;
//    · only internal state changes (unsub, dead) are automatic — no outbound is.
//  decideReplyAction is the whole policy, pure and pinned here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { decideReplyAction, INTERESTED_MIN_CONFIDENCE } from './replyParser'

describe('decideReplyAction — the checkout can only be HELD, and only when confident', () => {
  it('confident interested → hold_checkout (never auto-send)', () => {
    expect(decideReplyAction('interested', 0.95).action).toBe('hold_checkout')
    expect(decideReplyAction('interested', INTERESTED_MIN_CONFIDENCE).action).toBe('hold_checkout')
  })

  it('LOW-confidence interested is DEMOTED to a held text reply — never a checkout', () => {
    const d = decideReplyAction('interested', INTERESTED_MIN_CONFIDENCE - 0.01)
    expect(d.action).toBe('hold_text')
    expect(d.effectiveIntent).toBe('question')
  })

  it('a checkout NEVER auto-fires — no input yields an auto action that sends a link', () => {
    for (const c of [0, 0.5, 0.84, 0.85, 1]) {
      const a = decideReplyAction('interested', c).action
      expect(['hold_checkout', 'hold_text']).toContain(a) // always held, never automatic
    }
  })
})

describe('decideReplyAction — declines/ambiguity can never reach checkout', () => {
  it('out_of_office → ignore (auto-reply must not be read as interest)', () => {
    expect(decideReplyAction('out_of_office', 0.99).action).toBe('ignore')
  })

  it('unknown / vague → ignore, never checkout', () => {
    expect(decideReplyAction('unknown', 0.99).action).toBe('ignore')
  })

  it('unsubscribe / spam_complaint → auto_unsubscribe, no outbound', () => {
    expect(decideReplyAction('unsubscribe', 0.9).action).toBe('auto_unsubscribe')
    expect(decideReplyAction('spam_complaint', 0.9).action).toBe('auto_unsubscribe')
  })

  it('not_interested → auto_dead, no outbound', () => {
    expect(decideReplyAction('not_interested', 0.9).action).toBe('auto_dead')
  })
})

describe('decideReplyAction — genuine questions are held, not auto-answered', () => {
  it('question and not_now → hold_text (drafted, awaits approval)', () => {
    expect(decideReplyAction('question', 0.9).action).toBe('hold_text')
    expect(decideReplyAction('not_now', 0.9).action).toBe('hold_text')
  })

  it('the ONLY automatic actions are internal state — never an email to the prospect', () => {
    const autoActions = ['unsubscribe', 'spam_complaint', 'not_interested']
      .map(i => decideReplyAction(i, 0.9).action)
    for (const a of autoActions) expect(a.startsWith('auto_')).toBe(true)
    // and every auto_ action is a DB state change, never an outbound send (asserted by name).
    expect(autoActions.every(a => a === 'auto_unsubscribe' || a === 'auto_dead')).toBe(true)
  })
})
