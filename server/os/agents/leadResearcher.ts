import { getSql } from '../conn'
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

export async function runLeadDiscover(_batchSize = 8) {
  // PS-LEADGEN-V2 Phase 0 -- LLM "discovery" DELETED.
  //
  // This called discoverMSPsViaGroq(), which asked an LLM at temperature 0.7 to
  // "Generate N real MSP or MSSP company domains". A language model holds no registry of
  // MSPs; it pattern-matches plausible ones. It emitted the same person ("James Thompson")
  // in Cardiff, Manchester and New York at once and filled lead_research_queue with ~2,996
  // invented rows, which Aria then sequenced. That is why outbound is hard-paused
  // (PS-INCIDENT-01).
  //
  // No prompt repairs this. Fabrication was not a bug in the mechanism -- it WAS the
  // mechanism. Phase 1 replaces it with sources a human can go and verify: the UK Cyber
  // Essentials register, CompTIA / MSPAlliance directories, Clutch, and Google Maps via
  // Outscraper. Every lead will carry a `source` naming a real place and a `country`
  // derived from a real address signal -- never guessed, never generated.
  //
  // Until then this returns ZERO and says why. An empty queue is honest; a queue full of
  // fiction is what got us here.
  const start = Date.now()
  const result = {
    discovered: 0,
    candidates: 0,
    disabled: 'PS-LEADGEN-V2 Phase 0: LLM discovery deleted. Real sources land in Phase 1.',
  }
  await reportAgentRun('discover', true, { ...result, duration_ms: Date.now() - start })
  return result
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
