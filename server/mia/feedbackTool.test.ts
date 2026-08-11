// PS-MIA-HONEST-01 — Mia may not claim an action she did not complete.
//
// The three defects being pinned, all customer-facing:
//   A. an UNCONDITIONAL "the team will review it" in the prompt, fired whether or not anything was
//      written;
//   B. `feedbackRecorded = true` set without checking the write result, so a failed write still
//      produced "you just logged their feedback";
//   C. firing on INTENT rather than CONTENT — the only row in production is a user asking WHETHER
//      they could give feedback.
// Plus the invented escalation: a "Talk to Sales" control that exists nowhere, and "someone will
// reach out shortly" with no code path notifying any human.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  classifyFeedbackContent,
  buildHandoffTelegram,
  detectHandoffRequest,
  inferFeedbackCategory,
  buildInboxLine,
} from './feedbackTool'

const CHAT = fs.readFileSync('server/mia/miaChat.ts', 'utf8')

describe('C — the content gate: intent is not content', () => {
  it('refuses the exact message that produced the only row in production', () => {
    // "can I give you suggestions tabout the product or report bugs" — a question about the
    // channel, logged as feedback, acknowledged as logged.
    expect(classifyFeedbackContent('can I give you suggestions tabout the product or report bugs')).toBe('intent_only')
  })

  it('refuses other announcements of intent', () => {
    for (const m of [
      'can I report a bug',
      'how do I give feedback',
      "I'd like to submit a feature request",
      'where do I report issues',
      'I want to share some feedback',
    ]) expect(classifyFeedbackContent(m), m).toBe('intent_only')
  })

  it('ACCEPTS real content, including when it follows an intent phrase', () => {
    // The announcement may precede the substance in one message — stripping it must not throw the
    // substance away.
    expect(classifyFeedbackContent("I'd like to report a bug — the CSV import fails on files over 2MB")).toBe('content')
    expect(classifyFeedbackContent('the CSV import is broken for large files')).toBe('content')
    expect(classifyFeedbackContent('the campaign builder is really confusing to use')).toBe('content')
  })

  it('ignores messages with no feedback signal at all', () => {
    expect(classifyFeedbackContent('how do I launch my first campaign')).toBe('none')
    expect(classifyFeedbackContent('hi')).toBe('none')
  })

  it('categorises a real bug as bug', () => {
    expect(inferFeedbackCategory('the CSV import is broken')).toBe('bug')
    expect(inferFeedbackCategory('this page is confusing')).toBe('ux')
  })
})

