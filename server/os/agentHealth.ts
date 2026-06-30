import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

export type AgentStatus = 'healthy' | 'warning' | 'critical' | 'unknown'
export interface AgentHealthRecord {
  agent_name: string; status: AgentStatus; last_run_at: string | null
  last_success_at: string | null; consecutive_failures: number
  last_error: string | null; metrics: Record<string, any>
}

const STALE_THRESHOLDS: Record<string, number> = {
  aria: 3*3600000, janet: 26*3600000, researcher: 2*3600000,
  watchdog: 4*3600000, heartbeat: 3*3600000
}

const getConn = () => connect({ url: process.env.DATABASE_URL! })

export async function ensureHealthTable() {
  const conn = getConn()
  await conn.execute(`CREATE TABLE IF NOT EXISTS agent_health (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    company_id VARCHAR(100) NOT NULL DEFAULT 'phishsimai',
    agent_name VARCHAR(100) NOT NULL,
    last_run_at TIMESTAMP NULL, last_success_at TIMESTAMP NULL,
    status VARCHAR(50) DEFAULT 'unknown', consecutive_failures INT DEFAULT 0,
    last_error TEXT, metrics JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_agent (company_id, agent_name)
  )`)
}

export async function reportAgentRun(
  agentName: string, success: boolean, metrics: Record<string,any> = {},
  error?: string, companyId = 'phishsimai'
) {
  const conn = getConn()
  await ensureHealthTable()
  const m = JSON.stringify(metrics)
  if (success) {
    await conn.execute(
      `INSERT INTO agent_health (company_id,agent_name,last_run_at,last_success_at,status,consecutive_failures,metrics)
       VALUES (?,?,NOW(),NOW(),'healthy',0,?)
       ON DUPLICATE KEY UPDATE last_run_at=NOW(),last_success_at=NOW(),status='healthy',consecutive_failures=0,last_error=NULL,metrics=VALUES(metrics),updated_at=NOW()`,
      [companyId, agentName, m]
    )
  } else {
    await conn.execute(
      `INSERT INTO agent_health (company_id,agent_name,last_run_at,status,consecutive_failures,last_error,metrics)
       VALUES (?,?,NOW(),'warning',1,?,?)
       ON DUPLICATE KEY UPDATE last_run_at=NOW(),
       status=CASE WHEN consecutive_failures>=2 THEN 'critical' ELSE 'warning' END,
       consecutive_failures=consecutive_failures+1,last_error=VALUES(last_error),metrics=VALUES(metrics),updated_at=NOW()`,
      [companyId, agentName, error ?? null, m]
    )
  }
}

export async function getAgentHealth(companyId = 'phishsimai'): Promise<AgentHealthRecord[]> {
  const conn = getConn()
  await ensureHealthTable()
  const rows = await conn.execute(
    `SELECT agent_name,status,last_run_at,last_success_at,consecutive_failures,last_error,metrics
     FROM agent_health WHERE company_id=? ORDER BY agent_name`, [companyId]
  )
  return ((rows as any).rows || []).map((r: any) => ({
    ...r, metrics: typeof r.metrics==='string' ? JSON.parse(r.metrics||'{}') : (r.metrics||{})
  }))
}

export async function checkAgentStaleness(companyId = 'phishsimai'): Promise<string[]> {
  const conn = getConn()
  await ensureHealthTable()
  const rows = await conn.execute(`SELECT agent_name,last_run_at FROM agent_health WHERE company_id=?`,[companyId])
  const alerts: string[] = []
  const now = Date.now()
  for (const row of ((rows as any).rows||[])) {
    const threshold = STALE_THRESHOLDS[row.agent_name]
    if (!threshold) continue
    const lastRun = row.last_run_at ? new Date(row.last_run_at).getTime() : 0
    if (now-lastRun > threshold) {
      const h = ((now-lastRun)/3600000).toFixed(1)
      alerts.push(`${row.agent_name}: stale ${h}h`)
      await conn.execute(`UPDATE agent_health SET status='critical',updated_at=NOW() WHERE company_id=? AND agent_name=?`,[companyId,row.agent_name])
    }
  }
  if (alerts.length>0) await sendTelegram('PHISHSIMAI AGENT HEALTH ALERT\n'+alerts.join('\n')+'\nCheck HQ /api/os/hq')
  return alerts
}
