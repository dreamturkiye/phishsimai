// ─────────────────────────────────────────────────────────────────────────────
//  PS-INTERNAL-FUNNEL-01 — the funnel is computed over EXTERNAL sends only.
//
//  The bug this pins: on 2026-08-02 the brief reported "100% open / 40% click" as engagement
//  wins and "0% credential submission" as a conversion failure. All three came from 5 rows that
//  were the founder emailing himself at kaan@phishsimai.com from 127.0.0.1 — verified directly
//  against ep-spring-leaf. PS-INTERNAL-SIM-01 had already added a provenance WARNING, but the
//  rates themselves were still blended, so the line still read "Opened 5/5 (100.0%)" and agents
//  quoted the number without the caveat under it.
//
//  So these tests assert the DENOMINATOR changed, not that a disclaimer exists:
//    1. at 0 external sends there is no percentage anywhere in the output, and no "0%";
//    2. excluded rows are always counted and shown, never silently dropped;
//    3. below MIN_RATE_DENOMINATOR no percentage is emitted at any n;
//    4. capture status is stated as deployment fact, never inferred from the count.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  externalFunnelMetric,
  credentialCaptureStatus,
  unflaggedInternalOrgWarning,
  NON_LEAD_ORG_ADMIN_EMAILS,
  MIN_RATE_DENOMINATOR,
  INTERNAL_ORG_IDS,
  INTERNAL_RECIPIENT_DOMAINS,
  type FunnelCounts,
  type ExcludedBreakdown,
} from './kaan_os_v4'

const NO_COUNTS: FunnelCounts = { sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 }
const NO_EXCLUSIONS: ExcludedBreakdown = { total: 0, byDomain: 0, byPrivateIp: 0, byOrg: 0, unknown: 0 }

// The exact production state on 2026-08-02: 5 sends, all internal on every axis at once.
const TODAY_EXCLUDED: ExcludedBreakdown = { total: 5, byDomain: 5, byPrivateIp: 5, byOrg: 5, unknown: 0 }

describe('zero external sends — absence of measurement, not a measured zero', () => {
  const out = externalFunnelMetric(NO_COUNTS, TODAY_EXCLUDED)

  it('reports 0 external sends and an N/A funnel at n=0', () => {
    expect(out).toContain('0 external sends')
    expect(out).toContain('funnel N/A — n=0')
  })

  it('emits NO percentage anywhere — a "0%" here is the original bug', () => {
    expect(out).not.toMatch(/\d%/)
    expect(out).not.toContain('0%')
    expect(out).not.toContain('100%')
  })

  it('states plainly that no measurement exists, so a zero cannot be read as a bad result', () => {
    expect(out).toContain('There is NO external simulation data')
    expect(out).toMatch(/Not a low number, not a zero result/)
  })

  it('names acquisition as the constraint rather than the funnel', () => {
    expect(out).toContain('The constraint is acquisition, not the funnel.')
  })

  it('forbids the inverted reading too — "our rates are bad" is equally unsupported at n=0', () => {
    expect(out).toContain('including a sentence saying those things are BAD')
  })
})

