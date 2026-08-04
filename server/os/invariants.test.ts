// ─────────────────────────────────────────────────────────────────────────────
//  PS-INVARIANT-01 — each invariant proven by REINTRODUCING its violation.
//
//  A guard is never trusted to pass, only proven to fail when it should. Every block below states
//  the real-world defect it re-creates, so a reader can see the test discriminates rather than
//  merely runs.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  checkMrrInvariant,
  auditSuppressionRails,
  checkNotCheckedInvariant,
  checkPricingFrozen,
  summariseInvariants,
  OUTREACH_SEND_PATHS,
  REQUIRED_SUPPRESSION_RAILS,
  MRR_TOLERANCE_USD,
} from './invariants'
import { NOT_CHECKED } from './agents/scanVerdict'

describe('INV-1 — no fabricated MRR', () => {
  it('HOLDS when both derivations agree over real subscriptions', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 897, independentMrrUsd: 897, activeSubs: 3, stripeChecked: true })
    expect(r.status).toBe('HOLDS')
    expect(r.halt).toBe(false)
  })

  it('HOLDS at $0 over zero subs — the true state today', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 0, stripeChecked: true })
    expect(r.status).toBe('HOLDS')
    expect(r.evidence).toContain('$0.00')
  })

  // REINTRODUCTION 1: the two paths drift — a hardcoded price creeping back into one of them, or an
  // annual plan not normalised to monthly in one path but not the other.
  it('HALTS when the two derivations disagree', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 897, independentMrrUsd: 747, activeSubs: 3, stripeChecked: true })
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
    expect(r.evidence).toContain('disagree by $150.00')
  })

  // REINTRODUCTION 2: THE JULY PHANTOM. Nonzero MRR over zero subscriptions — the exact shape of the
  // $99/$249/$499/$999 ladder that reported revenue no customer had ever paid.
  it('HALTS on nonzero MRR over ZERO active subscriptions', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 249, independentMrrUsd: 249, activeSubs: 0, stripeChecked: true })
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
    expect(r.evidence).toContain('ZERO active subscriptions')
  })

  // The mirror: subs exist but MRR reads zero — a broken read, not a free customer.
  it('HALTS on zero MRR while subscriptions are active', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 2, stripeChecked: true })
    expect(r.status).toBe('VIOLATED')
    expect(r.evidence).toContain('but MRR computed as $0')
  })

  it('is NOT_CHECKED — never HOLDS — when Stripe was unreachable', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 0, stripeChecked: false })
    expect(r.status).toBe(NOT_CHECKED)
    expect(r.halt).toBe(false)
    expect(r.unitsScanned).toBe(0)
  })

  it('tolerates only rounding, not drift', () => {
    expect(checkMrrInvariant({ computedMrrUsd: 100, independentMrrUsd: 100 + MRR_TOLERANCE_USD, activeSubs: 1, stripeChecked: true }).status).toBe('HOLDS')
    expect(checkMrrInvariant({ computedMrrUsd: 100, independentMrrUsd: 100.5, activeSubs: 1, stripeChecked: true }).status).toBe('VIOLATED')
  })
})

describe('INV-2 — suppression rails intact on every outreach send path', () => {
  /** The real file, as shipped. */
  const live = (): Record<string, string> =>
    Object.fromEntries(OUTREACH_SEND_PATHS.map((p) => [p, fs.readFileSync(p, 'utf8')]))

  it('HOLDS against the real tree today', () => {
    const r = auditSuppressionRails(live())
    expect(r.status).toBe('HOLDS')
    expect(r.unitsScanned).toBe(OUTREACH_SEND_PATHS.length)
  })

  // REINTRODUCTION: drop each clause in turn. Losing ANY ONE re-opens a real hole, so each must fail
  // independently — a test that only catches all-three-removed would miss the realistic regression.
  it.each(REQUIRED_SUPPRESSION_RAILS.map((r) => r.key))('HALTS when the %s rail is removed', (key) => {
    const files = live()
    const rail = REQUIRED_SUPPRESSION_RAILS.find((r) => r.key === key)!
    for (const p of OUTREACH_SEND_PATHS) files[p] = files[p].replace(new RegExp(rail.re.source, 'gi'), 'TRUE /* rail removed */')
    const r = auditSuppressionRails(files)
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
    expect(r.evidence).toContain(key)
  })

  it('an UNREADABLE tree is NOT_CHECKED, never a pass over nothing', () => {
    const r = auditSuppressionRails({})
    expect(r.status).toBe(NOT_CHECKED)
    expect(r.unitsScanned).toBe(0)
  })

  it('does NOT audit the simulation path — enqueueCampaignSend is correctly exempt', () => {
    // Employees cannot unsubscribe from their employer's security training; there is no CAN-SPAM
    // relationship. Its floor is domain enrolment. Auditing it would enforce the wrong rule.
    expect(OUTREACH_SEND_PATHS).not.toContain('server/lib/campaignSend.ts' as never)
  })
})

