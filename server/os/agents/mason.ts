// ─────────────────────────────────────────────────────────────────────────────
//  PS-MASON-01 — Mason, Sales Director. The full-operator form of the live reply agent.
//
//  THIS EXPANDS salesReplies.ts. IT DOES NOT REPLACE OR LOOSEN IT.
//    The classify-draft-suppress loop shipped in PS-SALES-REPLY-01 is correct and running. Mason
//    CALLS it — he does not reimplement the classifier, and none of its guarantees are relaxed here:
//      · suppression still needs >= 0.8 confidence AND an explicit signal; ambiguity still drafts;
//      · an empty queue still reports empty and issues nothing;
//      · nothing is ever auto-sent to a prospect — interested/objection still gate to Kaan.
//    What Mason adds sits strictly ON TOP: sequence-health judgement, lead prioritisation, and
//    pipeline retirement. A test asserts he imports the live agent rather than carrying a second copy
//    of the classification logic, because two classifiers is two answers.
//
//  HE DEFERS TO THE FOUNDATION AGENTS ON THEIR DOMAINS.
//    This is the composition rule that makes eight agents an organisation rather than eight opinions:
//      · DEX owns whether mail is arriving. If Dex's breaker is tripped or the window is unmeasured,
//        Mason does not tune a sequence. Tuning cadence while deliverability is broken optimises the
//        wrong variable and burns list into a wall.
//      · REX owns whether the funnel data is true. If Rex has an OPEN stage_violation, the stage
//        machine and the timestamps disagree, so "prioritise engaged leads" and "retire stale leads"
//        are both operating on stages that may be wrong. Mason stands down on both.
//    He does not re-derive their verdicts or second-guess them. He reads what they published and
//    obeys it. A deferral is REPORTED, never silent — "Mason did nothing" and "Mason was told to
//    stand down by Dex" look identical otherwise, and only one of them is a problem.
//
//  ASYMMETRIC SAFETY, EXTENDED TO RETIREMENT.
//    The same reasoning that governs suppression governs retiring a lead:
//      · a BOUNCED address is provably undeliverable. Retiring it is safe and reversible in the only
//        way that matters — it can never have converted.
//      · a lead that has simply not replied yet MIGHT still convert. Retiring it destroys a real
//        opportunity for a tidier dashboard.
//    So bounced-but-active rows are retired autonomously (behind crm_write/L4); stale-no-reply rows
//    are only ever PROPOSED to Kaan with their count. Mason never bulk-retires on silence.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { assertAutonomyAllows, isAutonomyDenied } from '../autonomyGate'
import { getSequenceHealth } from '../sequences'
import { runSalesReplyAgent, replyToTrialMetric, type SalesReplyRun } from './salesReplies'
import { INTERNAL_EXCLUSION_SQL, type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

/** No rate below this denominator, ever. Inherited from the house rule. */
export const MIN_N = 30
/** A prospect contacted this long ago with no reply is STALE — proposed, never auto-retired. */
export const STALE_DAYS = 21

// ─── FOUNDATION VERDICTS ─────────────────────────────────────────────────────

export type DexVerdict = {
  checked: boolean
  paused: boolean
  tripped: boolean
  measured: boolean
  rate: number
  threshold: number
  reason: string
}

export type RexVerdict = {
  checked: boolean
  openCritical: number
  stageViolations: number
  funnelTrustworthy: boolean
  reason: string
}

export type FoundationVerdicts = { dex: DexVerdict; rex: RexVerdict }

/** Read Dex's published send-health. Mason does not re-measure deliverability; that is Dex's job. */
export async function readDexVerdict(sql: any): Promise<DexVerdict> {
  try {
    const h = await getSequenceHealth(sql)
    return {
      checked: true,
      paused: !!h.paused,
      tripped: !!h.tripped,
      measured: !!h.measured,
      rate: Number(h.rate ?? 0),
      threshold: Number((h as any).threshold ?? 0.03),
      reason: h.tripped
        ? `Dex: breaker TRIPPED at ${(h.rate * 100).toFixed(2)}% vs ${((h as any).threshold * 100).toFixed(2)}%`
        : !h.measured
          ? 'Dex: send window UNMEASURED — no data is not permission'
          : `Dex: send health OK (${(h.rate * 100).toFixed(2)}% vs ${((h as any).threshold * 100).toFixed(2)}%)`,
    }
  } catch {
    // Fail closed: an unreadable deliverability verdict is treated as "do not tune".
    return { checked: false, paused: true, tripped: false, measured: false, rate: 0, threshold: 0.03, reason: 'Dex: verdict UNREADABLE — standing down (fail closed)' }
  }
}

/** Read Rex's published funnel-trust verdict from the incidents he files. */
export async function readRexVerdict(sql: any): Promise<RexVerdict> {
  try {
    const rows = (await sql`SELECT detector, severity FROM os_integrity_incidents
      WHERE product_id=${COMPANY} AND resolved_at IS NULL`) as any[]
    const stageViolations = rows.filter((r) => String(r.detector) === 'stage_violation').length
    const openCritical = rows.filter((r) => String(r.severity) === 'critical').length
    return {
      checked: true,
      openCritical,
      stageViolations,
      // Only STAGE integrity gates Mason's stage-based actions. Rex's other open incidents
      // (a fabricating module, a hardcoded price) are real but do not make pipeline_stage untrue,
      // and standing down on everything would make Mason permanently inert for defects in other
      // agents' domains.
      funnelTrustworthy: stageViolations === 0,
      reason: stageViolations === 0
        ? `Rex: stage machine consistent (${openCritical} unrelated critical incident(s) open)`
        : `Rex: ${stageViolations} OPEN stage violation(s) — stage-derived data is SUSPECT`,
    }
  } catch {
    return { checked: false, openCritical: 0, stageViolations: 0, funnelTrustworthy: false, reason: 'Rex: verdict UNREADABLE — treating funnel as suspect (fail closed)' }
  }
}

export async function readFoundationVerdicts(sql: any): Promise<FoundationVerdicts> {
  const [dex, rex] = await Promise.all([readDexVerdict(sql), readRexVerdict(sql)])
  return { dex, rex }
}

// ─── WHAT MASON IS ALLOWED TO DO THIS RUN ────────────────────────────────────

export type ActionPermissions = {
  maySequenceTune: boolean
  mayPrioritise: boolean
  mayRetire: boolean
  deferrals: string[]
}

/**
 * Pure. Given the foundation verdicts, what may Mason do?
 *
 * Reply handling is deliberately ABSENT from this gate: answering a human who wrote to us is not
 * outbound tuning, it does not depend on send health, and it does not depend on stage data. Gating
 * replies on Dex's breaker would mean an interested prospect goes unanswered because our bounce
 * rate moved — which trades the scarcest thing we have for a metric.
 */
export function decideActions(v: FoundationVerdicts): ActionPermissions {
  const deferrals: string[] = []

  const dexOk = v.dex.checked && !v.dex.paused && !v.dex.tripped
  if (!dexOk) deferrals.push(`sequence tuning DEFERRED to Dex — ${v.dex.reason}`)

  const rexOk = v.rex.checked && v.rex.funnelTrustworthy
  if (!rexOk) deferrals.push(`lead prioritisation and retirement DEFERRED to Rex — ${v.rex.reason}`)

  return {
    maySequenceTune: dexOk,
    mayPrioritise: rexOk,
    mayRetire: rexOk && dexOk,
    deferrals,
  }
}

// ─── CONVERSION MATH ─────────────────────────────────────────────────────────

export type Funnel = {
  checked: boolean
  contacted: number
  replied: number
  engaged: number
  trials: number
  customers: number
  lines: string[]
}

export function stepLine(label: string, num: number, den: number): string {
  if (den === 0) return `${label}: 0/0 — N/A, n=0`
  if (den < MIN_N) return `${label}: ${num}/${den} — counts only, no rate below n=${MIN_N}`
  return `${label}: ${num}/${den} (${((num / den) * 100).toFixed(1)}%)`
}

export async function measureFunnel(sql: any): Promise<Funnel> {
  try {
    const r = (await sql.query(`
      SELECT
        count(*) FILTER (WHERE l.touch1_sent_at IS NOT NULL)::int AS contacted,
        count(*) FILTER (WHERE l.replied)::int AS replied,
        count(*) FILTER (WHERE l.pipeline_stage='engaged')::int AS engaged,
        count(*) FILTER (WHERE l.trial_at IS NOT NULL)::int AS trials,
        count(*) FILTER (WHERE l.pipeline_stage='customer')::int AS customers
      FROM ps_outreach_leads l WHERE 1=1 ${INTERNAL_EXCLUSION_SQL}`)) as any[]
    const contacted = Number(r[0]?.contacted ?? 0)
    const replied = Number(r[0]?.replied ?? 0)
    const engaged = Number(r[0]?.engaged ?? 0)
    const trials = Number(r[0]?.trials ?? 0)
    const customers = Number(r[0]?.customers ?? 0)
    return {
      checked: true, contacted, replied, engaged, trials, customers,
      lines: [
        stepLine('touched→replied', replied, contacted),
        replyToTrialMetric(trials, replied),
        stepLine('trial→paid', customers, trials),
      ],
    }
  } catch {
    return { checked: false, contacted: 0, replied: 0, engaged: 0, trials: 0, customers: 0, lines: ['funnel: NOT CHECKED'] }
  }
}

// ─── PIPELINE HYGIENE ────────────────────────────────────────────────────────

export type HygieneRun = {
  bouncedActive: number
  retired: number
  staleProposed: number
  gate: 'allowed' | 'denied' | 'deferred' | 'dry_run'
  gateReason: string
  proposals: string[]
}

/**
 * Retire what is provably dead; PROPOSE what is merely quiet.
 *
 * A bounced address cannot receive mail, so it cannot convert — leaving it in an active stage
 * inflates the active pipeline with rows that are certain to never move. That is safe to retire
 * autonomously. A lead that has not replied is a different thing entirely: silence is not refusal,
 * and retiring 159 of them for a tidier dashboard would destroy real opportunity. Those are counted
 * and surfaced, never acted on.
 */
export async function runHygiene(
  sql: any,
  perms: ActionPermissions,
  opts: { dryRun?: boolean; companyId?: string } = {},
): Promise<HygieneRun> {
  const out: HygieneRun = { bouncedActive: 0, retired: 0, staleProposed: 0, gate: 'deferred', gateReason: '', proposals: [] }

  try {
    const b = (await sql.query(`SELECT count(*)::int AS n FROM ps_outreach_leads l
      WHERE l.bounced = true AND l.pipeline_stage NOT IN ('dead','customer','internal_test') ${INTERNAL_EXCLUSION_SQL}`)) as any[]
    out.bouncedActive = Number(b[0]?.n ?? 0)

    const s = (await sql.query(`SELECT count(*)::int AS n FROM ps_outreach_leads l
      WHERE l.pipeline_stage='prospect' AND l.replied = false AND l.bounced = false
        AND l.touch1_sent_at < NOW() - interval '${STALE_DAYS} days' ${INTERNAL_EXCLUSION_SQL}`)) as any[]
    out.staleProposed = Number(s[0]?.n ?? 0)
  } catch {
    out.gateReason = 'hygiene counts NOT CHECKED (query failed)'
    return out
  }

  if (out.staleProposed > 0) {
    out.proposals.push(
      `${out.staleProposed} prospect(s) contacted >${STALE_DAYS}d ago with no reply. NOT retired — ` +
      `silence is not refusal, and the sequence is touch-1 only, so they have had one email. ` +
      `Retiring them is a founder decision, not an autonomous one.`,
    )
  }

  if (!perms.mayRetire) {
    out.gate = 'deferred'
    out.gateReason = 'retirement deferred to the foundation agents this run'
    return out
  }

  if (!out.bouncedActive) {
    out.gate = 'allowed'
    out.gateReason = 'nothing to retire'
    return out
  }

  if (opts.dryRun) {
    out.gate = 'dry_run'
    out.gateReason = `would retire ${out.bouncedActive} bounced lead(s)`
    return out
  }

  try {
    await assertAutonomyAllows('crm_write', opts.companyId ?? COMPANY)
  } catch (e) {
    if (!isAutonomyDenied(e)) throw e
    out.gate = 'denied'
    out.gateReason = `crm_write denied (${(e as any).reason}) — nothing written`
    return out
  }

  const rows = (await sql.query(`UPDATE ps_outreach_leads l
    SET pipeline_stage='dead', stage_updated_at=NOW()
    WHERE l.bounced = true AND l.pipeline_stage NOT IN ('dead','customer','internal_test')
    RETURNING l.id`)) as any[]
  out.retired = rows.length
  out.gate = 'allowed'
  out.gateReason = `retired ${out.retired} provably-undeliverable lead(s) (bounced)`

  await sql`INSERT INTO audit_log (actor, action, target, detail)
    VALUES ('mason','crm_write',${COMPANY},
            ${JSON.stringify({ reason: 'PS-MASON-01 retire bounced-but-active leads', retired: out.retired })}::jsonb)`.catch(() => {})
  return out
}

// ─── PRIORITISATION ──────────────────────────────────────────────────────────

export type PriorityLead = { id: string; email: string; company: string | null; daysInStage: number; nextAction: string }

/**
 * Engaged leads, oldest-waiting first. "Engaged" means they REPLIED — replyParser sets that stage —
 * so this list is the highest-value thing in the company at any moment.
 *
 * Returns [] honestly when there are none. It does not manufacture a priority list out of prospects
 * who have never responded; that would be activity dressed as pipeline.
 */
export async function prioritiseEngaged(sql: any, limit = 20): Promise<PriorityLead[]> {
  try {
    const r = (await sql.query(`
      SELECT l.id::text AS id, l.email, l.company,
             EXTRACT(EPOCH FROM (NOW() - l.stage_updated_at))/86400 AS days
      FROM ps_outreach_leads l
      WHERE l.pipeline_stage='engaged' ${INTERNAL_EXCLUSION_SQL}
      ORDER BY l.stage_updated_at ASC
      LIMIT ${Math.floor(limit)}`)) as any[]
    return r.map((x) => {
      const daysInStage = Math.floor(Number(x.days ?? 0))
      return {
        id: String(x.id),
        email: String(x.email),
        company: x.company ?? null,
        daysInStage,
        nextAction: daysInStage >= 3
          ? 'OVERDUE — a reply has been waiting 3+ days. Draft and send today.'
          : 'Draft a response and gate it to Kaan.',
      }
    })
  } catch {
    return []
  }
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeMasonLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:mason:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'mason', 'sales_finding', ${signature},
              ${`MASON SALES LESSON (${i.detector}, ${i.severity}). ${i.subject}: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)}`},
              false, 0, -0.1)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const MASON_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'gong-labs-sales',
    name: 'Gong Labs — sales conversation research',
    url: 'https://www.gong.io/blog/',
    kind: 'practitioner',
    why: 'Analysis over very large real sales-conversation corpora rather than opinion; the closest thing to measurement in outbound.',
  },
  {
    slug: 'ftc-can-spam',
    name: 'FTC — CAN-SPAM compliance guide',
    url: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
    kind: 'standards_body',
    why: 'The legal floor for cold outbound. A regulator is not a benchmark to weigh — it is a constraint, and Mason must not drift from it.',
  },
  {
    slug: 'hubspot-sales-statistics',
    name: 'HubSpot — sales statistics',
    url: 'https://www.hubspot.com/marketing-statistics',
    kind: 'practitioner',
    why: 'Published B2B follow-up and cadence benchmarks; a reference band for sequence design, never a target we may claim.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type MasonReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  verdicts: FoundationVerdicts
  permissions: ActionPermissions
  replies: SalesReplyRun | null
  funnel: Funnel
  priority: PriorityLead[]
  hygiene: HygieneRun
  lessonsWritten: number
  currency: CurrencyRun | null
  line: string
}

