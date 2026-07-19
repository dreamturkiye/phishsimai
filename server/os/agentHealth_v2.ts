import { AGENTS, AgentId } from '../lib/kaan_os_v4'
import { getSql } from './conn'
import { openSystemAlert, resolveSystemAlert } from './selfHeal'

/** The concrete neon client type returned by getSql() (NeonQueryFunction<false, false>). */
type Sql = ReturnType<typeof getSql>

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown' | 'healing'

export interface AgentHealthRecord {
  agent_id: string
  agent_name: string
  agent_title: string
  status: HealthStatus
  last_run_at: string | null
  last_success_at: string | null
  consecutive_failures: number
  last_error: string | null
  avg_response_ms: number
  self_heal_count: number
  last_heal_at: string | null
  uptime_pct: number
  company_id: string
}

export async function ensureAgentHealthTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_health_v2 (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          TEXT NOT NULL DEFAULT 'phishsimai',
      agent_id            TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'unknown',
      last_run_at         TIMESTAMPTZ,
      last_success_at     TIMESTAMPTZ,
      consecutive_failures INTEGER DEFAULT 0,
      last_error          TEXT,
      avg_response_ms     FLOAT DEFAULT 0,
      self_heal_count     INTEGER DEFAULT 0,
      last_heal_at        TIMESTAMPTZ,
      total_runs          INTEGER DEFAULT 0,
      total_successes     INTEGER DEFAULT 0,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, agent_id)
    )
  `.catch(() => {})

  for (const agentId of Object.keys(AGENTS)) {
    await sql`
      INSERT INTO agent_health_v2 (company_id, agent_id, status)
      VALUES ('phishsimai', ${agentId}, 'unknown')
      ON CONFLICT (company_id, agent_id) DO NOTHING
    `.catch(() => {})
  }
}

export async function reportAgentHealth(
  agentId: AgentId,
  success: boolean,
  responseMs: number,
  error?: string,
  companyId = 'phishsimai'
) {
  const sql = getSql()
  await ensureAgentHealthTable(sql)

  if (success) {
    await sql`
      INSERT INTO agent_health_v2
        (company_id, agent_id, status, last_run_at, last_success_at, consecutive_failures, avg_response_ms, total_runs, total_successes)
      VALUES (${companyId}, ${agentId}, 'healthy', NOW(), NOW(), 0, ${responseMs}, 1, 1)
      ON CONFLICT (company_id, agent_id) DO UPDATE SET
        status               = 'healthy',
        last_run_at          = NOW(),
        last_success_at      = NOW(),
        consecutive_failures = 0,
        last_error           = NULL,
        avg_response_ms      = ROUND(((agent_health_v2.avg_response_ms * agent_health_v2.total_runs) + ${responseMs})
                               / (agent_health_v2.total_runs + 1)),
        total_runs           = agent_health_v2.total_runs + 1,
        total_successes      = agent_health_v2.total_successes + 1,
        updated_at           = NOW()
    `.catch(() => {})
  } else {
    await sql`
      INSERT INTO agent_health_v2
        (company_id, agent_id, status, last_run_at, consecutive_failures, last_error, total_runs)
      VALUES (${companyId}, ${agentId}, 'warning', NOW(), 1, ${error ?? null}, 1)
      ON CONFLICT (company_id, agent_id) DO UPDATE SET
        status               = CASE
                                 WHEN agent_health_v2.consecutive_failures >= 3 THEN 'critical'
                                 ELSE 'warning'
                               END,
        last_run_at          = NOW(),
        consecutive_failures = agent_health_v2.consecutive_failures + 1,
        last_error           = ${error ?? null},
        total_runs           = agent_health_v2.total_runs + 1,
        updated_at           = NOW()
    `.catch(() => {})
  }
}

export async function getAllAgentHealth(companyId = 'phishsimai'): Promise<AgentHealthRecord[]> {
  const sql = getSql()
  await ensureAgentHealthTable(sql)

  const rows = await sql`
    SELECT
      agent_id, status, last_run_at, last_success_at,
      consecutive_failures, last_error, avg_response_ms,
      self_heal_count, last_heal_at,
      CASE WHEN total_runs > 0
        THEN ROUND((total_successes::float / total_runs::float) * 100)
        ELSE 0
      END as uptime_pct
    FROM agent_health_v2
    WHERE company_id = ${companyId}
    ORDER BY agent_id
  `.catch(() => [] as any[])

  return (rows as any[]).map((r: any) => ({
    ...r,
    agent_name: AGENTS[r.agent_id as AgentId]?.name || r.agent_id,
    agent_title: AGENTS[r.agent_id as AgentId]?.title || '',
    company_id: companyId,
  }))
}

export async function markHealing(agentId: AgentId, companyId = 'phishsimai') {
  const sql = getSql()
  await sql`
    UPDATE agent_health_v2
    SET status = 'healing', updated_at = NOW()
    WHERE company_id = ${companyId} AND agent_id = ${agentId}
  `.catch(() => {})
}

export async function recordHeal(agentId: AgentId, companyId = 'phishsimai') {
  const sql = getSql()
  await sql`
    UPDATE agent_health_v2
    SET self_heal_count = self_heal_count + 1, last_heal_at = NOW(), updated_at = NOW()
    WHERE company_id = ${companyId} AND agent_id = ${agentId}
  `.catch(() => {})
}

const EMPLOYEE_PING_THRESHOLDS: Partial<Record<AgentId, number>> = {
  janet: 26 * 60 * 60 * 1000,
}
// PS-STALE-THRESHOLD-01: daily-cadence agents (Aria et al.) heartbeat once/day via their sequence
// cron, so a 6h threshold tripped a false "stale" ~18h every day (the "Aria 27h / Marcus dispatched"
// alarm). Raised to 26h — matching Janet's override — so a daily agent is flagged only if it misses a
// FULL daily cycle (+2h grace), which is a real miss, not normal cadence.
const DEFAULT_EMPLOYEE_PING_MS = 26 * 60 * 60 * 1000

export async function checkEmployeeStaleness(companyId = 'phishsimai'): Promise<string[]> {
  const sql = getSql()
  await ensureAgentHealthTable(sql)
  const rows = await sql`
    SELECT agent_id, last_success_at, status, consecutive_failures
    FROM agent_health_v2 WHERE company_id = ${companyId}
  `.catch(() => [] as any[])

  const alerts: string[] = []
  const now = Date.now()
  const expectedIds = Object.keys(AGENTS) as AgentId[]

  for (const agentId of expectedIds) {
    const row = (rows as any[]).find((r) => r.agent_id === agentId)
    const threshold = EMPLOYEE_PING_THRESHOLDS[agentId] ?? DEFAULT_EMPLOYEE_PING_MS
    const lastSuccess = row?.last_success_at ? new Date(row.last_success_at).getTime() : 0
    const stale = !lastSuccess || now - lastSuccess > threshold
    const critical = row?.status === 'critical' || (row?.consecutive_failures ?? 0) >= 3

    if (stale || critical) {
      const h = lastSuccess ? ((now - lastSuccess) / 3600000).toFixed(1) : 'never'
      const label = AGENTS[agentId]?.name || agentId
      alerts.push(`employee:${agentId}: ${h}h${critical ? ' critical' : ''}`)
      await openSystemAlert('employee_stale:' + agentId, `${label} last ping ${h}h ago`)
    } else {
      await resolveSystemAlert('employee_stale:' + agentId, 'employee responding within threshold')
    }
  }
  return alerts
}
