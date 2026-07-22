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
import { sendTelegram } from '../telegram'
import { dailySendCap } from '../sequences'
import { DISQUALIFIED_LABELS } from '../sanitizeRefill'
import { computeFinderBudget } from './leadResearcher'

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
  // Seed the single row so the cursor UPDATE (WHERE id=1) actually persists — without this the
  // table has no row, the UPDATE is a no-op, and every run restarts at 0 (re-scraping the top).
  await sql`INSERT INTO msp_hub_harvest_state (id, cursor, total) VALUES (1, 0, 0) ON CONFLICT (id) DO NOTHING`.catch(() => {})
}

async function fetchCompanyUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`sitemap-companies HTTP ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>\s*([^<\s]+\/msp\/company\/[^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
}

// Parse the company's real domain out of the profile's JSON-LD LocalBusiness.url. Returns null on
// any fetch/parse failure or if the only url is mymsphub itself (a listing with no linked site).
// PS-FINDER-ICYPEAS-01: return the company NAME alongside the domain. The JSON-LD LocalBusiness
// block already carries `name` right next to `url`; we were throwing it away and inserting
// company_name=null. That's fine for AMF (domain-only finder) but fatal for Icypeas, whose
// Find-People step searches by company NAME — a nameless lead can't be enriched. Capturing the
// name here is what makes the Icypeas switch actually work on the bulk mymsphub source.
async function domainFromProfile(url: string): Promise<{ domain: string; name: string | null } | null> {
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
          const dom = hostnameOf(it.url)
          if (!dom) continue
          const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : null
          return { domain: dom, name }
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
      const prof = await domainFromProfile(slice[i])
      const domain = prof?.domain ?? null
      const companyName = prof?.name ?? null
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
          VALUES (${COMPANY_ID}, ${domain}, ${companyName}, 'mymsphub', 'pending',
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

// ── PS-CREDITS-01 / PS-FINDER-ICYPEAS-01: daily credit-balance monitoring on the morning funnel
// line. ICYPEAS is now the FINDER pool (shared with ScrollFuel — one 1,000-credit pool, two
// products; empty = both products' enrichment dark). AMF is retired (pool hit 0). MEV is the
// verifier. Balances are logged each run for day-over-day burn + a "dropping fast" flag.
const ICY_LOW = 200 // founder-set low-balance warning on the shared 1,000 pool
const MEV_LOW = 1000

async function ensureCreditLog(sql: any): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS credit_readings (
    id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, credits INTEGER NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`.catch(() => {})
}

