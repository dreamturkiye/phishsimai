// ─────────────────────────────────────────────────────────────────────────────
//  PS-VERA-01 — Vera, VP Customer Success. BUILD-AND-ARM.
//
//  THE GHOST SHE REPLACES, AND ITS ONE SHARP EDGE
//    customerSuccess.ts read the database, so it was never a pure fabricator — but it computed:
//        retentionScore = customers.length === 0 ? 100 : ...
//    and Janet printed "CS: 100% retention" into the standup every morning over ZERO customers.
//    A 100% retention rate with nothing to retain is not an optimistic estimate, it is a number
//    invented to fill a slot. Vera returns null there, and a test asserts she cannot emit a health
//    score or an at-risk count over an empty book.
//
//  WHAT BUILD-AND-ARM ACTUALLY MEANS HERE
//    Not "a stub with a TODO". The onboarding sequence, the health model, the churn-signal
//    definitions and the expansion triggers are all written and wired in this file. They run today
//    against a real (empty) account set and produce an honest empty result. The moment a first
//    paying account exists they compute against it with no code change and no manual start — which
//    is the actual test of whether machinery is armed or merely described.
//
//  INTERNAL ACCOUNTS ARE NOT CUSTOMERS
//    Three of the four organizations are ours: the founder's internal org and two test accounts.
//    Every simulation ever sent went to the internal org. Counting those as accounts would recreate
//    the exact contamination Rex was built to police, one table over. The exclusion is applied in
//    the SELECT, not downstream, for the same reason it is in the Sales agent.
//
//  SHE ACTS ON NOBODY TODAY, AND SAYS SO
//    Over zero accounts the honest report is "0 accounts, onboarding playbook built and armed".
//    Not "0 at-risk" — which implies a check ran over a population — and never an invented at-risk
//    item to look busy.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { withHealth } from './withHealth'; import { type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

/** No rate below this denominator. House rule. */
export const MIN_N = 30

/**
 * Our own organizations. Named explicitly rather than pattern-matched: a slug rule like "contains
 * phishsim" would silently start excluding a real customer called "PhishSim Partners".
 */
export const INTERNAL_ORG_NAMES = ['PhishSim Internal', 'ai worker', 'sending'] as const

/** Applied at the SELECT level, never downstream. */
export const INTERNAL_ORG_EXCLUSION_SQL = `
      AND o.name <> ALL (ARRAY['PhishSim Internal','ai worker','sending'])`

// ─── THE ONBOARDING PLAYBOOK (built now, triggers on first account) ──────────

export type OnboardingStep = {
  day: number
  key: string
  goal: string
  /** The measurable thing that proves this step landed. Not "sent an email". */
  successSignal: string
}

/**
 * The sequence a first customer lands into. Each step names the OUTCOME that proves it worked,
 * because "we sent the day-3 email" is activity and "they ran a campaign" is value.
 */
export const ONBOARDING: OnboardingStep[] = [
  { day: 0, key: 'welcome_and_domain', goal: 'Verify a sending domain — nothing works until this is done.', successSignal: 'a row in org_verified_domains for the account' },
  { day: 1, key: 'first_campaign', goal: 'Launch the first simulation against a small internal group.', successSignal: 'a campaign row with status sent/completed' },
  { day: 3, key: 'first_results', goal: 'Read the first click/report numbers and see the risk picture.', successSignal: 'campaign_results rows with emailOpenedAt or linkClickedAt' },
  { day: 7, key: 'add_client_org', goal: 'Add a second client organization — the MSP motion, and the moment the pricing makes sense.', successSignal: 'a second org under the same billing customer' },
  { day: 14, key: 'recurring_schedule', goal: 'Move from one-off to a recurring schedule so the product runs without them.', successSignal: 'a campaign with isRecurring = true' },
  { day: 30, key: 'trial_to_paid', goal: 'Convert before the 30-day trial ends.', successSignal: 'an active Stripe subscription' },
]

/** Time-to-first-value: the single number that predicts everything downstream. */
export const TTFV_STEP = 'first_campaign'

// ─── HEALTH MODEL ────────────────────────────────────────────────────────────

export type AccountUsage = {
  orgId: string
  name: string
  plan: string
  hasSubscription: boolean
  createdAt: string
  campaigns: number
  lastCampaignAt: string | null
  resultRows: number
  verifiedDomains: number
}

export type HealthBand = 'healthy' | 'watch' | 'at_risk'

export type AccountHealth = {
  orgId: string
  name: string
  /** null when the account has no usable signal yet — NEVER a default number. */
  score: number | null
  band: HealthBand | null
  reasons: string[]
  daysSinceCampaign: number | null
}

