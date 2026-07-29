// ─────────────────────────────────────────────────────────────────────────────
//  GSA §4 ACCEPTANCE TEST — "would 7.4 have caught what Kaan caught by hand?"
//
//  WHY A SNAPSHOT AND NOT LIVE PROD: three of the four defects were fixed on
//  2026-07-29 (PS-INTERNAL-SIM-01, PS-FAKEPIPELINE-01, PS-FOLLOWUP-01). A run
//  against live data today would show them PASSing and would prove nothing about
//  whether the engine can FIND them. The acceptance criterion is explicitly
//  "run GSA against PhishSim as it was this week", so this file pins that state
//  as a fixture — every number below was measured from the prod database on
//  2026-07-29 and is cited in the commit history.
//
//  The fixture is therefore the evidence, and it must not be tuned to make the
//  engine pass. Each value carries its provenance in a comment.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { runGsa, renderDigest } from './engine'
import { UNIVERSAL_STANDARDS } from './standards/core'
import { PHISHSIM_STANDARDS, type PhishSimFacts } from './standards/phishsim'
import { classifyRemediation } from './classify'
import type { CheckResult } from './types'

const ALL = [...UNIVERSAL_STANDARDS, ...PHISHSIM_STANDARDS]

/**
 * PhishSim as it stood on the morning of 2026-07-29, BEFORE any of the day's
 * fixes. Sources for each figure:
 *   · 523 contacted / 16 second touches — ps_outreach_leads, prod
 *   · touchDefs = [] and SEQUENCE = []  — server/os/sequences.ts:274 (pre-fix)
 *   · 0 inbound events                  — outreach_reply_drafts, prod (empty)
 *   · 5 sims, all org 8 "PhishSim Internal" — campaign_results JOIN organizations
 *   · 4 free orgs, 3 internal/test      — organizations + org_members, prod
 */
const AS_IT_WAS: PhishSimFacts = {
  companyId: 'phishsimai',
  gatheredAt: '2026-07-29T08:00:00Z',
  outreach: {
    touchesConfigured: 1, // touch 1 only — touchDefs was []
    touchesEnabled: 1,
    contactedEver: 523,
    followUpsSentEver: 16,
    source: 'server/os/sequences.ts:274 (touchDefs=[]) + ps_outreach_leads',
  },
  replyCapture: {
    endpointReachable: true, // 401 from the live probe = deployed + auth enforced
    inboundEventsEver: 0,
    outboundAwaitingReply: 523,
    source: 'outreach_reply_drafts (0 rows) + POST /api/os/webhooks/resend-inbound',
  },
  metrics: {
    externalEvents: 0,
    internalEvents: 5, // all 5 campaign_results rows belong to org 8
    unknownEvents: 0,
    provenanceLabelled: false,
    source: 'campaign_results JOIN organizations',
  },
  pipeline: {
    rawCount: 4, // orgs 6, 7, 8, 9
    excludedCount: 0, // no exclusion list existed yet
    exclusionApplied: false,
    suspectedUnexcluded: ['kaanari@mac.com (org 8)', 'asadbek.munasar@forliion.com (orgs 6,7)'],
    source: 'organizations + org_members',
  },
  revenue: { tracesToPaymentRecord: true, derivedFigures: 0, source: 'organizations.planActivatedAt (pre-revenue)' },
  fabrication: { unsourcedFigures: [], source: 'agent context audit' },
  deploy: { ciWired: true, undeployedCommits: 0, source: 'vercel + git' },
  cache: { staleReadPaths: [], source: 'route audit' },
  openTracking: { instrumented: false, source: 'ps_outreach_leads has no open column' },
  phishsim: {
    followUpTouchesConfigured: 0,
    followUpsArmed: false,
    approvedVariants: 0,
    inboundWebhookReachable: true,
    inboundWebhookStatus: 401,
    simMetricsTagged: false,
    exclusionListEntries: 0,
    exclusionMatched: 0,
    coldOpenTrackingInstrumented: false,
    source: 'prod DB + source tree, 2026-07-29',
  },
}

const byId = (rs: CheckResult[], id: string) => rs.find(r => r.id === id)!

