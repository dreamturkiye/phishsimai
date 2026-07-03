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

export function buildMarcusDiagnosisPrompt(bug: {
  error_message: string
  component_name: string
  user_action: string
  url_path: string
  stack_trace?: string
}, memoryContext: string): string {
  return `${MARCUS_SYSTEM}

${memoryContext}

You are diagnosing a bug report from PhishSimAI (Vite React + Express + tRPC, Neon PostgreSQL, Vercel):

ERROR MESSAGE: ${bug.error_message}
COMPONENT: ${bug.component_name}
USER WAS DOING: ${bug.user_action}
PAGE: ${bug.url_path}
STACK TRACE:
${(bug.stack_trace || '').slice(0, 1500)}
${PHISHSIM_CODEBASE_CONTEXT}

Think step by step. Recall memory patterns if relevant. Then respond ONLY in valid JSON, no markdown:
{
  "root_cause": "specific root cause in one sentence",
  "file_affected": "exact file path relative to repo root",
  "function_affected": "function or component name",
  "fix_description": "what the fix must do — actionable, specific",
  "fix_code_hint": "key implementation detail or code direction",
  "confidence": 0.0
}`
}

export function buildMarcusCodePrompt(opts: {
  task: string
  repoTree: string
  repoPath: string
  memoryContext: string
  priorDiagnosis?: string
  repoFiles?: Record<string, string>
  strict?: boolean
}): string {
  const repoFilesBlock = opts.repoFiles && Object.keys(opts.repoFiles).length
    ? `\nSOURCE FILES FROM REPO (read before editing — paths are relative to repo root):\n` +
      Object.entries(opts.repoFiles).map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n')
    : ''

  const strictNote = opts.strict
    ? '\n\nSTRICT MODE: You MUST respond with FILE:/---/---END--- blocks only. No markdown fences. No prose.'
    : ''

  return `${MARCUS_SYSTEM}

${opts.memoryContext}

You are Marcus implementing a fix on PhishSimAI at ${opts.repoPath}.
Stack: Vite React, Express + tRPC, TypeScript, Neon Postgres, Vercel.

Repo directories:
${opts.repoTree}
${PHISHSIM_CODEBASE_CONTEXT}
${repoFilesBlock}

${opts.priorDiagnosis ? `YOUR PRIOR DIAGNOSIS (follow this — you already thought this through):\n${opts.priorDiagnosis}\n` : ''}

TASK FROM JANET (includes your diagnosis when this is a bug fix):
${opts.task}

Think through the fix mentally before writing code. Apply memory patterns when they match.

Respond with EXACTLY this format and nothing else:
FILE: <relative path from repo root>
---
<complete new file content, full file not a diff>
---END---

Repeat FILE/---/content/---END--- for each file changed.
Multi-file tasks ARE allowed — output every file needed.
If truly unsafe, respond: CANNOT_AUTO_APPLY: <reason>${strictNote}`
}

export function buildMarcusTaskFromBug(
  bug: { error_message: string; component_name: string; user_action?: string; url_path: string; severity?: string; stack_trace?: string },
  diagnosis: { root_cause?: string; file_affected?: string; function_affected?: string; fix_description?: string; fix_code_hint?: string }
): string {
  return `# MARCUS BUG FIX — PhishSimAI Production

## Bug Report
- **Error**: ${bug.error_message}
- **Component**: ${bug.component_name}
- **User was doing**: ${bug.user_action || 'unknown'}
- **Page**: ${bug.url_path}
- **Severity**: ${bug.severity || 'medium'}

## Marcus Diagnosis (you — follow your own analysis)
- **Root cause**: ${diagnosis.root_cause}
- **File to fix**: ${diagnosis.file_affected}
- **Function/Component**: ${diagnosis.function_affected}
- **What the fix must do**: ${diagnosis.fix_description}
- **Implementation direction**: ${diagnosis.fix_code_hint || diagnosis.fix_description}

## Stack Trace
${(bug.stack_trace || '').slice(0, 800)}

## Requirements
1. Fix ONLY the root cause — no patches, no workarounds
2. Production-quality TypeScript code
3. Do not break any existing functionality
4. Add a comment: // ARCH-FIX: [brief description] to mark the change
5. Output the complete fixed file (or the specific function if file is large)

## Pipeline (autonomous — Janet queued you)
1. Apply fix on \`dev\` branch only
2. Watcher runs preview QA → merges to master → prod QA
3. Do NOT deploy directly to production`
}