/**
 * Score one account. Returns null for a brand-new account with no activity yet — that is "too early
 * to judge", not "unhealthy", and the two must not collapse into one number.
 *
 * The weights are deliberately about USE, not about logins: an MSP who verified a domain and ran a
 * recurring campaign is healthy even if nobody signed in this week.
 */
export function scoreAccountHealth(u: AccountUsage, now = Date.now()): AccountHealth {
  const ageDays = Math.floor((now - Date.parse(u.createdAt)) / 86_400_000)
  const daysSinceCampaign = u.lastCampaignAt ? Math.floor((now - Date.parse(u.lastCampaignAt)) / 86_400_000) : null
  const reasons: string[] = []

  // An account less than a day old with no activity is not at risk; it is new.
  if (ageDays < 1 && u.campaigns === 0) {
    return { orgId: u.orgId, name: u.name, score: null, band: null, reasons: ['too new to judge (<1 day, no activity yet)'], daysSinceCampaign }
  }

  let score = 0
  if (u.verifiedDomains > 0) { score += 30; reasons.push('sending domain verified') } else reasons.push('NO verified sending domain — nothing can send')
  if (u.campaigns > 0) { score += 30; reasons.push(`${u.campaigns} campaign(s) created`) } else reasons.push('no campaign ever created')
  if (u.resultRows > 0) { score += 20; reasons.push('has real simulation results') } else reasons.push('no simulation results yet')
  if (u.hasSubscription) { score += 20; reasons.push('active subscription') } else reasons.push('no active subscription')

  if (daysSinceCampaign !== null && daysSinceCampaign > 30) { score -= 20; reasons.push(`${daysSinceCampaign}d since last campaign`) }

  score = Math.max(0, Math.min(100, score))
  const band: HealthBand = score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'at_risk'
  return { orgId: u.orgId, name: u.name, score, band, reasons, daysSinceCampaign }
}

// ─── CHURN + EXPANSION SIGNALS ───────────────────────────────────────────────

export type ChurnSignal = { key: string; why: string; intervention: string }

/** Definitions now; they fire the moment an account exhibits them. */
export const CHURN_SIGNALS: ChurnSignal[] = [
  { key: 'no_domain_7d', why: 'A week in with no verified sending domain — the product literally cannot work for them.', intervention: 'Offer to walk the DNS records personally. This is the single highest-leverage save.' },
  { key: 'no_campaign_14d', why: 'Two weeks with no campaign created — they never reached first value.', intervention: 'Send the 3-click first-campaign path; offer to run the first one for them.' },
  { key: 'dormant_30d', why: '30 days since the last campaign on a previously active account.', intervention: 'Ask what changed. A dormant MSP usually has an internal blocker, not a product complaint.' },
  { key: 'trial_expiring_no_activity', why: 'Trial ending with no campaign run — will churn silently at day 30.', intervention: 'Direct outreach before expiry; a trial that never activated is not a pricing objection.' },
]

export type ExpansionSignal = { key: string; why: string }

export const EXPANSION_SIGNALS: ExpansionSignal[] = [
  { key: 'seat_ceiling', why: 'Approaching the plan seat limit — the upgrade is a fact, not a pitch.' },
  { key: 'multi_org', why: 'Added a second client organization — the MSP motion is working and the next tier pays for itself.' },
  { key: 'recurring_active', why: 'Running recurring campaigns — the product is embedded in their operations.' },
]

// ─── READING THE BOOK ────────────────────────────────────────────────────────

export type AccountBook = {
  checked: boolean
  external: AccountUsage[]
  internalExcluded: number
  paying: number
  trialing: number
  free: number
}

/**
 * WHOSE ACCOUNT IS IT? — the Vera/Nova boundary.
 *
 * Vera owns RETENTION of accounts that have committed: paying and trialing. Nova owns ACTIVATION of
 * signups that have not.
 *
 * This boundary was drawn after Vera's first live run produced a contradiction: she scored the one
 * free signup (egroth — no campaign, no verified domain, dormant since Jul 25) as `at_risk` while
 * her own report said "no accounts to assess". Both statements could not be true.
 *
 * The resolution is not to silence one of them, it is that "at-risk" was the wrong FRAME. A free
 * signup that never ran a campaign has not churned and cannot — it never activated. Calling that
 * churn risk would put a retention intervention on an activation problem and would double-count the
 * same org in two agents' reports. Vera refers it to Nova and says so.
 */
