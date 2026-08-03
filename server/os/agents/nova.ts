// ─────────────────────────────────────────────────────────────────────────────
//  PS-NOVA-01 — Nova, Head of Product Growth. BUILD-AND-ARM. Replaces the product.ts ghost.
//
//  THE GHOST
//    product.ts returned a hardcoded five-item backlog with invented priorities baked into the
//    strings — "unlocks entire MSP channel (HIGH)", "closes enterprise deals (HIGH)" — and wrote
//    the top one to memory at confidence 0.9 as a strategic fact. Nothing measured any of it. Janet
//    read `product.topFeature` in the standup and Marcus was fed it as a task. It is the LAST open
//    fabricated_writer incident on Rex's board; deleting it closes his list.
//
//    The specific dishonesty worth naming: ranking by "revenue impact" with zero revenue and zero
//    usage. Every one of those HIGH labels was a guess wearing a metric's clothes.
//
//  WHAT NOVA DOES INSTEAD
//    She INSTRUMENTS the activation funnel — signup -> verified domain -> first campaign -> first
//    result -> paid — as counted milestones over real rows. Today that funnel holds exactly one
//    external signup, so she reports COUNTS and the observed drop-off point, and refuses to state
//    an activation RATE. n=1 is an anecdote; a percentage over it is a fabrication with a decimal.
//
//  FEATURE PRIORITISATION IS EARNED, NOT ASSERTED
//    The spec asks her to rank product work by revenue impact. With zero revenue and one dormant
//    signup there is nothing to rank by, so she ranks NOTHING and says why. The moment friction is
//    measured across enough accounts, the same function ranks by observed drop-off — the ranking is
//    built, it is simply not yet earned. That is the difference between build-and-arm and a stub.
//
//  SHE OWNS ACTIVATION; VERA OWNS RETENTION.
//    Vera refers non-paying signups here by name rather than calling them at-risk customers — a
//    signup that never activated has not churned. Nova is the other side of that boundary.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { INTERNAL_ORG_EXCLUSION_SQL } from './vera'
import { type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

/** No rate below this denominator. House rule, and the whole point of Nova's honesty today. */
export const MIN_N = 30

// ─── THE ACTIVATION FUNNEL ───────────────────────────────────────────────────

export type Milestone = {
  key: string
  label: string
  /** Why this step is the one that matters, not just a step that exists. */
  why: string
}

/**
 * Activation, as milestones over rows that actually exist in this schema.
 *
 * Deliberately NOT "logged in", "viewed dashboard", "clicked around" — none of those are written
 * anywhere, and a funnel over columns nobody populates is a read surface with no writer wearing a
 * growth-metrics hat. Every milestone below maps to a table Nova can count.
 */
export const MILESTONES: Milestone[] = [
  { key: 'signup', label: 'Signed up', why: 'An organization row exists. The denominator for everything after it.' },
  { key: 'domain_verified', label: 'Verified a sending domain', why: 'The hard gate. Nothing can be sent until this exists, so a drop here is a total loss.' },
  { key: 'campaign_created', label: 'Created a first campaign', why: 'Intent became action. The strongest single predictor that a trial is real.' },
  { key: 'campaign_result', label: 'Saw a first result', why: 'First value: they can finally see their own risk picture. TTFV is measured to here.' },
  { key: 'paid', label: 'Converted to paid', why: 'The only milestone that is revenue.' },
]

export type FunnelCounts = {
  checked: boolean
  signup: number
  domainVerified: number
  campaignCreated: number
  campaignResult: number
  paid: number
  internalExcluded: number
}

export async function measureActivation(sql: any): Promise<FunnelCounts> {
  try {
    const r = (await sql.query(`
      SELECT
        count(*)::int AS signup,
        count(*) FILTER (WHERE (SELECT count(*) FROM org_verified_domains d WHERE d."orgId" = o.id) > 0)::int AS domain_verified,
        count(*) FILTER (WHERE (SELECT count(*) FROM campaigns c WHERE c."orgId" = o.id) > 0)::int AS campaign_created,
        count(*) FILTER (WHERE (SELECT count(*) FROM campaign_results r2 WHERE r2."orgId" = o.id) > 0)::int AS campaign_result,
        count(*) FILTER (WHERE o."stripeSubscriptionId" IS NOT NULL)::int AS paid
      FROM organizations o
      WHERE 1=1 ${INTERNAL_ORG_EXCLUSION_SQL}`)) as any[]

    const all = (await sql`SELECT count(*)::int AS n FROM organizations`) as any[]
    const signup = Number(r[0]?.signup ?? 0)
    return {
      checked: true,
      signup,
      domainVerified: Number(r[0]?.domain_verified ?? 0),
      campaignCreated: Number(r[0]?.campaign_created ?? 0),
      campaignResult: Number(r[0]?.campaign_result ?? 0),
      paid: Number(r[0]?.paid ?? 0),
      internalExcluded: Number(all[0]?.n ?? 0) - signup,
    }
  } catch {
    return { checked: false, signup: 0, domainVerified: 0, campaignCreated: 0, campaignResult: 0, paid: 0, internalExcluded: 0 }
  }
}

export type StepReport = { key: string; label: string; reached: number; of: number; line: string }

/**
 * Render one funnel step.
 *
 * NEVER a percentage below n=30. This is the function that keeps Nova honest today: with one signup
 * the truthful output is "1/1 reached" and "0/1 reached", not "100%" and "0%". A rate over n=1
 * invites exactly the reasoning it cannot support.
 */
export function stepReport(key: string, label: string, reached: number, of: number): StepReport {
  const line =
    of === 0
      ? `${label}: 0/0 — N/A, n=0`
      : of < MIN_N
        ? `${label}: ${reached}/${of} — counts only, no rate below n=${MIN_N}`
        : `${label}: ${reached}/${of} (${((reached / of) * 100).toFixed(1)}%)`
  return { key, label, reached, of, line }
}

export function buildFunnel(c: FunnelCounts): StepReport[] {
  return [
    stepReport('signup', 'Signed up', c.signup, c.signup),
    stepReport('domain_verified', 'Verified a sending domain', c.domainVerified, c.signup),
    stepReport('campaign_created', 'Created a first campaign', c.campaignCreated, c.signup),
    stepReport('campaign_result', 'Saw a first result', c.campaignResult, c.signup),
    stepReport('paid', 'Converted to paid', c.paid, c.signup),
  ]
}

/**
 * Where people fall out. Returns the FIRST milestone that lost everyone who reached the one before.
 *
 * Reported as an observation with its denominator attached, never as "the biggest problem" — with
 * n=1 the honest claim is "the one signup we have stopped here", which is a fact, not a diagnosis.
 */
export function biggestDropOff(steps: StepReport[]): { step: StepReport; lostFrom: StepReport } | null {
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]
    const cur = steps[i]
    if (prev.reached > 0 && cur.reached < prev.reached) return { step: cur, lostFrom: prev }
  }
  return null
}

