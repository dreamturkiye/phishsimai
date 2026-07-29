// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.2 — PhishSim company plugin (`phishsim-gsa-1.0`).
//
//  Company-shaped assertions only. Anything true for every company belongs in
//  standards/core.ts so the other products inherit it (§1) — the failure mode
//  this split prevents is a universal fix having to be made five times and
//  drifting.
//
//  These five come from the spec's PhishSim plugin list. Where a check would
//  merely restate a universal standard, it deliberately asserts the PhishSim-
//  SPECIFIC mechanism instead: the universal one asks "is the sequence ≥3
//  touches?", this one asks "does `touchDefs`/FOLLOWUP_TOUCHES actually hold
//  them and is FOLLOWUPS_ARMED true?" — the concrete thing that was empty.
// ─────────────────────────────────────────────────────────────────────────────
import type { CheckResult, CompanyFacts, Standard } from '../types'

export interface PhishSimFacts extends CompanyFacts {
  phishsim?: {
    /** Length of the configured follow-up set (touches 2+), from the source file. */
    followUpTouchesConfigured: number
    /** FOLLOWUPS_ARMED && an approved variant exists for each touch. */
    followUpsArmed: boolean
    /** Count of touches with an approved copy variant. */
    approvedVariants: number
    /** Did an HTTP probe reach the inbound webhook? null = not probed. */
    inboundWebhookReachable: boolean | null
    /** HTTP status the probe saw, for evidence. */
    inboundWebhookStatus: number | null
    /** Is the sim-metric provenance split rendered in the agents' context? */
    simMetricsTagged: boolean
    /** Emails on the non-lead exclusion list. */
    exclusionListEntries: number
    /** Free orgs whose admin is on the exclusion list. */
    exclusionMatched: number
    /** Is open tracking instrumented on cold outreach? */
    coldOpenTrackingInstrumented: boolean
    source: string
  } | null
}

const noFacts = (id: string, severity: CheckResult['severity'], what: string): CheckResult => ({
  id,
  outcome: 'UNVERIFIABLE',
  severity,
  summary: `Cannot determine ${what} — PhishSim facts were not supplied.`,
  evidence: [{ actual: 'no data', source: 'phishsim adapter', note: 'Absence of a measurement is not a pass.' }],
})

// ── PS-TOUCHDEFS ─────────────────────────────────────────────────────────────
// The literal defect: `touchDefs = []` and `SEQUENCE = []` sat in sequences.ts
// for 523 sends. This check reads the thing itself rather than a metric derived
// from it, because no metric existed — that was the whole problem.
export const PS_TOUCHDEFS: Standard = {
  id: 'PS-TOUCHDEFS',
  scope: 'company',
  description: 'PhishSim follow-up touches are configured (≥2 beyond touch 1) AND armed to send.',
  severity: 'critical',
  origin: 'PS-FOLLOWUP-01: touchDefs=[] after the dishonest copy was deleted 2026-07-24 and never refilled.',
  run(f: PhishSimFacts): CheckResult {
    const p = f.phishsim
    if (!p) return noFacts('PS-TOUCHDEFS', 'critical', 'follow-up touch configuration')
    const ev = [
      { actual: `${p.followUpTouchesConfigured} follow-up touch(es) configured`, source: p.source },
      { actual: `armed: ${p.followUpsArmed}, approved copy variants: ${p.approvedVariants}`, source: p.source },
    ]
    if (p.followUpTouchesConfigured < 2) {
      return {
        id: 'PS-TOUCHDEFS',
        outcome: 'DEVIATION',
        severity: 'critical',
        summary: `Only ${p.followUpTouchesConfigured} follow-up touch(es) are configured — the sequence is effectively single-touch.`,
        evidence: ev,
        remediation: {
          description: 'Populate the follow-up sequence with touches 2-5 and approve copy for each.',
          changeKind: 'sends-email',
          blastRadius: 'external-recipients',
          reversible: true,
          dependsOn: ['GTM-REPLY-CAPTURE'],
          prior: { followUpTouchesConfigured: p.followUpTouchesConfigured },
        },
      }
    }
    if (!p.followUpsArmed || p.approvedVariants < p.followUpTouchesConfigured) {
      return {
        id: 'PS-TOUCHDEFS',
        outcome: 'DEVIATION',
        severity: 'high',
        summary:
          `${p.followUpTouchesConfigured} follow-up touches are configured but cannot send ` +
          `(armed: ${p.followUpsArmed}, ${p.approvedVariants}/${p.followUpTouchesConfigured} approved). ` +
          `A sequence that cannot send is, from the prospect's side, the same as no sequence.`,
        evidence: ev,
        remediation: {
          description: 'Approve the drafted copy for each touch and arm the follow-up sender.',
          changeKind: 'sends-email',
          blastRadius: 'external-recipients',
          reversible: true,
          dependsOn: ['GTM-REPLY-CAPTURE'],
          prior: { followUpsArmed: p.followUpsArmed, approvedVariants: p.approvedVariants },
        },
      }
    }
    return {
      id: 'PS-TOUCHDEFS',
      outcome: 'PASS',
      severity: 'critical',
      summary: `${p.followUpTouchesConfigured} follow-up touches configured, approved and armed.`,
      evidence: ev,
    }
  },
}

