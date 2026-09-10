import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runOpsRecoveryTick } = vi.hoisted(() => ({ runOpsRecoveryTick: vi.fn() }))

vi.mock('./agentHealth_v2', () => ({
  ensureAgentHealthTable: vi.fn(async () => {}),
  getAllAgentHealth: vi.fn(async () => [
    {
      agent_id: 'janet', agent_name: 'Janet', agent_title: 'CEO',
      status: 'healthy', uptime_pct: 100, last_success_at: 'now',
      consecutive_failures: 0, self_heal_count: 1, avg_response_ms: 20,
    },
  ]),
  reportAgentHealth: vi.fn(),
  markHealing: vi.fn(),
  recordHeal: vi.fn(),
}))
vi.mock('./agentHealth', () => ({ reportAgentRun: vi.fn() }))
vi.mock('./opsRecovery', () => ({ runOpsRecoveryTick }))
vi.mock('../lib/kaan_os_v4', () => ({ talkToAgent: vi.fn(), AGENTS: {}, }))
vi.mock('./telegram', () => ({ sendTelegram: vi.fn() }))
vi.mock('./conn', () => ({ getSql: vi.fn(() => ({})) }))
vi.mock('./selfHeal', () => ({ queueJanetArchitectTask: vi.fn() }))
vi.mock('./marcusPipelineHealth', () => ({ alertMarcusPipelineIssues: vi.fn() }))
vi.mock('./l5Autonomy', () => ({ runL5MarcusScan: vi.fn() }))

import { cronAgentWatchdog } from './agentWatchdog'

function response() {
  const state: { status: number; body?: any } = { status: 200 }
  const res: any = {
    status: vi.fn((code: number) => { state.status = code; return res }),
    json: vi.fn((body: any) => { state.body = body; return res }),
  }
  return { res, state }
}

describe('agent watchdog cron route', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    runOpsRecoveryTick.mockReset()
    runOpsRecoveryTick.mockResolvedValue({ checked: 3, restarts: ['aria'] })
  })

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('executes the exact vercel.json default path and returns recovery summary', async () => {
    const { res, state } = response()
    await cronAgentWatchdog(
      { headers: { authorization: 'Bearer cron-secret' }, query: {} } as any,
      res,
    )

    expect(state.status).toBe(200)
    expect(state.body).toMatchObject({
      action: 'check',
      recovery: { checked: 3, restarts: ['aria'] },
      healthy: 1,
      critical: 0,
      total: 1,
    })
    expect(runOpsRecoveryTick).toHaveBeenCalledWith('phishsimai')
  })

  it('does not trust x-vercel-cron by itself', async () => {
    const { res, state } = response()
    await cronAgentWatchdog({ headers: { 'x-vercel-cron': '1' }, query: {} } as any, res)
    expect(state.status).toBe(401)
    expect(runOpsRecoveryTick).not.toHaveBeenCalled()
  })
})
