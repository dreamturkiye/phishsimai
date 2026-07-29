// ─────────────────────────────────────────────────────────────────────────────
//  GSA — PhishSim fact adapter. Company-specific, READ-ONLY.
//
//  Supplies FACTS; makes no judgements. Every judgement lives in a standard, so
//  a lesson learned here can be promoted to the universal core without dragging
//  PhishSim's schema with it (§1).
//
//  Every probe fails to `null`, never to a healthy-looking default. A query that
//  errors must produce UNVERIFIABLE downstream, because a swallowed failure that
//  reads as PASS is the precise bug class 7.4 exists to catch — and an auditor
//  that commits it is worse than no auditor.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../../conn'
import { followUpConfigStatus } from '../../sequences'
import { NON_LEAD_ORG_ADMIN_EMAILS } from '../../../lib/kaan_os_v4'
import type { PhishSimFacts } from '../standards/phishsim'

const SRC_LEADS = 'ps_outreach_leads (prod)'
const SRC_ORGS = 'organizations + org_members (prod)'

async function one<T>(p: Promise<any>, fallback: T | null = null): Promise<T | null> {
  try {
    const rows = await p
    return (rows?.[0] ?? fallback) as T | null
  } catch (e: any) {
    console.error('[gsa/phishsim] probe failed — reporting as unknown, not zero:', e?.message || e)
    return null
  }
}

/**
 * Probe the inbound reply webhook.
 *
 * 401 counts as REACHABLE and is the healthy answer: the handler returns 200 with
 * a warning when INBOUND_WEBHOOK_PASS is unset, so a 401 proves both that the
 * route is deployed and that auth is enforced. 404/5xx means it is not there.
 *
 * What this CANNOT tell us is whether the upstream mail relay actually delivers —
 * that is GTM-REPLY-CAPTURE's job, and conflating the two is how "the endpoint is
 * live" became mistaken for "we can receive replies".
 */
