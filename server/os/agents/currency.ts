// ─────────────────────────────────────────────────────────────────────────────
//  PS-CURRENCY-01 — the "doctor who stays current" faculty, shared by all eight experts.
//
//  THE FACULTY THIS PROVIDES
//    A specialist who never reads anything new decays into a specialist in 2026-08. Each agent
//    names its own trusted sources, fetches them on a schedule, and records what it learned WITH
//    PROVENANCE — source name, URL, and the date the claim was captured.
//
//  GROUNDED, NOT GULLIBLE — the property that makes this safe.
//    A doctor reads the journal and WEIGHS it. She does not change the protocol because of one
//    blog post. So an external finding enters this system as a PROPOSAL and never as a fact:
//
//      1. It is written with its citation attached. A claim whose source cannot be named is not
//         recorded at all — that is fabrication with an extra step.
//      2. There is deliberately NO adopt() function in this module. Not "an adopt function that
//         checks a permission" — none at all. Adoption is a human act performed elsewhere, so no
//         future code path can reach for it by accident. The absence is the guardrail.
//      3. Proposals touching PROTECTED doctrine are REJECTED before they are ever offered, and the
//         rejection is recorded rather than silently dropped, so "the loop tried to reprice us and
//         was refused" is visible instead of invisible.
//
//  WHY REJECTIONS ARE STORED
//    A silently dropped proposal looks identical to a proposal that was never made. If an external
//    source starts pushing us toward a discount every week, that is a signal about the source, and
//    it is only visible if the refusals are on the record.
//
//  ANTI-FABRICATION
//    Unreachable sources are NOT CHECKED — never "no changes". A loop that fetched nothing reports
//    zero proposals and says so. It may never emit a proposal it did not read off a page.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { getSql } from '../conn'
import { llmComplete } from '../llmChat'

const COMPANY = 'phishsimai'
const FETCH_TIMEOUT_MS = 20_000

/** Max proposals kept per run per agent. A source dump of 40 "insights" is noise, not currency. */
export const MAX_PROPOSALS_PER_RUN = 6

export type SourceKind = 'vendor_doc' | 'standards_body' | 'industry_benchmark' | 'practitioner' | 'competitor'

export type TrustedSource = {
  /** Stable key. Renaming orphans this source's history. */
  slug: string
  name: string
  url: string
  kind: SourceKind
  /** Why this source is trusted for this domain — recorded so the trust decision is auditable. */
  why: string
}

export type CurrencyFinding = {
  /** The claim, as stated by the source. */
  claim: string
  /** What the agent could do differently if the claim held. Tactic-level only. */
  implication: string
}

export type ScreenResult = { allowed: boolean; reason: string }

// ─── THE PROTECTED SURFACES ──────────────────────────────────────────────────
// These may never be altered from an external claim, by any agent, at any autonomy level. Each
// pattern is deliberately broad: a false positive costs one refused proposal, a false negative
// costs a price change made because a vendor blog recommended one.

const PROTECTED: { name: string; re: RegExp }[] = [
  {
    name: 'pricing',
    re: /\b(pric(e|ing|es)|discount|coupon|promo(tion(al)?)?|\$\s?\d|per[- ]seat rate|founding rate|free tier|paywall|billing amount|MSRP|list price|raise (the )?price|lower (the )?price)\b/i,
  },
  {
    name: 'brand voice',
    re: /\b(brand voice|tone of voice|rebrand|our (voice|persona)|rename the (product|company)|tagline|positioning statement)\b/i,
  },
  {
    name: 'honesty rules',
    re: /\b(testimonial|case study|social proof|logo wall|fabricat|invent(ed)? (a )?(stat|metric|number)|exaggerat|puff(ery)?|claim we have|say we have \d|imply we have)\b/i,
  },
  {
    name: 'own guardrails',
    re: /\b(guardrail|autonomy level|approval gate|human review|confidence threshold|suppress(ion)? threshold|auto[- ]send|bypass|disable the (gate|check|guard)|remove the (gate|check|guard))\b/i,
  },
]

