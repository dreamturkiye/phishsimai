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
})
