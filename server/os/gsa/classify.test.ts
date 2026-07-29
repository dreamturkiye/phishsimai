// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1.1 — adversarial tests on the tier classifier.
//
//  The acceptance test proves the classifier is right on the four known cases.
//  That is not enough: it could be right there by coincidence and still route a
//  destructive change to Tier A tomorrow. These tests attack the fail-safe
//  directly — every case below is a remediation TRYING to be autonomous, and the
//  assertion is that it does not get to be.
//
//  Asymmetry that justifies the paranoia (§2.1.1): a safe change misrouted to
//  Tier B costs one approval tap. A destructive change misrouted to Tier A is
//  the failure the whole layer exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { classifyRemediation, assignTier } from './classify'
import type { ChangeKind, BlastRadius, Remediation, CheckResult } from './types'

const rem = (over: Partial<Remediation> = {}): Remediation => ({
  description: 'test',
  changeKind: 'metric-tagging',
  blastRadius: 'internal',
  reversible: true,
  prior: { was: 1 },
  ...over,
})

describe('fail-safe: unknown ⇒ Tier B', () => {
  it('an explicitly unknown change kind is never autonomous', () => {
    expect(classifyRemediation(rem({ changeKind: 'unknown' })).tier).toBe('B')
  })

  it('a DEVIATION with no proposed fix escalates rather than silently doing nothing', () => {
    const d = classifyRemediation(undefined)
    expect(d.tier).toBe('B')
    expect(d.reason).toMatch(/unknown ⇒ Tier B/i)
  })

  it('a change kind outside the pre-declared Tier A set is refused even if it looks harmless', () => {
    // Every kind NOT on the allowlist must be Tier B — including ones a future
    // author might add to the union and forget to classify.
    const notEligible: ChangeKind[] = [
      'sends-email', 'payment-pricing', 'auth-security-gate', 'schema-ddl', 'delete-data', 'spends-money', 'unknown',
    ]
    for (const k of notEligible) {
      expect(classifyRemediation(rem({ changeKind: k, blastRadius: 'internal' })).tier, k).toBe('B')
    }
  })
})

describe('blast radius alone can force Tier B, whatever else is true', () => {
  it('a perfectly reversible, allowlisted, rollback-ready change still fails on radius', () => {
    const dangerous: BlastRadius[] = ['external-recipients', 'money', 'irreversible']
    for (const b of dangerous) {
      const d = classifyRemediation(rem({ changeKind: 'internal-config-flag', blastRadius: b, reversible: true }))
      expect(d.tier, b).toBe('B')
    }
  })

  it('names external contact specifically — a rolled-back flag does not un-send an email', () => {
    const d = classifyRemediation(rem({ blastRadius: 'external-recipients' }))
    expect(d.reason).toMatch(/un-send/i)
  })
})

describe('reversibility and rollback are preconditions, not preferences', () => {
  it('irreversible changes are Tier B', () => {
    expect(classifyRemediation(rem({ reversible: false })).tier).toBe('B')
  })

  it('a change with no recorded prior value cannot be Tier A', () => {
    // Tier A's entire safety argument is "we can put it back". Without a prior
    // value that claim is unbacked, so the change is not eligible however safe
    // it otherwise looks.
    const d = classifyRemediation(rem({ prior: undefined }))
    expect(d.tier).toBe('B')
    expect(d.reason).toMatch(/roll the change back/i)
  })

  it('a null prior is a legitimate recorded value and does not block Tier A', () => {
    // `null` means "it was previously unset" — a real, restorable state.
    // Only `undefined` (nothing captured) is disqualifying.
    expect(classifyRemediation(rem({ prior: null })).tier).toBe('A')
  })
})

describe('dependencies gate autonomy', () => {
  it('an unmet dependency forces Tier B even for a clean internal change', () => {
    const d = classifyRemediation(rem({ dependsOn: ['GTM-REPLY-CAPTURE'] }), new Set())
    expect(d.tier).toBe('B')
    expect(d.reason).toMatch(/GTM-REPLY-CAPTURE/)
  })

  it('the same change becomes Tier A once the dependency passes', () => {
    const d = classifyRemediation(rem({ dependsOn: ['GTM-REPLY-CAPTURE'] }), new Set(['GTM-REPLY-CAPTURE']))
    expect(d.tier).toBe('A')
  })

  it('a partially-met dependency set is still unmet', () => {
    const d = classifyRemediation(rem({ dependsOn: ['A-STD', 'B-STD'] }), new Set(['A-STD']))
    expect(d.tier).toBe('B')
    expect(d.reason).toMatch(/B-STD/)
  })
})

describe('the one accepting path requires every condition together', () => {
  it('accepts only a reversible, allowlisted, low-radius, rollback-ready, dependency-free change', () => {
    const d = classifyRemediation(rem())
    expect(d.tier).toBe('A')
    expect(d.reason).toMatch(/safe to apply and report/i)
  })

  it('breaking any single condition drops it to Tier B', () => {
    const breakers: Partial<Remediation>[] = [
      { reversible: false },
      { prior: undefined },
      { changeKind: 'sends-email' },
      { blastRadius: 'money' },
      { dependsOn: ['NOT-PASSING'] },
    ]
    for (const b of breakers) {
      expect(classifyRemediation(rem(b)).tier, JSON.stringify(b)).toBe('B')
    }
  })
})

describe('outcome gating in assignTier', () => {
  const base: CheckResult = {
    id: 'X', outcome: 'DEVIATION', severity: 'high', summary: 's', evidence: [{ actual: 'a', source: 'b' }],
  }

  it('PASS is tier NONE and never carries a fix', () => {
    expect(assignTier({ ...base, outcome: 'PASS' }, new Set()).tier).toBe('NONE')
  })

  it('UNVERIFIABLE is NONE even when a tempting remediation is attached', () => {
    // The dangerous case: a standard reports "can't measure this" but still
    // proposes a fix. Acting on it would mean reconfiguring a system on the
    // strength of a measurement the engine just admitted it could not take.
    const r = assignTier(
      { ...base, outcome: 'UNVERIFIABLE', remediation: rem({ changeKind: 'metric-tagging' }) },
      new Set(),
    )
    expect(r.tier).toBe('NONE')
    expect(r.tierReason).toMatch(/could not measure/i)
  })

  it('a DEVIATION is classified normally', () => {
    expect(assignTier({ ...base, remediation: rem() }, new Set()).tier).toBe('A')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  The auditor must not corrupt the system it audits.
//
//  GSA probes the live inbound reply webhook on a schedule to establish
//  reachability. That endpoint's job is to mark leads as replied and alert the
//  founder — so an ungated probe would mark a lead replied, fire a "📬 REPLY"
//  to Telegram and spend an LLM call drafting a response to nobody, once a week,
//  forever. Worse, it would create the very inbound event that GTM-REPLY-CAPTURE
//  reads as proof the channel works: the auditor would fake its own evidence.
// ─────────────────────────────────────────────────────────────────────────────
import { isSyntheticSender } from '../replyParser'

describe('GSA probe safety', () => {
  it('the probe sender is recognised as synthetic and gated before any side effect', () => {
    expect(isSyntheticSender('gsa-probe@example.invalid')).toBe(true)
  })

  it('a real prospect address is NOT treated as synthetic', () => {
    // The guard must not swallow genuine replies — that would recreate the exact
    // blindness GSA exists to detect.
    expect(isSyntheticSender('dave@acme-it.com')).toBe(false)
    expect(isSyntheticSender('info@belldesign.net')).toBe(false)
  })
})