// ─── FEATURE PRIORITISATION — built, not yet earned ──────────────────────────

export type FeatureCandidate = {
  key: string
  label: string
  /** The milestone this would unblock. Priority is DERIVED from measured loss at that milestone. */
  unblocks: string
}

/**
 * Candidate product work, each tied to the activation milestone it would unblock.
 *
 * Note what is absent: any priority label. The ghost shipped "(HIGH)" strings written by hand. Here
 * priority is a FUNCTION of measured drop-off, so it cannot be asserted — only computed, and only
 * once there is enough data to compute it from.
 */
export const FEATURE_CANDIDATES: FeatureCandidate[] = [
  { key: 'guided_dns', label: 'Guided DNS/domain verification with live record checking', unblocks: 'domain_verified' },
  { key: 'template_quickstart', label: 'One-click first campaign from a preset template', unblocks: 'campaign_created' },
  { key: 'sample_results', label: 'Show a worked example result set before the first real send', unblocks: 'campaign_result' },
  { key: 'multi_org_onboarding', label: 'Add-a-client flow for the MSP motion', unblocks: 'paid' },
]

export type RankedFeature = { key: string; label: string; lostAtMilestone: number; rationale: string }

/**
 * Rank features by measured loss at the milestone each unblocks.
 *
 * Returns [] when no milestone has a large enough denominator to judge. That empty array IS the
 * answer today, and it is the difference between this and the ghost: the ranking machinery exists
 * and runs, it simply has nothing legitimate to rank yet.
 */
