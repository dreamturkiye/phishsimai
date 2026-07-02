import type { SqlLike } from './selfLearning'
import { learnFromOutcome } from './outcomeLearning'

export type AgentReflection = {
  agentId: string
  taskId?: string
  success: boolean
  score?: number
  outputPreview: string
  correction?: string
  lesson?: string
  at: string
}

/** Per-agent reflection store — feeds self-correction prompts */
export async function ensureReflectionTable(sql: SqlLike): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS os_agent_reflections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      task_id TEXT,
      success BOOLEAN NOT NULL,
      score FLOAT,
      output_preview TEXT,
      correction TEXT,
      lesson TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {})
}

export async function recordAgentReflection(
  sql: SqlLike,
  companyId: string,
  reflection: Omit<AgentReflection, 'at'>,
): Promise<void> {
  await ensureReflectionTable(sql)
  await sql`
    INSERT INTO os_agent_reflections (company_id, agent_id, task_id, success, score, output_preview, correction, lesson)
    VALUES (
      ${companyId},
      ${reflection.agentId},
      ${reflection.taskId || null},
      ${reflection.success},
      ${reflection.score ?? null},
      ${reflection.outputPreview.slice(0, 500)},
      ${reflection.correction?.slice(0, 500) || null},
      ${reflection.lesson?.slice(0, 500) || null}
    )
  `.catch(() => {})

  await learnFromOutcome(sql, companyId, {
    agentId: reflection.agentId,
    success: reflection.success,
    score: reflection.score,
    lesson: reflection.lesson || reflection.correction || reflection.outputPreview,
    source: 'agent_task',
  }).catch(() => {})
}

/** Build self-correction block from recent failures for agent prompt injection */
export async function getAgentReflectionPrompt(
  sql: SqlLike,
  companyId: string,
  agentId: string,
): Promise<string> {
  await ensureReflectionTable(sql)
  const rows = await sql`
    SELECT success, score, correction, lesson, output_preview, created_at
    FROM os_agent_reflections
    WHERE company_id=${companyId} AND agent_id=${agentId}
    ORDER BY created_at DESC
    LIMIT 5
  `.catch(() => [])

  const recent = rows as any[]
  if (!recent.length) return ''

  const failures = recent.filter(r => !r.success || (r.score != null && Number(r.score) < 6))
  if (!failures.length) {
    const last = recent[0]
    return `SELF-CORRECTION (recent success): Last run score ${last.score ?? 'n/a'}. Keep this quality bar.`
  }

  const lines = failures.slice(0, 3).map(r => {
    const fix = r.correction || r.lesson || r.output_preview
    return `- ${String(r.created_at).slice(0, 10)}: ${fix.slice(0, 120)}`
  })
  return `SELF-CORRECTION (learn from recent misses):\n${lines.join('\n')}\nAdjust approach before repeating the same mistake.`
}

/** Janet-style review → structured reflection + optional follow-up correction task */
export function parseReviewForReflection(feedback: string, score: number): { correction?: string; lesson?: string } {
  const followUp = feedback.match(/FOLLOW-UP:\s*([\s\S]+)/i)?.[1]?.trim()
  const fb = feedback.match(/FEEDBACK:\s*([\s\S]+?)(?:\||$)/i)?.[1]?.trim()
  return {
    correction: score < 7 ? followUp || fb : undefined,
    lesson: fb || followUp,
  }
}

export async function runAgentSelfCorrection(
  sql: SqlLike,
  companyId: string,
  agentId: string,
): Promise<{ needsCorrection: boolean; promptBlock: string }> {
  const promptBlock = await getAgentReflectionPrompt(sql, companyId, agentId)
  const needsCorrection = promptBlock.includes('learn from recent misses')
  return { needsCorrection, promptBlock }
}
