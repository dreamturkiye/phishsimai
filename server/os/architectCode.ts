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

export async function architectCode(req: Request, res: Response) {
  if (!okSecret(req)) return res.status(401).json({ error: 'Unauthorized' })
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ ok: false, error: 'GROQ_API_KEY not configured' })

  const body = req.body || {}
  const task = String(body.task || '')
  const taskId = body.task_id ? String(body.task_id) : null
  if (task.length < 12) return res.status(400).json({ ok: false, error: 'Task too short' })

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
      priorDiagnosis = `Root cause: ${d.root_cause}\nFile: ${d.file_affected}\nFix: ${d.fix_description}`
    }
  }

  const prompt = buildMarcusCodePrompt({
    task,
    repoTree: String(body.repo_tree || '').slice(0, 2000),
    repoPath: String(body.repo_path || '/Users/kaan/phishsimai'),
    memoryContext: await getMarcusMemoryContext(),
    priorDiagnosis,
  })

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: GROQ_ARCHITECT_MODEL,
        messages: [{ role: 'system', content: MARCUS_SYSTEM }, { role: 'user', content: prompt }],
        max_tokens: 8000,
        temperature: 0.1,
      }),
    })
    if (!groqRes.ok) {
      return res.status(502).json({ ok: false, error: await groqRes.text().catch(() => 'Groq error') })
    }
    const data = await groqRes.json()
    const output = (data.choices?.[0]?.message?.content || '').trim()
    if (!output) return res.status(502).json({ ok: false, error: 'Empty response' })
    if (output.startsWith('CANNOT_AUTO_APPLY')) return res.json({ ok: false, error: output })

    const files: Record<string, string> = {}
    for (const match of output.matchAll(FILE_BLOCK_RE)) {
      if (match[1]?.trim()) files[match[1].trim()] = match[2]
    }
    if (!Object.keys(files).length) {
      return res.json({ ok: false, error: 'No FILE blocks', raw: output.slice(0, 1000) })
    }
    return res.json({ ok: true, files, raw: output.slice(0, 1500), agent: 'marcus' })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
