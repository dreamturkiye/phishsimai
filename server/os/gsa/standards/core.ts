// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.2 — the UNIVERSAL standards core. OS-level, applies to every company.
//
//  Each is a business truth learned the expensive way once. They judge FACTS
//  supplied by a company adapter and never touch a specific schema — that split
//  is what lets a fix to the engine benefit every company, and a market lesson
//  stay in one plugin (§1).
//
//  The rule every check below obeys: a missing fact is UNVERIFIABLE, never PASS.
//  A company that cannot answer "is reply capture wired?" has not demonstrated
//  that it is; silence is not health. This is the single most important line in
//  the file, because the failure mode 7.4 exists to catch is precisely the one
//  that produces no error.
// ─────────────────────────────────────────────────────────────────────────────
import type { CheckResult, CompanyFacts, Evidence, Standard } from '../types'

const unverifiable = (
  id: string,
  severity: CheckResult['severity'],
  what: string,
  source = 'no adapter probe',
): CheckResult => ({
  id,
  outcome: 'UNVERIFIABLE',
  severity,
  summary: `Cannot determine ${what} — the company adapter did not supply this fact.`,
  evidence: [{ actual: 'no data', source, note: 'Absence of a measurement is not a pass.' }],
})

// ── GTM-MULTITOUCH ───────────────────────────────────────────────────────────
// Origin: 523 first-touch sends with `touchDefs = []`. Single-touch cold email is
// a known rookie error — most replies come from touches 2-5 — and it produced no
// error, no alarm and no metric for weeks. Nothing in the system reported
// sequence LENGTH, so the defect was invisible everywhere except the source file.
export const GTM_MULTITOUCH: Standard = {
  id: 'GTM-MULTITOUCH',
  scope: 'universal',
  description: 'Cold outreach sequence has ≥3 touches configured AND enabled.',
  severity: 'critical',
  origin: 'PhishSim 2026-07: 523 sends, touchDefs=[], 3% ever received a second email.',
  run(f: CompanyFacts): CheckResult {
    const o = f.outreach
    if (!o) return unverifiable('GTM-MULTITOUCH', 'critical', 'outreach sequence length')

    const ev: Evidence[] = [
      { actual: `${o.touchesConfigured} touch(es) configured, ${o.touchesEnabled} enabled`, source: o.source },
    ]
    if (o.contactedEver != null) {
      ev.push({
        actual: `${o.contactedEver} lead(s) contacted, ${o.followUpsSentEver ?? 0} follow-up send(s) ever`,
        source: o.source,
        note: 'The gap between these two is what single-touch looks like in the data.',
      })
    }

    // Configured-but-disabled is still a deviation. A sequence that exists in a
    // file and cannot send is, from the prospect's side, identical to no sequence.
    if (o.touchesConfigured < 3 || o.touchesEnabled < 3) {
      const why = o.touchesConfigured < 3
        ? `only ${o.touchesConfigured} touch(es) are configured`
        : `${o.touchesConfigured} touches are configured but only ${o.touchesEnabled} can send`
      return {
        id: 'GTM-MULTITOUCH',
        outcome: 'DEVIATION',
        severity: 'critical',
        summary: `Cold outreach is effectively single-touch: ${why}. Most cold replies come from touches 2-5.`,
        evidence: ev,
        remediation: {
          description:
            'Enable the multi-touch follow-up sequence (approve copy, arm the sender) so touches 2+ actually send.',
          // Reversible as a flag, but the effect is thousands of emails to real
          // people — see classify.ts. Declared honestly so the classifier can do
          // its job; a standard that under-declared this would defeat the tiering.
          changeKind: 'sends-email',
          blastRadius: 'external-recipients',
          reversible: true,
          dependsOn: ['GTM-REPLY-CAPTURE'],
          prior: { touchesEnabled: o.touchesEnabled },
          next: { touchesEnabled: Math.max(3, o.touchesConfigured) },
        },
      }
    }
    return {
      id: 'GTM-MULTITOUCH',
      outcome: 'PASS',
      severity: 'critical',
      summary: `Outreach sequence has ${o.touchesConfigured} touches configured and ${o.touchesEnabled} enabled.`,
      evidence: ev,
    }
  },
}