// ── PS-INBOUND-WEBHOOK ───────────────────────────────────────────────────────
// Reachability is NOT the same question as "does the relay deliver". A 401 proves
// the handler is deployed and authenticated; it proves nothing about whether the
// Google Workspace routing rule and mail-parse relay in front of it exist. This
// check reports exactly what it can see and defers the rest to GTM-REPLY-CAPTURE.
export const PS_INBOUND_WEBHOOK: Standard = {
  id: 'PS-INBOUND-WEBHOOK',
  scope: 'company',
  description: 'The Resend/CloudMailin inbound reply webhook is deployed and reachable.',
  severity: 'critical',
  origin: 'PS-REPLY-CAPTURE-01: endpoint live, zero inbound events ever recorded.',
  run(f: PhishSimFacts): CheckResult {
    const p = f.phishsim
    if (!p) return noFacts('PS-INBOUND-WEBHOOK', 'critical', 'inbound webhook reachability')
    const ev = [
      {
        actual: p.inboundWebhookReachable === null
          ? 'not probed'
          : `reachable: ${p.inboundWebhookReachable} (HTTP ${p.inboundWebhookStatus ?? '?'})`,
        source: p.source,
      },
    ]
    if (p.inboundWebhookReachable === null) {
      return {
        id: 'PS-INBOUND-WEBHOOK',
        outcome: 'UNVERIFIABLE',
        severity: 'critical',
        summary: 'The inbound webhook was not probed, so its reachability is unknown.',
        evidence: ev,
      }
    }
    if (!p.inboundWebhookReachable) {
      return {
        id: 'PS-INBOUND-WEBHOOK',
        outcome: 'DEVIATION',
        severity: 'critical',
        summary: `The inbound reply webhook did not respond as deployed (HTTP ${p.inboundWebhookStatus ?? '?'}).`,
        evidence: ev,
        remediation: {
          description: 'Restore the inbound webhook route in production.',
          changeKind: 'unknown', // a routing/deploy change — not classifiable as safe
          blastRadius: 'irreversible',
          reversible: false,
        },
      }
    }
    return {
      id: 'PS-INBOUND-WEBHOOK',
      outcome: 'PASS',
      severity: 'critical',
      summary: `The inbound reply webhook is deployed and authenticated (HTTP ${p.inboundWebhookStatus}).`,
      evidence: [
        ...ev,
        {
          actual: 'reachability only',
          source: p.source,
          note: 'Says nothing about whether the upstream mail relay delivers — that is GTM-REPLY-CAPTURE.',
        },
      ],
    }
  },
}

// ── PS-SIM-PROVENANCE ────────────────────────────────────────────────────────
export const PS_SIM_PROVENANCE: Standard = {
  id: 'PS-SIM-PROVENANCE',
  scope: 'company',
  description: 'Simulation metrics are tagged internal-vs-external wherever agents read them.',
  severity: 'high',
  origin: 'PS-INTERNAL-SIM-01: all 5 sims belonged to org 8; a 40% click rate was compared to an industry benchmark.',
  run(f: PhishSimFacts): CheckResult {
    const p = f.phishsim
    if (!p) return noFacts('PS-SIM-PROVENANCE', 'high', 'simulation metric tagging')
    const ev = [{ actual: `sim metrics tagged with provenance: ${p.simMetricsTagged}`, source: p.source }]
    if (!p.simMetricsTagged) {
      return {
        id: 'PS-SIM-PROVENANCE',
        outcome: 'DEVIATION',
        severity: 'high',
        summary: 'Simulation metrics reach agents without an internal-vs-external provenance tag, so they can be read as market data.',
        evidence: ev,
        remediation: {
          description: 'Attach the internal/external provenance note to the simulation metric block in the agent context.',
          changeKind: 'metric-tagging',
          blastRadius: 'internal',
          reversible: true,
          prior: { simMetricsTagged: false },
          next: { simMetricsTagged: true },
        },
      }
    }
    return { id: 'PS-SIM-PROVENANCE', outcome: 'PASS', severity: 'high', summary: 'Simulation metrics carry provenance.', evidence: ev }
  },
}

