import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { DAILY_SEND_LIMIT } from './sequences'
import { COMBINED_DAILY_CAP, NEW_TOUCH_DAILY_CAP, SECOND_TOUCH_DAILY_CAP } from './outreachThrottle'
import { HEALABLE_OPS_AGENTS, EXPECTED_OPS_AGENTS } from './opsAgents'
import {
  STALL_HEAL_PAGE_AFTER,
  STALL_THRESHOLD,
  SEQUENCE_STALE_MS,
  agentTimingFromRow,
  decideStallHealActions,
  healLeadStalls,
  reclaimHungResearch,
  shouldPageStallHeal,
  stallHealPageMessage,
  stallNeedsHeal,
  type StallHealDeps,
} from './stallReclaim'

function freshSequence(): { ageMs: number; lastFailed: boolean } {
  return { ageMs: 10 * 60 * 1000, lastFailed: false }
}
function staleSequence(): { ageMs: number; lastFailed: boolean } {
  return { ageMs: SEQUENCE_STALE_MS + 1, lastFailed: false }
}
const idleResearcher = { ageMs: 5 * 60 * 1000, lastFailed: false }

function deps(overrides: Partial<StallHealDeps> = {}): StallHealDeps & {
  runSequence: ReturnType<typeof vi.fn>
  runResearcher: ReturnType<typeof vi.fn>
  reclaimResearch: ReturnType<typeof vi.fn>
  recordHeal: ReturnType<typeof vi.fn>
  sendTelegram: ReturnType<typeof vi.fn>
} {
  const d = {
    runSequence: vi.fn(async () => ({ sent: 2, paused: false })),
    runResearcher: vi.fn(async () => ({ added: 1, enriched: 1, discovered: 0 })),
    reclaimResearch: vi.fn(async () => ({ researchingReclaimed: 3, pendingRetired: 5 })),
    recordHeal: vi.fn(async (ok: boolean) => (ok ? 0 : 1)),
    sendTelegram: vi.fn(async () => {}),
    ...overrides,
  }
  return d as any
}

describe('stallNeedsHeal / page gate', () => {
  it('does not heal or page at the historical >20 threshold when count is 20', () => {
    expect(stallNeedsHeal({ sendStuck: 12, researchStuck: 8 })).toBe(false)
    expect(STALL_THRESHOLD).toBe(20)
  })

  it('heals the live 112-lead census (104 send-stuck + 8 research-stuck)', () => {
    expect(stallNeedsHeal({ sendStuck: 104, researchStuck: 8 })).toBe(true)
  })

  it('pages only on the 2nd+ consecutive failure', () => {
    expect(shouldPageStallHeal(1)).toBe(false)
    expect(shouldPageStallHeal(STALL_HEAL_PAGE_AFTER)).toBe(true)
    expect(shouldPageStallHeal(3)).toBe(true)
  })
})

describe('decideStallHealActions', () => {
  it('does nothing below threshold', () => {
    expect(decideStallHealActions({ sendStuck: 10, researchStuck: 2 }, staleSequence(), idleResearcher)).toEqual({
      invokeSequence: false,
      invokeResearcher: false,
      reclaimResearch: false,
      sequenceQueuedOnDrip: false,
    })
  })

  it('queues send-stuck on the hourly drip when Aria last success is fresh (no second slice)', () => {
    const plan = decideStallHealActions({ sendStuck: 104, researchStuck: 0 }, freshSequence(), idleResearcher)
    expect(plan.invokeSequence).toBe(false)
    expect(plan.sequenceQueuedOnDrip).toBe(true)
    expect(plan.invokeResearcher).toBe(false)
  })

  it('invokes sequence when Aria is stale or last run failed', () => {
    expect(decideStallHealActions({ sendStuck: 104, researchStuck: 0 }, staleSequence(), idleResearcher).invokeSequence).toBe(true)
    expect(
      decideStallHealActions(
        { sendStuck: 104, researchStuck: 0 },
        { ageMs: 5 * 60 * 1000, lastFailed: true },
        idleResearcher,
      ).invokeSequence,
    ).toBe(true)
  })

  it('reclaims and invokes researcher for research-stuck', () => {
    const plan = decideStallHealActions({ sendStuck: 0, researchStuck: 21 }, freshSequence(), idleResearcher)
    expect(plan.reclaimResearch).toBe(true)
    expect(plan.invokeResearcher).toBe(true)
    expect(plan.invokeSequence).toBe(false)
  })
})

describe('agentTimingFromRow', () => {
  it('treats a missing row as never-ran (stale + failed)', () => {
    expect(agentTimingFromRow(null)).toEqual({ ageMs: null, lastFailed: true })
  })

  it('flags lastFailed when consecutive_failures>0 and last_run is after last_success', () => {
    const t = agentTimingFromRow({
      last_success_at: '2026-09-19T16:00:00.000Z',
      last_run_at: '2026-09-19T18:00:00.000Z',
      consecutive_failures: 1,
    }, Date.parse('2026-09-19T18:10:00.000Z'))
    expect(t.lastFailed).toBe(true)
    expect(t.ageMs).toBe(Date.parse('2026-09-19T18:10:00.000Z') - Date.parse('2026-09-19T16:00:00.000Z'))
  })
})

