import { sendTelegram } from './telegram'
import { ensureHqTables, getSql } from './conn'
import {
  buildMarcusDiagnosisPrompt,
  buildMarcusTaskFromBug,
  getMarcusMemoryContext,
  makeErrorSignature,
  MARCUS_SYSTEM,
} from './marcus'
import { queueJanetArchitectTask } from './selfHeal'
import { llmComplete } from './llmChat'

export interface ArchitectDiagnosis {
  root_cause: string
  file_affected: string
  function_affected: string
  fix_description: string
  fix_code_hint: string
  confidence: number
  is_known_pattern: boolean
  qwen_task: string
}

async function ensureTables() {
  await ensureHqTables()
}

function parseDiagnosisJson(text: string): Record<string, unknown> {
  const cleaned = (text || '').replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('JSON parse failed')
  }
}

async function callMarcusDiagnosis(prompt: string): Promise<Record<string, unknown>> {
  const { text } = await llmComplete({
    messages: [
      { role: 'system', content: MARCUS_SYSTEM },
      { role: 'user', content: prompt },
    ],
    max_tokens: 500,
    temperature: 0.1,
  })
  return parseDiagnosisJson(text || '{}')
}

async function diagnose(bug: any, knownFix: any, memoryContext: string): Promise<ArchitectDiagnosis> {
  if (knownFix) {
    const parsed = {
      root_cause: knownFix.root_cause,
      file_affected: knownFix.file_affected,
      function_affected: knownFix.function_affected,
      fix_description: knownFix.fix_description,
      fix_code_hint: 'Apply known fix pattern: ' + knownFix.fix_description,
      confidence: Math.min(parseFloat(String(knownFix.confidence || '0.9')) + 0.05, 1.0),
    }
    return {
      ...parsed,
      is_known_pattern: true,
      qwen_task: buildMarcusTaskFromBug(bug, parsed),
    }
  }

  const prompt = buildMarcusDiagnosisPrompt(bug, memoryContext)

  try {
    let parsed: Record<string, unknown>
    try {
      parsed = await callMarcusDiagnosis(prompt)
    } catch {
      parsed = await callMarcusDiagnosis(prompt + '\n\nRespond with ONLY valid JSON, no markdown fences.')
    }
    const diagnosis = {
      root_cause: String(parsed.root_cause || 'Unknown root cause'),
      file_affected: String(parsed.file_affected || 'unknown'),
      function_affected: String(parsed.function_affected || 'unknown'),
      fix_description: String(parsed.fix_description || 'Investigate stack trace'),
      fix_code_hint: String(parsed.fix_code_hint || parsed.fix_description || ''),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : parseFloat(String(parsed.confidence || '0.5')),
      is_known_pattern: false,
    }
    return {
      ...diagnosis,
      qwen_task: buildMarcusTaskFromBug(bug, diagnosis),
    }
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e)
    const fallback = {
      root_cause: `LLM diagnosis unavailable (${err})`,
      file_affected: bug.stack_trace?.match(/at .+\((.+:\d+:\d+)\)/)?.[1]?.split(':')[0] || 'unknown',
      function_affected: 'unknown',
      fix_description: 'Manual investigation required — use stack trace below',
      fix_code_hint: (bug.stack_trace || '').split('\n').slice(0, 3).join('\n'),
      confidence: 0.3,
      is_known_pattern: false,
    }
    return {
      ...fallback,
      qwen_task: buildMarcusTaskFromBug(bug, fallback),
    }
  }
}

export async function runArchitectAgent(bugId: string) {
  const sql = getSql()
  await ensureTables()
  const bugs = await sql`SELECT * FROM bug_reports WHERE id=${bugId} LIMIT 1`
  const bug = (bugs as any[])[0]
  if (!bug) return { diagnosed: false }

  const signature = makeErrorSignature(bug.error_message, bug.component_name || 'Unknown')
  const known = await sql`SELECT * FROM architect_memory WHERE error_signature=${signature} LIMIT 1`
  const knownFix = (known as any[])[0]
  const memoryContext = await getMarcusMemoryContext()
  const diagnosis = await diagnose(bug, knownFix, memoryContext)

  await sql`UPDATE bug_reports SET diagnosis=${JSON.stringify(diagnosis)}, status='diagnosed' WHERE id=${bugId}`

  let architectTaskId: string | null = null
  if (diagnosis.qwen_task && (diagnosis.confidence || 0) > 0.2) {
    architectTaskId = await queueJanetArchitectTask({
      task: diagnosis.qwen_task,
      bugId,
      notes: `Marcus diagnosis conf=${Math.round((diagnosis.confidence || 0) * 100)}%`,
    })
  }

  if ((diagnosis.confidence || 0) > 0.5) {
    await sql`INSERT INTO architect_memory (error_signature,root_cause,file_affected,function_affected,fix_description,confidence)
      VALUES (${signature}, ${diagnosis.root_cause}, ${diagnosis.file_affected||'unknown'},
              ${diagnosis.function_affected||'unknown'}, ${diagnosis.fix_description}, ${diagnosis.confidence||0.5})
      ON CONFLICT (error_signature) DO UPDATE SET
        times_applied=architect_memory.times_applied+1, last_applied=NOW(),
        confidence=LEAST(architect_memory.confidence+0.02, 1.0)`
  }

  const urgency = bug.severity === 'critical' ? 'CRITICAL' : bug.severity === 'high' ? 'HIGH' : 'MEDIUM'
  await sendTelegram(
    `${urgency} BUG — PhishSimAI\n${bug.component_name}: ${bug.error_message?.slice(0, 100)}\n` +
    `Marcus: ${diagnosis.root_cause}\nFile: ${diagnosis.file_affected}\n` +
    `Fix: ${diagnosis.fix_description}\nConfidence: ${Math.round((diagnosis.confidence || 0) * 100)}%` +
    (architectTaskId ? `\nTask: ${architectTaskId}` : '')
  )

  return { diagnosed: true, diagnosis, architectTaskId }
}

export async function runQASmoke(triggerRef = 'manual', baseUrl?: string) {
  const start = Date.now()
  await ensureTables()
  const sql = getSql()
  const root = (baseUrl || 'https://phishsimai.com').replace(/\/$/, '')
  const tests = [
    { name: 'API health', test: async () => {
      const r = await fetch(`${root}/api/health`)
      if (!r.ok) throw new Error('Status ' + r.status)
    }},
    { name: 'HQ data responds', test: async () => {
      const r = await fetch(`${root}/api/os/hq?secret=ps-hq-2026`)
      const d = await r.json()
      if (!d.ok) throw new Error('HQ not ok: ' + (d.error || r.status))
    }},
    { name: 'Agent watchdog status', test: async () => {
      const r = await fetch(`${root}/api/os/agent-watchdog?secret=ps-hq-2026&action=status`)
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
  return { passed, failed, results, baseUrl: root }
}