// ── PS-ORG-EXCLUSION ─────────────────────────────────────────────────────────
export const PS_ORG_EXCLUSION: Standard = {
  id: 'PS-ORG-EXCLUSION',
  scope: 'company',
  description: 'The founder/test org exclusion list is current and applied to reported counts.',
  severity: 'high',
  origin: 'PS-FAKEPIPELINE-01: "4 free orgs" was 1 real prospect. Resurfaced twice.',
  run(f: PhishSimFacts): CheckResult {
    const p = f.phishsim
    if (!p) return noFacts('PS-ORG-EXCLUSION', 'high', 'org exclusion list status')
    const ev = [
      { actual: `${p.exclusionListEntries} entr(y/ies) on the list, matching ${p.exclusionMatched} free org(s)`, source: p.source },
    ]
    if (p.exclusionListEntries === 0 || p.exclusionMatched === 0) {
      return {
        id: 'PS-ORG-EXCLUSION',
        outcome: 'DEVIATION',
        severity: 'high',
        summary: p.exclusionListEntries === 0
          ? 'No founder/test accounts are excluded, so reported pipeline counts include our own orgs.'
          : 'The exclusion list matches no current org — it has gone stale against the live data.',
        evidence: ev,
        remediation: {
          description: 'Update the non-lead org exclusion list so founder and test accounts are removed from pipeline counts.',
          changeKind: 'exclusion-list',
          blastRadius: 'internal',
          reversible: true,
          prior: { exclusionListEntries: p.exclusionListEntries, exclusionMatched: p.exclusionMatched },
          next: { exclusionApplied: true },
        },
      }
    }
    return {
      id: 'PS-ORG-EXCLUSION',
      outcome: 'PASS',
      severity: 'high',
      summary: `Exclusion list is current: ${p.exclusionMatched} internal/test org(s) excluded from pipeline counts.`,
      evidence: ev,
    }
  },
}

// ── PS-COLD-OPEN-TRACKING ────────────────────────────────────────────────────
export const PS_COLD_OPEN_TRACKING: Standard = {
  id: 'PS-COLD-OPEN-TRACKING',
  scope: 'company',
  description: 'Cold-email opens are instrumented, so an external open rate exists.',
  severity: 'medium',
  origin: 'PS-TOPFUNNEL-01: ps_outreach_leads has no open column; every "100% open rate" was an internal sim.',
  run(f: PhishSimFacts): CheckResult {
    const p = f.phishsim
    if (!p) return noFacts('PS-COLD-OPEN-TRACKING', 'medium', 'cold-email open instrumentation')
    const ev = [{ actual: `cold open tracking instrumented: ${p.coldOpenTrackingInstrumented}`, source: p.source }]
    if (!p.coldOpenTrackingInstrumented) {
      return {
        id: 'PS-COLD-OPEN-TRACKING',
        outcome: 'DEVIATION',
        severity: 'medium',
        summary: 'Cold outreach has no open tracking, so no external open rate can be stated — only internal sim opens exist.',
        evidence: ev,
        remediation: {
          description: 'Add open tracking to the cold-outreach send path and a column to record it.',
          // Adding a column is DDL. Fail-safe: schema changes are Tier B without exception.
          changeKind: 'schema-ddl',
          blastRadius: 'irreversible',
          reversible: false,
        },
      }
    }
    return { id: 'PS-COLD-OPEN-TRACKING', outcome: 'PASS', severity: 'medium', summary: 'Cold-email opens are instrumented.', evidence: ev }
  },
}

export const PHISHSIM_STANDARDS: Standard[] = [
  PS_TOUCHDEFS,
  PS_INBOUND_WEBHOOK,
  PS_SIM_PROVENANCE,
  PS_ORG_EXCLUSION,
  PS_COLD_OPEN_TRACKING,
]
