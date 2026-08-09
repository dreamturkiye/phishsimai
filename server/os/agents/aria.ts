// ─────────────────────────────────────────────────────────────────────────────
//  PS-ARIA-01 — Aria, VP Marketing. Replaces the marketing.ts ghost.
//
//  WHAT THE GHOST WAS
//    server/os/agents/marketing.ts returned a hardcoded object and wrote it to memory at confidence
//    0.85 as if measured. Its `activeExperiment` claimed "T1 subject A/B: compliance-urgency vs
//    discovery question" — false three separate ways: the experiment is active:false, it has no test
//    arm at all, and the copy has been price-led since PS-COPY-PRICE-01. Janet quoted that line in
//    the 08:00 standup every morning. Rex flagged it critical; Aria is the replacement, and the
//    ghost is deleted in the same change so there are never two answers.
//
//  ARIA'S ONE NON-NEGOTIABLE: SHE MAY NOT TOUCH PRICE
//    Per spec this is a HARD STOP, not a guardrail she weighs. She may not alter pricing, create a
//    pricing campaign, or auto-apply copy that is price-adjacent. Copy changes to non-price surfaces
//    may auto-apply within guardrails; anything touching a number a customer pays goes to Kaan.
//    screenCopyChange() is that stop, and it is a pure function so it can be exhaustively tested.
//
//  THE DOCTRINE SHE HOLDS, AND WHY IT IS NOT JUST A PROMPT
//    "Lead with price, 10-minute setup, free trial. Never lead with insurance/compliance."
//    That is not taste — it is 908 measured sends producing 1 reply, and the reply was hostile. It
//    already lives in os_agent_lessons as phishsim:insurance-angle-failed, which survives prompt
//    rewrites. Aria reads it rather than restating it, so there is one copy of the fact.
//
//  ANTI-FABRICATION, THE SHAPE IT TAKES HERE
//    With 0 replies from 933 external sends, Aria's honest output is "0/933, no reply signal yet".
//    NOT "reply rate 0%" as though a message were being judged, and never an invented experiment.
//    A marketing agent with no outcomes reports channel and cost — the things that ARE measurable —
//    and says plainly that message performance is unmeasured.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { AB_EXPERIMENTS, TOUCH1_SUBJECT, TOUCH2_SUBJECT } from '../abTest'
import { withHealth } from './withHealth'; import { type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

/** Rate/kill rules. Both must hold before a variant may be judged. */
export const MIN_N = 30
export const KILL_WINDOW_DAYS = 7

/** Rex owns this predicate; Aria applies it to every number she reports. */
const EXCLUSION = `
      AND l.pipeline_stage <> 'internal_test'
      AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
      AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'`

// ─── THE HARD STOP ───────────────────────────────────────────────────────────

/**
 * Price-adjacency screen. Deliberately BROAD: a false positive costs one copy change routed to Kaan,
 * a false negative is an agent editing what a customer pays.
 *
 * Matches the numerals too ($299, 60¢, "per seat"), because the dangerous edit is rarely the word
 * "pricing" — it is a body that quietly says $249 where Stripe says $299.
 */
const PRICE_ADJACENT_RE =
  /(\$\s?\d|\d+\s?¢|\bcents?\b|\bpric(e|ing|es)\b|\bdiscount\b|\bcoupon\b|\bpromo\b|\bfree (month|trial extension)\b|\bper[- ]seat\b|\bper[- ]user\b|\bmo\b\/|\/mo\b|\bmonthly (rate|cost|fee)\b|\btier\b|\bplan (cost|price)\b|\bfounding rate\b|\bstarter\b|\bgrowth\b|\bpro\b|\benterprise\b)/i

export type CopyVerdict = { autoApply: boolean; reason: string }

/**
 * May Aria apply this copy change herself, or must it go to Kaan?
 *
 * Returns a verdict rather than throwing: a refused change is still a legitimate PROPOSAL for a
 * human, and swallowing it would lose the work. What she may never do is apply it.
 */
export function screenCopyChange(surface: string, newCopy: string): CopyVerdict {
  const text = `${surface}\n${newCopy}`
  if (PRICE_ADJACENT_RE.test(text)) {
    return {
      autoApply: false,
      reason:
        'PRICE-ADJACENT — hard stop. Aria may not alter pricing or price-bearing copy under any ' +
        'autonomy level. Surfaced to Kaan as a proposal.',
    }
  }
  return { autoApply: true, reason: 'non-price surface, within guardrails' }
}

// ─── CURRENT BEST OUTREACH — the single source of truth ──────────────────────

export type BestOutreach = {
  touch1Subject: string
  touch2Subject: string
  angle: string
  forbiddenAngle: string
  evidence: string
}

/**
 * What Mason sends and Janet quotes. Read from abTest.ts, NOT restated here — a second copy of the
 * subject line is a second thing to drift. This is the "single source of truth for current best
 * outreach" the spec assigns to Aria, and it is a pointer, not a duplicate.
 */
export function currentBestOutreach(): BestOutreach {
  return {
    touch1Subject: TOUCH1_SUBJECT,
    touch2Subject: TOUCH2_SUBJECT,
    angle: 'price-led: 60¢/user, $299/mo for 500, 10-minute setup, 30-day no-card trial, MSP margin',
    forbiddenAngle: 'insurance / compliance / breach-fear as an OPENER',
    evidence:
      '908 compliance-led cold sends produced 1 human reply and it was hostile. Recorded permanently ' +
      'as lesson phishsim:insurance-angle-failed. Compliance remains a second-position supporting ' +
      'point for larger MSPs, never the lead.',
  }
}

// ─── CHANNEL PERFORMANCE ─────────────────────────────────────────────────────

export type ChannelRow = {
  source: string
  leads: number
  contacted: number
  replied: number
  bounced: number
  trials: number
  /** Sends from this source that went through the CURRENT sanitization pipeline. */
  currentContacted: number
  currentBounced: number
  /**
   * A source with zero current-pipeline sends is HISTORICAL — it fed the replaced pipeline and
   * feeds nothing now. Derived from the data, never from a hardcoded list, so a source that resumes
   * becomes live again on its own.
   */
  historical: boolean
  bounceLine: string
  replyLine: string
}

/** Integer over denominator. No percentage below n=30, at any point, for any metric. */
export function ratio(label: string, num: number, den: number): string {
  if (den === 0) return `${label} 0/0 (N/A, n=0)`
  if (den < MIN_N) return `${label} ${num}/${den} (counts only, n<${MIN_N})`
  return `${label} ${num}/${den} (${((num / den) * 100).toFixed(1)}%)`
}

export async function measureChannels(sql: any): Promise<{ rows: ChannelRow[]; checked: boolean }> {
  try {
    const r = (await sql.query(`
      SELECT COALESCE(l.source,'(unknown)') AS source,
             count(*)::int AS leads,
             count(*) FILTER (WHERE l.touch1_sent_at IS NOT NULL)::int AS contacted,
             count(*) FILTER (WHERE l.replied)::int AS replied,
             count(*) FILTER (WHERE l.bounced)::int AS bounced,
             count(*) FILTER (WHERE l.trial_at IS NOT NULL)::int AS trials,
             count(*) FILTER (WHERE l.touch1_sent_at IS NOT NULL AND l.sanitized_at IS NOT NULL)::int AS current_contacted,
             count(*) FILTER (WHERE l.bounced AND l.sanitized_at IS NOT NULL)::int AS current_bounced
      FROM ps_outreach_leads l
      WHERE 1=1 ${EXCLUSION}
      GROUP BY 1
      ORDER BY contacted DESC`)) as any[]

    const rows: ChannelRow[] = r.map((x) => {
      const contacted = Number(x.contacted)
      const currentContacted = Number(x.current_contacted)
      const currentBounced = Number(x.current_bounced)
      const historical = contacted > 0 && currentContacted === 0
      return {
        source: String(x.source),
        leads: Number(x.leads),
        contacted,
        replied: Number(x.replied),
        bounced: Number(x.bounced),
        trials: Number(x.trials),
        currentContacted,
        currentBounced,
        historical,
        // A historical source is reported on its own terms; its rate is not the current pipeline's.
        bounceLine: historical
          ? `${ratio('bounce', Number(x.bounced), contacted)} [HISTORICAL — pre-pipeline-replacement, no longer feeding]`
          : ratio('bounce', currentBounced, currentContacted),
        replyLine: ratio('reply', Number(x.replied), contacted),
      }
    })
    return { rows, checked: true }
  } catch {
    return { rows: [], checked: false }
  }
}

/**
 * A channel whose bounce rate is so high the list itself is the problem.
 *
 * Only judged at n>=30 — below that a couple of dead mailboxes look like a catastrophe. The
 * threshold is deliberately well above Dex's overall breaker: this is not "our sending is unhealthy",
 * it is "this SOURCE is feeding us addresses that do not exist", which is a different decision
 * (stop using the source) with a different owner (Aria, channel economics).
 */
export const CHANNEL_BOUNCE_ALARM = 0.15

/**
 * PS-COHORT-01 — a HISTORICAL source may never raise an alarm.
 *
 * lead_researcher bounced 20/43 (46.5%), which is genuinely terrible and genuinely OVER. That
 * source fed the replaced pipeline and has sent nothing since 2026-07-13. Alarming on it every run
 * would be an agent demanding action on a system that no longer exists — noise that trains a human
 * to ignore the channel alarm, which is how the real one gets missed.
 *
 * The judgement is made on the CURRENT-pipeline sends only, so a source is judged on what it is
 * doing now, not on what a replaced pipeline did with it.
 */
export function channelIncidents(rows: ChannelRow[]): Incident[] {
  const out: Incident[] = []
  for (const c of rows) {
    if (c.historical) continue // dead source — reported as history, never as an alarm
    if (c.currentContacted < MIN_N) continue
    const rate = c.currentBounced / c.currentContacted
    if (rate < CHANNEL_BOUNCE_ALARM) continue
    out.push({
      detector: 'blind_gate',
      severity: (rate >= 0.3 ? 'critical' : 'high') as Severity,
      subject: `channel:${c.source}`,
      summary:
        `Lead source "${c.source}" is bouncing at ${c.currentBounced}/${c.currentContacted} ` +
        `(${((rate) * 100).toFixed(1)}%) on CURRENT-pipeline sends — far above the ${(CHANNEL_BOUNCE_ALARM * 100).toFixed(0)}% ` +
        `channel alarm. This is a LIST QUALITY problem, not a sending problem: the source is ` +
        `supplying addresses that do not exist, and every send against it costs domain reputation ` +
        `for zero chance of a reply.`,
      evidence: { source: c.source, currentContacted: c.currentContacted, currentBounced: c.currentBounced, rate: Number(rate.toFixed(4)), alarm: CHANNEL_BOUNCE_ALARM, cohort: 'current' },
      signature: `channel_bounce:${c.source}`,
    })
  }
  return out
}

// ─── EXPERIMENT INTEGRITY + THE KILL RULE ────────────────────────────────────

export type ExperimentState = {
  key: string
  active: boolean
  hasTestArm: boolean
  variants: { variant: string; sent: number; outcomes: number }[]
  verdict: string
}

/**
 * Audit what the experiment table actually says against what the code actually sends.
 *
 * TWO DEFECTS THIS FINDS, both real on 2026-08-03:
 *
 *   1. MISLABELLED IMPRESSIONS. getVariant() hashes every lead into 'control' or 'test' and
 *      recordImpression() writes that label — but sequences.ts sends `exp.control` whenever the
 *      experiment is inactive or has no test arm. So 413 rows are labelled variant='test' while
 *      every one of those leads received the CONTROL copy. Any later analysis compares control
 *      against control and attributes the difference to a variant that never existed. This is
 *      fabricated experiment data produced by correct-looking code.
 *
 *   2. NO OUTCOME EVENTS. The table holds only 'sent' rows. An experiment that records impressions
 *      and never records a reply/trial cannot be judged at any sample size — it is not an
 *      experiment, it is a counter. Reporting it as "running" is the ghost problem in miniature.
 */
export async function auditExperiments(sql: any): Promise<{ states: ExperimentState[]; incidents: Incident[]; checked: boolean }> {
  let rows: any[] = []
  try {
    rows = (await sql`SELECT experiment_key, variant, event, count(*)::int AS n
                      FROM ab_impressions GROUP BY 1,2,3`) as any[]
  } catch {
    return { states: [], incidents: [], checked: false }
  }

  const states: ExperimentState[] = []
  const incidents: Incident[] = []

  const keys = new Set<string>([...Object.keys(AB_EXPERIMENTS), ...rows.map((r) => String(r.experiment_key))])

  for (const key of keys) {
    const cfg = AB_EXPERIMENTS[key]
    const mine = rows.filter((r) => String(r.experiment_key) === key)
    const byVariant = new Map<string, { sent: number; outcomes: number }>()
    for (const r of mine) {
      const v = String(r.variant)
      const cur = byVariant.get(v) ?? { sent: 0, outcomes: 0 }
      if (String(r.event) === 'sent') cur.sent += Number(r.n)
      else cur.outcomes += Number(r.n)
      byVariant.set(v, cur)
    }
    const variants = [...byVariant.entries()].map(([variant, v]) => ({ variant, ...v }))
    const hasTestArm = !!cfg?.test
    const active = !!cfg?.active
    const totalOutcomes = variants.reduce((a, v) => a + v.outcomes, 0)
    const phantom = variants.find((v) => v.variant === 'test' && v.sent > 0)

    // DEFECT 1 — impressions labelled with a variant that was never sent.
    if (phantom && !hasTestArm) {
      incidents.push({
        detector: 'fabricated_writer',
        severity: 'critical',
        subject: `experiment:${key}`,
        summary:
          `${phantom.sent} impression(s) are recorded as variant='test' for experiment "${key}", but ` +
          `the experiment has NO test arm (active=${active}) — sequences.ts falls back to control for ` +
          `every send. Those ${phantom.sent} leads received CONTROL copy while the data says otherwise. ` +
          `Any analysis of this experiment compares control against control and credits a variant that ` +
          `never existed.`,
        evidence: { experiment: key, active, hasTestArm, mislabelledSent: phantom.sent, variants },
        signature: `experiment_mislabelled:${key}`,
      })
    }

    // DEFECT 2 — an experiment that cannot ever be judged.
    if (variants.some((v) => v.sent > 0) && totalOutcomes === 0) {
      incidents.push({
        detector: 'blind_gate',
        severity: 'high',
        subject: `experiment:${key}`,
        summary:
          `Experiment "${key}" has recorded ${variants.reduce((a, v) => a + v.sent, 0)} impression(s) and ` +
          `ZERO outcome events. With no outcome writer it can never be judged at any sample size — it ` +
          `is a counter, not an experiment. Read surface with no live writer, in experiment form.`,
        evidence: { experiment: key, sent: variants.map((v) => `${v.variant}=${v.sent}`), outcomes: 0 },
        signature: `experiment_no_outcomes:${key}`,
      })
    }

    states.push({
      key,
      active,
      hasTestArm,
      variants,
      verdict: experimentVerdict({ active, hasTestArm, variants, totalOutcomes }),
    })
  }

  return { states, incidents, checked: true }
}

/** The kill rule, stated honestly. A variant is only judged with outcomes AND n>=30. */
export function experimentVerdict(a: {
  active: boolean
  hasTestArm: boolean
  variants: { variant: string; sent: number; outcomes: number }[]
  totalOutcomes: number
}): string {
  const sent = a.variants.reduce((x, v) => x + v.sent, 0)
  if (!a.active && !a.hasTestArm) {
    return `NOT RUNNING — no test arm, control-only. ${sent} send(s) all received control copy.`
  }
  if (a.totalOutcomes === 0) return `UNJUDGEABLE — ${sent} impression(s), 0 outcomes recorded.`
  if (sent < MIN_N) return `TOO EARLY — ${sent} send(s), below n=${MIN_N}.`
  return `JUDGEABLE — ${sent} sends, ${a.totalOutcomes} outcomes; apply the ${KILL_WINDOW_DAYS}-day / n>=${MIN_N} kill rule.`
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeAriaLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:aria:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    const lesson =
      `ARIA MARKETING LESSON (${i.detector}, ${i.severity}). SUBJECT: ${i.subject}. ` +
      `FINDING: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)}. ` +
      `RULE: a channel or experiment in this state must not be quoted as performance until it is fixed.`
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'aria', 'marketing_finding', ${signature}, ${lesson}, false, 0, -0.2)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const ARIA_SOURCES: readonly TrustedSource[] = [
  {
    // The first URL used here 404'd on every run. The loop reported it NOT CHECKED honestly rather
    // than inventing a benchmark — correct behaviour — but a source that is permanently unreachable
    // is a permanently blind row, so it was replaced with a URL verified to return 200.
    slug: 'hubspot-marketing-statistics',
    name: 'HubSpot — marketing statistics',
    url: 'https://www.hubspot.com/marketing-statistics',
    kind: 'practitioner',
    why: 'Large published B2B benchmark set; a reference BAND for reply rates, never a target we may claim as ours.',
  },
  {
    slug: 'mailchimp-email-benchmarks',
    name: 'Mailchimp — email marketing benchmarks by industry',
    url: 'https://mailchimp.com/resources/email-marketing-benchmarks/',
    kind: 'vendor_doc',
    why: 'Per-industry open/click bands measured over a very large send corpus; useful for sanity-checking our own numbers.',
  },
  {
    slug: 'gong-labs-outbound',
    name: 'Gong Labs — outbound and messaging research',
    url: 'https://www.gong.io/blog/',
    kind: 'practitioner',
    why: 'Publishes analysis over large real sales-conversation corpora rather than opinion posts.',
  },
  {
    slug: 'litmus-email-design',
    name: 'Litmus — email rendering and engagement research',
    url: 'https://www.litmus.com/blog',
    kind: 'vendor_doc',
    why: 'Authoritative on how a message actually renders across clients, which is upstream of any copy result.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type AriaReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  best: BestOutreach
  channels: ChannelRow[]
  experiments: ExperimentState[]
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  lessonsWritten: number
  totals: { contacted: number; replied: number; bounced: number; trials: number }
  messagePerformance: string
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export async function runAriaAgent(opts: { sql?: any; skipCurrency?: boolean } = {}): Promise<AriaReport> {
  const sql = opts.sql ?? getSql()

  const ch = await measureChannels(sql)
  const ex = await auditExperiments(sql)

  const totals = ch.rows.reduce(
    (a, c) => ({ contacted: a.contacted + c.contacted, replied: a.replied + c.replied, bounced: a.bounced + c.bounced, trials: a.trials + c.trials }),
    { contacted: 0, replied: 0, bounced: 0, trials: 0 },
  )

  const incidents = [...channelIncidents(ch.rows), ...ex.incidents]
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0 }
  for (const i of incidents) bySeverity[i.severity]++

  const lessonsWritten = await writeAriaLessons(sql, incidents).catch(() => 0)

  const notChecked = [...(ch.checked ? [] : ['channels']), ...(ex.checked ? [] : ['experiments'])]

  // ANTI-FABRICATION: this is the sentence that must never become "reply rate 0%".
  const messagePerformance =
    totals.contacted === 0
      ? 'Message performance: NOT MEASURABLE — 0 external sends.'
      : totals.replied === 0
        ? `Message performance: UNMEASURED — ${totals.replied}/${totals.contacted} external replies. ` +
          `With zero replies there is no signal to attribute to any message, so no copy is "winning" ` +
          `and none is "losing". The constraint is not yet known to be the copy.`
        : ratio('Reply', totals.replied, totals.contacted)

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('aria', 'B2B outbound messaging, channel economics and demand generation', ARIA_SOURCES, sql).catch(() => null)

  const status: AriaReport['status'] = ch.checked || ex.checked ? 'ACTIVE' : 'INSUFFICIENT_DATA'
  const line = buildAriaLine({ status, totals, incidents, bySeverity, channels: ch.rows, messagePerformance, notChecked })

  return {
    status,
    best: currentBestOutreach(),
    channels: ch.rows,
    experiments: ex.states,
    incidents,
    bySeverity,
    lessonsWritten,
    totals,
    messagePerformance,
    notChecked,
    currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildAriaLine(a: {
  status: AriaReport['status']
  totals: { contacted: number; replied: number; bounced: number; trials: number }
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  channels: ChannelRow[]
  messagePerformance: string
  notChecked: string[]
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return (
      'Aria (Marketing): insufficient data — channel and experiment tables both unreadable this run. ' +
      'No performance claim is possible. Playbook built and armed.'
    )
  }
  const nc = a.notChecked.length ? ` · NOT CHECKED: ${a.notChecked.join(', ')}` : ''
  const worst = a.incidents.filter((i) => i.severity === 'critical' || i.severity === 'high').slice(0, 3).map((i) => i.subject)
  const defects = a.incidents.length ? ` · ${a.incidents.length} defect(s) (${a.bySeverity.critical} critical): ${worst.join(', ')}` : ''
  const live = a.channels.filter((c) => !c.historical)
  const hist = a.channels.filter((c) => c.historical)
  const best = live.filter((c) => c.currentContacted >= MIN_N).sort((x, y) => x.currentBounced / x.currentContacted - y.currentBounced / y.currentContacted)[0]
  const bestLine = best ? ` · cleanest live channel: ${best.source} (${best.bounceLine})` : ''
  const histLine = hist.length ? ` · ${hist.length} historical source(s) excluded from alarms: ${hist.map((h) => h.source).join(', ')}` : ''
  return (
    `Aria (Marketing): ${a.totals.contacted} external sends across ${live.length} live channel(s)${histLine}, ` +
    `${a.totals.trials} trial(s). ${a.messagePerformance}${bestLine}${defects}${nc} ` +
    `Current angle: price-led. Pricing is a HARD STOP — Aria proposes, never edits.`
  )
}

/** GET /api/os/aria — daily at 06:10 UTC, after Rex/Dex certify the data she reasons on. */
export async function cronAria(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await withHealth('aria', () => runAriaAgent())) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
