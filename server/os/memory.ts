import { neon } from '@neondatabase/serverless'
import { getSql } from './conn'

export type MemoryType = 'company' | 'customer' | 'campaign' | 'strategic' | 'operating'
export interface MemoryEntry {
  company_id: string; type: MemoryType; key: string; value: string; confidence: number; source: string
}

export async function ensureMemoryTable() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS janet_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence FLOAT NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL DEFAULT 'janet',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, type, key)
  )`
}

export async function rememberFact(e: MemoryEntry) {
  const sql = getSql()
  await ensureMemoryTable()
  await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${e.company_id}, ${e.type}, ${e.key}, ${e.value}, ${e.confidence}, ${e.source})
    ON CONFLICT (company_id, type, key) DO UPDATE SET
      value = EXCLUDED.value,
      confidence = EXCLUDED.confidence,
      source = EXCLUDED.source,
      updated_at = NOW()`
}

export async function recallMemory(companyId: string, type?: MemoryType, limit = 20): Promise<any[]> {
  const sql = getSql()
  await ensureMemoryTable()
  if (type) {
    return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} AND type=${type} ORDER BY updated_at DESC LIMIT ${limit}` as any
  }
  return await sql`SELECT * FROM janet_memory WHERE company_id=${companyId} ORDER BY updated_at DESC LIMIT ${limit}` as any
}

export async function recallContext(companyId: string, limit = 40): Promise<string> {
  const mems = await recallMemory(companyId, undefined, limit)
  if (!mems.length) return 'No memory yet.'
  const grouped: Record<string, string[]> = {}
  for (const m of mems) {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type].push(`${m.key}: ${m.value}`)
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
    { company_id:'phishsimai', type:'company', key:'icp', value:'MSP owners and IT Directors at SMBs 50-500 employees. Compliance-driven buyers: SOC2, HIPAA, PCI, ISO27001.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'differentiator', value:'AI-generated phishing templates that evolve weekly. 10-minute setup. White-label for MSPs. Automated training post-click.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'domain', value:'phishsimai.com — Resend verified, sarah@phishsimai.com outbound sender', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'company', key:'persona', value:'Sarah Mitchell - Head of Compliance Partnerships. Professional, compliance-focused outreach.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'mia_cs', value:'Mia — in-app customer success agent on PhishSim dashboard. Helps trial users activate (targets → campaign → launch), answers product questions, collects feedback to product_feedback + Telegram. Distinct from Janet (HQ CGO) and Sarah (outbound).', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'founder_workflow', value:'Kaan operates as Founder/GM/PM/Software Architect ONLY. NEVER writes application code in Cursor. Specs in docs/architect/SPEC-*.md. Implementation: local Ollama codegeex4:9b. Architect verifies build/test/probe then deploys. Saved 2026-06-30.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'company', key:'os_version', value:'4.5.1', confidence:1, source:'architect' },
    { company_id:'phishsimai', type:'operating', key:'self_heal_probe_20260630', value:'Probe SELF_HEAL_PROBE: Telegram 1+2 OK. Marcus diagnosis FAILED (confidence 0%, Diagnosis failed). Spec SPEC-self-heal-v4.5.1 written. Frontend telemetry + await Marcus + diagnosis fix required.', confidence:1, source:'architect' },
    { company_id:'phishsimai', type:'company', key:'linkedin_sarah', value:'Sarah Mitchell | Head of Compliance Partnerships @ PhishSimAI | LinkedIn voice: professional, warm, compliance-first (not salesy). Posts about MSP compliance (HIPAA, SOC2, NY DFS, CMMC), breach stats (67% start with phishing, $4.45M avg cost), phishing simulation ROI, audit readiness. Connection request tone: peer MSP/compliance professional. DM opener: reference their sector + compliance gap. Sign-off: Sarah Mitchell, Head of Compliance Partnerships, PhishSimAI. Email: sarah@phishsimai.com. Never claim founder — she is Head of Compliance Partnerships. CTA: free phishing simulation or compliance audit.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'campaign', key:'touch1_best_subject', value:'Phishing simulation for {company} — free compliance audit', confidence:0.7, source:'initial' },
    { company_id:'phishsimai', type:'campaign', key:'current_sequence', value:'5-touch email: T1(d0), T2(d3), T3(d7), T4(d12), T5(d19). Daily cap 20. Pause >8% bounce.', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'campaign', key:'outreach_batch_1', value:'0 MSP leads seeded yet. Target: MSP owners + IT Directors 50-500 employees. Compliance-driven.', confidence:1, source:'system' },
    { company_id:'phishsimai', type:'campaign', key:'key_stat', value:'67% of data breaches start with phishing. Average breach cost $4.45M (IBM 2024). Use in every touch.', confidence:1, source:'research' },
    { company_id:'phishsimai', type:'operating', key:'autonomy_level', value:'L3 — execute with approval for sends >20/day. L4 for tagging, task creation, CRM updates.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'strategic', key:'week1_priority', value:'Close first 3 MSP clients. One MSP = 10-100x LTV of direct SMB. Offer founding rate $49/mo first 3 months.', confidence:0.9, source:'janet' },
    { company_id:'phishsimai', type:'operating', key:'tone', value:'Professional, compliance-urgency, data-driven. Reference breach stats. Position as compliance tool not just security tool.', confidence:1, source:'founder' },
    { company_id:'phishsimai', type:'operating', key:'os_version', value:'Kaan AI OS v4.5 — PhishSimAI Edition (Neon Postgres)', confidence:1, source:'system' },
  ]
  for (const e of entries) await rememberFact(e)
  return entries.length
}