// ── GTM-REPLY-CAPTURE ────────────────────────────────────────────────────────
// Origin: "0 replies" and "we cannot receive replies" are the same number. This
// standard exists to refuse to collapse them.
export const GTM_REPLY_CAPTURE: Standard = {
  id: 'GTM-REPLY-CAPTURE',
  scope: 'universal',
  description: 'Inbound reply capture is wired and has received ≥1 event, else UNVERIFIABLE.',
  severity: 'critical',
  origin: 'PhishSim 2026-07: inbound endpoint live but zero events ever; replies indistinguishable from a dead relay.',
  run(f: CompanyFacts): CheckResult {
    const r = f.replyCapture
    if (!r) return unverifiable('GTM-REPLY-CAPTURE', 'critical', 'inbound reply capture status')

    const ev: Evidence[] = [
      { actual: `${r.inboundEventsEver} inbound event(s) ever received`, source: r.source },
      {
        actual: r.endpointReachable === null ? 'endpoint reachability unknown' : `endpoint reachable: ${r.endpointReachable}`,
        source: r.source,
      },
      { actual: `${r.outboundAwaitingReply} outbound send(s) awaiting a reply`, source: r.source },
    ]

    if (r.inboundEventsEver > 0) {
      return {
        id: 'GTM-REPLY-CAPTURE',
        outcome: 'PASS',
        severity: 'critical',
        summary: `Reply capture is proven: ${r.inboundEventsEver} inbound event(s) received.`,
        evidence: ev,
      }
    }

    // Zero events with zero sends outstanding is genuinely uninformative rather
    // than alarming — there has been nothing to reply to.
    if (r.outboundAwaitingReply === 0) {
      return {
        id: 'GTM-REPLY-CAPTURE',
        outcome: 'UNVERIFIABLE',
        severity: 'medium',
        summary: 'Reply capture has received nothing, but nothing has been sent either — untested, not broken.',
        evidence: ev,
      }
    }

    // The real case: mail went out, nothing came back, and we cannot tell which
    // of the two possible worlds we are in. Deliberately NOT a DEVIATION — that
    // would assert the channel is broken, which is a claim we have not earned.
    return {
      id: 'GTM-REPLY-CAPTURE',
      outcome: 'UNVERIFIABLE',
      severity: 'critical',
      summary:
        `${r.outboundAwaitingReply} send(s) are outstanding and inbound capture has received ZERO events ever. ` +
        `"Nobody replied" and "we cannot receive replies" are indistinguishable from this data.`,
      evidence: [
        ...ev,
        {
          actual: 'cannot distinguish silence from a dead channel',
          source: r.source,
          note: 'Resolve by sending a test reply from an external mailbox and confirming an event lands.',
        },
      ],
    }
  },
}

// ── METRICS-EXTERNAL ─────────────────────────────────────────────────────────
// Origin: a "40% click rate" that was two clicks by the founder, on the founder's
// own org, compared in a standup to a "10-15% industry benchmark".
export const METRICS_EXTERNAL: Standard = {
  id: 'METRICS-EXTERNAL',
  scope: 'universal',
  description: 'Reported funnel metrics derive from external recipients, not internal/test orgs.',
  severity: 'high',
  origin: 'PhishSim 2026-07: all 5 simulations belonged to the founder\'s own org; rates were read as market signal.',
  run(f: CompanyFacts): CheckResult {
    const m = f.metrics
    if (!m) return unverifiable('METRICS-EXTERNAL', 'high', 'funnel metric provenance')

    const total = m.externalEvents + m.internalEvents + m.unknownEvents
    const ev = [
      {
        actual: `${total} event(s): ${m.externalEvents} external, ${m.internalEvents} internal/test, ${m.unknownEvents} unattributed`,
        source: m.source,
      },
      { actual: `provenance labelled in reporting: ${m.provenanceLabelled}`, source: m.source },
    ]

    if (total === 0) {
      return {
        id: 'METRICS-EXTERNAL',
        outcome: 'PASS',
        severity: 'high',
        summary: 'No funnel events yet, so no metric can be misread as market data.',
        evidence: ev,
      }
    }

    // The deviation is NOT "we have internal test data" — that is normal and
    // useful. It is reporting internal data WITHOUT SAYING SO, which is what lets
    // a reader treat it as market signal.
    if (!m.provenanceLabelled && m.externalEvents < total) {
      return {
        id: 'METRICS-EXTERNAL',
        outcome: 'DEVIATION',
        severity: 'high',
        summary:
          `${m.internalEvents + m.unknownEvents} of ${total} funnel event(s) are internal/test or unattributed, ` +
          `and the reporting does not label provenance — so these rates can be read as market data.`,
        evidence: ev,
        remediation: {
          description:
            'Tag funnel metrics with internal-vs-external provenance wherever they are reported, so internal test data cannot be read as market signal.',
          changeKind: 'metric-tagging',
          blastRadius: 'internal', // changes what we SEE; sends nothing, spends nothing
          reversible: true,
          prior: { provenanceLabelled: false },
          next: { provenanceLabelled: true },
        },
      }
    }
    return {
      id: 'METRICS-EXTERNAL',
      outcome: 'PASS',
      severity: 'high',
      summary: m.provenanceLabelled
        ? 'Funnel metrics are labelled with internal-vs-external provenance.'
        : 'All funnel events derive from external recipients.',
      evidence: ev,
    }
  },
}

