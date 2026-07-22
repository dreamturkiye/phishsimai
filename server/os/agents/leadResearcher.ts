import { getSql } from '../conn'
import { discoverMspsForCity } from './mapsDiscovery'
import { reportAgentRun } from '../agentHealth'
import { sendTelegram } from '../telegram'

const COMPANY_ID = 'phishsimai'
// A lead gets this many enrichment attempts. On the last MISS it is retired to a terminal
// 'unenrichable' status instead of looping as 'pending' forever. Selection and terminalization
// share this constant so they can never drift (a mismatch is exactly what stranded the 69 leads:
// selection used `< 3`, terminalization never happened).
const MAX_RESEARCH_ATTEMPTS = 3
const MSP_TITLES = ['Owner', 'CEO', 'Founder', 'President', 'Managing Director', 'IT Director', 'CISO', 'Head of Security', 'CTO']

async function ensureResearchQueue(sql: ReturnType<typeof getSql>) {
  await sql`CREATE TABLE IF NOT EXISTS lead_research_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    domain TEXT NOT NULL,
    company_name TEXT,
    source TEXT,
    status TEXT DEFAULT 'pending',
    icp_score INTEGER DEFAULT 0,
    research_data JSONB DEFAULT '{}',
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, domain)
  )`
}

/**
 * PS-ENRICH-02 — AnyMailFinder, promoted ahead of Hunter.
 *
 * Measured on ScrollFuel 2026-07-15 against 20 real qualified domains: AMF returned 11
 * named, QEV-valid contacts (55%) versus 5.4% for free contact-page scraping. Hunter
 * benchmarks ~37.6% AND requires a NAME we do not have -- Google Maps gives us a domain
 * and nothing else (names on ~1 store in 56 measured). AMF's company-search takes a bare
 * DOMAIN, which is the only input this pipeline reliably owns.
 *
 * Billing model matters here: AMF charges 1 credit for up to 20 emails on a domain, and
 * ONLY when verified emails are found. Risky/unverified results are free. So a miss costs
 * nothing and 66 MSPs costs ~66 credits of the 400 available.
 *
 * Missing key is LOUD, never a silent null (SF-ENRICH-03): a null from an unconfigured
 * finder is byte-identical to an honest "this MSP has no discoverable contact", so a dead
 * step reports as a healthy one that never finds anything. That exact bug cost a day.
 */
let amfKeyWarned = false

// Return shape carries the DISTINCTION the pileup depended on:
//   • an object  → found an email
//   • null       → genuine MISS (AMF looked and there is no personal email for this domain)
//   • 'vendor_error' → the lookup never really happened (bad key 401, out of credits 402, timeout).
// A miss counts against the lead's retry budget and eventually retires it; a vendor error must NOT
// — the lead did nothing wrong, AMF was down, and it should retry once AMF recovers.
type AmfResult = { email: string; name: string | null; title: string | null } | null | 'vendor_error'

