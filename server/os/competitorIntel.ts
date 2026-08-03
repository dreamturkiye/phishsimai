// ─────────────────────────────────────────────────────────────────────────────
//  KAAN AI OS 7.5 §5 #3 — competitor intel, fetched not remembered.
//
//  THE RULE THIS EXISTS TO ENFORCE
//    Janet must never assert a competitor's price from recollection. A model asked "what does
//    KnowBe4 charge?" will always produce a confident number, and that number becomes a claim we
//    make to a prospect. So a competitor fact exists here only if a fetch WROTE it, with the URL,
//    the HTTP status and the timestamp attached. No row, no line in the brief.
//
//  NOT CHECKED IS A FIRST-CLASS OUTCOME
//    A failed fetch writes a row with fetch_ok=false. It does not skip, and it does not carry
//    last week's price forward as if it were current. The 0015 CHECK constraint makes a populated
//    failed row impossible at the schema level, so this cannot regress by accident. Unreachable
//    renders NOT CHECKED — the same distinction as "funnel N/A, n=0" vs "0%".
//
//  OUR PRICING IS FROZEN
//    Nothing here reads, writes, suggests or computes a PhishSim price. Intel informs Kaan. It
//    never auto-acts, and no downstream consumer may use it to alter a number we publish.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { getSql } from './conn'
import { llmComplete } from './llmChat'

const COMPANY = 'phishsimai'
const FETCH_TIMEOUT_MS = 20_000

export type Competitor = { slug: string; name: string; url: string }

/** The 7-set, founder-confirmed 2026-08-02. Slugs are stable keys — renaming one orphans history. */
export const COMPETITORS: readonly Competitor[] = [
  { slug: 'knowbe4', name: 'KnowBe4', url: 'https://www.knowbe4.com/pricing' },
  { slug: 'hoxhunt', name: 'Hoxhunt', url: 'https://hoxhunt.com/pricing' },
  { slug: 'caniphish', name: 'CanIPhish', url: 'https://caniphish.com/pricing' },
  { slug: 'phishingbox', name: 'PhishingBox', url: 'https://www.phishingbox.com/pricing' },
  { slug: 'usecure', name: 'usecure', url: 'https://www.usecure.io/pricing' },
  { slug: 'gophish', name: 'GoPhish', url: 'https://getgophish.com/' },
  { slug: 'huntress', name: 'Huntress', url: 'https://www.huntress.com/pricing' },
]

export type Extracted = {
  headline_price: string | null
  pricing_model: string | null
  trial_terms: string | null
  msp_features: string | null
  positioning: string | null
}
const EMPTY: Extracted = {
  headline_price: null, pricing_model: null, trial_terms: null, msp_features: null, positioning: null,
}

/** Strip markup to comparable text. The hash is over THIS, so a nav tweak isn't a "price change". */
export function normalisePage(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

type FetchResult = { ok: true; status: number; text: string } | { ok: false; status: number | null; reason: string }

async function fetchPage(url: string): Promise<FetchResult> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        // A plausible browser UA. Several of these sites 403 a bare fetch, and a 403 recorded as
        // NOT CHECKED every week is a permanently blind row — worth one honest header to avoid.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
    const text = normalisePage(body)
    if (text.length < 200) return { ok: false, status: res.status, reason: 'page body too short to be a real pricing page (likely JS-rendered or blocked)' }
    return { ok: true, status: res.status, text }
  } catch (e: any) {
    return { ok: false, status: null, reason: e?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : String(e?.message || e) }
  }
}

/**
 * Pull the five fields out of fetched text. Returns EMPTY on any parse failure — a page we fetched
 * but could not read is a SUCCESS with unknown fields, never a guess. Every value must be present
 * verbatim in the page; the prompt forbids inference, because an inferred competitor price is
 * exactly the fabrication this module exists to prevent.
 */
export async function extractFromPage(name: string, text: string): Promise<Extracted> {
  try {
    const { text: raw } = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            'Extract pricing facts from a competitor pricing page. Return ONLY JSON with keys: ' +
            'headline_price, pricing_model, trial_terms, msp_features, positioning. ' +
            'RULES: (1) every value must appear VERBATIM on the page — never infer, never recall, ' +
            'never compute; (2) use null for anything not stated on the page; (3) headline_price is ' +
            'the price string exactly as printed (e.g. "$4.50/user/month") — do not normalise or ' +
            'convert; (4) pricing_model is one of per_seat, flat, quote_only, or null. ' +
            'If the page states no price, headline_price MUST be null. A guess is a defect.',
        },
        { role: 'user', content: `Competitor: ${name}\n\nPage text (truncated):\n${text.slice(0, 6000)}` },
      ],
      max_tokens: 500,
      response_format: { type: 'json_object' },
    } as any)
    const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const j = JSON.parse(cleaned)
    const s = (v: any) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null)
    return {
      headline_price: s(j.headline_price),
      pricing_model: s(j.pricing_model),
      trial_terms: s(j.trial_terms),
      msp_features: s(j.msp_features),
      positioning: s(j.positioning),
    }
  } catch {
    return EMPTY
  }
}

type Row = Extracted & { competitor: string; fetch_ok: boolean; content_hash: string | null; captured_at: string }