describe('GSA acceptance §4 — the four findings, surfaced with no human prompt', () => {
  it('runs read-only and changes nothing', async () => {
    const run = await runGsa(ALL, AS_IT_WAS)
    expect(run.mode).toBe('read-only')
    expect(run.applied).toHaveLength(0)
  })

  it('FINDING 1 — single-touch outreach (touchDefs=[])', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const u = byId(results, 'GTM-MULTITOUCH')
    expect(u.outcome).toBe('DEVIATION')
    expect(u.severity).toBe('critical')
    // Evidence, not assertion: the 523/16 gap must be in the finding.
    expect(JSON.stringify(u.evidence)).toMatch(/523/)
    expect(JSON.stringify(u.evidence)).toMatch(/16/)
    // The company plugin catches the concrete mechanism too.
    expect(byId(results, 'PS-TOUCHDEFS').outcome).toBe('DEVIATION')
  })

  it('FINDING 2 — unwired reply capture is UNVERIFIABLE, not PASS and not DEVIATION', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const r = byId(results, 'GTM-REPLY-CAPTURE')
    // The whole point: it must NOT claim the channel is broken (unearned) and
    // must NOT call it healthy (dangerous). Only the third state is honest.
    expect(r.outcome).toBe('UNVERIFIABLE')
    expect(r.summary).toMatch(/indistinguishable/i)
    expect(JSON.stringify(r.evidence)).toMatch(/523/)
  })

  it('FINDING 3 — internal-only sim metrics', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const m = byId(results, 'METRICS-EXTERNAL')
    expect(m.outcome).toBe('DEVIATION')
    expect(m.summary).toMatch(/market data/i)
    expect(byId(results, 'PS-SIM-PROVENANCE').outcome).toBe('DEVIATION')
  })

  it('FINDING 4 — inflated org count', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const p = byId(results, 'PIPELINE-REAL')
    expect(p.outcome).toBe('DEVIATION')
    expect(JSON.stringify(p.evidence)).toMatch(/kaanari@mac\.com/)
    expect(byId(results, 'PS-ORG-EXCLUSION').outcome).toBe('DEVIATION')
  })

  it('every result carries evidence — no assertion without proof (§2.1(3))', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    for (const r of results) {
      expect(r.evidence.length, r.id).toBeGreaterThan(0)
      for (const e of r.evidence) {
        expect(e.actual, r.id).toBeTruthy()
        expect(e.source, r.id).toBeTruthy()
      }
    }
  })
})

describe('GSA acceptance §4 — tier assignments on those same four', () => {
  it('single-touch → Tier B: blast radius beats reversibility', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    for (const id of ['GTM-MULTITOUCH', 'PS-TOUCHDEFS']) {
      const r = byId(results, id)
      expect(r.tier, id).toBe('B')
      // The classifier must cite the RIGHT reason. A Tier B for an incidental
      // reason (e.g. a missing prior value) would pass a naive assertion while
      // leaving the blast-radius rule unproven.
      expect(r.tierReason, id).toMatch(/outside the company|un-send/i)
    }
  })

  it('the multi-touch fix is genuinely reversible — so only blast radius can be forcing Tier B', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const rem = byId(results, 'GTM-MULTITOUCH').remediation!
    expect(rem.reversible).toBe(true) // a flag flip
    expect(rem.blastRadius).toBe('external-recipients')
    // Proof the axes are independent: same change, internal radius ⇒ Tier A.
    const hypothetical = classifyRemediation(
      { ...rem, changeKind: 'internal-config-flag', blastRadius: 'internal', dependsOn: [] },
      new Set(),
    )
    expect(hypothetical.tier).toBe('A')
  })

  it('reply capture → never auto-fixed, because it was never measured', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const r = byId(results, 'GTM-REPLY-CAPTURE')
    expect(r.tier).toBe('NONE')
    expect(r.tierReason).toMatch(/never auto-remediated/i)
  })

  it('metric tagging → Tier A (reversible, internal, nothing sent)', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    for (const id of ['METRICS-EXTERNAL', 'PS-SIM-PROVENANCE']) {
      expect(byId(results, id).tier, id).toBe('A')
    }
  })

  it('org exclusion → Tier A (reversible, non-destructive)', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    for (const id of ['PIPELINE-REAL', 'PS-ORG-EXCLUSION']) {
      expect(byId(results, id).tier, id).toBe('A')
    }
  })

  it('no UNVERIFIABLE anywhere is ever assigned a remediating tier', async () => {
    const { results } = await runGsa(ALL, AS_IT_WAS)
    const unver = results.filter(r => r.outcome === 'UNVERIFIABLE')
    expect(unver.length).toBeGreaterThan(0)
    for (const r of unver) expect(r.tier, r.id).toBe('NONE')
  })

  it('nothing that sends email, spends money or changes schema is ever Tier A', async () => {
    // The safety boundary (§5), asserted over the whole run rather than per case.
    const { results } = await runGsa(ALL, AS_IT_WAS)
    for (const r of results) {
      if (r.tier !== 'A') continue
      const rem = r.remediation!
      expect(['sends-email', 'payment-pricing', 'spends-money', 'schema-ddl', 'delete-data', 'auth-security-gate', 'unknown'])
        .not.toContain(rem.changeKind)
      expect(['external-recipients', 'money', 'irreversible']).not.toContain(rem.blastRadius)
      expect(rem.reversible).toBe(true)
      expect(rem.prior).toBeDefined() // rollback is a precondition, not a nicety
    }
  })

  it('the digest leads with what needs a human', async () => {
    const run = await runGsa(ALL, AS_IT_WAS)
    const md = renderDigest(run)
    expect(md).toMatch(/read-only run: nothing was changed/)
    expect(md.indexOf('NEEDS YOUR APPROVAL')).toBeLessThan(md.indexOf('Passing'))
    expect(md).toMatch(/GTM-MULTITOUCH/)
    expect(md).toMatch(/Unverifiable/)
  })
})