// ── REVENUE-REAL ─────────────────────────────────────────────────────────────
export const REVENUE_REAL: Standard = {
  id: 'REVENUE-REAL',
  scope: 'universal',
  description: 'Every revenue/MRR figure traces to a real payment record, not a derived price table.',
  severity: 'critical',
  origin: 'Portfolio: 3 fabricated MRR paths; a "$39" figure that was list-price-derived and stale-cached.',
  run(f: CompanyFacts): CheckResult {
    const r = f.revenue
    if (!r) return unverifiable('REVENUE-REAL', 'critical', 'revenue provenance')
    const ev = [
      { actual: `traces to payment record: ${r.tracesToPaymentRecord}`, source: r.source },
      { actual: `${r.derivedFigures} figure(s) derived from a price table`, source: r.source },
    ]
    if (r.tracesToPaymentRecord === null) {
      return unverifiable('REVENUE-REAL', 'critical', 'whether revenue traces to payment records', r.source)
    }
    if (!r.tracesToPaymentRecord || r.derivedFigures > 0) {
      return {
        id: 'REVENUE-REAL',
        outcome: 'DEVIATION',
        severity: 'critical',
        summary: `${r.derivedFigures} revenue figure(s) are derived from a price table rather than a payment record.`,
        evidence: ev,
        remediation: {
          description: 'Re-source the reported revenue figure from payment records.',
          // Touches how money is REPORTED. Even read-only reporting changes to a
          // money figure go to a human — money is on the never-autonomous list.
          changeKind: 'payment-pricing',
          blastRadius: 'money',
          reversible: true,
          prior: { derivedFigures: r.derivedFigures },
        },
      }
    }
    return {
      id: 'REVENUE-REAL',
      outcome: 'PASS',
      severity: 'critical',
      summary: 'All reported revenue traces to real payment records.',
      evidence: ev,
    }
  },
}

// ── PIPELINE-REAL ────────────────────────────────────────────────────────────
// Origin: "4 free orgs" = the founder's own org + one person's duplicated test
// signup + 1 real trial. Agents built a conversion campaign aimed at ourselves.
export const PIPELINE_REAL: Standard = {
  id: 'PIPELINE-REAL',
  scope: 'universal',
  description: 'Lead/customer counts exclude founder and test accounts.',
  severity: 'high',
  origin: 'PhishSim 2026-07: "4 free orgs" was 1 real prospect; the illusion resurfaced twice.',
  run(f: CompanyFacts): CheckResult {
    const p = f.pipeline
    if (!p) return unverifiable('PIPELINE-REAL', 'high', 'pipeline exclusion status')
    const ev: Evidence[] = [
      {
        actual: `${p.rawCount} raw account(s), ${p.excludedCount} excluded as internal/test, exclusion applied: ${p.exclusionApplied}`,
        source: p.source,
      },
    ]
    if (p.suspectedUnexcluded.length) {
      ev.push({
        actual: `${p.suspectedUnexcluded.length} account(s) look internal/test but are not on the list: ${p.suspectedUnexcluded.join(', ')}`,
        source: p.source,
        note: 'An exclusion list going stale is the same defect returning under new rows.',
      })
    }

    if (!p.exclusionApplied || p.suspectedUnexcluded.length > 0) {
      return {
        id: 'PIPELINE-REAL',
        outcome: 'DEVIATION',
        severity: 'high',
        summary: !p.exclusionApplied
          ? `Reported pipeline of ${p.rawCount} does not exclude ${p.excludedCount} known internal/test account(s).`
          : `${p.suspectedUnexcluded.length} account(s) appear internal/test but are missing from the exclusion list.`,
        evidence: ev,
        remediation: {
          description: 'Update the internal/test exclusion list and apply it to reported pipeline counts.',
          changeKind: 'exclusion-list',
          blastRadius: 'internal',
          reversible: true,
          prior: { exclusionApplied: p.exclusionApplied, excludedCount: p.excludedCount },
          next: { exclusionApplied: true, excludedCount: p.excludedCount + p.suspectedUnexcluded.length },
        },
      }
    }
    return {
      id: 'PIPELINE-REAL',
      outcome: 'PASS',
      severity: 'high',
      summary: `Pipeline count excludes ${p.excludedCount} internal/test account(s).`,
      evidence: ev,
    }
  },
}

