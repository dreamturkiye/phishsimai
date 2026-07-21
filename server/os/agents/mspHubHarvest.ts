// PS-HARVEST-01 (2026-07-21) — free MSP discovery from mymsphub.com, replicating the method that
// produced 86% of the original 6,000 (source=mymsphub) instead of the narrow paid Outscraper lane.
//
// mymsphub is a JS SPA, so its city pages have no data in raw HTML — BUT it publishes
// sitemap-companies.xml (~12.5k company profile URLs), and each /msp/company/<slug> profile is
// server-rendered with a JSON-LD `LocalBusiness` block whose `url` is the company's REAL domain
// (e.g. freshmanagedit.com). robots.txt allows /msp/ (only /admin,/search,/claim,/leads are
// disallowed). So: sitemap → profile → JSON-LD domain → queue → the existing AMF researcher finds a
// valid named email → refill (AMF+MX) → send. No headless browser, no paid API for discovery.
//
// DE-DUP (belt-and-suspenders, per Kaan): a domain is normalized (lowercased, www-stripped by
// hostnameOf), de-duped within the run (Set), and inserted ON CONFLICT (company_id, domain) DO
// NOTHING. Downstream, ps_outreach_leads.email is UNIQUE and the researcher pre-checks
// LOWER(email)=LOWER(...) before insert, and the send path only touches touch1_sent_at IS NULL — so
// no address is ever queued, stored, or emailed twice.
import { getSql } from '../conn'
import { hostnameOf } from './mapsDiscovery'
import { reportAgentRun } from '../agentHealth'

const COMPANY_ID = 'phishsimai'
const SITEMAP = 'https://mymsphub.com/sitemap-companies.xml'
const UA = 'Mozilla/5.0 (compatible; PhishSimBot/1.0; +https://phishsimai.com)'
const PER_RUN_DEFAULT = 50
const CONCURRENCY = 8
const TIME_BUDGET_MS = 240_000

// Resumable cursor over the sitemap — a dedicated one-row table so runs advance instead of
// re-scraping the top of the list. Idempotent create.
async function ensureState(sql: any): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS msp_hub_harvest_state (
    id INT PRIMARY KEY DEFAULT 1,
    cursor INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT msp_hub_one_row CHECK (id = 1)
  )`.catch(() => {})
}

async function fetchCompanyUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`sitemap-companies HTTP ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>\s*([^<\s]+\/msp\/company\/[^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
}

// Parse the company's real domain out of the profile's JSON-LD LocalBusiness.url. Returns null on
// any fetch/parse failure or if the only url is mymsphub itself (a listing with no linked site).
async function domainFromProfile(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const html = await res.text()
    const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    for (const b of blocks) {
      let parsed: any
      try {
        parsed = JSON.parse(b.trim())
      } catch {
        continue
      }
      for (const it of Array.isArray(parsed) ? parsed : [parsed]) {
        const t = it?.['@type']
        const isLocal = t === 'LocalBusiness' || (Array.isArray(t) && t.includes('LocalBusiness'))
        if (isLocal && typeof it.url === 'string' && !/mymsphub\.com/i.test(it.url)) {
          return hostnameOf(it.url)
        }
      }
    }
    return null
  } catch {
    return null
  }
}

export interface HarvestResult {
  total: number
  cursorFrom: number
  cursorTo: number
  processed: number
  domainsQueued: number
  noDomain: number
}

// Harvest one bounded window of company profiles, queue their domains (US, dedup), advance cursor.
export async function harvestMspHub(sqlOverride?: any, perRun = PER_RUN_DEFAULT): Promise<HarvestResult> {
  const sql = sqlOverride ?? getSql()
  await ensureState(sql)
  const urls = await fetchCompanyUrls()
  const total = urls.length

  const stateRow = (await sql`SELECT cursor FROM msp_hub_harvest_state WHERE id = 1`) as Array<{ cursor: number }>
  let cursor = Number(stateRow[0]?.cursor ?? 0) || 0
  if (cursor >= total) cursor = 0 // wrap — re-scraping is free (domain dedup)
  const cursorFrom = cursor
  const slice = urls.slice(cursor, cursor + perRun)

  const started = Date.now()
  const seen = new Set<string>()
  let idx = 0
  let processed = 0
  let domainsQueued = 0
  let noDomain = 0

  async function worker(): Promise<void> {
    while (true) {
      if (Date.now() - started >= TIME_BUDGET_MS) return
      const i = idx++
      if (i >= slice.length) return
      processed++
      const domain = await domainFromProfile(slice[i])
      if (!domain) {
        noDomain++
        continue
      }
      if (seen.has(domain)) continue // within-run dedup
      seen.add(domain)
      try {
        // country_code='US' — mymsphub is US-only; the researcher carries this into
        // ps_outreach_leads.country so the geo gate admits them. Domain dedup is the ON CONFLICT.
        const r = (await sql`INSERT INTO lead_research_queue (company_id, domain, company_name, source, status, research_data)
          VALUES (${COMPANY_ID}, ${domain}, ${null}, 'mymsphub', 'pending',
            ${JSON.stringify({ country_code: 'US', profile: slice[i], harvested_at: new Date().toISOString() })})
          ON CONFLICT (company_id, domain) DO NOTHING RETURNING id`) as any[]
        if (r.length > 0) domainsQueued++
      } catch {
        /* transient insert error — skip, next run re-covers via cursor wrap */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) || 1 }, () => worker()))

  const cursorTo = cursorFrom + processed
  await sql`UPDATE msp_hub_harvest_state SET cursor = ${cursorTo}, total = ${total}, updated_at = now() WHERE id = 1`.catch(() => {})
  const result = { total, cursorFrom, cursorTo, processed, domainsQueued, noDomain }
  await reportAgentRun('discover', processed > 0, { agent: 'msp_harvest', ...result }).catch(() => {})
  return result
}

export async function cronMspHubHarvest(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET
  if (!okCron && !okHq) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const perRun = Math.max(1, Number(process.env.MSP_HARVEST_PER_RUN || PER_RUN_DEFAULT) || PER_RUN_DEFAULT)
    const r = await harvestMspHub(getSql(), perRun)
    return res.json({ ok: true, ...r })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
