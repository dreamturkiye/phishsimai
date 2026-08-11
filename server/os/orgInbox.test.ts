// ─────────────────────────────────────────────────────────────────────────────
//  isOrgInbox — the shared "is there a human behind this address?" predicate.
//
//  It now has TWO consumers, which is why it gets its own test file:
//    1. sanitizeRefill  — may this address be promoted into the sendable pool?
//    2. leadResearcher (PS-ICY-GUARD-01) — do we already hold a usable address at
//       this domain, so a paid Icypeas lookup can be skipped?
//
//  A false positive costs a send target. A false NEGATIVE now costs a finder
//  credit AND leaves a domain covered by an address no human reads. Both
//  directions are pinned here.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { isOrgInbox } from './sanitizeRefill'

describe('isOrgInbox — org inboxes (never promote, never block a find)', () => {
  it('catches the classic generic inboxes', () => {
    for (const e of ['info@x.com', 'sales@x.com', 'support@x.com', 'hello@x.com', 'contact@x.com'])
      expect(isOrgInbox(e)).toBe(true)
  })

  it('catches the three found in the prod queue overlap on 2026-07-24', () => {
    // These read as org inboxes to a human but were classed as sendable, which made the
    // finder guard skip the domain and left the refill holding an unattended mailbox.
    expect(isOrgInbox('helpdesk@evernetco.com')).toBe(true)
    expect(isOrgInbox('gsc-support@gsconsultingltd.com')).toBe(true)
    expect(isOrgInbox('smartsell@gcgcom.com')).toBe(true)
  })

  it('collapses digits and separators that leave a known token behind', () => {
    // 'info2' -> 'info', 'no-reply' -> 'noreply'.
    expect(isOrgInbox('info2@x.com')).toBe(true)
    expect(isOrgInbox('no-reply@x.com')).toBe(true)
  })

  // ⚠️ KNOWN GAP — pinned as ACTUAL behaviour, not as desired behaviour.
  //
  // The comment above ORG_INBOX_LOCALPARTS claims "info2, info-uk and info.us all reduce to
  // info". They do not: the collapse strips the separator but keeps the suffix, so info-uk ->
  // 'infouk' and info.us -> 'infous', neither of which is in the set. Only a token that becomes
  // an exact member survives the collapse.
  //
  // Consequence now that PS-ICY-GUARD-01 shares this predicate: an info-uk@ address both gets
  // promoted into the sendable pool AND makes the finder guard skip that domain. Widening the
  // rule (e.g. matching a known token as a PREFIX) would fix both — but it also shrinks the
  // sendable pool, which is at zero buffer, so it is a founder call and not a silent tidy-up.
  it('does NOT catch a known token carrying a region suffix (documented gap)', () => {
    expect(isOrgInbox('info-uk@x.com')).toBe(false)
    expect(isOrgInbox('info.us@x.com')).toBe(false)
  })
})

describe('isOrgInbox — real people and buyer-reaching roles stay eligible', () => {
  it('does not flag personal addresses', () => {
    for (const e of ['dylan@go2techs.net', 'jane.smith@acme.com', 'amelia.smith@x.com', 'jsmith@x.com'])
      expect(isOrgInbox(e)).toBe(false)
  })

  it('keeps ceo@/owner@/it@ — at a small MSP those reach exactly the buyer we want', () => {
    // Deliberate divergence from abTest.ts's ROLE_LOCALPARTS; pinned so it is not "tidied up".
    for (const e of ['ceo@x.com', 'owner@x.com', 'it@x.com']) expect(isOrgInbox(e)).toBe(false)
  })

  it('does not over-match names that merely contain an org token', () => {
    // 'helpdesk' must not drag in 'help' + a surname, and 'smartsell' must not drag in 'sell'.
    for (const e of ['helper@x.com', 'russell@x.com', 'selleck@x.com', 'supporter@x.com'])
      expect(isOrgInbox(e)).toBe(false)
  })

  it('handles malformed input without throwing', () => {
    expect(isOrgInbox('')).toBe(false)
    expect(isOrgInbox('@x.com')).toBe(false)
  })
})