async function lastSuccessful(sql: any, slug: string): Promise<Row | null> {
  const r = (await sql`SELECT competitor, fetch_ok, content_hash, captured_at::text AS captured_at,
                              headline_price, pricing_model, trial_terms, msp_features, positioning
                       FROM os_competitor_intel
                       WHERE product_id=${COMPANY} AND competitor=${slug} AND fetch_ok=true
                       ORDER BY captured_at DESC LIMIT 1`.catch(() => [])) as any[]
  return r[0] ?? null
}

const FIELDS: (keyof Extracted)[] = ['headline_price', 'pricing_model', 'trial_terms', 'msp_features', 'positioning']

export type Change = { competitor: string; field: string; from: string | null; to: string | null }

/** Field-level diff between the previous successful capture and the new one. */
export function diffCapture(name: string, prev: Extracted | null, next: Extracted): Change[] {
  if (!prev) return [] // first-ever capture is a BASELINE, not a change. Reporting it as one is noise.
  const out: Change[] = []
  for (const f of FIELDS) {
    const a = prev[f] ?? null
    const b = next[f] ?? null
    if (a !== b) out.push({ competitor: name, field: f, from: a, to: b })
  }
  return out
}

export type IntelRun = { checked: number; ok: number; notChecked: string[]; changes: Change[]; unchanged: number }

/**
 * The weekly job. One row per competitor per run — success or failure, never a skip.
 * Idempotent within a UTC day via the 0015 unique index (a same-day re-run inserts nothing).
 */
export async function runCompetitorIntel(sqlOverride?: any): Promise<IntelRun> {
  const sql = sqlOverride ?? getSql()
  const res: IntelRun = { checked: 0, ok: 0, notChecked: [], changes: [], unchanged: 0 }

  for (const c of COMPETITORS) {
    res.checked++
    const prev = await lastSuccessful(sql, c.slug)
    const got = await fetchPage(c.url)

    if (!got.ok) {
      res.notChecked.push(c.name)
      await sql`INSERT INTO os_competitor_intel (product_id, competitor, source_url, fetch_ok, http_status, fail_reason)
                VALUES (${COMPANY}, ${c.slug}, ${c.url}, false, ${got.status}, ${got.reason})
                ON CONFLICT DO NOTHING`.catch(() => {})
      continue
    }

    const hash = hashContent(got.text)
    let ext: Extracted
    if (prev && prev.content_hash === hash) {
      // Byte-identical to the last successful capture. Carrying the prior values forward here is
      // NOT recall — we fetched, and the page is provably unchanged. Skipping the LLM saves a call
      // and, more importantly, removes a chance for extraction to drift on identical input.
      ext = { headline_price: prev.headline_price, pricing_model: prev.pricing_model, trial_terms: prev.trial_terms, msp_features: prev.msp_features, positioning: prev.positioning }
      res.unchanged++
    } else {
      ext = await extractFromPage(c.name, got.text)
    }

    await sql`INSERT INTO os_competitor_intel
              (product_id, competitor, source_url, fetch_ok, http_status, content_hash,
               headline_price, pricing_model, trial_terms, msp_features, positioning)
              VALUES (${COMPANY}, ${c.slug}, ${c.url}, true, ${got.status}, ${hash},
                      ${ext.headline_price}, ${ext.pricing_model}, ${ext.trial_terms}, ${ext.msp_features}, ${ext.positioning})
              ON CONFLICT DO NOTHING`.catch(() => {})
    res.ok++
    res.changes.push(...diffCapture(c.name, prev, ext))
  }
  return res
}

/**
 * The single line this feeds into the weekly brief. CHANGES ONLY — a week where nothing moved says
 * so in one clause rather than re-listing seven unchanged prices, which is how a brief becomes
 * unreadable and then unread.
 *
 * It never recommends a price action. Our pricing is frozen and this is intel for Kaan; an agent
 * reading this line must not propose a price change from it.
 */
export function competitorIntelLine(run: IntelRun): string {
  const nc = run.notChecked.length ? ` · NOT CHECKED: ${run.notChecked.join(', ')} (unreachable — no price asserted for these)` : ''
  if (run.checked === 0) return 'Competitor intel: no competitors configured.'
  if (run.changes.length === 0) {
    return `Competitor intel: ${run.ok}/${run.checked} pages fetched, NO CHANGES vs last capture${nc}. ` +
      `Our price-led position is unchanged. PhishSim pricing is FROZEN — this line is intel, never a prompt to reprice.`
  }
  const lines = run.changes.slice(0, 8).map(c => `${c.competitor} ${c.field}: "${c.from ?? '(none)'}" → "${c.to ?? '(none)'}"`)
  const more = run.changes.length > 8 ? ` (+${run.changes.length - 8} more)` : ''
  return `Competitor intel: ${run.ok}/${run.checked} fetched, ${run.changes.length} CHANGE(S) — ${lines.join(' · ')}${more}${nc}. ` +
    `Read against our position: $299/500 users (60¢) and a 30-day no-card trial. PhishSim pricing is FROZEN — ` +
    `this informs Kaan and must NOT be used to propose a price change.`
}

/** GET /api/os/competitor-intel — weekly cron entry. */
export async function cronCompetitorIntel(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const run = await runCompetitorIntel()
    // `run.ok` is a COUNT of successful fetches, not a boolean — spreading it after `ok: true`
    // silently overwrote the status flag with a number. Report them under distinct names.
    return res.json({ success: true, fetched: run.ok, ...run, line: competitorIntelLine(run) })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