export function isVerasAccount(a: AccountUsage): boolean {
  return a.hasSubscription || a.plan !== 'free'
}

export async function readAccounts(sql: any): Promise<AccountBook> {
  try {
    const rows = (await sql.query(`
      SELECT o.id::text AS org_id, o.name, o.plan,
             (o."stripeSubscriptionId" IS NOT NULL) AS has_sub,
             o."createdAt"::text AS created_at,
             (SELECT count(*) FROM campaigns c WHERE c."orgId" = o.id)::int AS campaigns,
             (SELECT max(c2."scheduledAt")::text FROM campaigns c2 WHERE c2."orgId" = o.id) AS last_campaign_at,
             (SELECT count(*) FROM campaign_results r WHERE r."orgId" = o.id)::int AS result_rows,
             (SELECT count(*) FROM org_verified_domains d WHERE d."orgId" = o.id)::int AS verified_domains
      FROM organizations o
      WHERE 1=1 ${INTERNAL_ORG_EXCLUSION_SQL}`)) as any[]

    const all = (await sql`SELECT count(*)::int AS n FROM organizations`) as any[]
    const external: AccountUsage[] = rows.map((r) => ({
      orgId: String(r.org_id),
      name: String(r.name),
      plan: String(r.plan ?? 'free'),
      hasSubscription: r.has_sub === true,
      createdAt: String(r.created_at),
      campaigns: Number(r.campaigns ?? 0),
      lastCampaignAt: r.last_campaign_at ?? null,
      resultRows: Number(r.result_rows ?? 0),
      verifiedDomains: Number(r.verified_domains ?? 0),
    }))

    return {
      checked: true,
      external,
      internalExcluded: Number(all[0]?.n ?? 0) - external.length,
      paying: external.filter((a) => a.hasSubscription).length,
      trialing: external.filter((a) => !a.hasSubscription && a.plan !== 'free').length,
      free: external.filter((a) => !a.hasSubscription && a.plan === 'free').length,
    }
  } catch {
    return { checked: false, external: [], internalExcluded: 0, paying: 0, trialing: 0, free: 0 }
  }
}

/**
 * Retention over the book.
 *
 * Returns NULL over zero accounts. The ghost returned 100 here, and Janet printed "100% retention"
 * with nothing to retain — the single sharpest fabrication in the old CS agent.
 */
export function retentionScore(paying: number, churnedInPeriod: number): number | null {
  if (paying + churnedInPeriod === 0) return null
  return Math.round(((paying) / (paying + churnedInPeriod)) * 100)
}

/**
 * At-risk accounts. Over an empty book this returns [], and the REPORT says "no accounts to assess"
 * rather than "0 at-risk" — the latter implies a check ran over a population.
 */
