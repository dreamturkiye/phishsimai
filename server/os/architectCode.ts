import { Request, Response } from 'express'
import { getSql } from './conn'
import { ARCHITECT_SECRET } from './version'
import {
  GROQ_ARCHITECT_MODEL,
  MARCUS_SYSTEM,
  buildMarcusCodePrompt,
  getMarcusMemoryContext,
} from './marcus'
import { guardMarcusAllowed, guardMarcusDiff, recordMarcusOutcome, fileSetToDiff, makeMarcusBreakerDeps } from './marcusBreaker'
import { assertAutonomyAllows, isAutonomyDenied } from './autonomyGate'

const FILE_BLOCK_RE = /FILE:\s*(.+?)\n---\n([\s\S]*?)\n---END---/g

function okSecret(req: Request): boolean {
  const s = (req.query.secret as string) || req.body?.secret
  return !!ARCHITECT_SECRET && s === ARCHITECT_SECRET
}

export function parseFileBlocks(output: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const match of output.matchAll(FILE_BLOCK_RE)) {
    const path = match[1]?.trim()
    const content = match[2]
    if (path) files[path] = content
  }
  return files
}

/** Fallback when Marcus returns markdown fences instead of FILE blocks */
export function parseMarkdownCodeBlocks(output: string): Record<string, string> {
  const files: Record<string, string> = {}

  // ```path/to/file.tsx or ```tsx with path on prior line
  const pathFenceRe = /```(?:[\w-]+:)?([^\n`]+\.(?:tsx?|jsx?|py|css))\n([\s\S]*?)```/g
  for (const match of output.matchAll(pathFenceRe)) {
    const path = match[1]?.trim().replace(/^(typescript|tsx|javascript|jsx):/, '')
    if (path && !files[path]) files[path] = match[2]?.trimEnd() || ''
  }

  // // FILE: path comment before a generic fence
  const commentFenceRe = /\/\/\s*FILE:\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/g
  for (const match of output.matchAll(commentFenceRe)) {
    const path = match[1]?.trim()
    if (path && !files[path]) files[path] = match[2]?.trimEnd() || ''
  }

  return files
}

async function callGroqCode(prompt: string, strict = false): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: GROQ_ARCHITECT_MODEL,
      messages: [
        { role: 'system', content: MARCUS_SYSTEM },
        { role: 'user', content: prompt + (strict ? '\n\nSTRICT: FILE blocks only. No markdown.' : '') },
      ],
      max_tokens: 8000,
      temperature: strict ? 0.05 : 0.1,
    }),
  })
  if (!groqRes.ok) {
    throw new Error(await groqRes.text().catch(() => 'Groq error'))
  }
  const data = await groqRes.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

function parseMarcusOutput(output: string): Record<string, string> {
  const fromBlocks = parseFileBlocks(output)
  if (Object.keys(fromBlocks).length) return fromBlocks
  return parseMarkdownCodeBlocks(output)
}

async function callGeminiCode(prompt: string, strict = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: MARCUS_SYSTEM + '\n\n' + prompt }] }],
      generationConfig: { maxOutputTokens: 8000, temperature: strict ? 0.05 : 0.1 }
    }),
  })
  if (!geminiRes.ok) {
    throw new Error(await geminiRes.text().catch(() => 'Gemini error'))
  }
  const data = await geminiRes.json()
  return (data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '').trim()
}

async function callOpenAICode(prompt: string, strict = false): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: MARCUS_SYSTEM },
        { role: 'user', content: prompt + (strict ? '\n\nSTRICT: FILE blocks only. No markdown.' : '') },
      ],
      max_tokens: 8000,
      temperature: strict ? 0.05 : 0.1,
    }),
  })
  if (!openaiRes.ok) {
    throw new Error(await openaiRes.text().catch(() => 'OpenAI error'))
  }
  const data = await openaiRes.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

async function callWithFallback(prompt: string, strict = false): Promise<{ output: string; provider: string }> {
  let groqReason = ''
  let geminiReason = ''
  let openaiReason = ''

  try {
    const output = await callGroqCode(prompt, strict)
    return { output, provider: 'groq' }
  } catch (e: any) {
    groqReason = e?.message || String(e)
    console.log('[architectCode] groq failed: ' + groqReason)
  }

  try {
    const output = await callGeminiCode(prompt, strict)
    return { output, provider: 'gemini' }
  } catch (e: any) {
    geminiReason = e?.message || String(e)
    console.log('[architectCode] gemini failed: ' + geminiReason)
  }

  try {
    const output = await callOpenAICode(prompt, strict)
    return { output, provider: 'openai' }
  } catch (e: any) {
    openaiReason = e?.message || String(e)
    console.log('[architectCode] openai failed: ' + openaiReason)
  }

  throw new Error(`All providers failed: groq - ${groqReason}, gemini - ${geminiReason}, openai - ${openaiReason}`)
}

export async function architectCode(req: Request, res: Response) {
  if (!okSecret(req)) return res.status(401).json({ error: 'Unauthorized' })

  const body = req.body || {}
  const task = String(body.task || '')
  const taskId = body.task_id ? String(body.task_id) : null
  if (task.length < 12) return res.status(400).json({ ok: false, error: 'Task too short' })

  // AUTONOMY GATE — must pass BEFORE the breaker. The breaker is necessary but
  // NOT sufficient: it only knows about Marcus's failure history, not about
  // whether the OS is permitted to act autonomously at all. Without this, a POST
  // holding a valid ARCHITECT_SECRET would generate and return applyable files at
  // level='manual' whenever the breaker happened to be closed.
  //
  // Execution therefore requires BOTH: level allows AND breaker closed.
  // Denied → 423 parked, audited. This only ever DENIES; it enables nothing.
  try {
    await assertAutonomyAllows('execute_architect_task')
  } catch (e) {
    if (isAutonomyDenied(e)) {
      console.warn(`[autonomy] architectCode execution denied — parked (${e.reason} @ ${e.level})`)
      return res.status(423).json({
        ok: false,
        error: `Autonomy gate: execution denied at level '${e.level}' — task parked for founder approval`,
        parked: true,
        autonomy: 'denied',
        level: e.level,
        reason: e.reason,
      })
    }
    throw e
  }

  // MARCUS CIRCUIT BREAKER — do not EXECUTE (generate/apply a change) while the
  // breaker is OPEN. Parked + escalated.
  const breaker = makeMarcusBreakerDeps()
  if (!(await guardMarcusAllowed(breaker, `code: ${task.slice(0, 40)}`))) {
    return res.status(423).json({ ok: false, error: 'Marcus circuit breaker OPEN — task parked', parked: true })
  }

  const repoFiles: Record<string, string> = {}
  if (body.repo_files && typeof body.repo_files === 'object') {
    for (const [p, c] of Object.entries(body.repo_files as Record<string, unknown>)) {
      if (typeof c === 'string') repoFiles[p] = c.slice(0, 4000)
    }
  }

  const sql = getSql()
  let priorDiagnosis = ''
  if (taskId) {
    const rows = await sql`
      SELECT t.task, t.bug_id, b.diagnosis FROM os_architect_tasks t
      LEFT JOIN bug_reports b ON b.id = t.bug_id WHERE t.id=${taskId}::uuid LIMIT 1
    `
    const row = (rows as any[])[0]
    if (row?.diagnosis) {
      const d = typeof row.diagnosis === 'object' ? row.diagnosis : {}
      priorDiagnosis = `Root cause: ${d.root_cause}\nFile: ${d.file_affected}\nFix: ${d.fix_description}\nHint: ${d.fix_code_hint || ''}`
    }
  }

  const prompt = buildMarcusCodePrompt({
    task,
    repoTree: String(body.repo_tree || '').slice(0, 2000),
    repoPath: String(body.repo_path || '/Users/kaan/phishsimai'),
    memoryContext: await getMarcusMemoryContext(),
    priorDiagnosis,
    repoFiles,
  })

  try {
    let { output, provider } = await callWithFallback(prompt)
    if (!output) return res.status(502).json({ ok: false, error: 'Empty response', provider })
    if (output.startsWith('CANNOT_AUTO_APPLY')) return res.json({ ok: false, error: output, provider })

    let files = parseMarcusOutput(output)
    if (!Object.keys(files).length) {
      ({ output, provider } = await callWithFallback(prompt, true))
      if (output.startsWith('CANNOT_AUTO_APPLY')) return res.json({ ok: false, error: output, provider })
      files = parseMarcusOutput(output)
    }
    if (!Object.keys(files).length) {
      return res.json({ ok: false, error: 'No FILE blocks or markdown code fences', raw: output.slice(0, 1000), provider })
    }

    // DESTRUCTIVE-DIFF TRIPWIRE — before the change is handed off for apply. An
    // unsafe change set (>10 files or >500 net lines outside generated/) trips the
    // breaker OPEN and is DISCARDED — never returned for application.
    const verdict = await guardMarcusDiff(breaker, fileSetToDiff(files))
    if (verdict.verdict === 'reject') {
      await recordMarcusOutcome(breaker, false, `destructive_diff: ${verdict.reason}`)
      return res.json({ ok: false, error: 'Destructive diff refused — change discarded', discarded: true, analysis: verdict.analysis })
    }

    return res.json({ ok: true, files, raw: output.slice(0, 1500), agent: 'marcus', provider })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}