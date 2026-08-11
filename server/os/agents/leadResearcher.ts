import { getSql } from '../conn'
// PS-ICY-GUARD-01: the finder guard reuses the refill's OWN promotability predicate. Sharing the
// function (rather than restating the rule) is deliberate — if the two ever disagree about what
// counts as a usable address, the guard starts skipping domains the refill would never send to.
import { isOrgInbox } from '../sanitizeRefill'
// PS-FINDER-LEDGER-01: every paid finder call is written down, so "where did 299 credits go"
// is a query rather than a reconstruction from row counts.
import { recordProviderCall } from '../providerUsage'
import { discoverMspsForCity } from './mapsDiscovery'
import { reportAgentRun } from '../agentHealth'
import { sendTelegram } from '../telegram'
import { dailySendCap } from '../sequences'

const COMPANY_ID = 'phishsimai'
// A lead gets this many enrichment attempts. On the last MISS it is retired to a terminal
// 'unenrichable' status instead of looping as 'pending' forever. Selection and terminalization
// share this constant so they can never drift (a mismatch is exactly what stranded the 69 leads:
// selection used `< 3`, terminalization never happened).
const MAX_RESEARCH_ATTEMPTS = 3

// PS-FINDER-THROTTLE-02: the finder's daily output budget, demand-aware. The send draws from
// VERIFIED-sendable, and only a fraction of finds survive MEV verify, so the finds needed to keep
// the send fed = cap / pass_rate, plus a small buffer. Self-tunes as the cap ramps and the measured
// pass-rate drifts. FAIL TOWARD FEEDING, never starving:
//   • pass-rate is clamped to [0.35, 0.70] — the 0.70 CEILING is the floor on the budget: even a
//     fluke "100% passed" reading can't drop the budget below ~cap/0.70 ≈ 1.6× cap.
//   • a thin sample (< MIN_SAMPLE checked) uses a conservative default rather than a noisy ratio.
//   • FINDER_DAILY_MULTIPLE, if set, is a manual override escape hatch (flat multiple × cap).
export async function computeFinderBudget(
  sql: any,
  now: Date = new Date(),
): Promise<{ budget: number; cap: number; passRate: number; sampleChecked: number; source: 'measured' | 'default' | 'override' }> {
  const cap = dailySendCap(now)
  const override = process.env.FINDER_DAILY_MULTIPLE
  if (override) {
    const m = Number(override)
    if (Number.isFinite(m) && m > 0) return { budget: Math.max(cap, Math.round(m * cap)), cap, passRate: NaN, sampleChecked: 0, source: 'override' }
  }
  const PASS_DEFAULT = 0.6, PASS_MIN = 0.35, PASS_MAX = 0.7, BUFFER = 1.1, MIN_SAMPLE = 20
  let passRate = PASS_DEFAULT
  let sampleChecked = 0
  try {
    const r = (await sql`SELECT
      count(*) FILTER (WHERE refill_checked_at IS NOT NULL)::int AS checked,
      count(*) FILTER (WHERE refill_checked_at IS NOT NULL AND sanitize_reason='mev_valid')::int AS promoted
      FROM ps_outreach_leads WHERE refill_checked_at > now() - interval '7 days'`)[0]
    sampleChecked = Number(r?.checked ?? 0)
    if (sampleChecked >= MIN_SAMPLE && Number(r?.promoted) > 0) passRate = Number(r.promoted) / sampleChecked
  } catch {
    /* fall back to the conservative default — never throw the finder's budget calc */
  }
  const source = sampleChecked >= MIN_SAMPLE ? 'measured' : 'default'
  const clamped = Math.min(PASS_MAX, Math.max(PASS_MIN, passRate)) // clamp: fail toward feeding
  const budget = Math.max(cap, Math.ceil((cap / clamped) * BUFFER)) // never below the cap itself
  return { budget, cap, passRate: clamped, sampleChecked, source }
}
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

