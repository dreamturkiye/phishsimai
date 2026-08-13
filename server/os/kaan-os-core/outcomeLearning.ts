import type { SkillRecord } from './types'
import type { SqlLike } from './selfLearning'
import { ensureSelfLearningTables, upsertSkillFromArchitectMemory } from './selfLearning'

/** Agents get smarter from their own results — outcome → skill confidence + lessons */
export async function ensureOutcomeLearningTables(sql: SqlLike): Promise<void> {
  await ensureSelfLearningTables(sql)
  await sql`
    CREATE TABLE IF NOT EXISTS os_agent_lessons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'agent_task',
      signature TEXT NOT NULL,
      lesson TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      score FLOAT,
      confidence_delta FLOAT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {})
}

export async function learnFromOutcome(
  sql: SqlLike,
  companyId: string,
  opts: {
    agentId: string
    success: boolean
    score?: number
    lesson: string
    source?: 'agent_task' | 'experiment' | 'architect_memory'
    signature?: string
  },
): Promise<void> {
  await ensureOutcomeLearningTables(sql)
  const sig = opts.signature || `${opts.agentId}:${opts.lesson.slice(0, 80).replace(/\s+/g, '_')}`
  const delta = opts.success
    ? opts.score != null && opts.score >= 8 ? 0.05 : 0.02
    : -0.08

  await sql`
    INSERT INTO os_agent_lessons (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
    VALUES (
      ${companyId},
      ${opts.agentId},
      ${opts.source || 'agent_task'},
      ${sig.slice(0, 200)},
      ${opts.lesson.slice(0, 500)},
      ${opts.success},
      ${opts.score ?? null},
      ${delta}
    )
  `.catch(() => {})

  if (opts.success && (opts.score == null || opts.score >= 6)) {
    await upsertSkillFromArchitectMemory(sql, companyId, {
      errorSignature: sig,
      rootCause: `${opts.agentId} outcome`,
      fixDescription: opts.lesson,
      confidence: Math.min(0.5 + (opts.score || 7) / 20, 0.95),
    }).catch(() => {})
  } else if (!opts.success) {
    await sql`
      UPDATE os_skill_library SET confidence = GREATEST(confidence + ${delta}, 0.1)
      WHERE company_id=${companyId} AND signature=${sig.slice(0, 200)}
    `.catch(() => {})
  }
}

export async function getAgentLessonsForPrompt(
  sql: SqlLike,
  companyId: string,
  agentId: string,
  limit = 4,
): Promise<string> {
  await ensureOutcomeLearningTables(sql)
  const rows = await sql`
    SELECT lesson, success, score, created_at
    FROM os_agent_lessons
    WHERE company_id=${companyId} AND agent_id=${agentId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `.catch(() => [])

  const lessons = rows as any[]
  if (!lessons.length) return ''
  return 'LEARNED LESSONS (from your past results):\n' +
    lessons.map(l =>
      `- [${l.success ? '✓' : '✗'}${l.score != null ? ` ${l.score}/10` : ''}] ${String(l.lesson).slice(0, 100)}`,
    ).join('\n')
}

export async function recallSkillsForAgent(
  sql: SqlLike,
  companyId: string,
  agentId: string,
  query: string,
): Promise<SkillRecord[]> {
  const { recallRelevantSkills } = await import('./selfLearning')
  return recallRelevantSkills(sql, companyId, `${agentId} ${query}`, 4)
}