describe('INV-3 — NOT_CHECKED never reads clean', () => {
  it('HOLDS when every zero-unit scan reported NOT_CHECKED', () => {
    const r = checkNotCheckedInvariant([
      { subject: 'Rex.staticScan', verdict: NOT_CHECKED, unitsScanned: 0 },
      { subject: 'Finn.pricingGuard', verdict: 'GREEN', unitsScanned: 12 },
    ])
    expect(r.status).toBe('HOLDS')
  })

  // REINTRODUCTION: the Finn defect (§2 #8) — GREEN shipped to production over ZERO claims, the
  // exact law the org exists to enforce violated inside the agent that enforces it.
  it('HALTS on a PASS asserted over zero examined units', () => {
    const r = checkNotCheckedInvariant([{ subject: 'Finn.pricingGuard', verdict: 'GREEN', unitsScanned: 0 }])
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
    expect(r.evidence).toContain("reported 'GREEN' over 0 units")
  })

  it('is NOT_CHECKED when there are no verdicts to inspect', () => {
    expect(checkNotCheckedInvariant([]).status).toBe(NOT_CHECKED)
  })
})

describe('INV-4 — pricing frozen', () => {
  it('HOLDS when claims match live Stripe', () => {
    const r = checkPricingFrozen([], 12, true)
    expect(r.status).toBe('HOLDS')
    expect(r.evidence).toContain('12 price claim(s) match')
  })

  // REINTRODUCTION: a price literal in code drifts from live Stripe — the $99/$249/$499/$999 class.
  it('HALTS when a claim has drifted', () => {
    const r = checkPricingFrozen([{ detector: 'pricing_drift' }], 12, true)
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
  })

  it('is NOT_CHECKED when live prices were unavailable — never GREEN over zero', () => {
    expect(checkPricingFrozen([], 0, false).status).toBe(NOT_CHECKED)
  })

  it('is NOT_CHECKED when Stripe answered but zero claims were compared', () => {
    // Stripe reachability is not evidence the check ran. This is defect #8 restated.
    expect(checkPricingFrozen([], 0, true).status).toBe(NOT_CHECKED)
  })
})

describe('the suite halts and speaks plainly', () => {
  it('halts if ANY invariant is violated', () => {
    const s = summariseInvariants([
      checkMrrInvariant({ computedMrrUsd: 249, independentMrrUsd: 249, activeSubs: 0, stripeChecked: true }),
      checkPricingFrozen([], 12, true),
    ])
    expect(s.halt).toBe(true)
    expect(s.line).toContain('INVARIANT VIOLATION')
    expect(s.line).toContain('HALTED')
  })

  it('does NOT halt on unmeasured, but never goes quiet about it', () => {
    const s = summariseInvariants([checkPricingFrozen([], 0, false)])
    expect(s.halt).toBe(false)
    expect(s.unmeasured).toEqual(['INV-4'])
    expect(s.line).toContain('unmeasured is not clean')
  })

  it('says so plainly when all hold', () => {
    const s = summariseInvariants([checkPricingFrozen([], 12, true)])
    expect(s.line).toBe('Invariants: all 1 hold.')
  })
})