// ── PS-ICY-GUARD-01: the finder chokepoint ───────────────────────────────────
/**
 * A finder credit must never be spent to re-derive an address we already hold.
 *
 * THE PRECEDENT: that is exactly how AMF's shared pool was drained to 0 (PS-REFILL-03) — the
 * refill was calling the FINDER on ps_outreach_leads rows that already had an email in the row.
 * That specific path is gone: sanitizeRefill.ts now only VERIFIES (MyEmailVerifier / MX) and
 * imports no finder at all. This guard closes the same leak one layer up, where it can still
 * happen: `lead_research_queue` is keyed by DOMAIN and has no email column, so no row here ever
 * "has an email" in the AMF sense — but the DOMAIN can already have a perfectly good address
 * sitting in ps_outreach_leads from the CSV import, and the finder would happily pay to find it
 * again. Measured on prod 2026-07-24: all 7 rows that ended in status 'duplicate' were at a
 * domain that already held a personal address. The dedup check runs AFTER the spend, so it
 * detects the waste but does not prevent it. This runs BEFORE.
 *
 * WHAT IT MUST NOT DO — and this is why the predicate is narrow rather than "domain has any
 * email": 107 of the 149 queued domains that overlap the CSV import hold ONLY generic org
 * inboxes (info@, sales@, support@). sanitizeRefill.isOrgInbox() blocks those from ever being
 * promoted, so they are dead stock, and finding a named human there is the single highest-value
 * thing the finder does. A blanket domain guard would skip all 107 and starve the send pool to
 * save credits — trading the pipeline for the meter. So: skip only when the domain already has a
 * SENDABLE address (a real mailbox, not an org inbox, not bounced, not unsubscribed).
 *
 * Structural, not conventional: every finder call in this module goes through here, so a new
 * call site cannot bypass it by forgetting a convention. Returns before any HTTP request, so a
 * skip costs zero credits with either vendor.
 */
export type FinderOutcome = AmfResult | 'already_have_sendable'

/** Addresses at this domain that we could actually send to today. */
async function sendableAddressesAtDomain(sql: ReturnType<typeof getSql>, domain: string): Promise<string[]> {
  const d = String(domain).trim().toLowerCase()
  if (!d) return []
  const rows = (await sql`
    SELECT email FROM ps_outreach_leads
    WHERE split_part(lower(email), '@', 2) = ${d}
      AND bounced = false AND unsubscribed = false
      AND pipeline_stage NOT IN ('dead')`) as Array<{ email: string }>
  // isOrgInbox is the SAME predicate the refill uses to decide promotability. Sharing it is the
  // point: if the refill would never send to it, holding it is not a reason to skip the finder.
  return rows.map(r => String(r.email)).filter(e => !isOrgInbox(e))
}

/**
 * The ONLY way this module reaches a paid finder. Mirrors ScrollFuel's findEmailForDomainOnly():
 * check first, spend second, and say out loud when a call was skipped.
 */
export async function findEmailForDomainOnly(
  sql: ReturnType<typeof getSql>,
  domain: string,
  companyName: string | null,
  finder: string,
): Promise<FinderOutcome> {
  const existing = await sendableAddressesAtDomain(sql, domain).catch((e: any) => {
    // Fail OPEN on a read error: a DB hiccup must not silently disable lead generation. Say so —
    // an unguarded call is a thing we want to see in the log, not a thing we want to assume.
    console.error(`[finder-guard] ${domain}: precheck FAILED (${String(e?.message || e).slice(0, 100)}) — proceeding UNGUARDED`)
    return [] as string[]
  })
  if (existing.length) {
    // The log line is the whole point of "enforce it structurally" — a guard nobody can see
    // working is indistinguishable from a guard that silently stopped working.
    console.log(`[finder-guard] SKIP ${domain} — already hold ${existing.length} sendable address(es) (${existing.slice(0, 2).join(', ')}); 0 credits spent`)
    // Count the SKIP. Spend avoided is invisible in a balance reading — this is the only record
    // that the guard did anything, and the only way to show what it saved.
    await recordProviderCall({ provider: finder === 'amf' ? 'amf' : 'icypeas', endpoint: 'guard/skip', sent: false, skipped: 1 })
    return 'already_have_sendable'
  }
  return finder === 'amf'
    ? await enrichViaAnyMailFinder(String(domain))
    : await enrichViaIcypeas(String(domain), companyName)
}

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
    if (res.status === 404) {
      await recordProviderCall({ provider: 'amf', endpoint: 'find-email/company', results: 0 })
      return null // genuine miss — AMF only charges on a hit, so this is free
    }
    if (!res.ok) {
      // 401 bad key / 402 out of credits / 5xx — the lookup did not happen. NOT a miss.
      console.error(`[amf] ${domain} FAILED status=${res.status} — VENDOR FAILURE, not "no email found". body=${body.slice(0, 200)}`)
      await recordProviderCall({ provider: 'amf', endpoint: 'find-email/company', sent: false })
      return 'vendor_error'
    }
    const d = JSON.parse(body || '{}') as { emails?: string[]; valid_emails?: string[]; email_status?: string }
    const email = d.valid_emails?.[0] || d.emails?.[0]
    // AMF bills only on a hit, so `results` is 1/0 rather than a page size.
    await recordProviderCall({ provider: 'amf', endpoint: 'find-email/company', results: email ? 1 : 0 })
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

