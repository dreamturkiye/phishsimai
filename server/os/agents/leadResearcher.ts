import { getSql } from '../conn'
import { reportAgentRun } from '../agentHealth'
import { sendTelegram } from '../telegram'
import { llmComplete } from '../llmChat'

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

async function discoverMSPsViaGroq(existingDomains: Set<string>, batchSize: number) {
  try {
    const { text } = await llmComplete({
      messages: [{ role: 'user', content: `You are a B2B lead researcher for the MSP/MSSP market.
Generate ${batchSize} real MSP or MSSP company domains for cold outreach (phishing simulation and security awareness training).
Target: US, Canada, UK, or Australia-based MSPs with 5-200 employees, serving SMBs with compliance pressure (SOC2, HIPAA, PCI, ISO27001).
Return ONLY valid JSON array with no markdown: [{"domain":"example.com","company_name":"Example MSP","source":"ai_discovery"}]
Real companies only. Avoid Accenture, IBM, Deloitte, or companies with >500 employees.
Already found: ${[...existingDomains].slice(0, 20).join(', ')}` }],
      max_tokens: 600,
      temperature: 0.7,
    })
    const match = (text || '[]').match(/\[[\s\S]*?\]/)
    if (!match) return []
    const candidates = JSON.parse(match[0])
    return candidates.filter((c: any) => c.domain && !existingDomains.has(c.domain))
  } catch { return [] }
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

export async function runLeadDiscover(batchSize = 8) {
  const sql = getSql()
  await ensureResearchQueue(sql)
  const existing = await sql`SELECT domain FROM lead_research_queue WHERE company_id = ${COMPANY_ID} LIMIT 200`
  const existingDomains = new Set(existing.map((r: any) => r.domain))
  const candidates = await discoverMSPsViaGroq(existingDomains, batchSize)
  let discovered = 0
  for (const c of candidates) {
    try {
      await sql`INSERT INTO lead_research_queue (company_id, domain, company_name, source, status)
        VALUES (${COMPANY_ID}, ${c.domain}, ${c.company_name}, ${c.source || 'ai_discovery'}, 'pending')
        ON CONFLICT (company_id, domain) DO NOTHING`
      discovered++
    } catch {}
  }
  return { discovered, candidates: candidates.length }
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
