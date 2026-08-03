// PS-CURRENCY-01 — tests for the "grounded, not gullible" property.
//
// The whole faculty is safe only if an external claim cannot become doctrine. Two things enforce
// that: the screen (refuses protected surfaces) and the ABSENCE of an adopt path. Both are pinned
// here, the second by asserting the module's public surface really has no way to promote anything.
import { describe, it, expect } from 'vitest'
import * as currency from './currency'
import { screenProposal, formatProposal, currencyLine, proposalSignature, normalise, type TrustedSource } from './currency'

const SRC: TrustedSource = {
  slug: 'example',
  name: 'Example Source',
  url: 'https://example.com/guide',
  kind: 'vendor_doc',
  why: 'reference implementation for the domain',
}

describe('the screen — protected doctrine may never move from external input', () => {
  it('refuses a pricing suggestion', () => {
    const r = screenProposal({ claim: 'Competitors average $4/user/month', implication: 'Consider lowering our price to match' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('pricing')
  })

  it('refuses a discount suggestion even when the claim itself is innocuous', () => {
    // The claim is a neutral fact; only the implication is dangerous. Screening the claim alone
    // would let the actionable half through unread.
    const r = screenProposal({ claim: 'Q4 is the heaviest buying season for MSPs', implication: 'Offer a founding rate discount in Q4' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('pricing')
  })

  it('refuses a brand-voice rewrite', () => {
    expect(screenProposal({ claim: 'Playful tone lifts open rates', implication: 'Change our brand voice to be playful' }).allowed).toBe(false)
  })

  it('refuses anything that would manufacture social proof', () => {
    const r = screenProposal({ claim: 'Case studies lift conversion', implication: 'Add a testimonial to the landing page' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('honesty rules')
  })

  it('refuses a suggestion to weaken its own guardrails', () => {
    const r = screenProposal({ claim: 'Faster replies win deals', implication: 'Enable auto-send without human review' })
    expect(r.allowed).toBe(false)
    expect(r.reason).toContain('own guardrails')
  })

  it('allows a genuine tactic-level proposal', () => {
    const r = screenProposal({ claim: 'Tuesday sends see higher engagement in B2B', implication: 'Shift the send window to Tuesday morning' })
    expect(r.allowed).toBe(true)
  })
})

describe('provenance travels with the claim', () => {
  it('carries source, kind, url and capture date in the lesson text itself', () => {
    const text = formatProposal(SRC, { claim: 'A claim', implication: 'A tactic' }, '2026-08-03', { allowed: true, reason: 'ok' })
    expect(text).toContain('Example Source')
    expect(text).toContain('https://example.com/guide')
    expect(text).toContain('2026-08-03')
    // The citation must be IN the lesson body because that body is what gets fed into agent prompts;
    // a citation in a sidecar column is one the reading agent never sees.
    expect(text).toContain('vendor_doc')
  })

  it('marks an allowed proposal as NOT adopted doctrine', () => {
    const text = formatProposal(SRC, { claim: 'c', implication: 'i' }, '2026-08-03', { allowed: true, reason: 'ok' })
    expect(text).toContain('NOT ADOPTED DOCTRINE')
    expect(text).toContain('no code path in this system can promote it')
  })

  it('records a refusal rather than dropping it silently', () => {
    const text = formatProposal(SRC, { claim: 'c', implication: 'i' }, '2026-08-03', { allowed: false, reason: 'touches PROTECTED doctrine (pricing)' })
    expect(text).toContain('REFUSED')
    expect(text).toContain('pricing')
  })
})

describe('there is no adopt path — the absence is the guardrail', () => {
  it('exports nothing that could promote a proposal to fact', () => {
    const names = Object.keys(currency)
    const promoters = names.filter((n) => /adopt|promote|apply|accept|enact|commit/i.test(n))
    expect(promoters).toEqual([])
  })
})

describe('signatures are stable and per-source', () => {
  it('is deterministic for the same source and claim', () => {
    expect(proposalSignature('rex', 'a', 'Same claim')).toBe(proposalSignature('rex', 'a', 'Same claim'))
  })

  it('is case-insensitive on the claim, so re-phrasing case does not re-file', () => {
    expect(proposalSignature('rex', 'a', 'Same Claim')).toBe(proposalSignature('rex', 'a', 'same claim'))
  })

  it('differs across agents and across sources', () => {
    expect(proposalSignature('rex', 'a', 'c')).not.toBe(proposalSignature('dex', 'a', 'c'))
    expect(proposalSignature('rex', 'a', 'c')).not.toBe(proposalSignature('rex', 'b', 'c'))
  })
})

describe('the report line is honest about what it read', () => {
  const base = { agentId: 'rex', sourcesConfigured: 3, fetched: 0, notChecked: [] as string[], proposals: 0, refused: 0, line: '' }

  it('says NOT CHECKED when nothing was reachable — never "no changes"', () => {
    const line = currencyLine({ ...base, notChecked: ['A (timeout)'] })
    expect(line).toContain('NOT CHECKED')
    expect(line).toContain('a loop that read nothing proposes nothing')
    expect(line).not.toContain('nothing new worth proposing')
  })

  it('distinguishes "read them, nothing new" from "could not read them"', () => {
    const line = currencyLine({ ...base, fetched: 3 })
    expect(line).toContain('nothing new worth proposing')
  })

  it('surfaces refusals in the line rather than hiding them', () => {
    const line = currencyLine({ ...base, fetched: 3, proposals: 1, refused: 2 })
    expect(line).toContain('2 REFUSED')
    expect(line).toContain('NOT adopted doctrine')
  })
})

describe('page normalisation', () => {
  it('strips scripts, styles and markup down to comparable text', () => {
    expect(normalise('<style>a{}</style><script>x()</script><p>Hello  world</p>')).toBe('Hello world')
  })
})