// ── NO-FABRICATION ───────────────────────────────────────────────────────────
export const NO_FABRICATION: Standard = {
  id: 'NO-FABRICATION',
  scope: 'universal',
  description: 'No agent-reported number lacks a source; artifacts do not become conclusions.',
  severity: 'high',
  origin: 'Portfolio: a phantom "mystery customer" derived from the founder\'s own demo video.',
  run(f: CompanyFacts): CheckResult {
    const x = f.fabrication
    if (!x) return unverifiable('NO-FABRICATION', 'high', 'whether reported figures carry sources')
    const ev = [{ actual: `${x.unsourcedFigures.length} unsourced figure(s) reaching agents`, source: x.source }]
    if (x.unsourcedFigures.length) {
      ev.push({ actual: x.unsourcedFigures.join(' | '), source: x.source })
      return {
        id: 'NO-FABRICATION',
        outcome: 'DEVIATION',
        severity: 'high',
        summary: `${x.unsourcedFigures.length} number(s) reach agents without a stated source.`,
        evidence: ev,
        remediation: {
          description: 'Attach a source to each reported figure, or stop reporting it.',
          changeKind: 'display-annotation',
          blastRadius: 'internal',
          reversible: true,
          prior: { unsourced: x.unsourcedFigures.length },
          next: { unsourced: 0 },
        },
      }
    }
    return {
      id: 'NO-FABRICATION',
      outcome: 'PASS',
      severity: 'high',
      summary: 'Every reported figure carries a source.',
      evidence: ev,
    }
  },
}

// ── DEPLOY-LIVE ──────────────────────────────────────────────────────────────
export const DEPLOY_LIVE: Standard = {
  id: 'DEPLOY-LIVE',
  scope: 'universal',
  description: 'Production serves current code (CI wired, or manual deploy explicitly flagged).',
  severity: 'high',
  origin: 'Portfolio: VellaChat/kaanhq bugs sat live for days with no CI.',
  run(f: CompanyFacts): CheckResult {
    const d = f.deploy
    if (!d) return unverifiable('DEPLOY-LIVE', 'high', 'deploy freshness')
    if (d.ciWired === null) return unverifiable('DEPLOY-LIVE', 'high', 'whether CI is wired', d.source)
    const ev = [
      { actual: `CI wired: ${d.ciWired}`, source: d.source },
      { actual: `undeployed commits: ${d.undeployedCommits ?? 'unknown'}`, source: d.source },
    ]
    if (!d.ciWired || (d.undeployedCommits ?? 0) > 0) {
      return {
        id: 'DEPLOY-LIVE',
        outcome: 'DEVIATION',
        severity: 'high',
        summary: !d.ciWired
          ? 'No CI wired — production is not guaranteed to serve current code.'
          : `${d.undeployedCommits} commit(s) on the deploy branch are not live.`,
        evidence: ev,
        remediation: {
          description: 'Wire CI, or deploy the outstanding commits.',
          // Deploying ships code to production: unbounded and not engine-reversible.
          changeKind: 'unknown',
          blastRadius: 'irreversible',
          reversible: false,
        },
      }
    }
    return { id: 'DEPLOY-LIVE', outcome: 'PASS', severity: 'high', summary: 'Production serves current code.', evidence: ev }
  },
}

// ── CACHE-FRESH ──────────────────────────────────────────────────────────────
export const CACHE_FRESH: Standard = {
  id: 'CACHE-FRESH',
  scope: 'universal',
  description: 'Dashboard/revenue reads are live, not stale (cache:no-store where liveness matters).',
  severity: 'medium',
  origin: 'Portfolio: /api/hq served stale subscriber and MRR numbers.',
  run(f: CompanyFacts): CheckResult {
    const c = f.cache
    if (!c) return unverifiable('CACHE-FRESH', 'medium', 'cache freshness on liveness-critical reads')
    const ev = [{ actual: `${c.staleReadPaths.length} liveness-critical path(s) without a no-store guarantee`, source: c.source }]
    if (c.staleReadPaths.length) {
      ev.push({ actual: c.staleReadPaths.join(', '), source: c.source })
      return {
        id: 'CACHE-FRESH',
        outcome: 'DEVIATION',
        severity: 'medium',
        summary: `${c.staleReadPaths.length} liveness-critical read path(s) may serve stale data.`,
        evidence: ev,
        remediation: {
          description: 'Add cache:no-store to the affected read paths.',
          changeKind: 'cache-header',
          blastRadius: 'internal',
          reversible: true,
          prior: { staleReadPaths: c.staleReadPaths },
          next: { staleReadPaths: [] },
        },
      }
    }
    return { id: 'CACHE-FRESH', outcome: 'PASS', severity: 'medium', summary: 'Liveness-critical reads are not cached stale.', evidence: ev }
  },
}

export const UNIVERSAL_STANDARDS: Standard[] = [
  GTM_MULTITOUCH,
  GTM_REPLY_CAPTURE,
  METRICS_EXTERNAL,
  REVENUE_REAL,
  PIPELINE_REAL,
  NO_FABRICATION,
  DEPLOY_LIVE,
  CACHE_FRESH,
]