async function enrichViaAnyMailFinder(domain: string): Promise<AmfResult> {
  const key = process.env.ANYMAILFINDER_API_KEY?.trim()
  if (!key) {
    if (!amfKeyWarned) {
      amfKeyWarned = true
      console.error('[amf] ANYMAILFINDER_API_KEY is NOT SET — enrichment is DISABLED, not empty. Every lookup returns vendor_error (NOT a miss) so no lead is retired for a key we never set.')
    }
    return 'vendor_error'
  }
  try {
    // PS-ENRICH-02 FIX: endpoint + body + response shape copied VERBATIM from ScrollFuel's
    // lib/leadgen/enrich.ts anyMailFinder(), which is measured at 55% on real domains.
    // My first port guessed /v5.0/search/company.json and j.results[0].email from memory --
    // every call 404'd, and a 404 is treated as "no verified email", so 25 real MSPs came
    // back as 0 enriched and it looked like an honest miss. That is the exact defect this
    // codebase has spent two days removing: a vendor failure wearing the costume of a real
    // answer. Copy proven code; do not recall it.
    // PS-RESEARCHER-TIMEOUT-01: a per-call abort. AMF's company-search is slow, and with NO
    // timeout a single hung call consumed the whole 300s Vercel function budget — the researcher
    // 504'd (01:30, 01:45) and died before writing any lead. Same lesson as DeepInfra's own 60s
    // timeout: every vendor call gets its own bound so one slow vendor can't kill the run.
    const res = await fetch('https://api.anymailfinder.com/v5.1/find-email/company', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, email_type: 'personal' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const body = await res.text().catch(() => '')
    // 404 here genuinely means "no verified email for this domain" -- AMF only charges when
    // it finds one, so a miss is free. 401 (bad key) / 402 (out of credits) are NOT misses.
    if (res.status === 404) return null // genuine miss — AMF only charges on a hit, so this is free
    if (!res.ok) {
      // 401 bad key / 402 out of credits / 5xx — the lookup did not happen. NOT a miss.
      console.error(`[amf] ${domain} FAILED status=${res.status} — VENDOR FAILURE, not "no email found". body=${body.slice(0, 200)}`)
      return 'vendor_error'
    }
    const d = JSON.parse(body || '{}') as { emails?: string[]; valid_emails?: string[]; email_status?: string }
    const email = d.valid_emails?.[0] || d.emails?.[0]
    if (!email) return null // 200 but no address — a real miss
    // Normalize to lowercase+trim so the UNIQUE(email) constraint and the LOWER(email) dedup pre-check
    // treat case variants as the same address — no double-queue / double-send of Info@x vs info@x.
    return { email: String(email).trim().toLowerCase(), name: null, title: null }
  } catch (e: any) {
    // AbortSignal timeout / network error — the lookup did not complete. NOT a miss.
    console.error(`[amf] ${domain} threw: ${String(e?.message || e).slice(0, 160)}`)
    return 'vendor_error'
  }
}

let hunterKeyWarned = false

async function enrichViaHunter(domain: string) {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    // PS-ENRICH-01: a MISSING KEY IS NOT "no contact found". null here is byte-identical to
    // the honest "this MSP has no discoverable contact", so an unconfigured enricher reports
    // as a working one that never finds anything. Same bug found and fixed on ScrollFuel
    // (SF-ENRICH-03) where the key was EMPTY in prod and step 3 was silently dead.
    if (!hunterKeyWarned) {
      hunterKeyWarned = true
      console.error('[hunter] HUNTER_API_KEY is NOT SET — enrichment is DISABLED, not empty. Every lookup returns null and that null means "not checked".')
    }
    return null
  }
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${key}&limit=5`, { signal: AbortSignal.timeout(20000) })
    const d = await res.json()
    if (!d.data?.emails?.length) return null
    const dm = d.data.emails.find((e: any) =>
      MSP_TITLES.some(t => (e.position || '').toLowerCase().includes(t.toLowerCase()))
    ) || d.data.emails[0]
    if (!dm?.value) return null
    return { email: dm.value, name: `${dm.first_name || ''} ${dm.last_name || ''}`.trim(), title: dm.position }
  } catch { return null }
}

/**
 * PS-LEADGEN-V2 Phase 1 — the ICP walk. US / UK / AU only.
 *
 * CANADA IS ABSENT BY FOUNDER DECISION (2026-07-15), and absent at DISCOVERY, not just at
 * send. CASL is the strictest of the four regimes -- express or time-limited implied
 * consent, no broad B2B carve-out, real penalties. A Canadian MSP is never queried, never
 * queued, never enriched. The geo gate (PS-GEO-01) is the second line, not the first.
 */
const ICP_CITIES: Array<[string, string, string]> = [
  // United Kingdom
  ['London', 'England', 'United Kingdom'],
  ['Manchester', 'England', 'United Kingdom'],
  ['Birmingham', 'England', 'United Kingdom'],
  ['Leeds', 'England', 'United Kingdom'],
  ['Bristol', 'England', 'United Kingdom'],
  ['Glasgow', 'Scotland', 'United Kingdom'],
  ['Edinburgh', 'Scotland', 'United Kingdom'],
  ['Cardiff', 'Wales', 'United Kingdom'],
  ['Liverpool', 'England', 'United Kingdom'],
  ['Nottingham', 'England', 'United Kingdom'],
  // United States
  ['New York', 'New York', 'United States'],
  ['Los Angeles', 'California', 'United States'],
  ['Chicago', 'Illinois', 'United States'],
  ['Houston', 'Texas', 'United States'],
  ['Dallas', 'Texas', 'United States'],
  ['Austin', 'Texas', 'United States'],
  ['Atlanta', 'Georgia', 'United States'],
  ['Miami', 'Florida', 'United States'],
  ['Phoenix', 'Arizona', 'United States'],
  ['Denver', 'Colorado', 'United States'],
  ['Seattle', 'Washington', 'United States'],
  ['Boston', 'Massachusetts', 'United States'],
  ['Philadelphia', 'Pennsylvania', 'United States'],
  ['Charlotte', 'North Carolina', 'United States'],
  ['Minneapolis', 'Minnesota', 'United States'],
  ['San Antonio', 'Texas', 'United States'],
  ['San Diego', 'California', 'United States'],
  ['San Jose', 'California', 'United States'],
  ['San Francisco', 'California', 'United States'],
  ['Jacksonville', 'Florida', 'United States'],
  ['Columbus', 'Ohio', 'United States'],
  ['Indianapolis', 'Indiana', 'United States'],
  ['Nashville', 'Tennessee', 'United States'],
  ['Detroit', 'Michigan', 'United States'],
  ['Portland', 'Oregon', 'United States'],
  ['Las Vegas', 'Nevada', 'United States'],
  ['Baltimore', 'Maryland', 'United States'],
  ['Milwaukee', 'Wisconsin', 'United States'],
  ['Kansas City', 'Missouri', 'United States'],
  ['Tampa', 'Florida', 'United States'],
  ['Orlando', 'Florida', 'United States'],
  ['St. Louis', 'Missouri', 'United States'],
  ['Pittsburgh', 'Pennsylvania', 'United States'],
  ['Cincinnati', 'Ohio', 'United States'],
  ['Cleveland', 'Ohio', 'United States'],
  ['Raleigh', 'North Carolina', 'United States'],
  ['Salt Lake City', 'Utah', 'United States'],
  // Australia
  ['Sydney', 'New South Wales', 'Australia'],
  ['Melbourne', 'Victoria', 'Australia'],
  ['Brisbane', 'Queensland', 'Australia'],
  ['Perth', 'Western Australia', 'Australia'],
  ['Adelaide', 'South Australia', 'Australia'],
]

/**
 * PS-DISCOVER-WIDEN-01: multi-city × multi-term discovery, env-tunable. The DEFAULTS preserve the
 * original free-tier pace (1 city, 1 term/run), so deploying this changes NOTHING until the knobs
 * are raised — and raising them requires PAID Outscraper volume (each city×term is a billable query).
 *   DISCOVERY_CITIES_PER_RUN  (default 1)   — cities covered per run (sliding window over ICP_CITIES)
 *   DISCOVERY_TERMS           (default below) — comma-separated Maps search terms
 *   DISCOVERY_LIMIT_PER_QUERY (default = the `limit` arg) — places pulled per (city×term) query
 * Hard-capped at MAX_QUERIES_PER_RUN so a mis-set env can never fire thousands of billable queries.
 * Still stateless/idempotent: UNIQUE(company_id, domain) makes overlapping re-runs free.
 */
const DISCOVERY_TERMS_DEFAULT = ['managed service provider']
const MAX_QUERIES_PER_RUN = 60

export async function runLeadDiscover(limit = 20) {
  const start = Date.now()
  const citiesPerRun = Math.max(1, Number(process.env.DISCOVERY_CITIES_PER_RUN || 1) || 1)
  const terms = process.env.DISCOVERY_TERMS?.split(',').map((t) => t.trim()).filter(Boolean) || DISCOVERY_TERMS_DEFAULT
  const limitPerQuery = Math.max(1, Number(process.env.DISCOVERY_LIMIT_PER_QUERY || limit) || limit)
  // Advance the city window every run (6-hourly), not just per day, so widened runs cover new metros.
  const runIndex = Math.floor(Date.now() / (6 * 3600_000))

  let discovered = 0
  let candidates = 0
  let icp = 0
  let noGeo = 0
  let queries = 0
  const cities: string[] = []
  const errors: string[] = []
  outer: for (let c = 0; c < citiesPerRun; c++) {
    const [city, region, country] = ICP_CITIES[(runIndex * citiesPerRun + c) % ICP_CITIES.length]
    cities.push(`${city}/${country}`)
    for (const term of terms) {
      if (queries >= MAX_QUERIES_PER_RUN) break outer
      queries++
      try {
        const r = await discoverMspsForCity(term, city, region, country, limitPerQuery)
        discovered += r.queued
        candidates += r.found
        icp += r.icp
        noGeo += r.skippedNoGeo
      } catch (e: any) {
        // LOUD per-query, but one dead query must not kill the whole widened run.
        errors.push(`${term}@${city}: ${String(e?.message || e).slice(0, 80)}`)
      }
    }
  }
  // A run fails only if EVERY query failed (a dead vendor) — never on partial coverage.
  const ok = queries > 0 && errors.length < queries
  const result = { discovered, candidates, icp, noGeo, queries, cities, terms: terms.length, errors: errors.slice(0, 3) }
  await reportAgentRun('discover', ok, { ...result, duration_ms: Date.now() - start })
  return result
}

export async function runLeadResearcher(batchSize = 6) {
  const sql = getSql()
  await ensureResearchQueue(sql)
  const stats = { discovered: 0, enriched: 0, added: 0, skipped: 0, errors: [] as string[] }
  const start = Date.now()

  // PS-RESEARCHER-TIMEOUT-01: WALL CLOCK. Per-call timeouts bound each call; only a wall clock
  // bounds the TOTAL. Vercel kills the function at 300s and a 504 loses the whole run AND any
  // leads it found. Stop enqueuing at 220s and return what we did — partial and honest beats
  // dead and silent. Elapsed is logged around every vendor call so the logs say which call ate
  // the budget instead of us guessing.
  const DEADLINE_MS = 220_000
  const el = () => Math.round((Date.now() - start) / 1000)
  let budgetExhausted = false

  try {
    // PS-RESEARCHER-SPLIT-01: discovery REMOVED from the researcher. Outscraper ate 181 of 199s
    // (measured, 03:00 run) — the wrong thing in the wrong place: discovery already runs on its
    // OWN cron (/api/os/discover, every 6h → cronDiscover → runLeadDiscover, which INSERTs into
    // lead_research_queue). The researcher's job is ENRICHMENT; it now spends its full budget on
    // it and drains 5-10x faster. Discovery is NOT orphaned — the discover cron keeps the pool
    // filled independently. stats.discovered stays 0 here by design (this function no longer discovers).
    console.log(`[researcher] t=${el()}s enrichment start (discovery runs separately on /api/os/discover)`)

    const pending = await sql`
      SELECT id, domain, company_name, research_data FROM lead_research_queue
      WHERE company_id = ${COMPANY_ID} AND status = 'pending' AND attempts < ${MAX_RESEARCH_ATTEMPTS}
      ORDER BY created_at ASC LIMIT ${batchSize}`

    for (const item of pending) {
      // Do not START new work past the deadline. The in-flight item (≤~42s of bounded calls)
      // finishes by ~262s, safely under Vercel's 300s. Remaining rows stay 'pending' for the
      // next cron — never marked 'researching', so nothing is stranded.
      if (Date.now() - start > DEADLINE_MS) {
        budgetExhausted = true
        console.log(`[researcher] t=${el()}s BUDGET HIT — stopping; ${stats.added} added, remaining left pending`)
        break
      }
      try {
        await sql`UPDATE lead_research_queue SET status='researching', attempts=attempts+1, last_attempt_at=NOW() WHERE id=${item.id}`
        console.log(`[researcher] t=${el()}s enrich ${item.domain}`)
        // AMF first: it takes a bare domain, which is all Google Maps gives us. Hunter needs
        // a name and would return nothing for ~55 of every 56 leads here.
        const amf = await enrichViaAnyMailFinder(String(item.domain))
        const amfVendorError = amf === 'vendor_error'
        let hunter = amf && amf !== 'vendor_error' ? amf : null
        if (!hunter) hunter = await enrichViaHunter(String(item.domain))

        if (hunter?.email) {
          stats.enriched++
          const dup = await sql`SELECT id FROM ps_outreach_leads WHERE LOWER(email) = LOWER(${hunter.email}) LIMIT 1`
          if (dup.length > 0) {
            stats.skipped++
            await sql`UPDATE lead_research_queue SET status='duplicate', updated_at=NOW() WHERE id=${item.id}`
          } else {
            // PS-GEO-02: carry country_code from discovery into the column the send gate
            // actually reads. Without this every lead lands country=NULL and PS-GEO-01
            // blocks 100% of them -- correctly, but permanently. This is the last link.
            // Google Maps gives 'GB', not 'United Kingdom of Great Britain and Northern
            // Ireland'; the allowlist is ['US','GB','AU'] and only the short code matches.
            const cc = (item.research_data as any)?.country_code ?? null
            await sql`INSERT INTO ps_outreach_leads (email, name, company, title, source, pipeline_stage, country)
              VALUES (${hunter.email}, ${hunter.name || item.company_name}, ${item.company_name || String(item.domain).split('.')[0]}, ${hunter.title || 'Owner'}, 'google_maps', 'prospect', ${cc})
              ON CONFLICT (email) DO NOTHING`
            stats.added++
            await sql`UPDATE lead_research_queue SET status='enriched', icp_score=72, updated_at=NOW() WHERE id=${item.id}`
          }
        } else if (amfVendorError) {
          // PS-RESEARCHER-TERMINAL-01: the lookup NEVER RAN (bad key / out of credits / timeout).
          // Do not spend the lead's retry budget on an outage it isn't responsible for — undo the
          // attempt increment and leave it pending so it retries once AMF recovers. This is the bug
          // that would have stranded every enrichable lead the moment AMF's shared pool hit 402.
          stats.skipped++
          await sql`UPDATE lead_research_queue SET status='pending', attempts=GREATEST(attempts-1,0), updated_at=NOW() WHERE id=${item.id}`
        } else {
          // Genuine miss. Give it a TERMINAL state once it has used its retries, instead of
          // resetting to 'pending' forever (attempts hits 3 → excluded by `attempts < 3` → never
          // selected again, never resolved → the exact 69 leads the watchdog was alarming on).
          stats.skipped++
          await sql`UPDATE lead_research_queue
            SET status = CASE WHEN attempts >= ${MAX_RESEARCH_ATTEMPTS} THEN 'unenrichable' ELSE 'pending' END,
                updated_at = NOW()
            WHERE id = ${item.id}`
        }
        await new Promise(r => setTimeout(r, 1500))
      } catch (e: any) {
        stats.errors.push(`${item.domain}: ${e.message?.slice(0, 80)}`)
        await sql`UPDATE lead_research_queue SET status='failed', updated_at=NOW() WHERE id=${item.id}`
      }
    }

    console.log(`[researcher] t=${el()}s DONE — added:${stats.added} enriched:${stats.enriched} skipped:${stats.skipped} budget_hit:${budgetExhausted}`)
    await reportAgentRun('researcher', true, { ...stats, budget_exhausted: budgetExhausted, duration_ms: Date.now() - start }, undefined, COMPANY_ID)
    if (stats.added > 0) {
      await sendTelegram(`PHISHSIMAI RESEARCHER: +${stats.added} MSP leads\nDiscovered:${stats.discovered} Enriched:${stats.enriched} Skipped:${stats.skipped}${budgetExhausted ? ' (budget hit, rest pending)' : ''}`)
    }
  } catch (e: any) {
    await reportAgentRun('researcher', false, {}, e.message, COMPANY_ID)
    stats.errors.push('Fatal: ' + e.message)
  }
  return { ...stats, budget_exhausted: budgetExhausted, elapsed_s: el() }
}