describe('healLeadStalls', () => {
  it('below threshold: no invoke, no Telegram', async () => {
    const d = deps()
    const r = await healLeadStalls({ sendStuck: 10, researchStuck: 2 }, d, staleSequence(), idleResearcher)
    expect(r.paged).toBe(false)
    expect(d.runSequence).not.toHaveBeenCalled()
    expect(d.runResearcher).not.toHaveBeenCalled()
    expect(d.sendTelegram).not.toHaveBeenCalled()
    expect(r.actions[0]).toMatch(/Lead stall OK/)
  })

  it('fresh sequence: does not invoke runFullSequence (no blast / second slice) and does not page', async () => {
    const d = deps()
    const r = await healLeadStalls({ sendStuck: 104, researchStuck: 0 }, d, freshSequence(), idleResearcher)
    expect(d.runSequence).not.toHaveBeenCalled()
    expect(d.sendTelegram).not.toHaveBeenCalled()
    expect(r.paged).toBe(false)
    expect(r.ok).toBe(true)
    expect(r.actions.join(' ')).toMatch(/queued on hourly Dex-capped drip/)
  })

  it('stale sequence: invokes sequence; success does not page even if stalls remain', async () => {
    const d = deps()
    const r = await healLeadStalls({ sendStuck: 104, researchStuck: 8 }, d, staleSequence(), idleResearcher)
    expect(d.runSequence).toHaveBeenCalledTimes(1)
    expect(d.reclaimResearch).toHaveBeenCalledTimes(1)
    expect(d.runResearcher).toHaveBeenCalledWith(4)
    expect(d.sendTelegram).not.toHaveBeenCalled()
    expect(r.paged).toBe(false)
    expect(r.ok).toBe(true)
  })

  it('first heal throw does not page the founder', async () => {
    const d = deps({
      runSequence: vi.fn(async () => { throw new Error('sequence 500') }),
      recordHeal: vi.fn(async () => 1),
    })
    const r = await healLeadStalls({ sendStuck: 104, researchStuck: 0 }, d, staleSequence(), idleResearcher)
    expect(r.paged).toBe(false)
    expect(r.ok).toBe(false)
    expect(d.sendTelegram).not.toHaveBeenCalled()
    expect(r.actions.join(' ')).toMatch(/failed once/)
  })

  it('2nd consecutive heal failure pages, and does not assign founder homework', async () => {
    const d = deps({
      runSequence: vi.fn(async () => { throw new Error('sequence 500') }),
      recordHeal: vi.fn(async () => 2),
    })
    const r = await healLeadStalls({ sendStuck: 104, researchStuck: 0 }, d, staleSequence(), idleResearcher)
    expect(r.paged).toBe(true)
    expect(d.sendTelegram).toHaveBeenCalledTimes(1)
    const msg = d.sendTelegram.mock.calls[0][0] as string
    expect(msg).toMatch(/stall self-heal failed 2 consecutive times/)
    expect(msg).toMatch(/send-stuck 104/)
    expect(msg).not.toMatch(/→ \/api\/os\/sequence/)
    expect(msg).not.toMatch(/→ \/api\/os\/researcher/)
    expect(stallHealPageMessage({ sendStuck: 104, researchStuck: 8 }, 2, 'boom')).not.toMatch(/→ \/api\/os\//)
  })

  it('paused sequence (Dex / bounce rails) is a successful heal, not a page', async () => {
    const d = deps({
      runSequence: vi.fn(async () => ({ sent: 0, paused: true, reason: 'not_measured: no live sends in 7d window' })),
    })
    const r = await healLeadStalls({ sendStuck: 104, researchStuck: 0 }, d, staleSequence(), idleResearcher)
    expect(r.ok).toBe(true)
    expect(r.paged).toBe(false)
    expect(d.sendTelegram).not.toHaveBeenCalled()
  })
})

describe('reclaimHungResearch SQL', () => {
  it('resets hung researching → pending and retires pending≥3 → unenrichable', async () => {
    const calls: string[] = []
    const tagged = (strings: TemplateStringsArray) => {
      const q = strings.join('?')
      calls.push(q)
      return Promise.resolve([{ id: 'a' }])
    }
    const n = await reclaimHungResearch(tagged as any)
    expect(n.researchingReclaimed).toBe(1)
    expect(n.pendingRetired).toBe(1)
    expect(calls[0]).toMatch(/status='pending'/)
    expect(calls[0]).toMatch(/status = 'researching'/)
    expect(calls[1]).toMatch(/status='unenrichable'/)
    expect(calls[1]).toMatch(/attempts >= 3/)
  })
})

describe('hard bans — no Dex raise, no blast, no touch 93', () => {
  it('does not raise Dex caps and does not invent warm touch 93', () => {
    expect(DAILY_SEND_LIMIT).toBe(20)
    expect(NEW_TOUCH_DAILY_CAP).toBe(50)
    expect(SECOND_TOUCH_DAILY_CAP).toBe(50)
    expect(COMBINED_DAILY_CAP).toBe(100)
    const heal = readFileSync('server/os/stallReclaim.ts', 'utf8')
    expect(heal).not.toMatch(/touch 93/)
    expect(heal).not.toMatch(/DAILY_SEND_LIMIT\s*=/)
    expect(heal).toMatch(/no blast/)
    expect(HEALABLE_OPS_AGENTS).toEqual(['researcher', 'discover'])
    expect(HEALABLE_OPS_AGENTS).not.toContain('aria')
    expect(Object.keys(EXPECTED_OPS_AGENTS.phishsimai)).not.toContain('watchdog_stall_heal')
  })

  it('watchdog no longer sends the founder-homework PHISHSIMAI WATCHDOG telegram', () => {
    const src = readFileSync('server/os/watchdog.ts', 'utf8')
    expect(src).toContain('healLeadStallsFromWatchdog')
    expect(src).not.toMatch(/→ \/api\/os\/sequence/)
    expect(src).not.toMatch(/leads genuinely stalled >2d — send-stuck/)
  })
})
