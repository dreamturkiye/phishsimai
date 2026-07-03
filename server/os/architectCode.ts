import { Request, Response } from 'express'
import { getSql } from './conn'
import { ARCHITECT_SECRET } from './version'
import {
  GROQ_ARCHITECT_MODEL,
  MARCUS_SYSTEM,
  buildMarcusCodePrompt,
  getMarcusMemoryContext,
} from './marcus'

const FILE_BLOCK_RE = /FILE:\s*(.+?)\n---\n([\s\S]*?)\n---END---/g

function okSecret(req: Request): boolean {
  const s = (req.query.secret as string) || req.body?.secret
  return s === ARCHITECT_SECRET
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

export async function architectCode(req: Request, res: Response) {
  if (!okSecret(req)) return res.status(401).json({ error: 'Unauthorized' })
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ ok: false, error: 'GROQ_API_KEY not configured' })

  const body = req.body || {}
  const task = String(body.task || '')
  const taskId = body.task_id ? String(body.task_id) : null
  if (task.length < 12) return res.status(400).json({ ok: false, error: 'Task too short' })

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
      SELECT t.task, b.diagnosis FROM os_architect_tasks t
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
    let output = await callGroqCode(prompt)
    if (!output) return res.status(502).json({ ok: false, error: 'Empty response' })
    if (output.startsWith('CANNOT_AUTO_APPLY')) return res.json({ ok: false, error: output })

    let files = parseMarcusOutput(output)
    if (!Object.keys(files).length) {
      output = await callGroqCode(prompt, true)
      if (output.startsWith('CANNOT_AUTO_APPLY')) return res.json({ ok: false, error: output })
      files = parseMarcusOutput(output)
    }
    if (!Object.keys(files).length) {
      return res.json({ ok: false, error: 'No FILE blocks or markdown code fences', raw: output.slice(0, 1000) })
    }
    return res.json({ ok: true, files, raw: output.slice(0, 1500), agent: 'marcus' })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
