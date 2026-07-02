import type { SqlLike } from './selfLearning'
import { proactiveSkillSuggestions } from './selfLearning'
import { createAutonomousExperiment, evaluateExperimentAutonomy, listRunningExperiments } from './abExperiment'
import { SupervisorGraph } from './supervisorGraph'
import type { AgentId } from './types'

export type L5ActionHandlers = {
  queueArchitectTask?: (task: string, notes: string) => Promise<string | null>
  issueAgentTask?: (agentId: AgentId, title: string, description: string) => Promise<void>
}

export type ProactiveOpportunity = {
  kind: 'growth' | 'retention' | 'engineering' | 'experiment' | 'sales'
  agentId: AgentId
  title: string
  description: string
  autoExecute: boolean
}

export type JanetProactiveResult = {
  opportunities: ProactiveOpportunity[]
  executed: string[]
  skipped: string[]
}

/** Janet L5 — identify growth opportunities without founder prompt */
export async function detectGrowthOpportunities(
  sql: SqlLike,
  companyId: string,
): Promise<ProactiveOpportunity[]> {
  const opps: ProactiveOpportunity[] = []

  const lowPerf = await sql`
    SELECT agent_id, avg_score FROM agent_performance
    WHERE company_id=${companyId} AND avg_score < 6
    ORDER BY avg_score ASC LIMIT 2
  `.catch(() => [])
  for (const r of lowPerf as any[]) {
    opps.push({
      kind: 'growth',
      agentId: r.agent_id as AgentId,
      title: `Coach ${r.agent_id} — performance below bar`,
      description: `${r.agent_id} avg score ${Number(r.avg_score).toFixed(1)}/10. Janet assigns focused improvement task with measurable outcome.`,
      autoExecute: true,
    })
  }

  const staleAria = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE company_id=${companyId} AND agent_id='aria' AND created_at > NOW() - INTERVAL '7 days'
  `.catch(() => [{ n: 0 }])
  if (Number((staleAria as any[])[0]?.n || 0) === 0) {
    opps.push({
      kind: 'growth',
      agentId: 'aria',
      title: 'Launch weekly growth content sprint',
      description: 'No Aria tasks in 7 days. Auto-start LinkedIn + email sequence aligned to current ICP and top funnel metric.',
      autoExecute: true,
    })
  }

  const staleMason = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE company_id=${companyId} AND agent_id='mason' AND created_at > NOW() - INTERVAL '5 days'
  `.catch(() => [{ n: 0 }])
  if (Number((staleMason as any[])[0]?.n || 0) === 0) {
    opps.push({
      kind: 'sales',
      agentId: 'mason',
      title: 'Outbound pipeline refresh',
      description: 'No Mason activity in 5 days. Queue 20-target outbound sequence with personalized hooks.',
      autoExecute: true,
    })
  }

  const skills = await proactiveSkillSuggestions(sql, companyId).catch(() => [])
  if (skills.length > 0) {
    opps.push({
      kind: 'engineering',
      agentId: 'marcus',
      title: 'Prevent recurring pattern proactively',
      description: skills[0],
      autoExecute: true,
    })
  }

  const experiments = await listRunningExperiments(sql, companyId).catch(() => [])
  for (const exp of experiments.slice(0, 2)) {
    const evalResult = await evaluateExperimentAutonomy(sql, exp.id).catch(() => ({ action: 'none' as const, reason: '' }))
    if (evalResult.action !== 'none') {
      opps.push({
        kind: 'experiment',
        agentId: 'nova',
        title: `Promote experiment winner: ${exp.name}`,
        description: evalResult.reason,
        autoExecute: true,
      })
    }
  }

  return opps.slice(0, 5)
}

/** Execute proactive opportunities — Janet acts without being told */
export async function runJanetProactiveCycle(
  sql: SqlLike,
  companyId: string,
  productId: string,
  handlers: L5ActionHandlers = {},
): Promise<JanetProactiveResult> {
  const opportunities = await detectGrowthOpportunities(sql, companyId)
  const executed: string[] = []
  const skipped: string[] = []

  for (const opp of opportunities) {
    if (!opp.autoExecute) {
      skipped.push(opp.title)
      continue
    }

    if (opp.kind === 'engineering' && handlers.queueArchitectTask) {
      const id = await handlers.queueArchitectTask(
        `PROACTIVE: ${opp.description.slice(0, 400)}`,
        `Janet L5 proactive — ${opp.title}`,
      )
      if (id) executed.push(opp.title)
      else skipped.push(opp.title)
    } else if (handlers.issueAgentTask) {
      await handlers.issueAgentTask(opp.agentId, opp.title, opp.description).catch(() => {})
      executed.push(opp.title)
    } else {
      skipped.push(opp.title)
    }
  }

  if (executed.length === 0 && opportunities.length > 0) {
    const graph = new SupervisorGraph(companyId, productId, opportunities[0].description)
    await graph.run(`Proactive cycle identified ${opportunities.length} opportunities; ${skipped.length} awaiting handlers.`)
  }

  return { opportunities, executed, skipped }
}

export const JANET_PROACTIVE_SYSTEM_ADDENDUM = `
L5 PROACTIVE JANET:
- Identify growth, retention, and revenue opportunities daily without Kaan asking.
- Auto-delegate to department supervisors; Marcus for code, Aria for growth, Nova for experiments.
- Execute small safe actions autonomously; escalate only high-risk decisions to Kaan.
`.trim()