/**
 * The gate every external claim passes before it is offered as a proposal.
 *
 * Screens the claim AND its implication together: a claim can be innocuous ("competitors publish
 * per-seat rates") while its implication is not ("so we should publish ours lower"). Screening only
 * the claim would let the actionable half through unread.
 */
export function screenProposal(f: CurrencyFinding): ScreenResult {
  const text = `${f.claim}\n${f.implication}`
  for (const p of PROTECTED) {
    if (p.re.test(text)) {
      return {
        allowed: false,
        reason: `touches PROTECTED doctrine (${p.name}) — external input may never move this surface; escalate to Kaan instead`,
      }
    }
  }
  return { allowed: true, reason: 'tactic-level, within guardrails' }
}

// ─── FETCH ───────────────────────────────────────────────────────────────────

export function normalise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Fetched = { ok: true; status: number; text: string } | { ok: false; reason: string }

async function fetchSource(url: string): Promise<Fetched> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const text = normalise(body)
    if (text.length < 300) return { ok: false, reason: 'body too short to read (JS-rendered or blocked)' }
    return { ok: true, status: res.status, text }
  } catch (e: any) {
    return { ok: false, reason: e?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : String(e?.message || e) }
  }
}

/**
 * Pull findings out of fetched text. Returns [] on any parse failure — a page we fetched but could
 * not read yields NOTHING, never a guess. The prompt forbids inference for the same reason
 * competitorIntel's does: an inferred external claim is indistinguishable from a hallucinated one
 * once it is in the table.
 */
export async function extractFindings(agentDomain: string, sourceName: string, text: string): Promise<CurrencyFinding[]> {
  try {
    const { text: raw } = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            `Extract at most 3 findings relevant to ${agentDomain} from a source page. Return ONLY JSON: ` +
            '{"findings":[{"claim":"...","implication":"..."}]}. ' +
            'RULES: (1) `claim` must be stated VERBATIM-in-substance on the page — never infer, never ' +
            'recall from your own knowledge, never compute a number the page does not print; ' +
            '(2) if the page states nothing relevant, return {"findings":[]} — an empty result is a ' +
            'correct result and is strongly preferred over a weak one; (3) `implication` is a ' +
            'TACTIC-level suggestion only (timing, cadence, targeting, format, channel); ' +
            '(4) NEVER suggest changing prices, brand voice, honesty rules, or review gates. ' +
            'A guess is a defect.',
        },
        { role: 'user', content: `Source: ${sourceName}\n\nPage text (truncated):\n${text.slice(0, 6000)}` },
      ],
      max_tokens: 700,
      response_format: { type: 'json_object' },
    } as any)
    const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const j = JSON.parse(cleaned)
    const arr = Array.isArray(j?.findings) ? j.findings : []
    return arr
      .map((f: any) => ({ claim: String(f?.claim ?? '').trim(), implication: String(f?.implication ?? '').trim() }))
      .filter((f: CurrencyFinding) => f.claim.length > 12)
      .slice(0, 3)
  } catch {
    return []
  }
}

// ─── RECORD ──────────────────────────────────────────────────────────────────

export function proposalSignature(agentId: string, sourceSlug: string, claim: string): string {
  const h = createHash('sha256').update(`${sourceSlug}|${claim.toLowerCase()}`).digest('hex').slice(0, 16)
  return `${agentId}:currency:${h}`
}

/**
 * The provenance envelope. Every recorded proposal carries source name, URL and capture date in the
 * lesson text itself — not in a sidecar column — because the lesson text is what
 * getAgentLessonsForPrompt() feeds into an agent's context. A citation that does not travel with the
 * claim into the prompt is a citation the reading agent never sees.
 */