// Icypeas remaining credits (shared with ScrollFuel). POST /a/actions/subscription-information with
// the simple raw-key Authorization header — verified live 2026-07-22. Field: `credits`.
export async function icypeasCredits(): Promise<number | null> {
  const key = process.env.ICYPEAS_API_KEY?.trim()
  if (!key) return null
  try {
    const r = await fetch('https://app.icypeas.com/api/a/actions/subscription-information', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { credits?: number }
    const c = Number(d?.credits)
    return Number.isFinite(c) ? Math.floor(c) : null // credit_readings.credits is INTEGER
  } catch {
    return null
  }
}

async function mevCredits(): Promise<number | null> {
  const key = process.env.MYEMAILVERIFIER_API_KEY?.trim()
  if (!key) return null
  try {
    const r = await fetch(`https://client.myemailverifier.com/verifier/getcredits/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { credits?: number }
    const c = Number(d?.credits)
    return Number.isFinite(c) ? c : null
  } catch {
    return null
  }
}

// Balance + day-over-day burn + ~days-left + LOW / dropping-fast flags. Logs this reading for trend.
async function creditLine(sql: any, provider: string, current: number | null, low: number, label: string): Promise<string> {
  if (current == null) return `${label}: unknown ⚠️ (balance check failed)`
  let trend = ''
  try {
    const prev = (await sql`SELECT credits FROM credit_readings WHERE provider=${provider} AND read_at < now() - interval '20 hours' ORDER BY read_at DESC LIMIT 1`) as Array<{ credits: number }>
    await sql`INSERT INTO credit_readings (provider, credits) VALUES (${provider}, ${current})`
    const burn = prev[0] ? Number(prev[0].credits) - current : 0
    if (burn > 0) {
      const daysLeft = Math.floor(current / burn)
      trend = ` (−${burn.toLocaleString()}/day, ~${daysLeft}d left${daysLeft <= 7 ? ' ⏬ DROPPING FAST' : ''})`
    }
  } catch {
    /* trend is best-effort */
  }
  return `${label}: ${current.toLocaleString()}${current < low ? ' 🔴 LOW — top up' : ''}${trend}`
}

// PS-FUNNEL-01: ONE daily Telegram line so Kaan can watch harvest → valid/day end to end. Read-only.
export async function cronOutreachFunnel(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET
  if (!okCron && !okHq) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const sql = getSql()
    const n = async (q: Promise<any>) => Number((await q)[0]?.n ?? 0)
    const harvested24 = await n(sql`SELECT count(*) AS n FROM lead_research_queue WHERE created_at > now() - interval '24 hours'`)
    const queuePending = await n(sql`SELECT count(*) AS n FROM lead_research_queue WHERE status = 'pending' AND attempts < 3`)
    const enriched24 = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE created_at > now() - interval '24 hours'`)
    // PS-FUNNEL-02 (2026-07-22): this counted sanitize_reason='amf_valid', which PS-REFILL-03
    // (29368a8) stopped writing when the refill switched from AMF-find to MEV-verify — one commit
    // AFTER this line shipped. 'amf_valid' then existed nowhere but in this WHERE clause, so the
    // funnel read "valid 0" every day while the refill was in fact promoting normally. Count the
    // promotion itself (sanitized_at), and split out anything promoted WITHOUT a real mailbox
    // verdict so an MX-only promotion can never masquerade as verified.
    const promoted24 = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE sanitized_at > now() - interval '24 hours'`)
    const valid24 = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE sanitize_reason = 'mev_valid' AND sanitized_at > now() - interval '24 hours'`)
    const unverified24 = promoted24 - valid24
    const sendableNow = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE sanitized_at IS NOT NULL AND touch1_sent_at IS NULL AND country IN ('US','GB','AU') AND bounced = false AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')`)
    const sent24 = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE touch1_sent_at > now() - interval '24 hours'`)
    // PS-FUNNEL-02: crons run refill 06:30 → send 07:00 → this report 08:30, so `sendableNow` is
    // measured AFTER the send stamped touch1_sent_at and reads ~0 on a perfectly healthy day. That
    // looked like a drained pool. Report what the send actually had to draw from (pre-send) and
    // keep the post-send leftover as the secondary number — leftover 0 is normal, pre-send 0 is not.
    const sendablePreSend = sendableNow + sent24
    // PS-BACKLOG-RUNWAY-01: the actual constraint now is the VERIFIABLE backlog — leads that have
    // an email and haven't been disqualified, i.e. what the refill can still promote to sendable.
    // The refill draws it down at ~cap/day (to fill the send); the finder replenishes it. Show the
    // runway to sendable-0 so a drain is seen coming, not discovered at 0. While the finder
    // out-produces the cap it reads "stable"; the moment finder supply drops below the cap (credits
    // out, coverage falls) it flips to a day countdown.
    const cap = dailySendCap(new Date())
    const backlogVerifiable = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads
      WHERE email IS NOT NULL AND sanitized_at IS NULL AND touch1_sent_at IS NULL
        AND country IN ('US','GB','AU') AND bounced = false AND unsubscribed = false
        AND pipeline_stage NOT IN ('dead','customer')
        AND (sanitize_reason IS NULL OR sanitize_reason <> ALL(${DISQUALIFIED_LABELS}))`)
    const finderVerif24 = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads
      WHERE created_at > now() - interval '24 hours'
        AND (sanitize_reason IS NULL OR sanitize_reason <> ALL(${DISQUALIFIED_LABELS}))`)
    const netDrain = cap - finderVerif24
    const runway = netDrain > 0 ? `~${Math.floor(backlogVerifiable / netDrain)}d to sendable-0` : 'stable/growing ✅'
    // PS-FINDER-THROTTLE-02: show the demand-aware finder budget + the pass-rate it self-tuned from,
    // so the throttle is visible rather than silent — budget = ceil(cap / pass-rate) + buffer.
    const fb = await computeFinderBudget(sql, new Date())
    const budgetLine = `🎯 finder budget ${fb.budget}/day @ ${Math.round(fb.passRate * 100)}% MEV pass (n=${fb.sampleChecked}, ${fb.source}) · need cap ${fb.cap}`
    const runwayLine = `🛟 backlog ${backlogVerifiable} verifiable · finder +${finderVerif24}/day vs cap ${cap}/day → ${runway}`

    // PS-SEND-HEALTH-01: the business now runs on this send (1 signup / 20 emails). It must never
    // stop SILENTLY. This runs at 08:30, 90 min after the 07:00 send, so by now today's send is
    // done. Detect the three failure shapes and make each LOUD (a separate 🚨 Telegram), and tell a
    // real break apart from an expected empty pool.
    const capToday = dailySendCap(new Date())
    const sentToday = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE touch1_sent_at::date = CURRENT_DATE`)
    const sentYesterday = await n(sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE touch1_sent_at::date = CURRENT_DATE - 1`)
    const capYesterday = dailySendCap(new Date(Date.now() - 86_400_000))
    // The send cron reports as agent 'aria'. If its last run isn't today, the 07:00 cron never fired.
    const ariaRow = (await sql`SELECT last_run_at FROM agent_health WHERE company_id = ${COMPANY_ID} AND agent_name = 'aria' LIMIT 1`) as Array<{ last_run_at: string }>
    const todayUtc = new Date().toISOString().slice(0, 10)
    const ariaRanToday = !!ariaRow[0]?.last_run_at && new Date(ariaRow[0].last_run_at).toISOString().slice(0, 10) === todayUtc
    const poolWasAvailable = sendableNow + sentToday > 0 // leads existed to send at 07:00

    const sendAlerts: string[] = []
    let healthLine: string
    if (sentToday > 0) {
      healthLine = `✅ SEND ${sentToday}/${capToday}${sentToday < capToday ? ' ⚠️ below cap' : ''}`
    } else if (!ariaRanToday) {
      healthLine = `🚨 SEND CRON DID NOT RUN today (last: ${ariaRow[0]?.last_run_at ?? 'never'})`
      sendAlerts.push(`🚨 <b>PhishSim SEND FAILED</b> — the 07:00 send cron did NOT run today (last run ${ariaRow[0]?.last_run_at ?? 'never'}). Not a supply issue. Check /api/os/sequence.`)
    } else if (poolWasAvailable) {
      healthLine = `🚨 SEND RAN but sent 0 with ${sendableNow} sendable`
      sendAlerts.push(`🚨 <b>PhishSim SEND BROKEN</b> — the send ran but delivered 0 while ${sendableNow} leads were sendable. This is NOT the pool being empty — the send path is broken. Check /api/os/sequence.`)
    } else {
      healthLine = `⚪ sent 0 — pool empty (supply, expected, not a fault)`
    }
    // Early-warning: two consecutive under-cap days = supply thinning before it hits zero.
    if (sentToday < capToday && sentYesterday < capYesterday && sentYesterday > 0) {
      sendAlerts.push(`⚠️ <b>PhishSim SUPPLY DRAINING</b> — sends under cap two days running: ${sentYesterday}/${capYesterday} then ${sentToday}/${capToday}. The verified backlog is thinning; act before it reaches sendable-0.`)
    }
    for (const a of sendAlerts) await sendTelegram(a).catch(() => {})
    const funnel = { harvested24, queuePending, enriched24, promoted24, valid24, unverified24, sendablePreSend, sendableNow, sent24, backlogVerifiable, finderVerif24, cap, runway }
    await ensureCreditLog(sql)
    // PS-FINDER-ICYPEAS-01: report the ICYPEAS finder balance in place of AMF (retired at 0).
    const [icy, mev] = await Promise.all([icypeasCredits(), mevCredits()])
    const icyLine = await creditLine(sql, 'icypeas', icy, ICY_LOW, 'Icypeas finder (shared w/ ScrollFuel)')
    const mevLine = await creditLine(sql, 'mev', mev, MEV_LOW, 'MEV verifier')
    await sendTelegram(
      `📊 <b>PhishSim outreach funnel · 24h</b>\n` +
        `harvested ${harvested24} → queue ${queuePending} pending → enriched ${enriched24} → verified-valid ${valid24}${unverified24 > 0 ? ` ⚠️ +${unverified24} promoted UNVERIFIED` : ''} → sendable ${sendablePreSend} pre-send (${sendableNow} left) → sent ${sent24}\n` +
        `${healthLine}\n${runwayLine}\n${budgetLine}\n` +
        `💳 ${icyLine}\n💳 ${mevLine}`,
    ).catch(() => {})
    return res.json({ ok: true, ...funnel, credits: { icypeas: icy, mev } })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
