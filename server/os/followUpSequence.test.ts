// ─────────────────────────────────────────────────────────────────────────────
//  PS-FOLLOWUP-01 — the 5-touch sequence, and the gates that keep it safe.
//
//  Background: touchDefs and SEQUENCE were both emptied on 2026-07-24 when the
//  dishonest follow-up copy was deleted, and never refilled. For 523 first-touch
//  sends the sequence had exactly ONE touch — and nothing in the system reported
//  that, so no agent and no dashboard could see it. Rebuilt here.
//
//  The rule these tests exist to enforce is the founder's ordering constraint:
//  follow-ups must not send until inbound reply capture is PROVEN, because with
//  capture dead `replied` never flips and the sequence would keep emailing people
//  who already answered. That is enforced structurally, not by a note.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { FOLLOWUP_TOUCHES, APPROVED_VARIANT, approvedBody } from './outreachCopy'
import { threadMessageId } from './sequences'

describe('FOLLOWUP_TOUCHES — cadence and shape', () => {
  it('is a 5-touch sequence: touches 2-5 on top of touch 1', () => {
    expect(FOLLOWUP_TOUCHES.map(t => t.touch)).toEqual([2, 3, 4, 5])
  })

  it('spacing is 3/7/12/18 days from touch 1 — professional, never daily', () => {
    expect(FOLLOWUP_TOUCHES.map(t => t.delayDays)).toEqual([3, 7, 12, 18])
  })

  it('gaps between consecutive touches never shrink below 3 days', () => {
    // A sequence that accelerates as it goes reads as pressure. Ours decelerates.
    const days = [0, ...FOLLOWUP_TOUCHES.map(t => t.delayDays)]
    const gaps = days.slice(1).map((d, i) => d - days[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(3)
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b)) // monotonically widening
  })

  it('every touch offers both a safe and a bold variant, each with html and text', () => {
    for (const t of FOLLOWUP_TOUCHES) {
      for (const key of ['safe', 'bold'] as const) {
        const v = t[key]
        expect(v.id, `touch ${t.touch} ${key}`).toBeTruthy()
        expect(v.html('Dave', 'Acme IT').length).toBeGreaterThan(200)
        // CAN-SPAM requires the footer in EVERY part, not just the HTML one.
        expect(v.text('Dave', 'Acme IT')).toMatch(/Unsubscribe|unsubscribe/)
        expect(v.html('Dave', 'Acme IT')).toMatch(/unsubscribe\?e=\{\{TOKEN\}\}/)
      }
    }
  })

  it('carries no fabricated stats, scarcity or invented customers', () => {
    // The exact failure class that killed the last sequence: "43% → 4%", "2 slots
    // left", "attacks up 48%". Any bare percentage or countdown is suspect here.
    const banned = [
      /\b\d{1,3}%/,                          // any raw percentage claim
      /\bslots? (left|remaining|available)/i,
      /\bonly \d+ (left|spots|seats)/i,
      /\bexpires? (today|tomorrow|in \d)/i,
      /\bact (now|fast|today)\b/i,
      /\bone of our (clients|customers) (saw|had|got)/i,
    ]
    for (const t of FOLLOWUP_TOUCHES) {
      for (const key of ['safe', 'bold'] as const) {
        const body = t[key].html('Dave', 'Acme IT') + ' ' + t[key].text('Dave', 'Acme IT')
        for (const re of banned) {
          expect(re.test(body), `touch ${t.touch} ${key} matched ${re}`).toBe(false)
        }
      }
    }
  })

  it('the breakup touch promises to stop, and is terminal so that promise is true', () => {
    const t5 = FOLLOWUP_TOUCHES.find(t => t.touch === 5)!
    for (const key of ['safe', 'bold'] as const) {
      expect(t5[key].text('Dave', 'Acme IT')).toMatch(/last email|closing your file/i)
    }
    // markTouchSent() marks the lead dead at touch 5 — pinned by the cadence being the
    // final entry, so no touch can be scheduled after the email that says none will be.
    expect(Math.max(...FOLLOWUP_TOUCHES.map(t => t.touch))).toBe(5)
  })

  it('does not re-pitch touch 1 — touch 1 is already the insurance email', () => {
    // Touch 1's subject is "Your Clients' Insurers Now Want Phishing-Sim Proof". A
    // near-duplicate three days later in the same thread is how senders get spam-marked.
    const t2 = FOLLOWUP_TOUCHES.find(t => t.touch === 2)!
    for (const key of ['safe', 'bold'] as const) {
      expect(t2[key].subject('Acme IT')).not.toMatch(/insurers now want|phishing-sim proof/i)
    }
  })
})

describe('approval gate — nothing sends until the founder picks a variant', () => {
  it('ships with NOTHING approved', () => {
    // The shipped state must be inert. If this ever fails in CI, unapproved copy
    // became reachable.
    expect(Object.keys(APPROVED_VARIANT)).toHaveLength(0)
  })

  it('an unapproved touch yields no body, so the sender skips it', () => {
    for (const t of FOLLOWUP_TOUCHES) expect(approvedBody(t)).toBeNull()
  })

  it('approval selects exactly the chosen variant — never a default', () => {
    const t2 = FOLLOWUP_TOUCHES.find(t => t.touch === 2)!
    try {
      APPROVED_VARIANT[2] = 'bold'
      expect(approvedBody(t2)?.id).toBe(t2.bold.id)
      APPROVED_VARIANT[2] = 'safe'
      expect(approvedBody(t2)?.id).toBe(t2.safe.id)
    } finally {
      delete APPROVED_VARIANT[2]
    }
  })
})

describe('threading', () => {
  it('derives a stable Message-ID from the lead id', () => {
    const id = 'a1b2c3d4-0000-4000-8000-000000000001'
    expect(threadMessageId(id)).toBe(`<ps-${id}-t1@phishsimai.com>`)
    expect(threadMessageId(id)).toBe(threadMessageId(id)) // same input, same id, always
  })

  it('is a syntactically valid RFC 5322 msg-id', () => {
    expect(threadMessageId('x')).toMatch(/^<[^\s<>@]+@[^\s<>@]+>$/)
  })
})
