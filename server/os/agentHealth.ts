import { getSql } from './conn'
import { openSystemAlert, resolveSystemAlert } from './selfHeal'
import { getExpectedOpsAgents, HEALABLE_OPS_AGENTS } from './opsAgents'
import { dispatchOpsRestart } from './opsRecovery'

export type AgentStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface AgentHealthRecord {
  agent_name: string
  status: AgentStatus
  last_run_at: string | null
  last_success_at: string | null
  consecutive_failures: number
  last_error: string | null
  metrics: Record<string, any>
}

const STALE_THRESHOLDS: Record<string, number> = {
  aria: 26 * 60 * 60 * 1000,
  janet: 26 * 60 * 60 * 1000,
  researcher: 90 * 60 * 1000,
  discover: 7 * 60 * 60 * 1000,
  watchdog: 2 * 60 * 60 * 1000,
  heartbeat: 2 * 60 * 60 * 1000,
  agent_watchdog: 60 * 60 * 1000,
}

export async function ensureHealthTable() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS agent_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    agent_name TEXT NOT NULL,
    last_run_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    status TEXT DEFAULT 'unknown',
    consecutive_failures INTEGER DEFAULT 0,
    last_error TEXT,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, agent_name)
  )`
}

export async function reportAgentRun(
  agentName: string,
  success: boolean,
  metrics: Record<string, any> = {},
  error?: string,
  companyId = 'phishsimai'
) {
  const sql = getSql()
  await ensureHealthTable()
  const metricsJson = JSON.stringify(metrics)
  if (success) {
    await sql`
      INSERT INTO agent_health (company_id, agent_name, last_run_at, last_success_at, status, consecutive_failures, metrics)
      VALUES (${companyId}, ${agentName}, NOW(), NOW(), 'healthy', 0, ${metricsJson}::jsonb)
      ON CONFLICT (company_id, agent_name) DO UPDATE SET
        last_run_at = NOW(), last_success_at = NOW(), status = 'healthy',
        consecutive_failures = 0, last_error = NULL, metrics = ${metricsJson}::jsonb, updated_at = NOW()
    `
  } else {
    await sql`
      INSERT INTO agent_health (company_id, agent_name, last_run_at, status, consecutive_failures, last_error, metrics)
      VALUES (${companyId}, ${agentName}, NOW(), 'warning', 1, ${error ?? null}, ${metricsJson}::jsonb)
      ON CONFLICT (company_id, agent_name) DO UPDATE SET
        last_run_at = NOW(),
        status = CASE WHEN agent_health.consecutive_failures >= 2 THEN 'critical' ELSE 'warning' END,
        consecutive_failures = agent_health.consecutive_failures + 1,
        last_error = ${error ?? null}, metrics = ${metricsJson}::jsonb, updated_at = NOW()
    `
    if (HEALABLE_OPS_AGENTS.includes(agentName as any)) {
      await dispatchOpsRestart(agentName, 'error', companyId, error?.slice(0, 120)).catch(() => {})
    }
  }
}

export async function getAgentHealth(companyId = 'phishsimai'): Promise<AgentHealthRecord[]> {
  const sql = getSql()
  await ensureHealthTable()
  const rows = await sql`
    SELECT agent_name, status, last_run_at, last_success_at, consecutive_failures, last_error, metrics
    FROM agent_health WHERE company_id = ${companyId} ORDER BY agent_name
  `
  return rows as AgentHealthRecord[]
}

export async function checkAgentStaleness(companyId = 'phishsimai'): Promise<string[]> {
  const sql = getSql()
  await ensureHealthTable()
  const rows = await sql`SELECT agent_name, last_run_at FROM agent_health WHERE company_id = ${companyId}`
  const rowMap = new Map((rows as any[]).map((r) => [r.agent_name, r.last_run_at]))
  const expected = getExpectedOpsAgents(companyId)
  const alerts: string[] = []
  const now = Date.now()

  for (const [agentName, threshold] of Object.entries(expected)) {
    const lastRunAt = rowMap.get(agentName)
    const lastRun = lastRunAt ? new Date(lastRunAt as string).getTime() : 0
    const stale = !lastRun || now - lastRun > threshold
    if (stale) {
      const h = lastRun ? ((now - lastRun) / 3600000).toFixed(1) : 'never'
      alerts.push(`${agentName}: stale ${h}h`)
      await openSystemAlert('agent_stale:' + agentName, `stale ${h}h`)
      await sql`INSERT INTO agent_health (company_id, agent_name, status, updated_at)
        VALUES (${companyId}, ${agentName}, 'critical', NOW())
        ON CONFLICT (company_id, agent_name) DO UPDATE SET
          status='critical', updated_at=NOW()`
      if (HEALABLE_OPS_AGENTS.includes(agentName as any)) {
        await dispatchOpsRestart(agentName, 'stale', companyId, `${h}h`).catch(() => {})
      }
    } else {
      await resolveSystemAlert('agent_stale:' + agentName, 'running within threshold')
    }
  }
  return alerts
}
