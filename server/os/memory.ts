import { connect } from '@tidbcloud/serverless'

export type MemoryType = 'company' | 'customer' | 'campaign' | 'strategic' | 'operating'
export interface MemoryEntry {
  company_id: string; type: MemoryType; key: string; value: string; confidence: number; source: string
}

const getConn = () => connect({ url: process.env.DATABASE_URL! })

export async function ensureMemoryTable() {
  const conn = getConn()
  await conn.execute(`CREATE TABLE IF NOT EXISTS janet_memory (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    company_id VARCHAR(100) NOT NULL DEFAULT 'phishsimai',
    type VARCHAR(50) NOT NULL,
    key_name VARCHAR(200) NOT NULL,
    value TEXT NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    source VARCHAR(100) DEFAULT 'janet',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mem (company_id, type, key_name)
  )`)
}

export async function rememberFact(e: MemoryEntry) {
  const conn = getConn()
  await ensureMemoryTable()
  await conn.execute(
    `INSERT INTO janet_memory (company_id,type,key_name,value,confidence,source) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE value=VALUES(value),confidence=VALUES(confidence),source=VALUES(source),updated_at=NOW()`,
    [e.company_id, e.type, e.key, e.value, e.confidence, e.source]
  )
}

export async function recallMemory(companyId: string, type?: MemoryType, limit = 20): Promise<any[]> {
  const conn = getConn()
  await ensureMemoryTable()
  const rows = type
    ? await conn.execute(`SELECT * FROM janet_memory WHERE company_id=? AND type=? ORDER BY updated_at DESC LIMIT ?`, [companyId, type, limit])
    : await conn.execute(`SELECT * FROM janet_memory WHERE company_id=? ORDER BY updated_at DESC LIMIT ?`, [companyId, limit])
  return (rows as any).rows || []
}

export async function recallContext(companyId: string): Promise<string> {
  const mems = await recallMemory(companyId, undefined, 40)
  if (!mems.length) return 'No memory yet.'
  const grouped: Record<string, string[]> = {}
  for (const m of mems) {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type].push(`${m.key_name}: ${m.value}`)
  }
  return Object.entries(grouped).map(([t, items]) => `[${t.toUpperCase()}]\n${items.join('\n')}`).join('\n\n')
}

export async function learnFromOutcome(companyId: string, action: string, outcome: string, lesson: string) {
  await rememberFact({ company_id: companyId, type: 'strategic', key: `lesson_${Date.now()}`,
    value: `Action:${action}|Outcome:${outcome}|Lesson:${lesson}`, confidence: 0.9, source: 'reflection' })
}

export async function seedPhishSimMemory() {
  const entries: MemoryEntry[] = [
    { company_id:'phishsimai', type:'company', key:'product', value:'AI-powered phishing simulation + security awareness training for MSPs and IT teams. Automated campaigns, real-time reporting, staff training post-click.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'pricing', value:'Starter $99/mo (100 users), Growth $249/mo (500 users), Pro $499/mo (2000 users), Unlimited $999/mo. 20% annual discount.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'icp', value:'MSP owners (managed service providers) and IT Directors at SMBs 50-500 employees. Compliance-driven buyers: SOC2, HIPAA, PCI, ISO27001.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'differentiator', value:'AI-generated phishing templates that evolve weekly. 10-minute setup. White-label for MSPs. Automated training post-click. No per-seat setup fees.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'persona', value:'Sarah Mitchell - Head of Compliance Partnerships. Professional, compliance-focused outreach.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'campaign', key:'key_stat', value:'67% of data breaches start with phishing. Average breach cost $4.45M (IBM 2024). Use in every touch.', confidence:1, source:'research' },
    { company_id:'phishsimai', type:'strategic', key:'week1_priority', value:'Close first 3 MSP clients. One MSP = 10-100x LTV of direct SMB. Offer founding rate $49/mo first 3 months.', confidence:0.9, source:'janet' },
    { company_id:'phishsimai', type:'operating', key:'tone', value:'Professional, compliance-urgency, data-driven. Reference breach stats. Position as compliance tool not just security tool.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'operating', key:'os_version', value:'Kaan AI OS v3.0 PhishSimAi Edition - deployed Jun 28 2026', confidence:1, source:'system' },
  ]
  for (const e of entries) await rememberFact(e)
  return entries.length
}
