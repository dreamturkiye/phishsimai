import { getSql } from './conn'

export const GROQ_ARCHITECT_MODEL = process.env.GROQ_ARCHITECT_MODEL || 'llama-3.3-70b-versatile'

export const MARCUS_SYSTEM = `You are Marcus, Principal Software Architect on the PhishSim AI / Kaan AI OS team.
Expertise: Vite, React, Express, tRPC, Neon PostgreSQL, Vercel. Root-cause fixes only.`

export const PHISHSIM_CODEBASE_CONTEXT = `
PHISHSIMAI: client/src/ (Vite React), server/ (Express+tRPC), server/os/ (Kaan AI OS), api/handler.ts (Vercel entry)
`

export function makeErrorSignature(errorMessage: string, componentName: string): string {
  const cleaned = errorMessage.replace(/https?:\/\/[^\s]+/g, 'URL').replace(/\d+/g, 'N').slice(0, 120)
  return `${componentName}::${cleaned}`.toLowerCase()
}

export async function getMarcusMemoryContext(limit = 8): Promise<string> {
  const sql = getSql()
  const rows = await sql`
    SELECT error_signature, root_cause, file_affected, fix_description, times_applied, confidence
    FROM architect_memory ORDER BY times_applied DESC, last_applied DESC LIMIT ${limit}
  `.catch(() => [] as any[])
  if (!(rows as any[]).length) return 'MARCUS MEMORY: No prior patterns yet.'
  return `MARCUS MEMORY:\n${(rows as any[]).map((r, i) =>
    `${i + 1}. ${r.error_signature?.slice(0, 60)} → ${r.fix_description?.slice(0, 80)}`
  ).join('\n')}`
}

export async function recordMarcusDeployOutcome(opts: {
  bugId?: string | null
  success: boolean
  filesChanged?: string[]
  notes?: string
}) {
  if (!opts.bugId) return
  const sql = getSql()
  const bugs = await sql`SELECT error_message, component_name, diagnosis FROM bug_reports WHERE id=${opts.bugId} LIMIT 1`
  const bug = (bugs as any[])[0]
  if (!bug) return
  const signature = makeErrorSignature(bug.error_message, bug.component_name || 'Unknown')
  const diagnosis = typeof bug.diagnosis === 'object' ? bug.diagnosis : {}
  const lesson = opts.success
    ? `Deploy OK. Files: ${(opts.filesChanged || []).join(', ')}`.slice(0, 300)
    : `Deploy failed. ${opts.notes || ''}`.slice(0, 300)
  await sql`
    INSERT INTO architect_memory (error_signature, root_cause, file_affected, function_affected, fix_description, lesson, confidence)
    VALUES (${signature}, ${diagnosis.root_cause || 'unknown'}, ${diagnosis.file_affected || null},
      ${diagnosis.function_affected || null}, ${diagnosis.fix_description || 'Marcus fix'}, ${lesson}, ${opts.success ? 0.92 : 0.4})
    ON CONFLICT (error_signature) DO UPDATE SET
      times_applied = architect_memory.times_applied + 1,
      last_applied = NOW(),
      lesson = EXCLUDED.lesson
  `.catch(() => {})
}

export function buildMarcusCodePrompt(opts: {
  task: string
  repoTree: string
  repoPath: string
  memoryContext: string
  priorDiagnosis?: string
}): string {
  return `${MARCUS_SYSTEM}\n${opts.memoryContext}\n${PHISHSIM_CODEBASE_CONTEXT}\n` +
    `${opts.priorDiagnosis ? `PRIOR DIAGNOSIS:\n${opts.priorDiagnosis}\n` : ''}` +
    `TASK:\n${opts.task}\n\nRespond FILE: path\n---\ncontent\n---END---`
}

export function buildMarcusTaskFromBug(bug: any, diagnosis: any): string {
  return `# MARCUS BUG FIX — PhishSimAI\nError: ${bug.error_message}\nRoot cause: ${diagnosis.root_cause}\nFile: ${diagnosis.file_affected}\nFix: ${diagnosis.fix_description}`
}