// ── ICYPEAS finder (PS-FINDER-ICYPEAS-01) ────────────────────────────────────────────────────
// AMF's shared pool hit 0 (2026-07-22), so the finder is dead — Icypeas is the active replacement.
// Auth is the SIMPLE raw-key header (verified live: `Authorization: <key>`; Bearer 401s; no HMAC
// needed — reported to the founder). The chain is FULLY SYNCHRONOUS (no polling): find-people and
// sync/email-search both return in the response, so there is no async budget risk.
//
// Chain, per domain-only lead:
//   1. find-people({query:{currentCompanyName:{include:[name]}}}) → people at that company
//   2. pick the top decision-maker(s) → firstname/lastname
//   3. sync/email-search({firstname,lastname,domainOrCompany}) → the PERSONAL email
// Measured 16% personal on 25 named MSP domains vs AMF's 80% — kept only because 16% beats a dead
// pipeline. The bottleneck is Icypeas lead-DB coverage of small MSPs (60% return no name at all),
// which is WHY this needs company_name; a domain-derived guess is a weak fallback for nameless leads.
//
// SHARED with ScrollFuel: one 1,000-credit pool, two products. sync/email-search charges ~1 credit
// per FOUND (misses free); find-people is ~0.02/result. Rate limit 30 req/min — every Icypeas call
// is paced through icyThrottle below.
let icyKeyWarned = false
let icyLastCallAt = 0
const ICY_MIN_GAP_MS = 2100 // 30 req/min with headroom
async function icyThrottle(): Promise<void> {
  const wait = icyLastCallAt + ICY_MIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  icyLastCallAt = Date.now()
}
/** Billable units in an Icypeas response: leads for a search, 1 for a FOUND email, else 0. */
function icyResultCount(json: any): number {
  if (Array.isArray(json?.leads)) return json.leads.length
  return json?.status === 'FOUND' ? 1 : 0
}

