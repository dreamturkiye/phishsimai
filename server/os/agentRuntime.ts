/**
 * L5.7 agent runtime — persistent working memory for Janet's nine workers.
 *
 * Daily crons used to measure, think once with a static prompt, and forget.
 * This module is the anti-amnesia layer from KAAN_AI_OS 7.10 §E:
 *   - load lessons + reflections + the open thread before thinking
 *   - persist the next action so the following cron resumes instead of resetting
 *   - self-modification means changing that thread (and queuing Marcus for code)
 *     never rewriting Dex rails, prices, or protected paths
 */
import { getAgentReflectionPrompt } from './kaan-os-core/agentReflection'
import { getAgentLessonsForPrompt, learnFromOutcome } from './kaan-os-core/outcomeLearning'
import {
  classifySelfModification,
  formatRuntimeContext,
  type AgentWorkingState,
  type SelfModifyClass,
} from './agentRuntimePolicy'

export { classifySelfModification, formatRuntimeContext }
export type { AgentWorkingState, SelfModifyClass }

type SqlLike = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>

export async function ensureAgentRuntimeTable(sql: SqlLike): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS os_agent_working_state (
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      current_goal TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT 'none',
      last_assessment TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, agent_id)
    )
  `.catch(() => {})
}

export async function loadAgentRuntime(
  sql: SqlLike,
  companyId: string,
  agentId: string,
): Promise<{ working: AgentWorkingState; lessons: string; reflections: string; contextBlock: string }> {
  await ensureAgentRuntimeTable(sql)
  const rows = await sql`
    SELECT current_goal, next_action, last_assessment, updated_at
    FROM os_agent_working_state
    WHERE company_id=${companyId} AND agent_id=${agentId}
    LIMIT 1
  `.catch(() => [])
  const row = (rows as any[])[0]
  const working: AgentWorkingState = {
    currentGoal: String(row?.current_goal || ''),
    nextAction: String(row?.next_action || 'none'),
    lastAssessment: String(row?.last_assessment || ''),
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  }
  const [lessons, reflections] = await Promise.all([
    getAgentLessonsForPrompt(sql, companyId, agentId).catch(() => ''),
    getAgentReflectionPrompt(sql, companyId, agentId).catch(() => ''),
  ])
  return {
    working,
    lessons,
    reflections,
    contextBlock: formatRuntimeContext({ working, lessons, reflections }),
  }
}

export async function persistAgentRuntime(
  sql: SqlLike,
  companyId: string,
  agentId: string,
  update: {
    currentGoal?: string
    nextAction: string
    lastAssessment: string
    success?: boolean
    lesson?: string
  },
): Promise<SelfModifyClass> {
  await ensureAgentRuntimeTable(sql)
  const kind = classifySelfModification(update.nextAction)
  const nextAction = kind === 'hard_stop' ? 'escalate_hard_stop_to_founder' : update.nextAction
  await sql`
    INSERT INTO os_agent_working_state
      (company_id, agent_id, current_goal, next_action, last_assessment, updated_at)
    VALUES (
      ${companyId}, ${agentId}, ${String(update.currentGoal || '').slice(0, 400)},
      ${nextAction.slice(0, 400)}, ${update.lastAssessment.slice(0, 600)}, NOW()
    )
    ON CONFLICT (company_id, agent_id) DO UPDATE SET
      current_goal = EXCLUDED.current_goal,
      next_action = EXCLUDED.next_action,
      last_assessment = EXCLUDED.last_assessment,
      updated_at = NOW()
  `.catch(() => {})

  if (update.lesson) {
    await learnFromOutcome(sql, companyId, {
      agentId,
      success: update.success !== false && kind !== 'hard_stop',
      lesson: update.lesson.slice(0, 500),
      source: 'agent_task',
    }).catch(() => {})
  }
  return kind
}
