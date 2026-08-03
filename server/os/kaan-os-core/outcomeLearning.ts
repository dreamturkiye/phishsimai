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

/**
 * PS-JANET-DOCTRINE-01 — lessons that must OUTLIVE any prompt edit.
 *
 * A system prompt is one thin-memory turn away from being rewritten, summarised, or truncated, and
 * the two facts below were each learned expensively. They live in os_agent_lessons because that
 * table is read into every agent's context by getAgentLessonsForPrompt() regardless of what the
 * prompt currently says — so reverting the prompt cannot revert the lesson.
 *
 * Both are recorded as success=false: they are failures we paid for, and the negative
 * confidence_delta is the point. Idempotent by signature — re-seeding never duplicates.
 */
export const PERMANENT_LESSONS: { signature: string; lesson: string }[] = [
  {
    signature: 'phishsim:insurance-angle-failed',
    lesson:
      'INSURANCE/COMPLIANCE-URGENCY OPENER FAILED, MEASURED: 908 cold sends (2026-07-04..08-02) ' +
      'produced 1 human reply and it was hostile ("stop emailing me"). Do NOT lead outreach, ' +
      'landing copy, or a pitch with insurance, underwriting, audits, or breach-fear framing. ' +
      'Lead with price ($299/500 users = 60c), 10-minute setup, no-card 30-day trial, and MSP ' +
      'margin. Compliance is a SECOND-position supporting point for larger MSPs, never the opener.',
  },
  {
    signature: 'phishsim:pricing-frozen-live-stripe',
    lesson:
      'PRICING IS FROZEN AND LIVE-STRIPE-SOURCED: Starter $149 (100 users), Growth $299 (500), ' +
      'Pro $749 (2,500), Enterprise $1,499 (10,000); annual = 10x monthly; trial 30 days no card. ' +
      'A prompt once carried $99/$249/$499/$999 — all four wrong. NEVER quote a price not read ' +
      'from server/stripe/prices.ts, never discount, round, or invent one, and never propose a ' +
      'pricing change: Kaan approves pricing separately.',
  },
]

/** Write the permanent doctrine lessons once. Safe to call on every boot. */
export async function seedPermanentLessons(sql: SqlLike, companyId: string): Promise<void> {
  await ensureOutcomeLearningTables(sql)
  for (const l of PERMANENT_LESSONS) {
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${companyId} AND signature=${l.signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue
    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${companyId}, 'janet', 'experiment', ${l.signature}, ${l.lesson}, false, 0, -0.08)`
      .catch(() => {})
  }
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
