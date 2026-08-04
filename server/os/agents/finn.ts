// ─────────────────────────────────────────────────────────────────────────────
//  PS-FINN-01 — Finn, CFO. Replaces the finance.ts ghost and the $99 that lived inside it.
//
//  THE PHANTOM THIS KILLS
//    finance.ts computed the company's revenue picture from `const avgRevenue = 99` — a number that
//    matches NO live Stripe price (they are 149 / 299 / 749 / 1499). From it, it derived
//    projectedMrrIn90Days = contacted * 0.02 * 0.30 * 99, and Janet read that projection in the
//    standup every morning. Three fabrications stacked: an invented unit price, an invented reply
//    rate, and an invented close rate, presented as a forecast. Rex flagged the literal critical;
//    Finn is the replacement, and the ghost is deleted in this change.
//
//  FINN'S FIRST LAW: HE NEVER STATES A PRICE HE DID NOT READ FROM STRIPE.
//    Not from a constant, not from a prompt, not from memory. loadPhishSimPrices() reads
//    /v1/prices live. If Stripe is unreachable, every price-dependent number is NOT CHECKED —
//    never a remembered figure, and never a fallback constant, because a fallback constant is
//    exactly what $99 was.
//
//  HARD STOP: HE FLAGS DRIFT, HE NEVER EDITS A PRICE.
//    The pricing guard is his one ACTIVE faculty today and it is real: it reads the plan-price
//    claims we make to customers and compares each against live Stripe. It would have caught the
//    $99 button and the invented $49 founding rate. What it does with a mismatch is REPORT it.
//    Finn has no write path to a price, to Stripe, or to copy.
//
//  ACTIVE vs BUILD-AND-ARM, stated honestly.
//    · Pricing guard: ACTIVE. It has real inputs today (live Stripe + the copy in this repo).
//    · Revenue metrics: BUILT AND ARMED. With 0 paying customers the truthful output is
//      "MRR $0, 0 paying, pricing guard green" — not a padded number, not a projection. The
//      machinery computes MRR/ARR/churn/plan-mix from real subscriptions the moment one exists.
//      There is deliberately NO forecast function in this module: the ghost's only forecast was
//      fabricated, and a forecast over zero pipeline outcomes would be too.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { loadPhishSimPrices, type StripePlan } from '../../stripe/prices'
import { readSource, type SourceFile, type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'
import { scanVerdict, scanVerdictReason } from './scanVerdict'
// PS-PRICE-SNAPSHOT-01. Statically imported so the bundler INLINES it — the whole point is that
// this survives into the serverless bundle, where .ts sources do not. Regenerated at build and
// freshness-checked in CI, so it can never describe copy we no longer ship.
import priceClaimSnapshot from './priceClaims.generated.json'

const COMPANY = 'phishsimai'

// ─── LIVE STRIPE TRUTH ───────────────────────────────────────────────────────

export type StripeTruth = {
  checked: boolean
  /** plan -> monthly USD, read live. Empty when NOT CHECKED. */
  monthlyUsd: Partial<Record<StripePlan, number>>
  activeSubs: number
  trialingSubs: number
  mrrUsd: number
  arrUsd: number
  reason: string
}

const EMPTY_TRUTH: StripeTruth = {
  checked: false, monthlyUsd: {}, activeSubs: 0, trialingSubs: 0, mrrUsd: 0, arrUsd: 0,
  reason: 'Stripe NOT CHECKED',
}

/**
 * Read revenue truth from Stripe. Prices AND subscriptions, both live.
 *
 * On any failure this returns checked:false. It does NOT fall back to a remembered MRR or a
 * constant — the whole reason this agent exists is that a fallback constant became a reported
 * forecast. "NOT CHECKED" is the only honest answer to an unreachable billing system.
 */
export async function readStripeTruth(): Promise<StripeTruth> {
  let monthlyUsd: Partial<Record<StripePlan, number>> = {}
  try {
    const prices = await loadPhishSimPrices()
    for (const p of prices) {
      if (p.interval !== 'monthly' || typeof p.unitAmount !== 'number') continue
      monthlyUsd[p.plan] = Math.round(p.unitAmount) / 100
    }
  } catch (e: any) {
    return { ...EMPTY_TRUTH, reason: `Stripe prices NOT CHECKED (${String(e?.message || e).slice(0, 80)})` }
  }

  try {
    const StripeMod = (await import('stripe')).default
    const key = process.env.STRIPE_SECRET_KEY ?? ''
    if (!key) return { ...EMPTY_TRUTH, monthlyUsd, reason: 'Stripe subscriptions NOT CHECKED (no STRIPE_SECRET_KEY)' }
    const stripe = new StripeMod(key, { apiVersion: '2025-05-28.basil' as any })

    const subs = await stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.items.data.price'] })
    let activeSubs = 0
    let trialingSubs = 0
    let mrrCents = 0

    for (const s of subs.data) {
      if (s.status === 'trialing') trialingSubs++
      if (s.status !== 'active') continue
      activeSubs++
      for (const item of s.items.data) {
        const price = item.price
        if (!price?.unit_amount || !price.recurring) continue
        const qty = item.quantity ?? 1
        // Normalise annual to a monthly figure so MRR means one thing.
        const perMonth = price.recurring.interval === 'year' ? price.unit_amount / 12 : price.unit_amount
        mrrCents += perMonth * qty
      }
    }

    const mrrUsd = Math.round(mrrCents) / 100
    return {
      checked: true,
      monthlyUsd,
      activeSubs,
      trialingSubs,
      mrrUsd,
      arrUsd: Math.round(mrrUsd * 12 * 100) / 100,
      reason: 'read live from Stripe',
    }
  } catch (e: any) {
    return { ...EMPTY_TRUTH, monthlyUsd, reason: `Stripe subscriptions NOT CHECKED (${String(e?.message || e).slice(0, 80)})` }
  }
}

// ─── THE PRICING GUARD — Finn's one ACTIVE faculty ───────────────────────────

/** Files that state a plan price to a customer or to an agent that will quote it. */
export const PRICE_CLAIM_SURFACES = [
  'client/src/pages/Home.tsx',
  'server/os/agents/salesReplies.ts',
  'server/os/janet.ts',
  'server/os/abTest.ts',
]

export type PriceClaim = { file: string; plan: StripePlan; amountUsd: number; context: string }

const PLAN_WORDS: Record<string, StripePlan> = {
  starter: 'starter', growth: 'growth', pro: 'pro', enterprise: 'enterprise',
}

/** Strip comments — a wrong price in a comment is not a claim made to anyone. */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Find plan-name/price pairs actually asserted in copy.
 *
 * TWO DIRECTIONS, DELIBERATELY ASYMMETRIC WINDOWS.
 *   PLAN-then-PRICE ("Starter $149", `name: "Growth", price: "$299"`) is how pricing tables and
 *   prose both read, so it gets a 40-char window.
 *
 *   PRICE-then-PLAN ("$99 Starter plan") is real but rare, and it is where mis-pairing happens. Its
 *   window is 12 chars AND may not cross a sentence boundary. That is not arbitrary tuning — the
 *   first version used 40 chars in both directions and produced a FALSE POSITIVE on live copy:
 *
 *       "60c/user, $299/mo for 500. Drops to 30c on Pro."
 *
 *   $299 is the Growth price and "Pro" names the 30c tier, but they sit 32 characters apart, so the
 *   guard reported Pro-at-$299 against Stripe's $749. The copy was correct and the guard was wrong.
 *   A pricing guard that cries wolf is one a human learns to dismiss, which is worse than no guard
 *   at all — the same reasoning that narrowed Rex's price detector after it flagged a milestone ladder.
 */
export function extractPriceClaims(file: string, rawText: string): PriceClaim[] {
  const text = stripComments(rawText)
  const out: PriceClaim[] = []
  const seen = new Set<string>()

  // Forward: plan then price, 40-char window. Reverse: price then plan, 12 chars and no sentence
  // boundary (no '.', '!', '?', ';' between them).
  const re = /(starter|growth|pro|enterprise)[^\n]{0,40}?\$\s?([\d,]+)|\$\s?([\d,]+)[^.!?;\n]{0,12}?\b(starter|growth|pro|enterprise)\b/gi
  for (const m of text.matchAll(re)) {
    const planWord = (m[1] ?? m[4] ?? '').toLowerCase()
    const amountStr = (m[2] ?? m[3] ?? '').replace(/,/g, '')
    const plan = PLAN_WORDS[planWord]
    const amountUsd = Number(amountStr)
    if (!plan || !Number.isFinite(amountUsd) || amountUsd <= 0) continue
    // Plan prices are monthly figures in a sane range. A six-figure number beside a plan word is a
    // compliance penalty or a contract value, not our price.
    if (amountUsd < 10 || amountUsd > 50_000) continue
    const key = `${plan}:${amountUsd}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ file, plan, amountUsd, context: m[0].replace(/\s+/g, ' ').slice(0, 80) })
  }
  return out
}

/**
 * Compare every claim against live Stripe.
 *
 * If Stripe was NOT CHECKED this returns NO incidents and the caller reports the guard as
 * unverified. Flagging drift against an unknown truth would be guessing, and a guard that guesses is
 * worse than one that admits it did not run.
 */
export function auditPriceClaims(claims: PriceClaim[], live: Partial<Record<StripePlan, number>>, stripeChecked: boolean): Incident[] {
  if (!stripeChecked) return []
  const out: Incident[] = []
  for (const c of claims) {
    const truth = live[c.plan]
    if (truth === undefined) continue // no live price for that plan — cannot judge, so does not
    if (Math.abs(truth - c.amountUsd) < 0.005) continue
    out.push({
      detector: 'pricing_drift',
      severity: 'critical' as Severity,
      subject: `${c.file}:${c.plan}`,
      summary:
        `Copy claims ${c.plan} at $${c.amountUsd} but live Stripe says $${truth}. ` +
        `A customer reading this is quoted a price we do not charge. ` +
        `Context: "${c.context}". Finn FLAGS this — he never edits a price, and neither may any agent.`,
      evidence: { file: c.file, plan: c.plan, claimedUsd: c.amountUsd, liveStripeUsd: truth, context: c.context },
      signature: `price_claim_drift:${c.file}:${c.plan}`,
    })
  }
  return out
}

/** A plan we charge for but never mention, or mention but do not sell. Reported, not filed. */
export function coverageGaps(claims: PriceClaim[], live: Partial<Record<StripePlan, number>>): string[] {
  const claimed = new Set(claims.map((c) => c.plan))
  const sold = Object.keys(live) as StripePlan[]
  const gaps: string[] = []
  for (const p of sold) if (!claimed.has(p)) gaps.push(`${p} is sold in Stripe but stated in no scanned surface`)
  return gaps
}

// ─── REVENUE TRUTH PACK (BUILT AND ARMED) ────────────────────────────────────

export type RevenuePack = {
  armed: boolean
  mrrUsd: number | null
  arrUsd: number | null
  payingCustomers: number | null
  trialing: number | null
  lines: string[]
}

/**
 * The structure now, the numbers as they arrive.
 *
 * With zero paying customers this reports $0 and says so plainly. It contains NO forecast — the
 * ghost's only forecast was fabricated from three invented rates, and a projection over zero
 * conversion outcomes would be the same fabrication with better manners.
 */
export function buildRevenuePack(truth: StripeTruth, dbCustomers: number | null): RevenuePack {
  if (!truth.checked) {
    return {
      armed: true, mrrUsd: null, arrUsd: null, payingCustomers: null, trialing: null,
      lines: [`Revenue: NOT CHECKED — ${truth.reason}. No MRR figure may be quoted this cycle.`],
    }
  }
  const lines = [
    `MRR $${truth.mrrUsd.toFixed(2)} · ARR $${truth.arrUsd.toFixed(2)} (live Stripe, ${truth.activeSubs} active subscription(s))`,
    truth.trialingSubs > 0 ? `${truth.trialingSubs} trialing subscription(s)` : 'No trialing subscriptions',
  ]
  if (truth.activeSubs === 0) {
    lines.push(
      'No paying customers yet, so churn, NRR, LTV/CAC and payback are NOT MEASURABLE — they are ' +
      'built and will compute from real subscriptions the moment one exists. No forecast is offered: ' +
      'a projection over zero conversion outcomes is a fabrication.',
    )
  }
  if (dbCustomers !== null && dbCustomers !== truth.activeSubs) {
    lines.push(
      `RECONCILIATION GAP: the CRM says ${dbCustomers} customer(s), Stripe says ${truth.activeSubs} ` +
      `active subscription(s). Stripe is the revenue truth; the CRM stage is the thing to fix.`,
    )
  }
  return {
    armed: true,
    mrrUsd: truth.mrrUsd,
    arrUsd: truth.arrUsd,
    payingCustomers: truth.activeSubs,
    trialing: truth.trialingSubs,
    lines,
  }
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeFinnLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:finn:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'finn', 'pricing_guard', ${signature},
              ${`FINN PRICING LESSON (${i.severity}). ${i.subject}: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)} RULE: every price stated to a customer must equal the live Stripe value; a price literal in code is a defect even when it currently matches.`},
              false, 0, -0.3)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const FINN_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'stripe-billing-metrics',
    name: 'Stripe — SaaS billing and revenue metrics docs',
    url: 'https://docs.stripe.com/billing/subscriptions/overview',
    kind: 'vendor_doc',
    why: 'Our actual billing system. How Stripe defines a subscription state IS how our MRR is computed.',
  },
  {
    slug: 'sec-revenue-recognition',
    name: 'FASB / SEC — revenue recognition guidance (ASC 606)',
    url: 'https://www.sec.gov/answers/revrecog.htm',
    kind: 'standards_body',
    why: 'The accounting standard for when revenue may be recognised. A standards body outranks any SaaS blog on this.',
  },
  {
    slug: 'openview-saas-benchmarks',
    name: 'Bessemer — State of the Cloud / SaaS benchmarks',
    url: 'https://www.bvp.com/atlas',
    kind: 'industry_benchmark',
    why: 'Published benchmark bands for NRR, churn and payback — a reference range, never a number we may claim as ours.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type FinnReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  /** Pricing guard is ACTIVE today; revenue metrics are BUILT AND ARMED. */
  pricingGuard: 'GREEN' | 'DRIFT' | 'NOT_CHECKED'
  /** Why the guard reached that verdict — an abstention with no stated cause is barely better than a false green. */
  pricingGuardReason: string
  /**
   * Where the compared claims came from. `live-source` locally and in CI; `build-snapshot` in the
   * serverless bundle; `none` if neither is available, which forces NOT_CHECKED.
   */
  claimSource: 'live-source' | 'build-snapshot' | 'none'
  stripe: StripeTruth
  claims: PriceClaim[]
  incidents: Incident[]
  gaps: string[]
  revenue: RevenuePack
  lessonsWritten: number
  /** Kept for ea.ts, which reads finance.customers. Real, from Stripe — never a constant. */
  customers: number
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export async function runFinnAgent(
  opts: {
    sql?: any
    root?: string
    skipCurrency?: boolean
    /**
     * Injectable Stripe truth. Exists so a test can reproduce the PRODUCTION condition exactly —
     * Stripe reachable AND repository sources absent — which is the state that produced the false
     * GREEN. Without it a test environment lacking STRIPE_SECRET_KEY abstains via the dependency
     * path instead, which is correct behaviour but a different code path from the one that shipped.
     */
    stripeOverride?: StripeTruth
    /**
     * Injectable claim snapshot. Defaults to the build-time artifact. Exists so a test can simulate
     * the one state where the LAW still governs — no readable sources AND no snapshot — which is
     * otherwise unreachable now that the snapshot is statically bundled.
     */
    snapshotOverride?: PriceClaim[]
  } = {},
): Promise<FinnReport> {
  const sql = opts.sql ?? getSql()
  const root = opts.root ?? process.cwd()

  const stripe = opts.stripeOverride ?? (await readStripeTruth())

  const files: SourceFile[] = PRICE_CLAIM_SURFACES.map((p) => readSource(p, root))
  const liveClaims = files.flatMap((f) => (f.text === null ? [] : extractPriceClaims(f.relPath, f.text)))
  const unreadable = files.filter((f) => f.text === null).map((f) => `source:${f.relPath}`)

  // THE TWO CLOCKS. Copy changes at commit time; a Stripe price changes in the dashboard at any
  // time, with no commit to trigger CI. Reading live sources is better when they exist (local, CI),
  // but in the serverless bundle they do not — so the build-time snapshot supplies the claims and
  // prod still compares them against LIVE Stripe every day. Without this, dashboard-side drift is
  // invisible to both CI and prod.
  const snapshotClaims: PriceClaim[] = opts.snapshotOverride ??
    (priceClaimSnapshot.claims as { file: string; plan: string; amountUsd: number; context: string }[])
      .map((c) => ({ file: c.file, plan: c.plan as StripePlan, amountUsd: c.amountUsd, context: c.context }))
  const usingSnapshot = liveClaims.length === 0 && snapshotClaims.length > 0
  const claims: PriceClaim[] = usingSnapshot ? snapshotClaims : liveClaims
  const claimSource: 'live-source' | 'build-snapshot' | 'none' =
    liveClaims.length ? 'live-source' : usingSnapshot ? 'build-snapshot' : 'none'

  const incidents = auditPriceClaims(claims, stripe.monthlyUsd, stripe.checked)
  // Coverage gaps over an EMPTY claim set are an artifact of not scanning, not a finding. Same law
  // as the guard verdict: nothing examined, nothing to conclude.
  const gaps = stripe.checked && claims.length > 0 ? coverageGaps(claims, stripe.monthlyUsd) : []
  const lessonsWritten = await writeFinnLessons(sql, incidents).catch(() => 0)

  let dbCustomers: number | null = null
  try {
    const r = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads WHERE pipeline_stage='customer'`) as any[]
    dbCustomers = Number(r[0]?.n ?? 0)
  } catch { dbCustomers = null }

  const revenue = buildRevenuePack(stripe, dbCustomers)

  const notChecked = [...unreadable, ...(stripe.checked ? [] : ['stripe'])]

  // PS-SCAN-VERDICT-01. The units are PRICE CLAIMS ACTUALLY VERIFIED, not surfaces we meant to read.
  // The shipped version asked `!stripe.checked ? NOT_CHECKED : ...`, which mistook the reachability
  // of a dependency for evidence that the check ran — and on the serverless bundle, where no .ts
  // source exists, it reported "GREEN — all 0 claim(s) match live Stripe" having verified nothing.
  // GREEN now requires at least one claim genuinely compared against a live Stripe price.
  const guardScan = { unitsScanned: claims.length, findings: incidents.length, pass: 'GREEN' as const, fail: 'DRIFT' as const, dependencyAvailable: stripe.checked }
  const pricingGuard: FinnReport['pricingGuard'] = scanVerdict(guardScan)
  const pricingGuardReason = scanVerdictReason(guardScan, 'Pricing guard')

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('finn', 'SaaS revenue metrics, pricing discipline and unit economics', FINN_SOURCES, sql).catch(() => null)

  const status: FinnReport['status'] = stripe.checked || claims.length > 0 ? 'ACTIVE' : 'INSUFFICIENT_DATA'
  const line = buildFinnLine({ status, pricingGuard, stripe, claims, incidents, gaps, revenue, notChecked, claimSource })

  return {
    status, pricingGuard, pricingGuardReason, claimSource, stripe, claims, incidents, gaps, revenue, lessonsWritten,
    customers: stripe.checked ? stripe.activeSubs : 0,
    notChecked, currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildFinnLine(a: {
  status: FinnReport['status']
  pricingGuard: FinnReport['pricingGuard']
  stripe: StripeTruth
  claims: PriceClaim[]
  incidents: Incident[]
  gaps: string[]
  revenue: RevenuePack
  notChecked: string[]
  claimSource?: FinnReport['claimSource']
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return 'Finn (CFO): insufficient data — Stripe unreachable and no price surface readable. No revenue or pricing claim is possible. Playbook built and armed.'
  }
  const guard =
    a.pricingGuard === 'NOT_CHECKED'
      ? `pricing guard NOT CHECKED — ${a.claims.length === 0
          ? 'ZERO price claims were readable (serverless bundles ship no .ts sources), so nothing was verified'
          : a.stripe.reason} — no drift verdict this cycle, and an empty scan is NOT a clean one`
      : a.pricingGuard === 'GREEN'
        ? `pricing guard GREEN — all ${a.claims.length} plan-price claim(s) across ${new Set(a.claims.map((c) => c.file)).size} surface(s) match live Stripe` +
          (a.claimSource === 'build-snapshot' ? ' (claims from the build-time snapshot; Stripe read live just now)' : '')
        : `pricing guard RED — ${a.incidents.length} claim(s) contradict live Stripe: ${a.incidents.map((i) => i.subject).join(', ')}`
  const gaps = a.gaps.length ? ` · ${a.gaps.join('; ')}` : ''
  const nc = a.notChecked.length ? ` · NOT CHECKED: ${a.notChecked.join(', ')}` : ''
  return `Finn (CFO): ${a.revenue.lines.join(' · ')} · ${guard}${gaps}${nc} Pricing is a HARD STOP — Finn flags drift and never edits a price.`
}

/**
 * The ONE way MRR is rendered to a human, used by every surface that shows it.
 *
 * A null report or an unreachable Stripe renders "NOT CHECKED", never "$0" — those are different
 * facts. "$0" means we asked Stripe and nobody is paying; "NOT CHECKED" means we did not ask. The
 * ghost blurred exactly this line by computing a number when it had none.
 */
export function mrrDisplay(r: FinnReport | null): string {
  if (!r || !r.stripe.checked) return 'MRR NOT CHECKED (Stripe unreachable — no revenue figure may be quoted)'
  return `MRR $${r.stripe.mrrUsd.toFixed(2)} · ${r.stripe.activeSubs} paying (live Stripe)`
}

/** GET /api/os/finn — 06:40 UTC, after the rest of the org has reported. */
export async function cronFinn(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await runFinnAgent()) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
