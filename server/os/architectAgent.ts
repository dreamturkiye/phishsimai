import { sendTelegram } from './telegram'
import { ensureHqTables, getSql } from './conn'
import { buildMarcusTaskFromBug } from './marcus'
import { queueJanetArchitectTask } from './selfHeal'

const ARCHITECT_SYSTEM = `You are Marcus, a Principal Software Architect with 18 years of experience 
building and scaling SaaS products from zero to IPO. You specialize in Node.js, Express, tRPC, 
Vite, React, TypeScript, and Vercel deployments. You diagnose bugs from stack traces immediately and 
write production-quality fixes on the first attempt. You never patch symptoms — only root causes.`

async function ensureTables() {
  await ensureHqTables()
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

Bug in PhishSimAI (Vite+Express+tRPC, Neon Postgres, Vercel):
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
    return { ...JSON.parse(text.replace(/```json|```/g,'').trim()), is_known_pattern: false }
  } catch {
    return { root_cause: 'Diagnosis failed', file_affected: 'unknown', fix_description: 'Manual review needed', confidence: 0, is_known_pattern: false }
  }
}

export async function runArchitectAgent(bugId: string) {
  const sql = getSql()
  await ensureTables()
  const bugs = await sql`SELECT * FROM bug_reports WHERE id=${bugId} LIMIT 1`
  const bug = (bugs as any[])[0]
  if (!bug) return { diagnosed: false }
  const signature = makeSignature(bug.error_message, bug.component_name||'Unknown')
  const known = await sql`SELECT * FROM architect_memory WHERE error_signature=${signature} LIMIT 1`
  const knownFix = (known as any[])[0]
  const diagnosis = await diagnose(bug, knownFix)
  await sql`UPDATE bug_reports SET diagnosis=${JSON.stringify(diagnosis)}, status='diagnosed' WHERE id=${bugId}`
  if ((diagnosis.confidence||0) > 0.5) {
    await sql`INSERT INTO architect_memory (error_signature,root_cause,file_affected,function_affected,fix_description,confidence)
      VALUES (${signature}, ${diagnosis.root_cause}, ${diagnosis.file_affected||'unknown'},
              ${diagnosis.function_affected||'unknown'}, ${diagnosis.fix_description}, ${diagnosis.confidence||0.5})
      ON CONFLICT (error_signature) DO UPDATE SET
        times_applied=architect_memory.times_applied+1, last_applied=NOW(),
        confidence=LEAST(architect_memory.confidence+0.02, 1.0)`
  }
  const architectTaskId = await queueJanetArchitectTask({
    task: buildMarcusTaskFromBug(bug, diagnosis),
    bugId,
    notes: `Marcus diagnosis conf=${Math.round((diagnosis.confidence || 0) * 100)}%`,
  })

  const urgency = bug.severity==='critical' ? 'CRITICAL' : bug.severity==='high' ? 'HIGH' : 'MEDIUM'
  await sendTelegram(
    `${urgency} BUG — PhishSimAI\n${bug.component_name}: ${bug.error_message?.slice(0,100)}\n` +
    `Marcus: ${diagnosis.root_cause}\nFile: ${diagnosis.file_affected}\n` +
    `Fix: ${diagnosis.fix_description}\nConfidence: ${Math.round((diagnosis.confidence||0)*100)}%` +
    (architectTaskId ? `\nTask: ${architectTaskId}` : '')
  )
  return { diagnosed: true, diagnosis, architectTaskId }
}

export async function runQASmoke(triggerRef = 'manual') {
  const start = Date.now()
  await ensureTables()
  const sql = getSql()
  const tests = [
    { name: 'API health', test: async () => {
      const r = await fetch('https://phishsimai.com/api/health')
      if (!r.ok) throw new Error('Status ' + r.status)
    }},
    { name: 'HQ data responds', test: async () => {
      const r = await fetch('https://phishsimai.com/api/os/hq?secret=ps-hq-2026')
      const d = await r.json()
      if (!d.ok) throw new Error('HQ not ok: ' + (d.error || r.status))
    }},
    { name: 'Agent watchdog status', test: async () => {
      const r = await fetch('https://phishsimai.com/api/os/agent-watchdog?secret=ps-hq-2026&action=status')
      const d = await r.json()
      if (!d.total || d.total < 9) throw new Error('Expected 9 agents, got ' + d.total)
    }},
  ]
  const results: any[] = []
  let passed = 0, failed = 0
  for (const t of tests) {
    try { await t.test(); results.push({ name: t.name, status: 'pass' }); passed++ }
    catch(e: any) { results.push({ name: t.name, status: 'fail', error: e.message }); failed++ }
  }
  const status = failed === 0 ? 'passed' : failed <= 1 ? 'warning' : 'failed'
  await sql`INSERT INTO qa_runs (trigger_type, trigger_ref, tests_run, tests_passed, tests_failed, test_results, duration_ms, status)
    VALUES ('bug_fix', ${triggerRef}, ${tests.length}, ${passed}, ${failed}, ${JSON.stringify(results)}, ${Date.now() - start}, ${status})`.catch(() => {})
  if (failed > 0) await sendTelegram(`PHISHSIMAI QA: ${failed} tests failed\n${results.filter(r=>r.status==='fail').map(r=>r.name+': '+r.error).join('\n')}`)
  else await sendTelegram(`PHISHSIMAI QA: All ${passed} tests passed`)
  return { passed, failed, results }
}
