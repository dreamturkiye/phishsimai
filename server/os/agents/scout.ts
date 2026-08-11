// ─────────────────────────────────────────────────────────────────────────────
//  PS-SCOUT-01 — Scout, VP Market Intelligence. Replaces the research.ts ghost.
//
//  WHAT THE GHOST WAS
//    server/os/agents/research.ts returned four hardcoded competitor strings and wrote them to
//    memory at confidence 0.9 — INCLUDING DOLLAR FIGURES ("KnowBe4: enterprise $30+/user/yr",
//    "Proofpoint: $50K+ contracts"). Those numbers came from a developer's memory, not a fetch, and
//    Janet quoted them. That is precisely the failure competitorIntel.ts was built to prevent, sitting
//    in the same repo, feeding the same standup. Deleted here, unwired from both standup paths.
//
//  SCOUT'S FIRST LAW: NEVER STATE A COMPETITOR FACT THAT A FETCH DID NOT WRITE.
//    If os_competitor_intel has no verified row for a competitor, Scout says NOT CHECKED. He does not
//    fall back on the model's recollection, and he has no hardcoded competitor facts anywhere in this
//    file to fall back TO — a test asserts no dollar figure appears in his source.
//
//  DATA-SIDE ONLY (spec guardrail)
//    Scout never edits outreach copy — that is Aria's, and he has no write path to it. A fetched
//    competitor price that contradicts a claim we make is surfaced to Kaan as a DECISION, per the
//    competitor-pricing-study lesson. He never resolves that himself and never proposes a price.
//
//  ICP IS A LIVE DEFINITION, NOT A PARAGRAPH
//    The ghost's "highest LTV ICP" sentence was untestable prose. Scout's ICP is a set of segment
//    predicates scored against ACTUAL conversion, so "our targeting is right" becomes a claim with a
//    denominator. With zero replies and zero trials that claim is currently UNMEASURED, and he says
//    so rather than asserting the segment he likes best is winning.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { withHealth } from './withHealth'; import { COMPETITORS } from '../competitorIntel'
import { INTERNAL_EXCLUSION_SQL, type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

/** No rate below this denominator. House rule. */
export const MIN_N = 30
/** A capture older than this is stale intel — reported as such, never quoted as current. */
export const INTEL_STALE_DAYS = 14

// ─── ICP: PREDICATES, NOT PROSE ──────────────────────────────────────────────

export type Segment = {
  key: string
  label: string
  /** SQL predicate over ps_outreach_leads aliased `l`. */
  predicate: string
  /** Why this segment is believed to matter. Stated so it can be argued with and disproven. */
  thesis: string
}

/**
 * The live ICP, as segments that can be SCORED. Each is a predicate over data we actually hold.
 *
 * Deliberately built from columns that exist (source, country, industry) rather than the columns we
 * wish existed (seat count, MSP-vs-direct). An ICP defined over fields nobody populates is the
 * read-surface-with-no-writer problem wearing a strategy hat.
 */
export const SEGMENTS: Segment[] = [
  {
    key: 'msp_directory',
    label: 'MSP directory-sourced',
    predicate: `l.source IN ('msp_csv_import','mymsphub')`,
    thesis: 'Verified MSP listings — the ICP the whole price-led pitch is written for (1 MSP = many end customers).',
  },
  {
    key: 'maps_local_it',
    label: 'Local IT / MSP via Maps',
    predicate: `l.source = 'google_maps'`,
    thesis: 'Geographically-discovered IT providers. Higher volume, unverified MSP status — the segment most likely to drift off-ICP.',
  },
  {
    key: 'us',
    label: 'United States',
    predicate: `l.country = 'US'`,
    thesis: 'Largest addressable MSP market and the one the copy is written for.',
  },
  {
    key: 'non_us',
    label: 'Outside the US',
    predicate: `l.country IS NOT NULL AND l.country <> 'US'`,
    thesis: 'Allowlisted non-US geos. Tracked separately because pricing in USD and US-centric framing may convert differently.',
  },
]

export type SegmentScore = {
  key: string
  label: string
  contacted: number
  replied: number
  trials: number
  customers: number
  replyLine: string
  trialLine: string
  /** null until there is enough data to judge — never a guess dressed as a score. */
  icpScore: number | null
  verdict: string
}

export function segmentLine(label: string, num: number, den: number): string {
  if (den === 0) return `${label} 0/0 (N/A, n=0)`
  if (den < MIN_N) return `${label} ${num}/${den} (counts only, n<${MIN_N})`
  return `${label} ${num}/${den} (${((num / den) * 100).toFixed(1)}%)`
}

/**
 * Score a segment against ACTUAL conversion.
 *
 * Returns icpScore=null whenever the denominator is too small OR there are no outcomes at all. That
 * null is the honest answer today: 933 contacted, 0 replied. A scoring function that returned 0 for
 * every segment would rank them, and a ranking over zero signal is an invented preference.
 */
export function scoreSegment(s: Segment, row: { contacted: number; replied: number; trials: number; customers: number }): SegmentScore {
  const { contacted, replied, trials, customers } = row
  const enough = contacted >= MIN_N
  const anyOutcome = replied > 0 || trials > 0 || customers > 0

  let icpScore: number | null = null
  let verdict: string
  if (!enough) {
    verdict = `UNSCORED — ${contacted} contacted, below n=${MIN_N}.`
  } else if (!anyOutcome) {
    verdict = `UNMEASURED — ${contacted} contacted, 0 outcomes. No segment can be called better than another on zero signal.`
  } else {
    // Weighted toward the outcome that actually pays. Only computed once something has happened.
    icpScore = Number((((replied * 1 + trials * 5 + customers * 20) / contacted) * 100).toFixed(2))
    verdict = `SCORED ${icpScore} (reply x1 + trial x5 + paid x20, per 100 contacted).`
  }

  return {
    key: s.key,
    label: s.label,
    contacted, replied, trials, customers,
    replyLine: segmentLine('reply', replied, contacted),
    trialLine: segmentLine('trial', trials, contacted),
    icpScore,
    verdict,
  }
}

export async function scoreSegments(sql: any, segments = SEGMENTS): Promise<{ scores: SegmentScore[]; checked: boolean }> {
  const scores: SegmentScore[] = []
  try {
    for (const s of segments) {
      const r = (await sql.query(`
        SELECT count(*) FILTER (WHERE l.touch1_sent_at IS NOT NULL)::int AS contacted,
               count(*) FILTER (WHERE l.replied)::int AS replied,
               count(*) FILTER (WHERE l.trial_at IS NOT NULL)::int AS trials,
               count(*) FILTER (WHERE l.pipeline_stage='customer')::int AS customers
        FROM ps_outreach_leads l
        WHERE ${s.predicate} ${INTERNAL_EXCLUSION_SQL}`)) as any[]
      scores.push(scoreSegment(s, {
        contacted: Number(r[0]?.contacted ?? 0),
        replied: Number(r[0]?.replied ?? 0),
        trials: Number(r[0]?.trials ?? 0),
        customers: Number(r[0]?.customers ?? 0),
      }))
    }
    return { scores, checked: true }
  } catch {
    return { scores: [], checked: false }
  }
}

// ─── DISQUALIFICATION RULES ──────────────────────────────────────────────────

export type DisqualRule = { key: string; why: string; predicate: string }

/**
 * Who we should NOT be contacting. Enforced as counts Scout reports, not as deletions he performs —
 * retiring leads is Mason's gated action, and two agents writing the same rows is how state races.
 */
export const DISQUALIFY: DisqualRule[] = [
  {
    key: 'free_mailbox',
    why: 'A consumer mailbox is not an MSP buyer — it is almost always a mis-parsed listing.',
    predicate: `lower(split_part(l.email,'@',2)) IN ('gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com')`,
  },
  {
    key: 'role_address',
    why: 'Role addresses (info@, sales@) reach a shared inbox, not a decision-maker. Low intent, high complaint risk.',
    predicate: `split_part(lower(l.email),'@',1) IN ('info','sales','contact','admin','support','hello','office','enquiries','inquiries')`,
  },
  {
    key: 'no_country',
    why: 'Country is the send allowlist key. A lead without one cannot be geo-gated and must not be sequenced.',
    predicate: `l.country IS NULL`,
  },
]

export type DisqualCount = { key: string; why: string; total: number; stillActive: number }

export async function countDisqualified(sql: any, rules = DISQUALIFY): Promise<{ counts: DisqualCount[]; checked: boolean }> {
  const counts: DisqualCount[] = []
  try {
    for (const r of rules) {
      const q = (await sql.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE l.pipeline_stage NOT IN ('dead','customer','internal_test'))::int AS still_active
        FROM ps_outreach_leads l WHERE ${r.predicate} ${INTERNAL_EXCLUSION_SQL}`)) as any[]
      counts.push({ key: r.key, why: r.why, total: Number(q[0]?.total ?? 0), stillActive: Number(q[0]?.still_active ?? 0) })
    }
    return { counts, checked: true }
  } catch {
    return { counts: [], checked: false }
  }
}

// ─── COMPETITOR INTEL STATE ──────────────────────────────────────────────────

export type IntelState = {
  checked: boolean
  configured: number
  withVerifiedRow: number
  notChecked: string[]
  staleDays: number | null
  facts: { competitor: string; headline_price: string | null; pricing_model: string | null; capturedAt: string }[]
  line: string
}

/**
 * What we can HONESTLY say about competitors right now.
 *
 * Reads only rows a fetch wrote. A competitor with no verified row is NOT CHECKED — Scout has no
 * fallback and states none.
 */
export async function readIntelState(sql: any): Promise<IntelState> {
  const configured = COMPETITORS.length
  try {
    const rows = (await sql.query(`
      SELECT DISTINCT ON (competitor) competitor, headline_price, pricing_model,
             captured_at::text AS captured_at,
             EXTRACT(EPOCH FROM (NOW() - captured_at))/86400 AS age_days
      FROM os_competitor_intel
      WHERE product_id='${COMPANY}' AND fetch_ok = true
      ORDER BY competitor, captured_at DESC`)) as any[]

    const have = new Set(rows.map((r) => String(r.competitor)))
    const notChecked = COMPETITORS.filter((c) => !have.has(c.slug)).map((c) => c.name)
    const staleDays = rows.length ? Math.floor(Math.max(...rows.map((r) => Number(r.age_days ?? 0)))) : null

    const facts = rows.map((r) => ({
      competitor: String(r.competitor),
      headline_price: r.headline_price ?? null,
      pricing_model: r.pricing_model ?? null,
      capturedAt: String(r.captured_at).slice(0, 10),
    }))

    return {
      checked: true,
      configured,
      withVerifiedRow: rows.length,
      notChecked,
      staleDays,
      facts,
      line: intelLine(configured, rows.length, notChecked, staleDays),
    }
  } catch {
    return { checked: false, configured, withVerifiedRow: 0, notChecked: COMPETITORS.map((c) => c.name), staleDays: null, facts: [], line: 'Competitor intel: NOT CHECKED (query failed).' }
  }
}

export function intelLine(configured: number, verified: number, notChecked: string[], staleDays: number | null): string {
  if (verified === 0) {
    return (
      `Competitor intel: 0/${configured} competitors have a verified capture — NOTHING may be stated ` +
      `about competitor pricing or features. NOT CHECKED: ${notChecked.join(', ')}. ` +
      `This is a read surface with no successful writer, not an absence of competition.`
    )
  }
  const stale = staleDays !== null && staleDays > INTEL_STALE_DAYS
    ? ` · OLDEST CAPTURE ${staleDays}d OLD — treat as stale, not current`
    : ''
  const nc = notChecked.length ? ` · NOT CHECKED: ${notChecked.join(', ')}` : ''
  return `Competitor intel: ${verified}/${configured} competitors have a verified capture${stale}${nc}.`
}

/**
 * A fetched competitor price that contradicts a claim we make.
 *
 * Surfaced to Kaan as a DECISION, never resolved by Scout — per the competitor-pricing-study lesson,
 * which says the fetched row wins over the founder's study and the COPY changes. That copy change is
 * Aria's to make and Kaan's to approve; Scout's job ends at putting the contradiction on the table.
 */
export const LOWEST_PRICE_CLAIM = 'one of the lowest per-seat prices in the industry'

export function contradictionIncidents(facts: IntelState['facts'], ourPerSeatUsd: number): Incident[] {
  const out: Incident[] = []
  for (const f of facts) {
    if (!f.headline_price) continue
    // Only a per-seat monthly figure is comparable to ours. Anything else is surfaced but not judged.
    const m = f.headline_price.match(/\$\s?(\d+(?:\.\d+)?)/)
    if (!m) continue
    const theirs = Number(m[1])
    if (!Number.isFinite(theirs) || theirs <= 0) continue
    if (theirs >= ourPerSeatUsd) continue
    out.push({
      detector: 'pricing_drift',
      severity: 'high' as Severity,
      subject: `competitor:${f.competitor}`,
      summary:
        `${f.competitor} shows a fetched headline price of ${f.headline_price} (captured ${f.capturedAt}), ` +
        `below our $${ourPerSeatUsd.toFixed(2)}/seat. This CONTRADICTS the claim "${LOWEST_PRICE_CLAIM}". ` +
        `Per the competitor-pricing-study lesson the fetched row wins and the COPY changes — that is a ` +
        `decision for Kaan and a copy edit for Aria. Scout states the contradiction and stops.`,
      evidence: { competitor: f.competitor, theirHeadlinePrice: f.headline_price, ourPerSeatUsd, capturedAt: f.capturedAt, claim: LOWEST_PRICE_CLAIM },
      signature: `competitor_price_contradiction:${f.competitor}`,
    })
  }
  return out
}

// ─── LEARNING ────────────────────────────────────────────────────────────────

export async function writeScoutLessons(sql: any, incidents: Incident[]): Promise<number> {
  let n = 0
  for (const i of incidents) {
    const signature = `phishsim:scout:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'scout', 'market_intel', ${signature},
              ${`SCOUT MARKET-INTEL LESSON (${i.detector}, ${i.severity}). ${i.subject}: ${i.summary} EVIDENCE: ${JSON.stringify(i.evidence)}`},
              false, 0, -0.1)`.catch(() => {})
    n++
  }
  return n
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

/** Scout's currency loop IS the competitor set — the sources are the market itself. */
export const SCOUT_SOURCES: readonly TrustedSource[] = COMPETITORS.map((c) => ({
  slug: `competitor-${c.slug}`,
  name: c.name,
  url: c.url,
  kind: 'competitor' as const,
  why: 'Founder-confirmed competitor set (2026-08-02). A price stated here is a fetched fact; a price stated from memory is a fabrication.',
}))

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type ScoutReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  segments: SegmentScore[]
  disqualified: DisqualCount[]
  intel: IntelState
  incidents: Incident[]
  lessonsWritten: number
  icpVerdict: string
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export async function runScoutAgent(
  opts: { sql?: any; skipCurrency?: boolean; ourPerSeatUsd?: number } = {},
): Promise<ScoutReport> {
  const sql = opts.sql ?? getSql()
  // Growth: $299 / 500 seats = $0.598. Passed in rather than hardcoded so the caller reads it from
  // the live Stripe values; Scout never states a PhishSim price of his own.
  const ourPerSeatUsd = opts.ourPerSeatUsd ?? 0.598

  const seg = await scoreSegments(sql)
  const dq = await countDisqualified(sql)
  const intel = await readIntelState(sql)

  const incidents = contradictionIncidents(intel.facts, ourPerSeatUsd)
  const lessonsWritten = await writeScoutLessons(sql, incidents).catch(() => 0)

  const notChecked = [
    ...(seg.checked ? [] : ['segments']),
    ...(dq.checked ? [] : ['disqualification']),
    ...(intel.checked ? [] : ['competitor_intel']),
  ]

  const scored = seg.scores.filter((s) => s.icpScore !== null)
  const icpVerdict = !seg.checked
    ? 'ICP: NOT CHECKED.'
    : scored.length === 0
      ? `ICP: UNMEASURED — ${seg.scores.reduce((a, s) => a + s.contacted, 0)} contacted across ${seg.scores.length} segment(s), ` +
        `0 outcomes. No segment can be called better targeted than another on zero signal, and none is.`
      : `ICP: best-performing segment is ${[...scored].sort((a, b) => (b.icpScore! - a.icpScore!))[0].label} ` +
        `(score ${[...scored].sort((a, b) => (b.icpScore! - a.icpScore!))[0].icpScore}).`

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('scout', 'MSP market structure, competitor positioning and ICP targeting', SCOUT_SOURCES, sql).catch(() => null)

  const status: ScoutReport['status'] = seg.checked || intel.checked ? 'ACTIVE' : 'INSUFFICIENT_DATA'
  const line = buildScoutLine({ status, icpVerdict, intel, disqualified: dq.counts, incidents, notChecked })

  return { status, segments: seg.scores, disqualified: dq.counts, intel, incidents, lessonsWritten, icpVerdict, notChecked, currency, line: currency ? `${line} ${currency.line}` : line }
}

export function buildScoutLine(a: {
  status: ScoutReport['status']
  icpVerdict: string
  intel: IntelState
  disqualified: DisqualCount[]
  incidents: Incident[]
  notChecked: string[]
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return 'Scout (Market Intel): insufficient data — neither segment data nor competitor intel was readable. No targeting or competitor claim is possible. Playbook built and armed.'
  }
  const dq = a.disqualified.filter((d) => d.stillActive > 0)
  const dqLine = dq.length
    ? ` · off-ICP still active: ${dq.map((d) => `${d.stillActive} ${d.key}`).join(', ')}`
    : ' · no off-ICP leads in an active stage'
  const contra = a.incidents.length
    ? ` · ${a.incidents.length} fetched competitor price CONTRADICTS our lowest-price claim — DECISION FOR KAAN`
    : ''
  const nc = a.notChecked.length ? ` · NOT CHECKED: ${a.notChecked.join(', ')}` : ''
  return `Scout (Market Intel): ${a.icpVerdict} ${a.intel.line}${dqLine}${contra}${nc} Intel is data-side only — Scout never edits copy and never proposes a price.`
}

/** GET /api/os/scout — 06:30 UTC, after Rex/Dex/Aria/Mason. */
export async function cronScout(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    return res.json({ success: true, ...(await (async () => { const r = await withHealth('scout', () => runScoutAgent()); const reasoning = await (await import('./reason')).reasonAndAct('scout', r, `You are Scout, VP Market Intelligence for PhishSim AI, a phishing-simulation SaaS for MSPs. You NEVER state a competitor fact that is not present in the data given to you -- if intel is stale or missing you say NOT CHECKED, never a remembered figure. Given today's real ICP and competitor data, decide the single most useful action: which segment to prioritize outreach toward, or state plainly that n is too small to judge yet. Never invent a number.`).catch((e: any) => ({ assessment: 'reasoning unavailable', action: 'none', queued: false, taskId: null, error: String(e?.message || e) })); return { ...r, reasoning }; })()) })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
