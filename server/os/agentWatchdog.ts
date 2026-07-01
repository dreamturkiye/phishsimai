import { Request, Response } from 'express'
import { getAllAgentHealth, reportAgentHealth, ensureAgentHealthTable, markHealing, recordHeal } from './agentHealth_v2'
import { talkToAgent, AGENTS, AgentId } from './agents/kaan_os_v4'
import { sendTelegram } from './telegram'
import { getSql } from './conn'
import { queueJanetArchitectTask } from './selfHeal'

const HQ = process.env.HQ_SECRET || 'ps-hq-2026'
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
    (req.query.secret as string) === HQ
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
    return { ok: false, ms, preview: '', error: err.message.slice(0, 100) }
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
      res.status(400).json({ error: 'Unknown agent', available: Object.keys(AGENTS) })
      return
    }
    const result = await pingAgent(agentId, companyId)
    res.json({
      agent: AGENTS[agentId].name,
      status: result.ok ? 'ok' : 'fail',
      response_ms: result.ms,
      preview: result.preview,
      error: result.error,
    })
    return
  }

  const agents = await getAllAgentHealth(companyId)
  const allIds = Object.keys(AGENTS) as AgentId[]
  const sorted = [...agents].sort((a, b) => priorityOf(a.status) - priorityOf(b.status))
  const needsHelp = sorted.filter((a) => priorityOf(a.status) < 99)
  const known = new Set(agents.map((a) => a.agent_id))
  const newAgents = allIds.filter((id) => !known.has(id))

  let targetId: AgentId | null = null
  if (newAgents.length > 0) targetId = newAgents[0]
  else if (needsHelp.length > 0) targetId = needsHelp[0].agent_id as AgentId

  if (!targetId) {
    const randomId = allIds[Math.floor(Math.random() * allIds.length)]
    const spot = await pingAgent(randomId, companyId)
    res.json({
      ok: true,
      overall: 'healthy',
      summary: `${agents.length}/${agents.length} agents healthy, spot checked ${AGENTS[randomId].name}`,
      spot_check: { agent: AGENTS[randomId].name, status: spot.ok ? 'ok' : 'fail', ms: spot.ms, preview: spot.preview },
      timestamp: new Date().toISOString(),
    })
    return
  }

  await markHealing(targetId, companyId)
  const healResult = await pingAgent(targetId, companyId)
  const agent = AGENTS[targetId]

  if (healResult.ok) {
    await sendTelegram(`✅ ${agent.name} — HEALED\n${agent.title}\nResponse: ${healResult.ms}ms\n${healResult.preview}`).catch(() => {})
  } else {
    await sendTelegram(`🚨 ${agent.name} — HEAL FAILED\n${agent.title}\nError: ${healResult.error}`).catch(() => {})
    await queueJanetArchitectTask({
      task: `Agent ${agent.name} heal failed: ${healResult.error}. Investigate LLM chain and agent health.`,
      notes: `agent_id=${targetId}`,
    }).catch(() => {})
  }

  const finalAgents = await getAllAgentHealth(companyId)
  const healthyCount = finalAgents.filter((a) => a.status === 'healthy').length
  const stillUnhealthy = finalAgents.filter((a) => priorityOf(a.status) < 99).length
  const overall = healthyCount === finalAgents.length ? 'healthy'
    : healthyCount > finalAgents.length * 0.7 ? 'degraded' : 'critical'

  res.json({
    ok: true,
    overall,
    summary: `${healthyCount}/${finalAgents.length} agents healthy`,
    this_run: {
      agent_healed: targetId,
      agent_name: agent.name,
      result: healResult.ok ? 'healed' : 'failed',
      ms: healResult.ms,
      preview: healResult.preview,
      error: healResult.error,
    },
    remaining_unhealthy: stillUnhealthy,
    agents: formatAgentList(finalAgents),
    timestamp: new Date().toISOString(),
  })
}