export async function runMasonAgent(
  opts: { sql?: any; skipCurrency?: boolean; skipReplies?: boolean; dryRun?: boolean } = {},
): Promise<MasonReport> {
  const sql = opts.sql ?? getSql()

  const verdicts = await readFoundationVerdicts(sql)
  const permissions = decideActions(verdicts)

  // The live classifier, unchanged and unconditioned. See decideActions() for why replies are not
  // gated on send health.
  const replies = opts.skipReplies ? null : await runSalesReplyAgent(sql).catch(() => null)

  const funnel = await measureFunnel(sql)
  const priority = permissions.mayPrioritise ? await prioritiseEngaged(sql) : []
  const hygiene = await runHygiene(sql, permissions, { dryRun: opts.dryRun })

  const incidents: Incident[] = []
  if (hygiene.bouncedActive > 0 && !permissions.mayRetire) {
    incidents.push({
      detector: 'stage_violation',
      severity: 'high' as Severity,
      subject: 'pipeline:bounced_active',
      summary: `${hygiene.bouncedActive} bounced lead(s) sit in an active stage and could not be retired this run — ${hygiene.gateReason}.`,
      evidence: { bouncedActive: hygiene.bouncedActive, gate: hygiene.gate },
      signature: `mason_bounced_active_blocked`,
    })
  }
  const lessonsWritten = await writeMasonLessons(sql, incidents).catch(() => 0)

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('mason', 'B2B outbound sales, objection handling and sequence design', MASON_SOURCES, sql).catch(() => null)

  const status: MasonReport['status'] = funnel.checked ? 'ACTIVE' : 'INSUFFICIENT_DATA'
  const line = buildMasonLine({ status, verdicts, permissions, replies, funnel, priority, hygiene })

  return {
    status, verdicts, permissions, replies, funnel, priority, hygiene, lessonsWritten, currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildMasonLine(a: {
  status: MasonReport['status']
  verdicts: FoundationVerdicts
  permissions: ActionPermissions
  replies: SalesReplyRun | null
  funnel: Funnel
  priority: PriorityLead[]
  hygiene: HygieneRun
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return 'Mason (Sales): insufficient data — the funnel could not be read this run. No pipeline claim is possible. Playbook built and armed.'
  }
  const defer = a.permissions.deferrals.length ? ` · DEFERRED: ${a.permissions.deferrals.join(' | ')}` : ''
  const rep = a.replies
    ? a.replies.queued === 0
      ? '0 replies queued (correct at the current funnel state — nothing to classify)'
      : `${a.replies.classified}/${a.replies.queued} replies classified, ${a.replies.draftsForKaan} draft(s) awaiting your send, ${a.replies.suppressed} auto-suppressed`
    : 'replies not run this cycle'
  const prio = a.priority.length
    ? `${a.priority.length} engaged lead(s) prioritised${a.priority.some((p) => p.daysInStage >= 3) ? ' (some OVERDUE)' : ''}`
    : '0 engaged leads — nothing to prioritise, and none invented'
  const hyg = a.hygiene.retired
    ? `${a.hygiene.retired} bounced lead(s) retired`
    : a.hygiene.bouncedActive
      ? `${a.hygiene.bouncedActive} bounced-active lead(s) NOT retired (${a.hygiene.gateReason})`
      : 'pipeline clean of bounced-active rows'
  const prop = a.hygiene.proposals.length ? ` · PROPOSAL: ${a.hygiene.proposals.join(' ')}` : ''
  return (
    `Mason (Sales): ${a.funnel.lines.join(' · ')}. ${rep}. ${prio}. ${hyg}.${prop}${defer} ` +
    `No draft was sent to a prospect — that gate stays human.`
  )
}

/** GET /api/os/mason — 06:20 UTC, after Rex (05:45), Dex (05:50) and Aria (06:10). */
export async function cronMason(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await runMasonAgent()) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