describe('GSA — the state after the 2026-07-29 fixes', () => {
  // Same engine, current facts. Confirms the checks actually respond to reality
  // rather than always firing — a check that cannot pass is not a check.
  const NOW: PhishSimFacts = {
    ...AS_IT_WAS,
    gatheredAt: '2026-07-29T18:00:00Z',
    outreach: { ...AS_IT_WAS.outreach!, touchesConfigured: 5, touchesEnabled: 1 },
    metrics: { ...AS_IT_WAS.metrics!, provenanceLabelled: true },
    pipeline: { ...AS_IT_WAS.pipeline!, excludedCount: 3, exclusionApplied: true, suspectedUnexcluded: [] },
    phishsim: {
      ...AS_IT_WAS.phishsim!,
      followUpTouchesConfigured: 4,
      followUpsArmed: false,
      approvedVariants: 0,
      simMetricsTagged: true,
      exclusionListEntries: 2,
      exclusionMatched: 3,
    },
  }

  it('the two metric/pipeline findings now PASS', async () => {
    const { results } = await runGsa(ALL, NOW)
    expect(byId(results, 'METRICS-EXTERNAL').outcome).toBe('PASS')
    expect(byId(results, 'PIPELINE-REAL').outcome).toBe('PASS')
    expect(byId(results, 'PS-SIM-PROVENANCE').outcome).toBe('PASS')
    expect(byId(results, 'PS-ORG-EXCLUSION').outcome).toBe('PASS')
  })

  it('multi-touch STILL deviates: configured but not armed is not fixed', async () => {
    // 5 touches exist in the file and none can send. The check must not be
    // satisfied by configuration alone — that is the same gap in a new costume.
    const { results } = await runGsa(ALL, NOW)
    const u = byId(results, 'GTM-MULTITOUCH')
    expect(u.outcome).toBe('DEVIATION')
    expect(u.summary).toMatch(/only 1 can send|but only 1/i)
    expect(u.tier).toBe('B')
  })

  it('reply capture remains UNVERIFIABLE until an inbound event lands', async () => {
    const { results } = await runGsa(ALL, NOW)
    expect(byId(results, 'GTM-REPLY-CAPTURE').outcome).toBe('UNVERIFIABLE')
  })

  it('once an inbound event lands, reply capture passes and unblocks multi-touch tiering', async () => {
    const PROVEN: PhishSimFacts = {
      ...NOW,
      replyCapture: { ...NOW.replyCapture!, inboundEventsEver: 1 },
      outreach: { ...NOW.outreach!, touchesConfigured: 5, touchesEnabled: 5 },
      phishsim: { ...NOW.phishsim!, followUpsArmed: true, approvedVariants: 4 },
    }
    const { results } = await runGsa(ALL, PROVEN)
    expect(byId(results, 'GTM-REPLY-CAPTURE').outcome).toBe('PASS')
    expect(byId(results, 'GTM-MULTITOUCH').outcome).toBe('PASS')
    expect(byId(results, 'PS-TOUCHDEFS').outcome).toBe('PASS')
  })
})
