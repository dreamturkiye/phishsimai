import type { SqlLike } from './selfLearning'
import type { AgentId } from './types'

export type IntelFinanceScanResult = {
  agentId: AgentId
  actions: string[]
  tasksSuggested: string[]
}

/** Scout L4 — proactive market intelligence without founder prompt */
export async function runScoutProactiveScan(
  sql: SqlLike,
  companyId: string,
): Promise<IntelFinanceScanResult> {
  const actions: string[] = []
  const tasksSuggested: string[] = []

  const staleScout = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE company_id=${companyId} AND agent_id='scout' AND created_at > NOW() - INTERVAL '7 days'
  `.catch(() => [{ n: 0 }])

  if (Number((staleScout as any[])[0]?.n || 0) === 0) {
    tasksSuggested.push('Weekly competitive intel sweep: top 3 competitors, pricing changes, feature gaps vs us')
    actions.push('Scout idle 7d — queued competitive intel sweep')
  }

  const staleIntel = await sql`
    SELECT count(*)::int AS n FROM janet_memory
    WHERE company_id=${companyId} AND source='scout' AND updated_at > NOW() - INTERVAL '14 days'
  `.catch(() => [{ n: 0 }])
  if (Number((staleIntel as any[])[0]?.n || 0) === 0) {
    tasksSuggested.push('ICP refresh: validate ideal customer profile against last 30 days signups and churn reasons')
    actions.push('No Scout intel in 14d — ICP refresh recommended')
  }

  tasksSuggested.push('Trend scan: emerging AI/SaaS signals relevant to our category (win/loss patterns, Reddit/LinkedIn)')
  return { agentId: 'scout', actions, tasksSuggested }
}

/** Finn L4 — proactive financial monitoring and forecasting */
export async function runFinnProactiveScan(
  sql: SqlLike,
  companyId: string,
): Promise<IntelFinanceScanResult> {
  const actions: string[] = []
  const tasksSuggested: string[] = []

  const staleFinn = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE company_id=${companyId} AND agent_id='finn' AND created_at > NOW() - INTERVAL '7 days'
  `.catch(() => [{ n: 0 }])

  if (Number((staleFinn as any[])[0]?.n || 0) === 0) {
    tasksSuggested.push('MRR/ARR snapshot: pull live metrics, compare to prior week, flag anomalies >5%')
    actions.push('Finn idle 7d — queued MRR snapshot')
  }

  tasksSuggested.push('Unit economics review: LTV/CAC estimate update, payback period, margin sensitivity')
  tasksSuggested.push('30-day revenue forecast with best/base/worst scenarios — highlight risks to Kaan only if material')

  const metricAlerts = await sql`
    SELECT key, value FROM janet_memory
    WHERE company_id=${companyId} AND type='metric' AND key ILIKE '%mrr%'
    ORDER BY updated_at DESC LIMIT 3
  `.catch(() => [])
  if ((metricAlerts as any[]).length === 0) {
    actions.push('No recent MRR memory — Finn should seed financial baseline')
  }

  return { agentId: 'finn', actions, tasksSuggested }
}

export async function runIntelFinanceProactiveCycle(
  sql: SqlLike,
  companyId: string,
  issueAgentTask?: (agentId: AgentId, title: string, description: string) => Promise<void>,
): Promise<{ scout: IntelFinanceScanResult; finn: IntelFinanceScanResult; executed: string[] }> {
  const scout = await runScoutProactiveScan(sql, companyId)
  const finn = await runFinnProactiveScan(sql, companyId)
  const executed: string[] = []

  if (issueAgentTask) {
    for (const desc of scout.tasksSuggested.slice(0, 2)) {
      await issueAgentTask('scout', desc.slice(0, 80), desc).catch(() => {})
      executed.push(`scout: ${desc.slice(0, 60)}`)
    }
    for (const desc of finn.tasksSuggested.slice(0, 2)) {
      await issueAgentTask('finn', desc.slice(0, 80), desc).catch(() => {})
      executed.push(`finn: ${desc.slice(0, 60)}`)
    }
  }

  return { scout, finn, executed }
}

export const SCOUT_L4_SYSTEM_ADDENDUM = `
L4 SCOUT (Market Intelligence Supervisor):
- Run competitive sweeps, ICP validation, and trend scans proactively every week.
- Sub-agents: scout-icp (ICP profiling), scout-competitive (competitive intel).
- Deliver actionable intel to Aria (messaging) and Mason (outbound) without waiting for Kaan.
`.trim()

export const FINN_L4_SYSTEM_ADDENDUM = `
L4 FINN (Finance Supervisor):
- Monitor MRR/ARR weekly, update forecasts, flag anomalies >5% to Janet.
- Sub-agents: finn-forecast (scenarios), finn-metrics (unit economics).
- Autonomous reporting; escalate pricing/strategic financial decisions to Kaan only.
`.trim()