export function atRiskAccounts(healths: AccountHealth[]): AccountHealth[] {
  return healths.filter((h) => h.band === 'at_risk')
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeVeraLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:vera:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'vera', 'customer_success', ${signature},
              ${`VERA CS LESSON (${i.severity}). ${i.subject}: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)}`},
              false, 0, -0.1)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const VERA_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'gainsight-cs-practice',
    name: 'Gainsight — customer success practice library',
    url: 'https://www.gainsight.com/blog/',
    kind: 'practitioner',
    why: 'The largest published body of CS operating practice; useful for health-model and playbook design, never for a number we may claim.',
  },
  {
    slug: 'bvp-nrr-benchmarks',
    name: 'Bessemer — cloud benchmarks (NRR, churn, retention)',
    url: 'https://www.bvp.com/atlas',
    kind: 'industry_benchmark',
    why: 'Benchmark BANDS for retention and NRR — a reference range to judge ourselves against once we have customers, not a target to assert.',
  },
  {
    slug: 'stripe-churn-mechanics',
    name: 'Stripe — subscription lifecycle, cancellation and dunning',
    url: 'https://docs.stripe.com/billing/subscriptions/cancel',
    kind: 'vendor_doc',
    why: 'Our billing system defines what churn mechanically IS here; involuntary churn from failed payments is a different problem from a cancellation.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type VeraReport = {
  status: 'ACTIVE' | 'BUILT_AND_ARMED' | 'INSUFFICIENT_DATA'
  book: AccountBook
  healths: AccountHealth[]
  atRisk: AccountHealth[]
  /** Free signups handed to Nova — they have an activation problem, not a churn problem. */
  referredToNova: string[]
  /** null until there is a book to measure. Never 100 over zero accounts. */
  retention: number | null
  onboardingSteps: number
  churnSignalsArmed: number
  expansionSignalsArmed: number
  incidents: Incident[]
  lessonsWritten: number
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export async function runVeraAgent(opts: { sql?: any; skipCurrency?: boolean; now?: number } = {}): Promise<VeraReport> {
  const sql = opts.sql ?? getSql()
  const now = opts.now ?? Date.now()

  const book = await readAccounts(sql)
  // Only accounts Vera owns are scored — free signups belong to Nova's activation funnel.
  const mine = book.external.filter(isVerasAccount)
  const referredToNova = book.external.filter((a) => !isVerasAccount(a))
  const healths = mine.map((a) => scoreAccountHealth(a, now))
  const atRisk = atRiskAccounts(healths)
  const retention = retentionScore(book.paying, 0)

  // An account that signed up and never verified a domain is a REAL finding — but only once one
  // exists. Over an empty book this loop produces nothing, which is the correct output.
  const incidents: Incident[] = []
  for (const h of healths) {
    const usage = mine.find((a) => a.orgId === h.orgId)!
    if (usage.hasSubscription && usage.verifiedDomains === 0) {
      incidents.push({
        detector: 'blind_gate',
        severity: 'critical' as Severity,
        subject: `account:${usage.name}`,
        summary: `Paying account "${usage.name}" has NO verified sending domain — the product cannot send for them at all. This is the highest-leverage save available.`,
        evidence: { orgId: usage.orgId, campaigns: usage.campaigns, verifiedDomains: 0 },
        signature: `cs_paying_no_domain:${usage.orgId}`,
      })
    }
  }
  const lessonsWritten = await writeVeraLessons(sql, incidents).catch(() => 0)

  const status: VeraReport['status'] = !book.checked
    ? 'INSUFFICIENT_DATA'
    : book.paying > 0
      ? 'ACTIVE'
      : 'BUILT_AND_ARMED'

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('vera', 'customer success, onboarding, retention and churn intervention', VERA_SOURCES, sql).catch(() => null)

  const line = buildVeraLine({ status, book, healths, atRisk, retention, referredToNova: referredToNova.map((a) => a.name) })

  return {
    status, book, healths, atRisk, retention, referredToNova: referredToNova.map((a) => a.name),
    onboardingSteps: ONBOARDING.length,
    churnSignalsArmed: CHURN_SIGNALS.length,
    expansionSignalsArmed: EXPANSION_SIGNALS.length,
    incidents, lessonsWritten,
    notChecked: book.checked ? [] : ['accounts'],
    currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildVeraLine(a: {
  status: VeraReport['status']
  book: AccountBook
  healths: AccountHealth[]
  atRisk: AccountHealth[]
  retention: number | null
  referredToNova?: string[]
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return 'Vera (CS): insufficient data — the account book was unreadable this run. No health or retention claim is possible. Playbook built and armed.'
  }

  if (a.status === 'BUILT_AND_ARMED') {
    const nova = a.referredToNova ?? []
    const ref = nova.length
      ? ` ${nova.length} free signup(s) (${nova.join(', ')}) referred to Nova — they never activated, which is an ` +
        `activation problem, not churn. Counting them as at-risk would put a retention intervention on the wrong problem.`
      : ''
    return (
      `Vera (CS): 0 paying accounts — onboarding, health scoring and churn instrumentation BUILT AND ARMED ` +
      `(${ONBOARDING.length}-step onboarding, ${CHURN_SIGNALS.length} churn signals, ${EXPANSION_SIGNALS.length} expansion triggers), ` +
      `and they self-activate on the first paying account with no manual start. ` +
      `Retention is NOT MEASURABLE with nothing to retain — not 100%. ` +
      `No paying or trialing account exists to assess, so no at-risk list exists and none is invented.${ref} ` +
      `${a.book.internalExcluded} internal org(s) excluded from every count.`
    )
  }

  const scored = a.healths.filter((h) => h.score !== null)
  const ret = a.retention === null ? 'retention NOT MEASURABLE' : `retention ${a.retention}%`
  const risk = a.atRisk.length
    ? `${a.atRisk.length} at-risk: ${a.atRisk.map((h) => h.name).join(', ')}`
    : `0 at-risk across ${scored.length} assessed account(s)`
  return (
    `Vera (CS): ${a.book.paying} paying · ${a.book.trialing} trialing · ${ret} · ${risk}. ` +
    `${a.book.internalExcluded} internal org(s) excluded from every count.`
  )
}

/** GET /api/os/vera — 06:50 UTC. */
export async function cronVera(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await withHealth('vera', () => runVeraAgent())) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
