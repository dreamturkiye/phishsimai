import { getSql } from '../conn'
import { reportAgentRun } from '../agentHealth'

const COMPANY_ID = 'phishsimai'

/**
 * PS-LEADGEN-V2 Phase 1 — REAL discovery from Google Maps via Outscraper.
 *
 * This replaces discoverMSPsViaGroq(), which asked an LLM at temperature 0.7 to "generate
 * real MSP domains" and produced ~3,000 invented companies -- the same person in three
 * cities at once. Every row here traces to a Google Maps listing a human can open.
 *
 * Measured 2026-07-15 against the live API before any of this was written:
 *  - "managed service provider, Manchester, England, United Kingdom" -> 5 real MSPs
 *    (Seriun, AAG IT Services, Texaport, Remedian, The PC Support Group).
 *  - The SAME query with ", Manchester, GB" returned the CITY of Manchester
 *    (kgmid /m/052bw, manchester.gov.uk). The region term is load-bearing; without it
 *    Google answers with a knowledge-panel entity and it looks like a result.
 *  - Every real hit carried type='Computer support and services' -- a genuine Google
 *    category, and a better ICP filter than any keyword guess.
 *  - country_code='GB'. The `country` field is the long form ("United Kingdom of Great
 *    Britain and Northern Ireland") and would NEVER match the ['US','GB','AU'] allowlist.
 *    Mapping `country` instead of `country_code` would have silently rejected 100% of
 *    leads while the gate looked healthy.
 *  - Some listings return country_code=null. Those are stored as NULL and the geo gate
 *    (PS-GEO-01) makes them unsendable by construction. Unknown is not permission.
 */

const OUTSCRAPER_ENDPOINT = 'https://api.app.outscraper.com/maps/search-v3'

/** Google's own category for MSPs. Verified present on every real hit in the probe. */
const ICP_TYPE = 'computer support and services'

export type MapsPlace = {
  place_id?: string
  name?: string
  site?: string
  website?: string
  phone?: string
  country_code?: string | null
  city?: string | null
  type?: string | null
  full_address?: string | null
}

/** Strip a bare hostname from a Maps site URL. Tracking params are common (utm_*, GBP). */
export function hostnameOf(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const h = new URL(decodeURIComponent(String(url))).hostname.toLowerCase()
    return h.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * One Outscraper query. Returns raw places. Throws LOUD on vendor failure -- a dead API
 * must never look like "no MSPs in this city" (SF-GOLIVE-04 / SF-ENRICH-03, learned the
 * hard way on the other product).
 */
export async function searchMaps(query: string, limit = 20): Promise<MapsPlace[]> {
  const key = process.env.OUTSCRAPER_API_KEY?.trim()
  if (!key) {
    throw new Error('OUTSCRAPER_API_KEY is NOT SET — discovery is DISABLED, not empty. An unconfigured finder must never be mistaken for an exhausted city.')
  }
  const url = `${OUTSCRAPER_ENDPOINT}?query=${encodeURIComponent(query)}&limit=${limit}&async=false`
  const res = await fetch(url, { headers: { 'X-API-KEY': key } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Outscraper ${res.status} for "${query}" — VENDOR FAILURE, not "no results". ${body.slice(0, 200)}`)
  }
  const json: any = await res.json()
  return (json?.data?.[0] ?? []) as MapsPlace[]
}

/** ICP shape: a real MSP with a real site. Rejects knowledge-panel entities and no-site listings. */
export function isIcpMsp(p: MapsPlace): boolean {
  if (!hostnameOf(p.site || p.website)) return false
  const t = String(p.type || '').toLowerCase()
  return t.includes(ICP_TYPE) || t.includes('it service') || t.includes('computer consultant')
}

/**
 * Discover MSPs for one city and queue them. Idempotent: UNIQUE(company_id, domain) makes
 * re-runs free, which matters because query results overlap heavily (Seriun and AAG both
 * appeared under two different queries in the probe) and the free tier is ~500/month.
 */
export async function discoverMspsForCity(
  category: string,
  city: string,
  region: string,
  country: string,
  limit = 20,
): Promise<{ found: number; icp: number; queued: number; skippedNoGeo: number }> {
  const sql = getSql()
  const start = Date.now()
  const query = `${category}, ${city}, ${region}, ${country}`
  const places = await searchMaps(query, limit)

  let icp = 0
  let queued = 0
  let skippedNoGeo = 0

  for (const p of places) {
    if (!isIcpMsp(p)) continue
    icp++
    const domain = hostnameOf(p.site || p.website)
    if (!domain) continue
    const cc = p.country_code ? String(p.country_code).toUpperCase() : null
    if (!cc) skippedNoGeo++
    const rows = (await sql`
      INSERT INTO lead_research_queue (company_id, domain, company_name, source, status, research_data)
      VALUES (
        ${COMPANY_ID},
        ${domain},
        ${p.name ?? null},
        'google_maps',
        'pending',
        ${JSON.stringify({
          place_id: p.place_id ?? null,
          country_code: cc,
          city: p.city ?? null,
          phone: p.phone ?? null,
          type: p.type ?? null,
          full_address: p.full_address ?? null,
          query,
          discovered_at: new Date().toISOString(),
        })}
      )
      ON CONFLICT (company_id, domain) DO NOTHING
      RETURNING id`) as any[]
    if (rows.length > 0) queued++
  }

  const result = { found: places.length, icp, queued, skippedNoGeo }
  await reportAgentRun('discover', true, { ...result, query, duration_ms: Date.now() - start })
  return result
}
