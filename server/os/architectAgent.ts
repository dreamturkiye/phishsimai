import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

const ARCHITECT_SYSTEM = `You are Marcus, a Principal Software Architect with 18 years of experience 
building and scaling SaaS products from zero to IPO. You specialize in Node.js, Express, tRPC, TiDB, 
Vite, React, TypeScript, and Vercel deployments. You diagnose bugs from stack traces immediately and 
write production-quality fixes on the first attempt. You never patch symptoms — only root causes.`

const getConn = () => connect({ url: process.env.DATABASE_URL! })

async function ensureTables() {
  const conn = getConn()
  await conn.execute(`CREATE TABLE IF NOT EXISTS bug_reports (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    error_message TEXT NOT NULL, stack_trace TEXT, component_name VARCHAR(255),
    user_action TEXT, url_path VARCHAR(500), user_email VARCHAR(255), browser TEXT,
    severity VARCHAR(50) DEFAULT 'medium', status VARCHAR(50) DEFAULT 'open',
    occurrence_count INT DEFAULT 1, first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    diagnosis JSON, fix_applied TEXT, fix_confirmed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await conn.execute(`CREATE TABLE IF NOT EXISTS architect_memory (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    error_signature VARCHAR(255) NOT NULL UNIQUE,
    root_cause TEXT NOT NULL, file_affected VARCHAR(500), function_affected VARCHAR(255),
    fix_description TEXT NOT NULL, fix_worked TINYINT(1) DEFAULT 1,
    times_applied INT DEFAULT 1, confidence FLOAT DEFAULT 0.9, lesson TEXT,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_applied TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
}

function makeSignature(errorMessage: string, componentName: string): string {
  const cleaned = errorMessage.replace(/https?:\/\/[^\s]+/g,'URL').replace(/\d+/g,'N').slice(0,120)
  return (componentName + '::' + cleaned).toLowerCase()
}

async function diagnose(bug: any, knownFix: any) {
  if (knownFix) {
    return {
      root_cause: knownFix.root_cause,
      file_affected: knownFix.file_affected,
      fix_description: knownFix.fix_description,
      confidence: Math.min(parseFloat(knownFix.confidence||'0.9')+0.05, 1.0),
      is_known_pattern: true
    }
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: `${ARCHITECT_SYSTEM}

Bug in PhishSimAI (Vite+Express+tRPC, TiDB, Vercel):
ERROR: ${bug.error_message}
COMPONENT: ${bug.component_name}
PAGE: ${bug.url_path}
STACK: ${(bug.stack_trace||'').slice(0,1000)}

Respond ONLY in JSON:
{"root_cause":"specific","file_affected":"exact path","function_affected":"name","fix_description":"what to do","confidence":0.8}` }],
        max_tokens: 300, temperature: 0.1
      })
    })
    const d = await res.json()
    const text = d.choices?.[0]?.message?.content || '{}'
    return { ...JSON.parse(text.replace(/\`\`\`json|\`\`\`/g,'').trim()), is_known_pattern: false }
  } catch {
    return { root_cause: 'Diagnosis failed', file_affected: 'unknown', fix_description: 'Manual review needed', confidence: 0, is_known_pattern: false }
  }
}

export async function runArchitectAgent(bugId: string) {
  const conn = getConn()
  await ensureTables()
  const bugs = await conn.execute(`SELECT * FROM bug_reports WHERE id=? LIMIT 1`, [bugId])
  const bug = (bugs as any).rows?.[0]
  if (!bug) return { diagnosed: false }
  const signature = makeSignature(bug.error_message, bug.component_name||'Unknown')
  const known = await conn.execute(`SELECT * FROM architect_memory WHERE error_signature=? LIMIT 1`, [signature])
  const knownFix = (known as any).rows?.[0]
  const diagnosis = await diagnose(bug, knownFix)
  await conn.execute(`UPDATE bug_reports SET diagnosis=?, status='diagnosed' WHERE id=?`,
    [JSON.stringify(diagnosis), bugId])
  if ((diagnosis.confidence||0) > 0.5) {
    await conn.execute(`INSERT INTO architect_memory (error_signature,root_cause,file_affected,function_affected,fix_description,confidence)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE times_applied=times_applied+1,last_applied=NOW(),
      confidence=LEAST(confidence+0.02,1.0),updated_at=NOW()`,
      [signature, diagnosis.root_cause, diagnosis.file_affected||'unknown',
       diagnosis.function_affected||'unknown', diagnosis.fix_description, diagnosis.confidence||0.5])
  }
  const urgency = bug.severity==='critical' ? 'CRITICAL' : bug.severity==='high' ? 'HIGH' : 'MEDIUM'
  await sendTelegram(
    `${urgency} BUG — PhishSimAI\n${bug.component_name}: ${bug.error_message?.slice(0,100)}\n` +
    `Marcus: ${diagnosis.root_cause}\nFile: ${diagnosis.file_affected}\n` +
    `Fix: ${diagnosis.fix_description}\nConfidence: ${Math.round((diagnosis.confidence||0)*100)}%`
  )
  return { diagnosed: true, diagnosis }
}

export async function runQASmoke(triggerRef = 'manual') {
  const conn = getConn()
  await ensureTables()
  const tests = [
    { name: 'API health', test: async () => {
      const r = await fetch('https://phishsimai.com/api/health')
      if (!r.ok) throw new Error('Status ' + r.status)
    }},
    { name: 'OS heartbeat responds', test: async () => {
      const r = await fetch('https://phishsimai.com/api/os/heartbeat',
        { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET }})
      if (!r.ok) throw new Error('Status ' + r.status)
    }},
    { name: 'HQ data responds', test: async () => {
      const r = await fetch('https://phishsimai.com/api/os/hq?secret=ps-hq-2026')
      if (!r.ok) throw new Error('Status ' + r.status)
    }},
  ]
  const results: any[] = []
  let passed = 0, failed = 0
  for (const t of tests) {
    try { await t.test(); results.push({ name: t.name, status: 'pass' }); passed++ }
    catch(e: any) { results.push({ name: t.name, status: 'fail', error: e.message }); failed++ }
  }
  const status = failed===0 ? 'passed' : 'failed'
  if (failed > 0) await sendTelegram(`PHISHSIMAI QA: ${failed} tests failed\n${results.filter(r=>r.status==='fail').map(r=>r.name+': '+r.error).join('\n')}`)
  else await sendTelegram(`PHISHSIMAI QA: All ${passed} tests passed`)
  return { passed, failed, results }
}