describe('the invented escalation is detected as a real request', () => {
  it('recognises a request for a human', () => {
    for (const [m, kind] of [
      ['can I talk to sales', 'sales'],
      ['I want to speak to a human', 'other'],
      ['can someone call me back', 'callback'],
      ['I need to talk to support about a problem', 'support'],
      ['schedule a demo please', 'sales'],
    ] as const) expect(detectHandoffRequest(m), m).toBe(kind)
  })

  it('does not fire on ordinary product questions', () => {
    for (const m of ['how do I add employees', 'what compliance reports exist', 'launch my campaign'])
      expect(detectHandoffRequest(m), m).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  A + B — the claim may not outrun the action
// ─────────────────────────────────────────────────────────────────────────────
describe('A — the unconditional promise is gone', () => {
  it('the prompt no longer tells her to promise review regardless of any write', () => {
    expect(CHAT).not.toContain('thank them and say the team will review it')
  })

  it('every action claim is derived from a verified outcome block', () => {
    expect(CHAT).toContain('ACTION RESULTS FOR THIS MESSAGE — these are the ONLY action claims you may make')
    expect(CHAT).toContain('No action was taken this message. Do not claim any.')
  })
})

describe('B — the claim is gated on a returned row id', () => {
  it('feedbackRecorded comes from the result, never set unconditionally', () => {
    expect(CHAT).toContain('const feedbackRecorded = feedbackResult?.ok === true')
    // The old shape: a bare assignment after an unchecked await.
    expect(CHAT).not.toMatch(/feedbackRecorded = true\s*$/m)
  })

  it('a failed write instructs an honest sentence, not a confirmation', () => {
    expect(CHAT).toContain("I couldn't log that just now")
    expect(CHAT).toContain('Do NOT say it was logged.')
  })

  it('a handoff claim requires BOTH the row and the notification', () => {
    // A row nobody was told about is not a callback.
    expect(CHAT).toContain("handoffResult?.ok === true && handoffResult.notified === true")
    expect(CHAT).toContain("Kaan will email you shortly")
    expect(CHAT).toContain('Do NOT promise contact.')
  })

  it('intent-only produces an explicit "nothing was logged" instruction', () => {
    expect(CHAT).toContain('they have not given any yet')
    expect(CHAT).toContain('you must NOT say anything was')
  })
})

describe('the reality boundary — the root cause of the invented UI', () => {
  it('forbids describing UI elements and screen positions', () => {
    expect(CHAT).toContain('NEVER describe a UI element, icon, menu, button or its screen position')
  })

  it('names the specific things that do NOT exist', () => {
    expect(CHAT).toContain('There is NO "Talk to Sales" option')
    expect(CHAT).toContain('NO live-chat-with-a-human')
    expect(CHAT).toContain('NO phone line')
  })

  it('forbids unbacked promises of contact and unbacked action claims', () => {
    expect(CHAT).toContain('NEVER promise that someone will contact them unless')
    expect(CHAT).toContain('NEVER claim to have logged, saved, filed, escalated or sent anything unless')
  })

  it('whitelists reality rather than merely blacklisting one mistake', () => {
    // The general fix: if it is not in the prompt, it does not exist.
    expect(CHAT).toContain('If it is\nnot listed here, IT DOES NOT EXIST')
    expect(CHAT).toContain('WHAT ACTUALLY EXISTS')
  })
})

// The bug I shipped INTO the fix for this bug: sendTelegram resolves { ok:false, skipped:true }
// when unconfigured rather than throwing, so `try { await send(); notified = true }` set true for a
// message that was never sent. Proven live — a prod row carried notifiedAt while nothing was sent.
describe('notified reflects the SEND RESULT, not the absence of an exception', () => {
  const src = fs.readFileSync('server/mia/feedbackTool.ts', 'utf8')

  it('reads ok from the return value', () => {
    expect(src).toContain('notified = sent?.ok === true')
  })

  it('does not infer success from a completed await', () => {
    // The shape that shipped: an await followed by an unconditional assignment.
    expect(src).not.toMatch(/await sendTelegram\([\s\S]{0,600}?\)\s*\n\s*notified = true/)
  })

  it('sendTelegram genuinely returns rather than throws when unconfigured', () => {
    // The premise the bug rested on, pinned so a future refactor of telegram.ts cannot silently
    // invalidate this reasoning.
    const tg = fs.readFileSync('server/os/telegram.ts', 'utf8')
    expect(tg).toContain("return { ok: false, skipped: true, error: 'Telegram not configured")
  })
})

describe('the reader — what the team sees', () => {
  it('states plainly when there is nothing, rather than implying silence is health', () => {
    const l = buildInboxLine({ feedback7d: 0, bugs7d: 0, openHandoffs: 0, unnotifiedHandoffs: 0, oldestOpenDays: null })
    expect(l).toContain('no trial feedback in the last 7 days')
    expect(l).toContain('no open human-handoff requests')
  })

  it('shouts when a customer is waiting for a human', () => {
    const l = buildInboxLine({ feedback7d: 2, bugs7d: 1, openHandoffs: 1, unnotifiedHandoffs: 0, oldestOpenDays: 3 })
    expect(l).toContain('1 CUSTOMER(S) WAITING FOR A HUMAN')
    expect(l).toContain('oldest 3d')
    expect(l).toContain('nothing else contacts them')
  })

  it('flags the invisible case — recorded but nobody notified', () => {
    // The one number here that represents a person waiting on nothing.
    const l = buildInboxLine({ feedback7d: 0, bugs7d: 0, openHandoffs: 2, unnotifiedHandoffs: 2, oldestOpenDays: 1 })
    expect(l).toContain('RECORDED BUT NOBODY WAS NOTIFIED')
    expect(l).toContain('invisible everywhere else')
  })

  it('counts bugs separately so "3 new bug reports" is answerable', () => {
    expect(buildInboxLine({ feedback7d: 5, bugs7d: 3, openHandoffs: 0, unnotifiedHandoffs: 0, oldestOpenDays: null }))
      .toContain('5 feedback item(s) in 7d, 3 of them bug reports')
  })
})

describe('the reader is actually wired into the standup', () => {
  it("Janet's daily brief reads the Mia inbox", () => {
    const janet = fs.readFileSync('server/os/janet.ts', 'utf8')
    expect(janet).toContain('readMiaInbox()')
    expect(janet).toContain('CUSTOMER VOICE (Mia')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  PS-MIA-REACHABLE-01 — a delivered handoff that cannot be answered.
//
//  0019 proved the path FIRES. Kaan then used Mia in production and found the defect one layer
//  further out: the Telegram arrived carrying org, plan, page and the customer's words — and no
//  name, no email, no phone. Mia had said "Kaan will email you shortly". Kaan had no address.
//
//  A promise that is delivered and still cannot be kept. It reads as handled, which is why no
//  unnotified-row alarm could ever have surfaced it.
//
//  Every test below asserts against the MESSAGE BODY, not against the send. The old body was built
//  inline inside an I/O function, which is precisely why nothing could see what it omitted.
// ─────────────────────────────────────────────────────────────────────────────
describe('PS-MIA-REACHABLE-01 — the handoff carries a way to reply', () => {
  const base = {
    kind: 'sales' as const,
    orgName: 'Acme MSP',
    plan: 'free',
    trialDay: 3,
    callWindowDisplay: 'not specified',
    pathname: '/dashboard',
    id: 42,
    message: 'I need to talk to someone about pricing',
  }

  it('renders the account email — the field whose absence made the notification useless', () => {
    const msg = buildHandoffTelegram({ ...base, email: 'owner@acmemsp.com' })
    expect(msg).toContain('Email: owner@acmemsp.com')
  })

  it('puts the reply-to line ABOVE the customer message, not buried under it', () => {
    // It is the field that decides whether this notification can result in anything.
    const msg = buildHandoffTelegram({ ...base, email: 'owner@acmemsp.com' })
    expect(msg.indexOf('Email: owner@acmemsp.com')).toBeLessThan(msg.indexOf(base.message))
  })

  it('when there is NO address, says so loudly instead of silently omitting the line', () => {
    // The failure mode being pinned: a message that looks complete because the missing field simply
    // is not rendered. NOT CHECKED never reads as clean.
    const msg = buildHandoffTelegram({ ...base, email: null })
    expect(msg).toContain('NO CONTACT EMAIL ON FILE')
    expect(msg).toContain('cannot reply')
    expect(msg).not.toContain('Email: ')
  })

  it('never invents or substitutes an address when none exists', () => {
    const msg = buildHandoffTelegram({ ...base, email: null })
    expect(msg).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it('still carries the form fields when the form eventually supplies them', () => {
    const msg = buildHandoffTelegram({
      ...base, email: 'owner@acmemsp.com', firstName: 'Dana', lastName: 'Reed',
      phone: '+1 555 0100', preferredContact: 'call',
    })
    expect(msg).toContain('Name: Dana Reed')
    expect(msg).toContain('Phone: +1 555 0100')
    expect(msg).toContain('Prefers: call')
  })
})

describe('PS-MIA-REACHABLE-01 — the address is resolved at the write point, not per caller', () => {
  const TOOL = fs.readFileSync('server/mia/feedbackTool.ts', 'utf8')

  it('the INSERT actually persists the email column', () => {
    // The Telegram is transient. The row is what a human triages tomorrow.
    expect(TOOL).toMatch(/INSERT INTO mia_handoff_requests[\s\S]{0,400}email/)
  })

  it('resolves from the logged-in users row rather than asking the customer', () => {
    expect(TOOL).toContain('resolveAccountEmail')
    expect(TOOL).toMatch(/from\(users\)/)
  })

  it('BOTH live callers get the address, because neither one passes it', () => {
    // The composition failure this design forecloses: threading through routers.ts and forgetting
    // http.ts would fix the call and leave the payload broken on one path.
    const routers = fs.readFileSync('server/routers.ts', 'utf8')
    const http = fs.readFileSync('server/mia/http.ts', 'utf8')
    for (const [name, src] of [['routers.ts', routers], ['http.ts', http]] as const) {
      expect(src, name).not.toContain('resolveAccountEmail')
    }
    // ...and the single write point they share does it for them.
    expect(TOOL).toMatch(/const email = formEmail \?\? \(await resolveAccountEmail\(db, opts\.userId\)\)/)
  })

  it('a form-supplied address wins, so a customer can redirect the reply', () => {
    expect(TOOL).toContain('formEmail ??')
  })
})

describe('PS-MIA-REACHABLE-01 — Mia may not promise an email she cannot send', () => {
  it('the email promise is gated on REACHABLE, not merely on notified', () => {
    expect(CHAT).toContain('handoffResult.reachable === true')
    expect(CHAT).toContain('handoffFlagged && handoffReachable')
  })

  it('flagged-but-unreachable gets an honest sentence that asks for the address', () => {
    expect(CHAT).toContain('You may NOT say')
    expect(CHAT).toContain('Ask them for the best address')
  })

  it('never asks a logged-in customer for an email we already stored', () => {
    expect(CHAT).toContain('Do NOT ask them for their email address: we already have it')
  })

  it('notified and reachable remain SEPARATE outcomes', () => {
    const TOOL = fs.readFileSync('server/mia/feedbackTool.ts', 'utf8')
    expect(TOOL).toContain('reachable: email !== null')
    // If these ever collapse into one boolean, the distinction that made the defect visible is gone.
    expect(TOOL).not.toContain('notified = email !== null')
  })
})