export function rankFeatures(steps: StepReport[], minN = MIN_N): RankedFeature[] {
  const byKey = new Map(steps.map((s) => [s.key, s]))
  const ranked: RankedFeature[] = []
  for (const f of FEATURE_CANDIDATES) {
    const target = byKey.get(f.unblocks)
    const prevIdx = steps.findIndex((s) => s.key === f.unblocks) - 1
    const prev = prevIdx >= 0 ? steps[prevIdx] : null
    if (!target || !prev) continue
    if (prev.reached < minN) continue // not enough people reached the prior step to judge the loss
    const lost = prev.reached - target.reached
    if (lost <= 0) continue
    ranked.push({
      key: f.key,
      label: f.label,
      lostAtMilestone: lost,
      rationale: `${lost} of ${prev.reached} accounts that reached "${prev.label}" never reached "${target.label}".`,
    })
  }
  return ranked.sort((a, b) => b.lostAtMilestone - a.lostAtMilestone)
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeNovaLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:nova:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'nova', 'product_growth', ${signature},
              ${`NOVA GROWTH LESSON (${i.severity}). ${i.subject}: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)}`},
              false, 0, -0.1)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const NOVA_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'amplitude-plg-benchmarks',
    name: 'Amplitude — product-led growth benchmarks',
    url: 'https://amplitude.com/blog',
    kind: 'practitioner',
    why: 'Published activation and retention curve analysis over large product datasets; a reference band for funnel shape, never a number we may claim.',
  },
  {
    slug: 'reforge-activation',
    name: 'Reforge — growth and activation frameworks',
    url: 'https://www.reforge.com/blog',
    kind: 'practitioner',
    why: 'The standard vocabulary for activation milestones and time-to-value; useful for how to MEASURE, not for what our numbers are.',
  },
  {
    slug: 'stripe-trials',
    name: 'Stripe — trials and subscription conversion mechanics',
    url: 'https://docs.stripe.com/billing/subscriptions/trials',
    kind: 'vendor_doc',
    why: 'Defines mechanically how our 30-day no-card trial converts or lapses — trial->paid is measured against this, not against a blog.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type NovaReport = {
  status: 'ACTIVE' | 'BUILT_AND_ARMED' | 'INSUFFICIENT_DATA'
  counts: FunnelCounts
  funnel: StepReport[]
  dropOff: { step: StepReport; lostFrom: StepReport } | null
  rankedFeatures: RankedFeature[]
  milestonesInstrumented: number
  incidents: Incident[]
  lessonsWritten: number
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export async function runNovaAgent(opts: { sql?: any; skipCurrency?: boolean } = {}): Promise<NovaReport> {
  const sql = opts.sql ?? getSql()

  const counts = await measureActivation(sql)
  const funnel = buildFunnel(counts)
  const dropOff = counts.checked ? biggestDropOff(funnel) : null
  const rankedFeatures = counts.checked ? rankFeatures(funnel) : []

  // A signup that has produced nothing is a real observation — but at n=1 it is an OBSERVATION,
  // filed as medium, not a critical product verdict.
  const incidents: Incident[] = []
  if (counts.checked && counts.signup > 0 && counts.campaignCreated === 0) {
    incidents.push({
      detector: 'blind_gate',
      severity: 'medium' as Severity,
      subject: 'activation:no_first_campaign',
      summary:
        `${counts.signup}/${counts.signup} external signup(s) have never created a campaign. At n=${counts.signup} ` +
        `this is an observation, not a diagnosis — it is one account's behaviour, and no activation ` +
        `rate or product conclusion may be drawn from it.`,
      evidence: { signups: counts.signup, domainVerified: counts.domainVerified, campaignCreated: 0, n: counts.signup },
      signature: 'nova_no_first_campaign',
    })
  }
  const lessonsWritten = await writeNovaLessons(sql, incidents).catch(() => 0)

  const status: NovaReport['status'] = !counts.checked
    ? 'INSUFFICIENT_DATA'
    : counts.signup >= MIN_N
      ? 'ACTIVE'
      : 'BUILT_AND_ARMED'

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('nova', 'product-led growth, activation and trial conversion', NOVA_SOURCES, sql).catch(() => null)

  const line = buildNovaLine({ status, counts, funnel, dropOff, rankedFeatures })

  return {
    status, counts, funnel, dropOff, rankedFeatures,
    milestonesInstrumented: MILESTONES.length,
    incidents, lessonsWritten,
    notChecked: counts.checked ? [] : ['activation_funnel'],
    currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildNovaLine(a: {
  status: NovaReport['status']
  counts: FunnelCounts
  funnel: StepReport[]
  dropOff: { step: StepReport; lostFrom: StepReport } | null
  rankedFeatures: RankedFeature[]
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return 'Nova (Product Growth): insufficient data — the activation funnel was unreadable this run. No activation claim is possible. Instrumentation built and armed.'
  }

  const steps = a.funnel.map((s) => s.line).join(' · ')

  if (a.status === 'BUILT_AND_ARMED') {
    const drop = a.dropOff
      ? ` Observed stop point: "${a.dropOff.lostFrom.label}" -> "${a.dropOff.step.label}". At n=${a.counts.signup} that is one account's behaviour, not a funnel diagnosis.`
      : ''
    return (
      `Nova (Product Growth): ${a.counts.signup} external signup(s), ${MILESTONES.length} activation milestones ` +
      `INSTRUMENTED and counting over real rows — ${steps}.${drop} ` +
      `No activation rate is stated: n=${a.counts.signup} is below n=${MIN_N}, and a percentage over it would be a ` +
      `fabrication with a decimal point. ` +
      `Feature ranking is BUILT but UNEARNED — priority is derived from measured drop-off, and no ` +
      `milestone yet has a denominator large enough to derive from, so nothing is ranked. ` +
      `${a.counts.internalExcluded} internal org(s) excluded.`
    )
  }

  const top = a.rankedFeatures.length
    ? ` Top product priority by measured loss: ${a.rankedFeatures[0].label} — ${a.rankedFeatures[0].rationale}`
    : ' No feature ranked: no milestone has enough volume to derive priority from.'
  return `Nova (Product Growth): ${steps}.${top} ${a.counts.internalExcluded} internal org(s) excluded.`
}

/** GET /api/os/nova — 07:00 UTC, the last of the eight before Janet's 08:00 standup. */
export async function cronNova(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await runNovaAgent()) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
