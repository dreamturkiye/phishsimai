import { getSql } from '../conn'
import { discoverMspsForCity } from './mapsDiscovery'
import { reportAgentRun } from '../agentHealth'
import { sendTelegram } from '../telegram'

const COMPANY_ID = 'phishsimai'
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

async function enrichViaHunter(domain: string) {
  const key = process.env.HUNTER_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${key}&limit=5`)
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
  // Australia
  ['Sydney', 'New South Wales', 'Australia'],
  ['Melbourne', 'Victoria', 'Australia'],
  ['Brisbane', 'Queensland', 'Australia'],
  ['Perth', 'Western Australia', 'Australia'],
  ['Adelaide', 'South Australia', 'Australia'],
]

/**
 * ONE city per run, chosen by day-of-year. Deterministic, stateless, and self-pacing:
 * 30 cities x ~20 places = ~600 places/month, which is roughly the Outscraper free tier.
 * The pace is a property of the design, not a limit someone has to remember to enforce.
 *
 * Re-running the same day is free: UNIQUE(company_id, domain) makes the insert idempotent,
 * and measured overlap is real (Seriun and AAG appeared under two different queries).
 */
export async function runLeadDiscover(limit = 20) {
  const start = Date.now()
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000)
  const [city, region, country] = ICP_CITIES[dayOfYear % ICP_CITIES.length]
  try {
    const r = await discoverMspsForCity('managed service provider', city, region, country, limit)
    const result = { discovered: r.queued, candidates: r.found, icp: r.icp, city, country, noGeo: r.skippedNoGeo }
    await reportAgentRun('discover', true, { ...result, duration_ms: Date.now() - start })
    return result
  } catch (e: any) {
    // LOUD. A dead vendor must never read as "no MSPs in this city" -- that mistake is what
    // let 3,000 fabricated leads look like a working pipeline.
    await reportAgentRun('discover', false, { city, country }, e?.message)
    return { discovered: 0, candidates: 0, error: e?.message, city, country }
  }
}

export async function runLeadResearcher(batchSize = 6) {
  const sql = getSql()
  await ensureResearchQueue(sql)
  const stats = { discovered: 0, enriched: 0, added: 0, skipped: 0, errors: [] as string[] }
  const start = Date.now()

  try {
    const discover = await runLeadDiscover(batchSize * 2)
    stats.discovered = discover.discovered

    const pending = await sql`
      SELECT id, domain, company_name FROM lead_research_queue
      WHERE company_id = ${COMPANY_ID} AND status = 'pending' AND attempts < 3
      ORDER BY created_at ASC LIMIT ${batchSize}`

    for (const item of pending) {
      try {
        await sql`UPDATE lead_research_queue SET status='researching', attempts=attempts+1, last_attempt_at=NOW() WHERE id=${item.id}`
        const hunter = await enrichViaHunter(String(item.domain))

        if (hunter?.email) {
          stats.enriched++
          const dup = await sql`SELECT id FROM ps_outreach_leads WHERE LOWER(email) = LOWER(${hunter.email}) LIMIT 1`
          if (dup.length > 0) {
            stats.skipped++
            await sql`UPDATE lead_research_queue SET status='duplicate', updated_at=NOW() WHERE id=${item.id}`
          } else {
            await sql`INSERT INTO ps_outreach_leads (email, name, company, title, source, pipeline_stage)
              VALUES (${hunter.email}, ${hunter.name || item.company_name}, ${item.company_name || String(item.domain).split('.')[0]}, ${hunter.title || 'Owner'}, 'lead_researcher', 'prospect')
              ON CONFLICT (email) DO NOTHING`
            stats.added++
            await sql`UPDATE lead_research_queue SET status='enriched', icp_score=72, updated_at=NOW() WHERE id=${item.id}`
          }
        } else {
          stats.skipped++
          await sql`UPDATE lead_research_queue SET status='pending', updated_at=NOW() WHERE id=${item.id}`
        }
        await new Promise(r => setTimeout(r, 1500))
      } catch (e: any) {
        stats.errors.push(`${item.domain}: ${e.message?.slice(0, 80)}`)
        await sql`UPDATE lead_research_queue SET status='failed', updated_at=NOW() WHERE id=${item.id}`
      }
    }

    await reportAgentRun('researcher', true, { ...stats, duration_ms: Date.now() - start }, undefined, COMPANY_ID)
    if (stats.added > 0) {
      await sendTelegram(`PHISHSIMAI RESEARCHER: +${stats.added} MSP leads\nDiscovered:${stats.discovered} Enriched:${stats.enriched} Skipped:${stats.skipped}`)
    }
  } catch (e: any) {
    await reportAgentRun('researcher', false, {}, e.message, COMPANY_ID)
    stats.errors.push('Fatal: ' + e.message)
  }
  return stats
}
