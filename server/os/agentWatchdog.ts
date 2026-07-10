import { Request, Response } from 'express'
import { getAllAgentHealth, reportAgentHealth, ensureAgentHealthTable, markHealing, recordHeal } from './agentHealth_v2'
import { reportAgentRun } from './agentHealth'
import { runOpsRecoveryTick } from './opsRecovery'
import { talkToAgent, AGENTS, AgentId } from '../lib/kaan_os_v4'
import { sendTelegram } from './telegram'
import { getSql } from './conn'
import { queueJanetArchitectTask } from './selfHeal'
import { alertMarcusPipelineIssues } from './marcusPipelineHealth'
import { runL5MarcusScan } from './l5Autonomy'

const HQ = process.env.HQ_SECRET
const CRON = process.env.CRON_SECRET || ''
const COMPANY = 'phishsimai'

const HEALTH_PROMPTS: Record<AgentId, string> = {
  janet: 'Health ping. Respond with: ONLINE plus one sentence on current company priority.',
  marcus: 'Health ping. Respond with: ONLINE plus pipeline status in one sentence.',
  aria: 'Health ping. Respond with: ONLINE plus current marketing priority in one sentence.',
  nova: 'Health ping. Respond with: ONLINE plus top product issue in one sentence.',
  rex: 'Health ping. Respond with: ONLINE plus pipeline data quality in one sentence.',
  scout: 'Health ping. Respond with: ONLINE plus key market signal this week in one sentence.',
  finn: 'Health ping. Respond with: ONLINE plus revenue status in one sentence.',
  vera: 'Health ping. Respond with: ONLINE plus customer health in one sentence.',
  max: 'Health ping. Respond with: ONLINE plus Kaan top priority today in one sentence.',
}

function auth(req: Request): boolean {
  return req.headers.authorization === `Bearer ${CRON}` ||
    (!!HQ && (req.query.secret as string) === HQ)
}

async function pingAgent(agentId: AgentId, companyId: string) {
  const t0 = Date.now()
  try {
    const result = await talkToAgent(agentId, HEALTH_PROMPTS[agentId], companyId, false)
    const ms = Date.now() - t0
    await reportAgentHealth(agentId, true, ms, undefined, companyId)
    await recordHeal(agentId, companyId)
    return { ok: true, ms, preview: result.response.slice(0, 120), error: undefined as string | undefined }
  } catch (err: any) {
    const ms = Date.now() - t0
    await reportAgentHealth(agentId, false, ms, err.message, companyId)
    // Added a check to see if the error is an HTTP 504 error
    if (err.message.includes('ECONNABORTED') || err.message.includes('ETIMEDOUT')) {
      // If it is, try to resend the directive after a short delay
      await new Promise(resolve => setTimeout(resolve, 500))
      try {
        const result = await talkToAgent(agentId, HEALTH_PROMPTS[agentId], companyId, false)
        const ms = Date.now() - t0
        await reportAgentHealth(agentId, true, ms, undefined, companyId)
        await recordHeal(agentId, companyId)
        return { ok: true, ms, preview: result.response.slice(0, 120), error: undefined as string | undefined }
      } catch (err: any) {
        const ms = Date.now() - t0
        await reportAgentHealth(agentId, false, ms, err.message, companyId)
        return { ok: false, ms, preview: '', error: err.message.slice(0, 100) }
      }
    } else {
      const ms = Date.now() - t0
      await reportAgentHealth(agentId, false, ms, err.message, companyId)
      return { ok: false, ms, preview: '', error: err.message.slice(0, 100) }
    }
  }
}

function formatAgentList(agents: any[]) {
  return agents.map((a) => ({
    agent_id: a.agent_id,
    name: a.agent_name,
    title: a.agent_title,
    status: a.status,
    uptime: a.uptime_pct + '%',
    last_success: a.last_success_at,
    failures: a.consecutive_failures,
    heals: a.self_heal_count,
    avg_ms: Math.round(a.avg_response_ms),
  }))
}

function priorityOf(status: string): number {
  if (status === 'critical') return 0
  if (status === 'healing') return 1
  if (status === 'unknown') return 2
  if (status === 'warning') return 3
  return 99
}

export async function cronAgentWatchdog(req: Request, res: Response) {
  if (!auth(req)) { res.status(401).json({ error: 'Unauthorized' }); return }

  const action = (req.query.action as string) || 'check'
  const companyId = (req.query.company_id as string) || COMPANY
  await ensureAgentHealthTable(getSql())

  const opsRecovery = action === 'check' ? await runOpsRecoveryTick(companyId).catch(() => ({ checked: 0, restarts: [] })) : null

  if (action === 'status') {
    const agents = await getAllAgentHealth(companyId)
    const healthy = agents.filter((a) => a.status === 'healthy').length
    const critical = agents.filter((a) => a.status === 'critical' || a.status === 'unknown').length
    const overall = critical > 3 ? 'critical' : healthy < agents.length ? 'degraded' : 'healthy'
    res.json({
      overall, healthy, total: agents.length,
      agents: formatAgentList(agents),
      timestamp: new Date().toISOString(),
    })
    return
  }

  if (action === 'ping') {
    const agentId = ((req.query.agent as string) || 'janet') as AgentId
    if (!AGENTS[agentId]) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }
    const result = await pingAgent(agentId, companyId)
    res.json(result)
    return
  }

  res.status(400).json({ error: 'Invalid action' })
}