describe('excluded rows are counted and shown, never silently dropped', () => {
  const out = externalFunnelMetric(NO_COUNTS, TODAY_EXCLUDED)

  it('prints the total excluded', () => {
    expect(out).toContain('5 internal/test EXCLUDED from every rate')
  })

  it('prints each exclusion reason with its own count', () => {
    expect(out).toContain('5 to our own org(s)')
    expect(out).toContain('5 to an @phishsimai.com address')
    expect(out).toContain('5 from localhost/private IP')
  })

  it('warns that overlapping reasons do not sum, so the arithmetic does not look broken', () => {
    expect(out).toContain('reasons overlap, so they do not sum')
  })

  it('says nothing about exclusions when there are none', () => {
    expect(externalFunnelMetric({ ...NO_COUNTS, sent: 40 }, NO_EXCLUSIONS)).not.toContain('EXCLUDED')
  })

  it('counts unattributable rows as excluded rather than assuming they are real', () => {
    const out2 = externalFunnelMetric(NO_COUNTS, { ...NO_EXCLUSIONS, total: 3, unknown: 3 })
    expect(out2).toContain('3 unattributable')
    expect(out2).toContain('3 internal/test EXCLUDED')
  })

  // REGRESSION. The first draft derived the headline by summing the reason fields, so the real
  // production shape — 5 rows each tripping domain AND private-ip AND org — rendered as
  // "15 internal/test EXCLUDED". That invents 10 sends that do not exist. An inflated count in a
  // line whose entire purpose is to stop inflated counts is worse than no line at all.
  it('reports the ACTUAL excluded row count, never the sum of overlapping reasons', () => {
    const out = externalFunnelMetric(NO_COUNTS, TODAY_EXCLUDED)
    expect(out).toContain('5 internal/test EXCLUDED')
    expect(out).not.toContain('15 internal/test EXCLUDED')
    expect(TODAY_EXCLUDED.byDomain + TODAY_EXCLUDED.byPrivateIp + TODAY_EXCLUDED.byOrg).toBe(15)
    expect(TODAY_EXCLUDED.total).toBe(5)
  })

  it('never claims more excluded rows than the population that produced them', () => {
    const out = externalFunnelMetric(NO_COUNTS, TODAY_EXCLUDED)
    const headline = out.match(/\((\d+) internal\/test EXCLUDED/)
    expect(headline).not.toBeNull()
    expect(Number(headline![1])).toBe(TODAY_EXCLUDED.total)
  })
})

describe('below MIN_RATE_DENOMINATOR — counts only, no percentage at any n', () => {
  it('shows raw counts with denominators and no percent sign', () => {
    const out = externalFunnelMetric(
      { sent: 12, opened: 9, clicked: 5, submitted: 1, reported: 4 }, NO_EXCLUSIONS)
    expect(out).toContain('12 external send(s)')
    expect(out).toContain('Opened 9/12')
    expect(out).toContain('Clicked 5/12')
    expect(out).toContain('Submitted 1/12')
    expect(out).not.toMatch(/\d%/)
  })

  it('explains why the percentage is withheld', () => {
    const out = externalFunnelMetric({ ...NO_COUNTS, sent: 12 }, NO_EXCLUSIONS)
    expect(out).toContain('COUNTS ONLY')
    expect(out).toContain(`below ${MIN_RATE_DENOMINATOR}`)
    expect(out).toContain('do not compare them to an industry benchmark')
  })

  it('withholds the percentage at exactly one below the floor', () => {
    const out = externalFunnelMetric(
      { ...NO_COUNTS, sent: MIN_RATE_DENOMINATOR - 1 }, NO_EXCLUSIONS)
    expect(out).not.toMatch(/\d%/)
  })
})

describe('at or above MIN_RATE_DENOMINATOR — percentages are allowed', () => {
  const out = externalFunnelMetric(
    { sent: 30, opened: 15, clicked: 6, submitted: 3, reported: 9 }, NO_EXCLUSIONS)

  it('emits percentages alongside the raw counts, never instead of them', () => {
    expect(out).toContain('Opened 15/30 (50.0%)')
    expect(out).toContain('Clicked 6/30 (20.0%)')
    expect(out).toContain('Reported 9/30 (30.0%)')
    expect(out).toContain('Submitted 3/30 (10.0%)')
  })

  it('still reports exclusions when both exist', () => {
    const mixed = externalFunnelMetric(
      { sent: 30, opened: 15, clicked: 6, submitted: 3, reported: 9 },
      { ...NO_EXCLUSIONS, total: 5, byOrg: 5 })
    expect(mixed).toContain('5 internal/test EXCLUDED')
    expect(mixed).toContain('(50.0%)')
  })
})

describe('credential capture status is deployment fact, not an inference from the count', () => {
  it('says BUILT AND LIVE and names both routes even at zero submissions', () => {
    const out = credentialCaptureStatus(0)
    expect(out).toContain('BUILT AND LIVE')
    expect(out).toContain('/c/:token')
    expect(out).toContain('/submit/:token')
    expect(out).toContain('0 submission(s)')
  })

  it('never uses language implying the feature is missing', () => {
    const out = credentialCaptureStatus(0)
    expect(out).not.toMatch(/unbuilt|not built|missing|DOES NOT EXIST|broken/i)
  })

  it('reports a real count when submissions exist', () => {
    expect(credentialCaptureStatus(7)).toContain('7 submission(s)')
  })
})

describe('tripwire on the hardcoded INTERNAL_ORG_IDS list', () => {
  it('is silent when nothing looks internal — no false alarm in the normal case', () => {
    expect(unflaggedInternalOrgWarning([])).toBe('')
  })

  it('names every suspect org with its id and admin contact', () => {
    const out = unflaggedInternalOrgWarning([
      { id: 12, name: 'scratch', adminEmail: 'kaanari@mac.com' },
      { id: 13, name: 'demo', adminEmail: 'qa@phishsimai.com' },
    ])
    expect(out).toContain('2 ORG(S) LOOK INTERNAL BUT ARE NOT EXCLUDED')
    expect(out).toContain('#12 "scratch" (kaanari@mac.com)')
    expect(out).toContain('#13 "demo" (qa@phishsimai.com)')
  })

  it('says the external numbers are inflated and must not be quoted', () => {
    const out = unflaggedInternalOrgWarning([{ id: 12, name: 'x', adminEmail: 'kaanari@mac.com' }])
    expect(out).toContain('INFLATED')
    expect(out).toContain('INTERNAL_ORG_IDS')
    expect(out).toContain('PS-INTERNAL-FUNNEL-02')
  })

  // The founder's brief said "@phishsimai.com". Measured against prod, the three known internal
  // orgs use @forliion.com and @mac.com — zero are @phishsimai.com. A tripwire matching only the
  // literal rule could not fire on a single real instance of what it watches for.
  it('fires on a known-internal admin address that is NOT on our own domain', () => {
    const out = unflaggedInternalOrgWarning([
      { id: 14, name: 'new test org', adminEmail: 'asadbek.munasar@forliion.com' },
    ])
    expect(out).toContain('#14 "new test org"')
    expect(out).toContain('LOOK INTERNAL BUT ARE NOT EXCLUDED')
  })

  it('the addresses it must catch are exactly the ones already known to be ours', () => {
    // Guards against someone "simplifying" the query back to a bare @phishsimai.com LIKE.
    expect(NON_LEAD_ORG_ADMIN_EMAILS).toContain('kaanari@mac.com')
    expect(NON_LEAD_ORG_ADMIN_EMAILS).toContain('asadbek.munasar@forliion.com')
    expect(NON_LEAD_ORG_ADMIN_EMAILS.some(e => e.endsWith('@phishsimai.com'))).toBe(false)
  })
})

describe('exclusion constants match what was verified in prod on 2026-08-02', () => {
  it('pins the three internal org ids', () => {
    expect([...INTERNAL_ORG_IDS].sort((a, b) => a - b)).toEqual([6, 7, 8])
  })

  it('treats our own apex as an internal recipient domain', () => {
    expect(INTERNAL_RECIPIENT_DOMAINS).toContain('phishsimai.com')
  })
})