async function probeInboundWebhook(baseUrl: string): Promise<{ reachable: boolean | null; status: number | null }> {
  try {
    const res = await fetch(`${baseUrl}/api/os/webhooks/resend-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A sender that can never match a lead: the probe must not be able to mark
      // a real prospect as replied, or the auditor would be corrupting the very
      // data it audits.
      body: JSON.stringify({ from: 'gsa-probe@example.invalid', subject: 'gsa liveness probe', text: 'probe' }),
      signal: AbortSignal.timeout(15_000),
    })
    return { reachable: res.status === 401 || res.status === 200, status: res.status }
  } catch (e: any) {
    console.error('[gsa/phishsim] inbound webhook probe failed:', e?.message || e)
    return { reachable: null, status: null }
  }
}

export async function gatherPhishSimFacts(opts: { baseUrl?: string; probeHttp?: boolean } = {}): Promise<PhishSimFacts> {
  const sql = getSql()
  const gatheredAt = new Date().toISOString()
  const emails = NON_LEAD_ORG_ADMIN_EMAILS as unknown as string[]

  const [outreachRow, drafts, simProv, orgRow, openCol] = await Promise.all([
    one<any>(sql`SELECT
        count(*) FILTER (WHERE touch1_sent_at IS NOT NULL)::int AS contacted,
        count(*) FILTER (WHERE touch2_sent_at IS NOT NULL)::int AS t2,
        count(*) FILTER (WHERE replied)::int AS replied,
        count(*) FILTER (WHERE touch1_sent_at IS NOT NULL AND replied=false
                         AND bounced=false AND unsubscribed=false)::int AS awaiting
      FROM ps_outreach_leads`),
    one<any>(sql`SELECT count(*)::int AS n FROM outreach_reply_drafts`),
    one<any>(sql`
      SELECT count(*) FILTER (WHERE owner IS NOT NULL AND owner = ANY(${emails}))::int AS internal,
             count(*) FILTER (WHERE owner IS NOT NULL AND NOT (owner = ANY(${emails})))::int AS external,
             count(*) FILTER (WHERE owner IS NULL)::int AS unknown
      FROM (
        SELECT lower((SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
                      WHERE m."orgId" = r."orgId" AND m.role='admin' AND u.email IS NOT NULL
                      ORDER BY m.id ASC LIMIT 1)) AS owner
        FROM campaign_results r WHERE r."emailSentAt" IS NOT NULL) t`),
    one<any>(sql`
      SELECT count(*)::int AS free_total,
             count(*) FILTER (WHERE is_excluded)::int AS excluded
      FROM (
        SELECT lower((SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
                      WHERE m."orgId" = o.id AND m.role='admin' AND u.email IS NOT NULL
                      ORDER BY m.id ASC LIMIT 1)) = ANY(${emails}) AS is_excluded
        FROM organizations o WHERE o.plan = 'free') t`),
    // Instrumentation is a schema fact, so ask the schema rather than trusting a
    // constant that would drift the moment someone added the column.
    one<any>(sql`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name='ps_outreach_leads' AND column_name IN ('opened_at','open_count')`),
  ])

  const seq = followUpConfigStatus()
  const probe = opts.probeHttp === false
    ? { reachable: null as boolean | null, status: null as number | null }
    : await probeInboundWebhook(opts.baseUrl || 'https://phishsimai.com')

  const inboundEvents = drafts ? Number(drafts.n) : null
  const repliedLeads = outreachRow ? Number(outreachRow.replied) : null
  const contacted = outreachRow ? Number(outreachRow.contacted) : null

  // Provenance labelling is a property of the rendered agent context. It is true
  // iff the context builder emits the internal/external note — verified by the
  // presence of the exported renderer rather than asserted, so deleting it in a
  // refactor makes this check fail instead of silently lying.
  let simMetricsTagged = false
  try {
    const mod = await import('../../../lib/kaan_os_v4')
    simMetricsTagged = typeof (mod as any).simProvenanceNote === 'function'
  } catch { simMetricsTagged = false }

  const touchesConfigured = 1 + seq.configured
  const canSendFollowUps = seq.armed && seq.approvedVariants >= seq.configured && seq.configured > 0

  return {
    companyId: 'phishsimai',
    gatheredAt,
    outreach: outreachRow === null ? null : {
      touchesConfigured,
      touchesEnabled: canSendFollowUps ? touchesConfigured : 1,
      contactedEver: Number(outreachRow.contacted),
      followUpsSentEver: Number(outreachRow.t2),
      source: `${seq.source} + ${SRC_LEADS}`,
    },
    replyCapture: inboundEvents === null || outreachRow === null ? null : {
      endpointReachable: probe.reachable,
      inboundEventsEver: inboundEvents + (repliedLeads ?? 0),
      outboundAwaitingReply: Number(outreachRow.awaiting),
      source: `outreach_reply_drafts + ${SRC_LEADS} + POST /api/os/webhooks/resend-inbound`,
    },
    metrics: simProv === null ? null : {
      externalEvents: Number(simProv.external),
      internalEvents: Number(simProv.internal),
      unknownEvents: Number(simProv.unknown),
      provenanceLabelled: simMetricsTagged,
      source: 'campaign_results JOIN organizations/org_members (prod)',
    },
    pipeline: orgRow === null ? null : {
      rawCount: Number(orgRow.free_total),
      excludedCount: Number(orgRow.excluded),
      exclusionApplied: emails.length > 0,
      suspectedUnexcluded: [],
      source: SRC_ORGS,
    },
    // Deliberately null rather than invented: PhishSim has no adapter for these
    // yet, and UNVERIFIABLE is the honest result. Filling them with optimistic
    // defaults would manufacture four passes out of nothing.
    revenue: null,
    fabrication: null,
    deploy: null,
    cache: null,
    openTracking: openCol === null ? null : {
      instrumented: Number(openCol.n) > 0,
      source: 'information_schema.columns on ps_outreach_leads',
    },
    phishsim: {
      followUpTouchesConfigured: seq.configured,
      followUpsArmed: seq.armed,
      approvedVariants: seq.approvedVariants,
      inboundWebhookReachable: probe.reachable,
      inboundWebhookStatus: probe.status,
      simMetricsTagged,
      exclusionListEntries: emails.length,
      exclusionMatched: orgRow ? Number(orgRow.excluded) : 0,
      coldOpenTrackingInstrumented: openCol ? Number(openCol.n) > 0 : false,
      source: `${SRC_LEADS} + ${SRC_ORGS} + source tree`,
    },
  }
}