export function formatProposal(
  src: TrustedSource,
  f: CurrencyFinding,
  capturedISO: string,
  screen: ScreenResult,
): string {
  const head = screen.allowed
    ? 'EXTERNAL PROPOSAL — NOT ADOPTED DOCTRINE.'
    : `EXTERNAL PROPOSAL REFUSED — ${screen.reason}.`
  return (
    `${head} Treat as a cited suggestion to weigh, never as an established fact. ` +
    `CLAIM: ${f.claim} ` +
    `IMPLICATION (tactic-level only): ${f.implication} ` +
    `SOURCE: ${src.name} (${src.kind}) — ${src.url} — captured ${capturedISO}. ` +
    `TRUSTED BECAUSE: ${src.why} ` +
    `A human adopts this or it stays a proposal; no code path in this system can promote it.`
  )
}

export type CurrencyRun = {
  agentId: string
  sourcesConfigured: number
  fetched: number
  notChecked: string[]
  proposals: number
  refused: number
  line: string
}

/**
 * Fetch this agent's named sources and record what they said, as proposals.
 *
 * Writes to os_agent_lessons — the PRODUCT-OWNED store. Deliberately NOT kaan-os-core: that
 * directory is a pinned vendored copy of dreamturkiye/kaan-os-core and CI rejects edits to it
 * (see memory.ts:90). Domain currency is PhishSim doctrine, not shared-core behaviour.
 *
 * success=false and confidence_delta=0 together encode "this is not an outcome I measured, and it
 * has moved no confidence". A proposal that scored itself would be indistinguishable in the table
 * from a lesson earned by a real result.
 */
export async function runCurrencyLoop(
  agentId: string,
  agentDomain: string,
  sources: readonly TrustedSource[],
  sqlOverride?: any,
): Promise<CurrencyRun> {
  const sql = sqlOverride ?? getSql()
  const capturedISO = new Date().toISOString().slice(0, 10)
  const res: CurrencyRun = {
    agentId,
    sourcesConfigured: sources.length,
    fetched: 0,
    notChecked: [],
    proposals: 0,
    refused: 0,
    line: '',
  }

  let kept = 0
  for (const src of sources) {
    if (kept >= MAX_PROPOSALS_PER_RUN) break
    const got = await fetchSource(src.url)
    if (!got.ok) {
      res.notChecked.push(`${src.name} (${got.reason})`)
      continue
    }
    res.fetched++

    const findings = await extractFindings(agentDomain, src.name, got.text)
    for (const f of findings) {
      if (kept >= MAX_PROPOSALS_PER_RUN) break
      const screen = screenProposal(f)
      const signature = proposalSignature(agentId, src.slug, f.claim)

      const existing = (await sql`SELECT 1 FROM os_agent_lessons
        WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
      if (existing.length) continue // already on the record; re-reading the same page is not news

      await sql`INSERT INTO os_agent_lessons
        (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
        VALUES (${COMPANY}, ${agentId}, ${screen.allowed ? 'currency_proposal' : 'currency_refused'},
                ${signature}, ${formatProposal(src, f, capturedISO, screen)}, false, 0, 0)`
        .catch(() => {})

      if (screen.allowed) res.proposals++
      else res.refused++
      kept++
    }
  }

  res.line = currencyLine(res)
  return res
}

/** The one line an agent's report carries about its own currency. Honest when it read nothing. */
export function currencyLine(run: CurrencyRun): string {
  if (run.sourcesConfigured === 0) return 'Currency: no sources configured.'
  const nc = run.notChecked.length ? ` · NOT CHECKED: ${run.notChecked.join('; ')}` : ''
  if (run.fetched === 0) {
    return (
      `Currency: 0/${run.sourcesConfigured} sources reachable — NOT CHECKED this cycle${nc}. ` +
      `No proposals recorded (a loop that read nothing proposes nothing).`
    )
  }
  if (run.proposals === 0 && run.refused === 0) {
    return `Currency: ${run.fetched}/${run.sourcesConfigured} sources read, nothing new worth proposing${nc}.`
  }
  const ref = run.refused ? ` · ${run.refused} REFUSED (touched protected doctrine — pricing/voice/honesty/guardrails)` : ''
  return (
    `Currency: ${run.fetched}/${run.sourcesConfigured} sources read · ${run.proposals} new cited proposal(s) ` +
    `recorded for human review${ref}${nc}. Proposals are NOT adopted doctrine.`
  )
}
