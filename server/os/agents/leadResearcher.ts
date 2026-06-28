import { connect } from '@tidbcloud/serverless'
import { reportAgentRun } from '../agentHealth'
import { sendTelegram } from '../telegram'

const COMPANY_ID = 'phishsimai'
const MSP_TITLES = ['Owner','CEO','Founder','President','Managing Director','IT Director','CISO','Head of Security','CTO']

const getConn = () => connect({ url: process.env.DATABASE_URL! })

async function ensureResearchQueue() {
  const conn = getConn()
  await conn.execute(`CREATE TABLE IF NOT EXISTS lead_research_queue (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    company_id VARCHAR(100) NOT NULL DEFAULT 'phishsimai',
    domain VARCHAR(255) NOT NULL, company_name VARCHAR(255), source VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', icp_score INT DEFAULT 0, research_data JSON,
    attempts INT DEFAULT 0, last_attempt_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_domain (company_id, domain)
  )`)
}

async function discoverMSPsViaGroq(existingDomains: Set<string>, batchSize: number) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: `You are a B2B lead researcher for the MSP/MSSP market.
Generate ${batchSize} real MSP or MSSP company domains for cold outreach (phishing simulation and security awareness training).
Target: US, Canada, UK, or Australia-based MSPs with 5-200 employees, serving SMBs with compliance pressure (SOC2, HIPAA, PCI, ISO27001).
Return ONLY valid JSON array with no markdown: [{"domain":"example.com","company_name":"Example MSP","source":"ai_discovery"}]
Real companies only. Avoid Accenture, IBM, Deloitte, or companies with >500 employees.
Already found: ${[...existingDomains].slice(0, 20).join(', ')}` }],
        max_tokens: 600, temperature: 0.7
      })
    })
    const d = await res.json()
    const text = d.choices?.[0]?.message?.content || '[]'
    const match = text.match(/\[[\s\S]*?\]/)
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

export async function runLeadResearcher(batchSize = 5): Promise<{
  discovered: number; enriched: number; added: number; skipped: number; errors: string[]
}> {
  const conn = getConn()
  await ensureResearchQueue()
  const stats = { discovered: 0, enriched: 0, added: 0, skipped: 0, errors: [] as string[] }

  try {
    const existingRows = await conn.execute(`SELECT domain FROM lead_research_queue WHERE company_id=? LIMIT 200`, [COMPANY_ID])
    const existingDomains = new Set(((existingRows as any).rows || []).map((r: any) => r.domain))

    // Step 1: Discover MSPs
    const candidates = await discoverMSPsViaGroq(existingDomains, batchSize * 2)
    for (const c of candidates) {
      try {
        await conn.execute(
          `INSERT INTO lead_research_queue (company_id,domain,company_name,source,status) VALUES (?,?,?,?,'pending') ON DUPLICATE KEY UPDATE updated_at=NOW()`,
          [COMPANY_ID, c.domain, c.company_name, c.source || 'ai_discovery']
        )
        stats.discovered++
      } catch {}
    }

    // Step 2: Process pending
    const pending = await conn.execute(
      `SELECT id,domain,company_name FROM lead_research_queue WHERE company_id=? AND status='pending' AND attempts<3 ORDER BY created_at ASC LIMIT ?`,
      [COMPANY_ID, batchSize]
    )

    for (const item of ((pending as any).rows || [])) {
      try {
        await conn.execute(`UPDATE lead_research_queue SET status='researching',attempts=attempts+1,last_attempt_at=NOW() WHERE id=?`, [item.id])
        const hunter = await enrichViaHunter(item.domain)

        if (hunter?.email) {
          stats.enriched++
          const dup = await conn.execute(`SELECT id FROM ps_outreach_leads WHERE LOWER(email)=LOWER(?) LIMIT 1`, [hunter.email])
          if (((dup as any).rows || []).length > 0) {
            stats.skipped++
            await conn.execute(`UPDATE lead_research_queue SET status='duplicate',updated_at=NOW() WHERE id=?`, [item.id])
          } else {
            await conn.execute(
              `INSERT INTO ps_outreach_leads (email,name,company,title,source,pipeline_stage) VALUES (?,?,?,?,'lead_researcher','prospect') ON DUPLICATE KEY UPDATE updated_at=NOW()`,
              [hunter.email, hunter.name || item.company_name, item.company_name || item.domain.split('.')[0], hunter.title || 'Owner']
            )
            stats.added++
            await conn.execute(`UPDATE lead_research_queue SET status='enriched',icp_score=72,updated_at=NOW() WHERE id=?`, [item.id])
          }
        } else {
          stats.skipped++
          await conn.execute(`UPDATE lead_research_queue SET status='pending',updated_at=NOW() WHERE id=?`, [item.id])
        }
        await new Promise(r => setTimeout(r, 1500))
      } catch (e: any) {
        stats.errors.push(`${item.domain}: ${e.message?.slice(0, 80)}`)
        await conn.execute(`UPDATE lead_research_queue SET status='failed',updated_at=NOW() WHERE id=?`, [item.id])
      }
    }

    await reportAgentRun('researcher', true, stats, undefined, COMPANY_ID)
    if (stats.added > 0) {
      await sendTelegram(`PHISHSIMAI RESEARCHER: +${stats.added} MSP leads\nDiscovered:${stats.discovered} Skipped:${stats.skipped}`)
    }
  } catch (e: any) {
    await reportAgentRun('researcher', false, {}, e.message, COMPANY_ID)
    stats.errors.push('Fatal: ' + e.message)
  }
  return stats
}