async function icyPost(path: string, body: unknown, key: string): Promise<any | 'vendor_error'> {
  await icyThrottle()
  try {
    const r = await fetch(`https://app.icypeas.com/api/${path}`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (r.status === 401 || r.status === 402 || r.status === 429) {
      console.error(`[icypeas] ${path} status=${r.status} — VENDOR FAILURE (401 key / 402 credits / 429 rate). NOT a miss.`)
      // A rejected request is not a call we were billed for — record it as attempted, not spent.
      await recordProviderCall({ provider: 'icypeas', endpoint: path, sent: false })
      return 'vendor_error'
    }
    if (!r.ok) {
      console.error(`[icypeas] ${path} status=${r.status}`)
      await recordProviderCall({ provider: 'icypeas', endpoint: path, sent: false })
      return 'vendor_error'
    }
    const json = await r.json()
    // PS-FINDER-LEDGER-01: this is the chokepoint both Icypeas endpoints pass through, so it is
    // the one place that can count calls AND billable results without a caller remembering to.
    const results = icyResultCount(json)
    console.log(`[icypeas] ${path} → ${results} result(s)`)
    await recordProviderCall({ provider: 'icypeas', endpoint: path, results })
    return json
  } catch (e: any) {
    console.error(`[icypeas] ${path} threw: ${String(e?.message || e).slice(0, 140)}`)
    await recordProviderCall({ provider: 'icypeas', endpoint: path, sent: false })
    return 'vendor_error'
  }
}

// A company name for find-people: prefer the harvested one; else a weak guess from the domain
// (strip TLD, de-dash). The guess rarely matches Icypeas's lead DB, but a nameless lead has no
// other shot and this never costs a credit (find-people bills per RESULT, and a no-match is empty).
function companyNameFor(domain: string, companyName?: string | null): string {
  const c = (companyName ?? '').trim()
  if (c) return c
  return String(domain).replace(/\.[a-z.]+$/i, '').replace(/[-_]+/g, ' ').trim()
}

const DECISION_MAKER = /owner|founder|co-found|ceo|president|principal|partner|managing|director|chief|cto|cio|\bvp\b|vice president|manager/i

async function enrichViaIcypeas(domain: string, companyName?: string | null): Promise<AmfResult> {
  const key = process.env.ICYPEAS_API_KEY?.trim()
  if (!key) {
    if (!icyKeyWarned) {
      icyKeyWarned = true
      console.error('[icypeas] ICYPEAS_API_KEY is NOT SET — finder DISABLED. Every lookup returns vendor_error (NOT a miss) so no lead is retired for a key we never set.')
    }
    return 'vendor_error'
  }
  // 1. Find people at the company.
  //
  // PS-FINDER-CAP-01 (2026-07-24): this call used to send NO pagination object. Per Icypeas's
  // documented schema (api-doc.icypeas.com/leads-db/find-people, verified 2026-07-24) the
  // `pagination.size` default is 100, min 1, max 200 — so every call pulled up to 100 leads and
  // the code below kept `.slice(0, 2)`. Reconstructed spend for 2026-07-23→24: ~210 of 299
  // credits went on 247 find-people calls, implying ~42 billed results per call, against 4 we
  // could possibly use. That is the single largest line in the finder bill.
  //
  // THE TRADE-OFF, stated because it is real: the filter below drops leads without a first AND
  // last name (the module's own measurement says ~60% of small MSPs return no name at all), and
  // the sort then ranks decision-makers first. A big page means picking the best of many; a
  // small page means taking what arrives. Too small a cap saves credits by lowering the hit
  // rate, which starves a send pool currently running at zero buffer — a worse outcome than the
  // spend. Tunable without a deploy for exactly that reason; raise it if yield drops.
  const size = Math.min(200, Math.max(1, Number(process.env.ICYPEAS_FIND_PEOPLE_SIZE ?? 3)))
  const fp = await icyPost(
    'find-people',
    { query: { currentCompanyName: { include: [companyNameFor(domain, companyName)] } }, pagination: { size } },
    key,
  )
  if (fp === 'vendor_error') return 'vendor_error'
  const leads: Array<{ firstname?: string; lastname?: string; headline?: string }> = fp?.leads ?? []
  const named = leads
    .filter(l => l.firstname && l.lastname && !/[.,]/.test(l.firstname) && l.firstname.length <= 20 && (l.lastname as string).length <= 30)
    .sort((a, b) => (DECISION_MAKER.test(b.headline || '') ? 1 : 0) - (DECISION_MAKER.test(a.headline || '') ? 1 : 0))
    .slice(0, 2)
  if (named.length === 0) return null // genuine miss: no person for this company in the lead DB

  // 2. Resolve the personal email for the best-ranked name(s).
  for (const n of named) {
    const es = await icyPost('sync/email-search', { firstname: n.firstname, lastname: n.lastname, domainOrCompany: domain }, key)
    if (es === 'vendor_error') return 'vendor_error' // don't burn the lead's retry budget on an outage
    if (es?.status === 'FOUND' && es.emails?.[0]?.email) {
      return { email: String(es.emails[0].email).trim().toLowerCase(), name: `${n.firstname} ${n.lastname}`, title: n.headline || null }
    }
  }
  return null // had name(s) but no verifiable personal email — a genuine miss
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
    await recordProviderCall({ provider: 'hunter', endpoint: 'domain-search', results: d?.data?.emails?.length ?? 0 })
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
  // PS-ICY-GUARD-01: finder_skipped_have_email is reported per run so the guard's effect is
  // VISIBLE in agent_health telemetry, not just in a log line nobody reads.
  const stats = { discovered: 0, enriched: 0, added: 0, skipped: 0, finder_skipped_have_email: 0, errors: [] as string[] }
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

    // PS-FINDER-THROTTLE-02: DEMAND-AWARE budget. We send min(cap, available) = 50→100/day, and
    // only ~63% of finds survive MEV verify, so the finds NEEDED to keep the send fed are
    // cap / pass_rate (+ a small buffer) — not a flat multiple. computeFinderBudget self-tunes as
    // the cap ramps and the pass-rate drifts, and FLOORS the budget (pass-rate clamped ≤ 0.7) so a
    // fluke-high reading can't collapse it and starve the send. Once met, skip enriching entirely.
    const { budget: finderDailyBudget, passRate, sampleChecked } = await computeFinderBudget(sql, new Date())
    // Finds today = ps_outreach_leads the researcher inserted since UTC midnight (its only writer;
    // the backlog is weeks old, the refill only UPDATEs). Duplicates don't insert, so this ≈ credits spent.
    const producedToday = Number((await sql`SELECT count(*) AS n FROM ps_outreach_leads
      WHERE source = 'google_maps' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`)[0]?.n ?? 0)
    if (producedToday >= finderDailyBudget) {
      console.log(`[researcher] finder budget ${finderDailyBudget}/day (pass-rate ${Math.round(passRate * 100)}%, n=${sampleChecked}) already met (${producedToday} today) — skipping to conserve shared Icypeas credits`)
      await reportAgentRun('researcher', true, { ...stats, finder_budget_reached: true, produced_today: producedToday, finder_budget: finderDailyBudget, pass_rate: passRate }, undefined, COMPANY_ID)
      return { ...stats, budget_exhausted: budgetExhausted, finder_budget_reached: true, elapsed_s: el() }
    }

    const pending = await sql`
      SELECT id, domain, company_name, research_data FROM lead_research_queue
      WHERE company_id = ${COMPANY_ID} AND status = 'pending' AND attempts < ${MAX_RESEARCH_ATTEMPTS}
      ORDER BY created_at ASC LIMIT ${batchSize}`

    for (const item of pending) {
      // PS-FINDER-THROTTLE-01: stop the moment today's finder output (prior + this run's inserts)
      // reaches the budget — no more credit-spending lookups for the day.
      if (producedToday + stats.added >= finderDailyBudget) {
        console.log(`[researcher] t=${el()}s finder budget ${finderDailyBudget} reached mid-run (${producedToday + stats.added}) — stopping`)
        break
      }
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
        // PS-FINDER-ICYPEAS-01: finder is env-selectable so we can switch back to AMF INSTANTLY
        // if its shared pool is topped up — LEAD_FINDER=amf restores the old path, no deploy of
        // logic, just an env flip. Default is icypeas (AMF is at 0). The AMF code stays intact and
        // dormant below. Both return the same 3-way contract (hit / null miss / 'vendor_error').
        const finder = (process.env.LEAD_FINDER ?? 'icypeas').toLowerCase()
        // PS-ICY-GUARD-01: routed through the chokepoint — it prechecks and can return without
        // spending a credit with either vendor.
        const primary = await findEmailForDomainOnly(sql, String(item.domain), item.company_name as string | null, finder)

        // We already hold a sendable address at this domain. Retire the row as 'duplicate' — the
        // status that already means "we have this contact" — WITHOUT calling Hunter either: a
        // second paid enricher for a contact we hold is the same waste with a different invoice.
        if (primary === 'already_have_sendable') {
          stats.skipped++
          stats.finder_skipped_have_email = (stats.finder_skipped_have_email ?? 0) + 1
          await sql`UPDATE lead_research_queue SET status='duplicate', updated_at=NOW() WHERE id=${item.id}`
          continue
        }

        const amfVendorError = primary === 'vendor_error' // "the lookup never ran" — do not retire the lead
        let hunter = primary && primary !== 'vendor_error' ? primary : null
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
