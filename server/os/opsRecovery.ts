import { getSql } from './conn'
import { healOpsAgent, getExpectedOpsAgents, HEALABLE_OPS_AGENTS } from './opsAgents'
import { openSystemAlert, resolveSystemAlert } from './selfHeal'
import { sendTelegram } from './telegram'

export type HealableOpsAgent = (typeof HEALABLE_OPS_AGENTS)[number]

const HEAL_COOLDOWN_MS = 30 * 60 * 1000
const inFlight = new Set<string>()

function healKey(companyId: string, agentName: string) {
  return `${companyId}:${agentName}`
}

async function getLastHealAttempt(companyId: string, agentName: string): Promise<number> {
  const sql = getSql()
  const rows = await sql`
    SELECT metrics FROM agent_health
    WHERE company_id = ${companyId} AND agent_name = ${agentName}
    LIMIT 1
  `.catch(() => [])
  const metrics = (rows as any[])[0]?.metrics || {}
  const ts = metrics.last_heal_attempt_at
  return ts ? new Date(ts).getTime() : 0
}

async function markHealAttempt(companyId: string, agentName: string) {
  const sql = getSql()
  await sql`
    UPDATE agent_health SET metrics = COALESCE(metrics, '{}'::jsonb) || ${JSON.stringify({ last_heal_attempt_at: new Date().toISOString() })}::jsonb,
      updated_at = NOW()
    WHERE company_id = ${companyId} AND agent_name = ${agentName}
  `.catch(() => {})
}

export async function dispatchOpsRestart(
  agentName: string,
  reason: 'error' | 'stale' | 'silent',
  companyId: string,
  detail?: string
): Promise<{ ok: boolean; message: string }> {
  if (!HEALABLE_OPS_AGENTS.includes(agentName as HealableOpsAgent)) {
    return { ok: false, message: 'not healable' }
  }

  const key = healKey(companyId, agentName)
  if (inFlight.has(key)) return { ok: false, message: 'heal in flight' }

  const lastAttempt = await getLastHealAttempt(companyId, agentName)
  if (Date.now() - lastAttempt < HEAL_COOLDOWN_MS) {
    return { ok: false, message: 'cooldown' }
  }

  inFlight.add(key)
  const alertKey = 'agent_stale:' + agentName
  const alertDetail = `${reason}${detail ? ': ' + detail : ''} — Janet restarting now`

  try {
    await openSystemAlert(alertKey, alertDetail, companyId)
    await markHealAttempt(companyId, agentName)
    const result = await healOpsAgent(agentName, companyId)
    await resolveSystemAlert(alertKey, `restarted OK: ${result}`, companyId)
    await resolveSystemAlert('ops_restart:' + agentName, 'superseded', companyId).catch(() => {})
    await sendTelegram(`✅ Janet restarted ${agentName}\n${result}`).catch(() => {})
    return { ok: true, message: result }
  } catch (e: any) {
    const err = e.message?.slice(0, 120) || 'heal failed'
    await openSystemAlert(alertKey, `restart failed: ${err}`)
    await sendTelegram(`🚨 Janet restart failed: ${agentName}\n${err}`).catch(() => {})
    return { ok: false, message: err }
  } finally {
    inFlight.delete(key)
  }
}

export async function runOpsRecoveryTick(companyId = 'phishsimai'): Promise<{
  checked: number
  restarts: { agent: string; reason: string; ok: boolean; message: string }[]
}> {
  const sql = getSql()
  const expected = getExpectedOpsAgents(companyId)
  const rows = await sql`
    SELECT agent_name, last_run_at, last_success_at, status, consecutive_failures, last_error
    FROM agent_health WHERE company_id = ${companyId}
  `.catch(() => [])

  const rowMap = new Map((rows as any[]).map((r) => [r.agent_name, r]))
  const now = Date.now()
  const candidates: { agent: string; reason: 'error' | 'stale' | 'silent'; priority: number; detail: string }[] = []

  for (const agentName of HEALABLE_OPS_AGENTS) {
    const threshold = expected[agentName]
    if (!threshold) continue
    const row = rowMap.get(agentName)
    const lastRun = row?.last_run_at ? new Date(row.last_run_at as string).getTime() : 0
    const lastSuccess = row?.last_success_at ? new Date(row.last_success_at as string).getTime() : 0
    const failures = row?.consecutive_failures ?? 0

    if (failures >= 1 && lastRun && (!lastSuccess || lastRun > lastSuccess)) {
      candidates.push({
        agent: agentName,
        reason: 'error',
        priority: 0,
        detail: row?.last_error || `${failures} consecutive failures`,
      })
      continue
    }

    if (!lastRun || now - lastRun > threshold) {
      const h = lastRun ? ((now - lastRun) / 3600000).toFixed(1) + 'h' : 'never'
      candidates.push({ agent: agentName, reason: 'stale', priority: 1, detail: h })
      continue
    }

    if (lastSuccess && now - lastSuccess > threshold) {
      candidates.push({
        agent: agentName,
        reason: 'silent',
        priority: 2,
        detail: `last success ${((now - lastSuccess) / 3600000).toFixed(1)}h ago`,
      })
    }
  }

  candidates.sort((a, b) => a.priority - b.priority)

  const restarts: { agent: string; reason: string; ok: boolean; message: string }[] = []
  const pipeline = candidates.filter((c) => ['researcher', 'discover'].includes(c.agent))
  const toRun = [...pipeline.slice(0, 2), ...candidates.filter((c) => !['researcher', 'discover'].includes(c.agent)).slice(0, 1)]

  const seen = new Set<string>()
  for (const c of toRun) {
    if (seen.has(c.agent)) continue
    seen.add(c.agent)
    const r = await dispatchOpsRestart(c.agent, c.reason, companyId, c.detail)
    restarts.push({ agent: c.agent, reason: c.reason, ok: r.ok, message: r.message })
  }

  return { checked: Object.keys(expected).length, restarts }
}

export async function onOpsAgentFailure(
  agentName: string,
  companyId: string,
  error?: string
): Promise<void> {
  if (!HEALABLE_OPS_AGENTS.includes(agentName as HealableOpsAgent)) return
  await dispatchOpsRestart(agentName, 'error', companyId, error?.slice(0, 120))
}
