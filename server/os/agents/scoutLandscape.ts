// ─────────────────────────────────────────────────────────────────────────────
//  PS-SCOUT-LANDSCAPE-01 — the runner: registry-only fetch -> Cerebras extract -> provenance gate.
//
//  Every finding this produces carries source + date + a verbatim on-page quote, or it is written
//  verified:false (a cited proposal, never quotable as fact). A failed fetch is NOT_CHECKED, never a
//  fabricated trend. Findings are PROPOSALS for Kaan; nothing here adopts a claim as doctrine, and
//  PROTECTED_TOPICS are refused before extraction. See scoutRegistry.ts for the guards.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { llmComplete } from '../llmChat'
import {
  SOURCE_REGISTRY,
  normaliseText,
  verifyFinding,
  isProtectedTopic,
  type RegistrySource,
  type ScoutFinding,
} from './scoutRegistry'

const COMPANY = 'phishsimai'
const FETCH_TIMEOUT_MS = 20_000

type FetchResult = { ok: true; status: number; text: string } | { ok: false; status: number | null; reason: string }

async function fetchSource(url: string): Promise<FetchResult> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal, redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
    const text = normaliseText(body)
    if (text.length < 200) return { ok: false, status: res.status, reason: 'page too short to read (JS-rendered or blocked)' }
    return { ok: true, status: res.status, text }
  } catch (e: any) {
    return { ok: false, status: null, reason: e?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : String(e?.message || e) }
  }
}

type Extract = { claim: string; quote: string; source_date: string | null } | null

/**
 * Pull ONE proposed finding from a source's text. Returns null when extraction could not run or
 * parse — NOT an empty finding, so an LLM outage is distinguishable from "nothing found" (the
 * competitorIntel.ts:100 lesson). The model is instructed to quote verbatim; the quote is then
 * VERIFIED against the page independently — the model cannot talk its way past the substring check.
 */
async function extractFinding(src: RegistrySource, text: string): Promise<Extract> {
  try {
    const { text: raw } = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            'You extract ONE relevant, current fact from an authoritative cybersecurity source for an ' +
            'MSP phishing-simulation vendor. Return ONLY JSON: {claim, quote, source_date}. RULES: ' +
            '(1) quote MUST be copied VERBATIM from the page text — never paraphrased, never invented; ' +
            '(2) claim is your one-sentence summary of what the quote implies for the market; ' +
            '(3) source_date is any date the page states, else null; ' +
            '(4) if the page contains nothing relevant, return {"claim":null,"quote":null,"source_date":null}. ' +
            'A quote that is not on the page is a defect.',
        },
        { role: 'user', content: `Source: ${src.name} (${src.topic})\n\nPage text (truncated):\n${text.slice(0, 6000)}` },
      ],
      max_tokens: 400,
      response_format: { type: 'json_object' },
    } as any)
    const cleaned = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const j = JSON.parse(cleaned)
    if (!j || typeof j.claim !== 'string' || !j.claim.trim()) return null
    return { claim: j.claim.trim().slice(0, 400), quote: String(j.quote ?? '').trim().slice(0, 600), source_date: j.source_date ? String(j.source_date).slice(0, 40) : null }
  } catch {
    return null // extraction unavailable -> NOT CHECKED, never a fabricated finding
  }
}

export type LandscapeRun = { checked: number; verified: number; unverified: number; notChecked: string[]; findings: ScoutFinding[] }

