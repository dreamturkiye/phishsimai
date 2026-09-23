import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { formatEscalation } from './escalationNotify'

describe('founder Telegram is for faults, not SME brainstorms', () => {
  it('reasonAndAct queues Marcus quietly', () => {
    const src = readFileSync('server/os/agents/reason.ts', 'utf8')
    expect(src).toMatch(/source:\s*`agent:\$\{agentId\}`/)
    expect(src).toMatch(/notify:\s*false/)
  })

  it('queueJanetArchitectTask does not page or escalate agent:* sources', () => {
    const src = readFileSync('server/os/selfHeal.ts', 'utf8')
    expect(src).toContain("startsWith('agent:')")
    expect(src).toContain('if (!agentSourced)')
    expect(src).toContain('opts.notify !== false && !agentSourced')
  })

  it('ops staleness does not watch names that never heartbeat', () => {
    const src = readFileSync('server/os/opsAgents.ts', 'utf8')
    expect(src).not.toMatch(/agent_watchdog:\s*60/)
    expect(src).not.toMatch(/janet:\s*26/)
    expect(src).toContain('watchdog:')
    expect(src).toContain('heartbeat:')
  })

  it('never-instrumented pings say never, not neverh', () => {
    const v2 = readFileSync('server/os/agentHealth_v2.ts', 'utf8')
    expect(v2).toContain("last ping ${age}")
    expect(v2).not.toContain('${h}h ago')
    expect(v2).toContain('no heartbeat instrumented')
    const v1 = readFileSync('server/os/agentHealth.ts', 'utf8')
    expect(v1).not.toContain("stale ${h}h")
    expect(v1).toContain('no heartbeat instrumented')
  })

  it('breaker trips still read as escalations', () => {
    const msg = formatEscalation({
      id: 1,
      productId: 'phishsimai',
      category: 'breaker_trip',
      status: 'pending',
      createdAtMs: Date.now(),
      payload: { trip_reason: 'consecutive_failures', fingerprint: 'abc', last_error: 'boom' },
    }, Date.now())
    expect(msg).toContain('ESCALATION — breaker_trip')
    expect(msg).toContain('🔴')
  })

  it('GCs leftover stale alerts for names no longer on the watch list', () => {
    const v1 = readFileSync('server/os/agentHealth.ts', 'utf8')
    expect(v1).toContain("LIKE 'system_alert:agent_stale:%'")
    expect(v1).toContain('no longer on ops watch')
    const v2 = readFileSync('server/os/agentHealth_v2.ts', 'utf8')
    expect(v2).toContain("LIKE 'system_alert:employee_stale:%'")
    expect(v2).toContain('retired from roster')
    expect(v2).toContain('Boolean(AGENTS[r.agent_id as AgentId])')
  })

  it('CGO cron reports janet health so she is not permanently unknown', () => {
    const src = readFileSync('server/os/routes.ts', 'utf8')
    expect(src).toMatch(/reportAgentHealth\(\s*'janet'/)
  })

  it('watchdog does not page the founder for routine reclaimable stalls', () => {
    const src = readFileSync('server/os/watchdog.ts', 'utf8')
    expect(src).toContain('healLeadStallsFromWatchdog')
    expect(src).not.toContain('leads genuinely stalled >2d')
    expect(src).not.toContain('→ /api/os/sequence')
    const heal = readFileSync('server/os/stallReclaim.ts', 'utf8')
    expect(heal).toContain('STALL_HEAL_PAGE_AFTER = 2')
    expect(heal).toContain('stall self-heal failed')
  })

  it('outreach funnel does not page send-cron/send-zero homework for reclaimable or Dex throttle', () => {
    const src = readFileSync('server/os/agents/mspHubHarvest.ts', 'utf8')
    expect(src).toContain('decideOutreachSendHealth')
    expect(src).not.toContain('PhishSim SEND FAILED')
    expect(src).not.toContain('PhishSim SEND BROKEN')
    expect(src).not.toMatch(/Check \/api\/os\/sequence/)
    const page = readFileSync('server/os/sendHealthPage.ts', 'utf8')
    expect(page).toContain('isDexDailyThrottle')
    expect(page).toContain('combined_daily_cap')
    expect(page).toContain('self-heal')
  })

  it('MSP admin FORBIDDEN errors carry a human message', () => {
    const src = readFileSync('server/routers.ts', 'utf8')
    expect(src).not.toMatch(/TRPCError\(\{ code: "FORBIDDEN" \}\)/)
  })

  it('ConvAI does not send dynamicVariables or show raw FORBIDDEN', () => {
    const panel = readFileSync('client/src/components/os/JanetConvaiPanel.tsx', 'utf8')
    expect(panel).not.toContain('dynamicVariables')
    const platform = readFileSync('client/src/components/os/janetConvaiPlatform.ts', 'utf8')
    expect(platform).toContain("if (/forbidden/i.test(detail))")
    expect(platform).toContain('Voice session was rejected')
  })

  it('PS-TELEGRAM-NOISE-01 policy module is wired for LLM billing coalesce', () => {
    const policy = readFileSync('server/os/telegramNoisePolicy.ts', 'utf8')
    expect(policy).toContain('LLM_PROVIDER_BILLING_ALERT')
    expect(policy).toContain('shouldSendSequenceDigest')
    const triage = readFileSync('server/os/escalationTriagePolicy.ts', 'utf8')
    expect(triage).toContain('isLlmBillingAgentCritical')
  })
})
