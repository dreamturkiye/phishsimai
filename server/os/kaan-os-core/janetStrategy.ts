import type { SqlLike } from './selfLearning'
import { createAutonomousExperiment, evaluateExperimentAutonomy, listRunningExperiments } from './abExperiment'
import { SupervisorGraph } from './supervisorGraph'

export type StrategyStatus = 'active' | 'paused' | 'completed' | 'failed'

export type LongTermStrategy = {
  id: string
  companyId: string
  name: string
  hypothesis: string
  horizonDays: number
  currentPhase: string
  status: StrategyStatus
  experimentId?: string
  nextReviewAt?: string
  createdAt: string
}

export async function ensureStrategyTable(sql: SqlLike): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS os_long_term_strategies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      horizon_days INTEGER DEFAULT 30,
      current_phase TEXT DEFAULT 'discover',
      status TEXT DEFAULT 'active',
      experiment_id UUID,
      next_review_at TIMESTAMPTZ,
      last_action TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {})
}

const DEFAULT_STRATEGIES = [
  { name: 'Activation lift', hypothesis: 'Improve first-session activation by 15% via onboarding experiments', phase: 'experiment' },
  { name: 'Organic growth', hypothesis: 'Weekly content + social distribution drives 10% more qualified signups', phase: 'execute' },
  { name: 'Code quality', hypothesis: 'Proactive Marcus optimizations reduce incident rate by 25%', phase: 'optimize' },
]

export async function seedDefaultStrategies(sql: SqlLike, companyId: string): Promise<void> {
  await ensureStrategyTable(sql)
  for (const s of DEFAULT_STRATEGIES) {
    await sql`
      INSERT INTO os_long_term_strategies (company_id, name, hypothesis, current_phase, status, next_review_at)
      SELECT ${companyId}, ${s.name}, ${s.hypothesis}, ${s.phase}, 'active', NOW() + INTERVAL '7 days'
      WHERE NOT EXISTS (
        SELECT 1 FROM os_long_term_strategies WHERE company_id=${companyId} AND name=${s.name}
      )
    `.catch(() => {})
  }
}

export async function getActiveStrategies(sql: SqlLike, companyId: string): Promise<LongTermStrategy[]> {
  await ensureStrategyTable(sql)
  const rows = await sql`
    SELECT * FROM os_long_term_strategies
    WHERE company_id=${companyId} AND status='active'
    ORDER BY next_review_at ASC NULLS LAST
    LIMIT 10
  `.catch(() => [])
  return (rows as any[]).map(r => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    hypothesis: r.hypothesis,
    horizonDays: r.horizon_days,
    currentPhase: r.current_phase,
    status: r.status,
    experimentId: r.experiment_id,
    nextReviewAt: r.next_review_at,
    createdAt: r.created_at,
  }))
}

export type StrategyAdvanceResult = {
  strategiesReviewed: number
  experimentsCreated: string[]
  actions: string[]
}

/** Janet advances long-horizon strategies autonomously on cron */
export async function advanceLongTermStrategies(
  sql: SqlLike,
  companyId: string,
  productId: string,
): Promise<StrategyAdvanceResult> {
  await seedDefaultStrategies(sql, companyId)
  const strategies = await getActiveStrategies(sql, companyId)
  const experimentsCreated: string[] = []
  const actions: string[] = []

  for (const s of strategies) {
    const due = !s.nextReviewAt || new Date(s.nextReviewAt) <= new Date()
    if (!due) continue

    if (s.currentPhase === 'discover' || s.currentPhase === 'experiment') {
      if (!s.experimentId && s.name.toLowerCase().includes('activation')) {
        const expId = await createAutonomousExperiment(sql, companyId, {
          name: `Strategy: ${s.name}`,
          hypothesis: s.hypothesis,
          variantA: 'Control onboarding flow',
          variantB: 'Streamlined activation checklist',
          minSamples: 30,
        })
        if (expId) {
          experimentsCreated.push(expId)
          await sql`
            UPDATE os_long_term_strategies SET experiment_id=${expId}::uuid, current_phase='experiment',
              last_action='Created autonomous A/B experiment', next_review_at=NOW()+INTERVAL '7 days', updated_at=NOW()
            WHERE id=${s.id}::uuid
          `.catch(() => {})
          actions.push(`Started experiment for strategy "${s.name}"`)
        }
      } else if (s.experimentId) {
        const result = await evaluateExperimentAutonomy(sql, s.experimentId).catch(() => ({ action: 'none' as const, reason: '' }))
        if (result.action !== 'none') {
          await sql`
            UPDATE os_long_term_strategies SET current_phase='execute', status='completed',
              last_action=${result.reason}, next_review_at=NOW()+INTERVAL '30 days', updated_at=NOW()
            WHERE id=${s.id}::uuid
          `.catch(() => {})
          actions.push(`Strategy "${s.name}" completed: ${result.reason}`)
        } else {
          await sql`
            UPDATE os_long_term_strategies SET next_review_at=NOW()+INTERVAL '7 days', updated_at=NOW()
            WHERE id=${s.id}::uuid
          `.catch(() => {})
        }
      }
    } else if (s.currentPhase === 'execute') {
      const graph = new SupervisorGraph(companyId, productId, `[Strategy: ${s.name}] ${s.hypothesis}`)
      await graph.run(`Strategy phase execute — delegate to growth team.`)
      await sql`
        UPDATE os_long_term_strategies SET last_action='Delegated via supervisor graph', next_review_at=NOW()+INTERVAL '7 days', updated_at=NOW()
        WHERE id=${s.id}::uuid
      `.catch(() => {})
      actions.push(`Executed strategy "${s.name}" via supervisor graph`)
    } else if (s.currentPhase === 'optimize') {
      await sql`
        UPDATE os_long_term_strategies SET last_action='Marcus optimization phase — see proactive scan', next_review_at=NOW()+INTERVAL '7 days', updated_at=NOW()
        WHERE id=${s.id}::uuid
      `.catch(() => {})
      actions.push(`Strategy "${s.name}" in Marcus optimization phase`)
    }
  }

  const running = await listRunningExperiments(sql, companyId).catch(() => [])
  for (const exp of running) {
    await evaluateExperimentAutonomy(sql, exp.id).catch(() => {})
  }

  return { strategiesReviewed: strategies.length, experimentsCreated, actions }
}