/** The weekly job. One row per source per run — verified finding, unverified proposal, or NOT_CHECKED. */
export async function runScoutLandscape(sqlOverride?: any): Promise<LandscapeRun> {
  const sql = sqlOverride ?? getSql()
  const res: LandscapeRun = { checked: 0, verified: 0, unverified: 0, notChecked: [], findings: [] }

  for (const src of SOURCE_REGISTRY) {
    res.checked++
    const got = await fetchSource(src.url)
    if (!got.ok) {
      res.notChecked.push(`${src.name} (${got.reason})`)
      await sql`INSERT INTO os_market_intel (product_id, source_slug, source_name, source_url, topic, fetch_ok, http_status, fail_reason)
                VALUES (${COMPANY}, ${src.slug}, ${src.name}, ${src.url}, ${src.topic}, false, ${got.status}, ${got.reason})
                ON CONFLICT DO NOTHING`.catch(() => {})
      continue
    }

    const ext = await extractFinding(src, got.text)
    if (!ext) {
      // Fetched but nothing extractable / extractor unavailable -> NOT CHECKED with a reason.
      res.notChecked.push(`${src.name} (no extractable finding)`)
      await sql`INSERT INTO os_market_intel (product_id, source_slug, source_name, source_url, topic, fetch_ok, http_status, fail_reason)
                VALUES (${COMPANY}, ${src.slug}, ${src.name}, ${src.url}, ${src.topic}, false, ${got.status}, 'no extractable finding')
                ON CONFLICT DO NOTHING`.catch(() => {})
      continue
    }

    // CONSTITUTIONAL REFUSAL: an external claim touching a protected topic is never adopted.
    if (isProtectedTopic(ext.claim) || isProtectedTopic(ext.quote)) {
      res.notChecked.push(`${src.name} (REFUSED — protected topic, not adopted from an external source)`)
      await sql`INSERT INTO os_market_intel (product_id, source_slug, source_name, source_url, topic, fetch_ok, http_status, fail_reason)
                VALUES (${COMPANY}, ${src.slug}, ${src.name}, ${src.url}, ${src.topic}, false, ${got.status}, 'refused: protected topic')
                ON CONFLICT DO NOTHING`.catch(() => {})
      continue
    }

    // THE PROVENANCE GATE: verified only if the quote is genuinely on the page.
    const verified = verifyFinding(got.text, ext.quote)
    if (verified) res.verified++; else res.unverified++
    res.findings.push({
      sourceSlug: src.slug, sourceName: src.name, sourceUrl: src.url, sourceDate: ext.source_date,
      claim: ext.claim, quote: ext.quote, verified, topic: src.topic,
    })
    await sql`INSERT INTO os_market_intel
                (product_id, source_slug, source_name, source_url, topic, fetch_ok, http_status, claim, quote, source_date, verified)
              VALUES (${COMPANY}, ${src.slug}, ${src.name}, ${src.url}, ${src.topic}, true, ${got.status},
                      ${ext.claim}, ${verified ? ext.quote : null}, ${ext.source_date}, ${verified})
              ON CONFLICT DO NOTHING`.catch(() => {})
  }
  return res
}

/**
 * The one line Scout feeds the brief. VERIFIED findings only are stated as fact; unverified ones are
 * summarised as "N cited proposals awaiting evidence"; NOT_CHECKED sources are named. Never asserts
 * a trend Scout could not verify, and never proposes a positioning or pricing action from it.
 */
export function landscapeLine(run: LandscapeRun): string {
  const verified = run.findings.filter((f) => f.verified)
  const nc = run.notChecked.length ? ` · NOT CHECKED: ${run.notChecked.length}` : ''
  if (verified.length === 0) {
    return `Landscape: ${run.checked} source(s) checked, 0 verified findings this run` +
      `${run.unverified ? ` · ${run.unverified} cited proposal(s) awaiting evidence` : ''}${nc}. ` +
      `No market claim asserted. Intel only — never a prompt to reprice or restate positioning.`
  }
  const head = verified.slice(0, 3).map((f) => `${f.sourceName}: ${f.claim}`).join(' · ')
  return `Landscape: ${verified.length} verified finding(s) — ${head}` +
    `${run.unverified ? ` · ${run.unverified} unverified proposal(s)` : ''}${nc}. ` +
    `Each carries a source + on-page quote; these are PROPOSALS for Kaan, not adopted doctrine.`
}

/**
 * GET /api/os/scout-landscape — the weekly Track-3 cron entry. Secret-gated like the other crons.
 * Routes extraction through llmComplete -> Cerebras (free, cron-safe). Every finding passes the
 * verifyFinding gate; nothing here adopts a claim as doctrine.
 */
export async function cronScoutLandscape(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const run = await runScoutLandscape()
    return res.json({ success: true, ...run, line: landscapeLine(run) })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
