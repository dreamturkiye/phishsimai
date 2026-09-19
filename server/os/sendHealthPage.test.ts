import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DAILY_SEND_LIMIT } from './sequences'
import { COMBINED_DAILY_CAP, NEW_TOUCH_DAILY_CAP, SECOND_TOUCH_DAILY_CAP } from './outreachThrottle'
import { HEALABLE_OPS_AGENTS } from './opsAgents'
import { SEQUENCE_STALE_MS } from './stallReclaim'
import {
  decideOutreachSendHealth,
  sequenceRunIsStale,
  shouldPageSupplyDraining,
  type OutreachSendHealthInput,
} from './sendHealthPage'

const verifierOk = { mev: true, qev: true, any: true }
const verifierEmpty = { mev: false, qev: false, any: false }
const fresh = { ageMs: 10 * 60 * 1000, lastFailed: false }
const stale = { ageMs: SEQUENCE_STALE_MS + 1, lastFailed: false }

function base(overrides: Partial<OutreachSendHealthInput> = {}): OutreachSendHealthInput {
  return {
    sentToday: 0,
    capToday: 20,
    sendableNow: 12,
    backlogVerifiable: 40,
    ariaRanToday: true,
    sequence: fresh,
    t1StarveReason: 't1_eligible_but_not_sent',
    verifier: verifierOk,
    bounceTripped: false,
    ariaLastRun: '2026-09-19T08:00:00.000Z',
    ...overrides,
  }
}

describe('sequenceRunIsStale', () => {
  it('treats missing age, >90m, or lastFailed as stale', () => {
    expect(sequenceRunIsStale({ ageMs: null, lastFailed: false })).toBe(true)
    expect(sequenceRunIsStale(stale)).toBe(true)
    expect(sequenceRunIsStale({ ageMs: 5 * 60 * 1000, lastFailed: true })).toBe(true)
    expect(sequenceRunIsStale(fresh)).toBe(false)
  })
})

describe('decideOutreachSendHealth', () => {
  it('sentToday > 0 is healthy — no page, no invoke', () => {
    const d = decideOutreachSendHealth(base({ sentToday: 18, sendableNow: 4 }))
    expect(d.kind).toBe('ok')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toBeNull()
    expect(d.healthLine).toMatch(/✅ SEND 18\/20/)
  })

  it('send-cron + fresh Aria defers (no second slice, no Telegram)', () => {
    const d = decideOutreachSendHealth(base({
      ariaRanToday: false,
      sendableNow: 8,
      sequence: fresh,
      t1StarveReason: 't1_eligible_but_not_sent',
    }))
    expect(d.kind).toBe('defer')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toBeNull()
    expect(d.healthLine).toMatch(/hourly Dex-capped drip/)
    expect(d.action).toMatch(/no second slice/)
  })

  it('send-cron + stale Aria self-heals and does not page the founder', () => {
    const d = decideOutreachSendHealth(base({
      ariaRanToday: false,
      sendableNow: 8,
      sequence: stale,
      ariaLastRun: '2026-09-18T07:00:00.000Z',
    }))
    expect(d.kind).toBe('heal')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(true)
    expect(d.telegram).toBeNull()
    expect(d.healthLine).toMatch(/self-heal invoked/)
  })

  it('send-zero + combined_daily_cap is a Dex throttle, not SEND BROKEN', () => {
    const d = decideOutreachSendHealth(base({
      ariaRanToday: true,
      sendableNow: 40,
      t1StarveReason: 'combined_daily_cap',
    }))
    expect(d.kind).toBe('throttle')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toBeNull()
    expect(d.healthLine).toMatch(/combined_daily_cap/)
  })

  it('send-zero + new_touch_daily_cap is a Dex throttle', () => {
    const d = decideOutreachSendHealth(base({
      t1StarveReason: 'new_touch_daily_cap',
      sendableNow: 22,
    }))
    expect(d.kind).toBe('throttle')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(false)
  })

  it('send-zero + sendable leftover, not throttle, stale → heal, no Telegram', () => {
    const d = decideOutreachSendHealth(base({
      ariaRanToday: true,
      sendableNow: 9,
      sequence: stale,
      t1StarveReason: 't1_eligible_but_not_sent',
    }))
    expect(d.kind).toBe('heal')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(true)
    expect(d.telegram).toBeNull()
  })

  it('verifier empty stays a legitimate page and does not assign sequence homework', () => {
    const d = decideOutreachSendHealth(base({
      verifier: verifierEmpty,
      sendableNow: 0,
      backlogVerifiable: 200,
    }))
    expect(d.kind).toBe('verifier_empty')
    expect(d.page).toBe(true)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toMatch(/mailbox verifier EMPTY/)
    expect(d.telegram).not.toMatch(/Check \/api\/os\/sequence/)
  })

  it('real T1 starve stays a legitimate sanitize-refill page', () => {
    const d = decideOutreachSendHealth(base({
      sendableNow: 0,
      backlogVerifiable: 6435,
      t1StarveReason: 'pool_starved_sanitized: T1 requires sanitized_at IS NOT NULL; sanitized=0 unsanitized=6435',
    }))
    expect(d.kind).toBe('starve')
    expect(d.page).toBe(true)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toMatch(/T1 STARVED/)
    expect(d.telegram).toMatch(/sanitize-refill/)
    expect(d.telegram).not.toMatch(/Check \/api\/os\/sequence/)
  })

  it('bounce breaker stays a legitimate page and is not relabeled SEND BROKEN', () => {
    const d = decideOutreachSendHealth(base({
      bounceTripped: true,
      sendableNow: 30,
      t1StarveReason: 'bounce_breaker_tripped',
    }))
    expect(d.kind).toBe('bounce_breaker')
    expect(d.page).toBe(true)
    expect(d.invokeSequence).toBe(false)
    expect(d.telegram).toMatch(/BOUNCE BREAKER/)
    expect(d.telegram).not.toMatch(/SEND BROKEN/)
    expect(d.telegram).not.toMatch(/Check \/api\/os\/sequence/)
  })

  it('empty pool with a small backlog is expected supply, not a page', () => {
    const d = decideOutreachSendHealth(base({
      sendableNow: 0,
      backlogVerifiable: 12,
      t1StarveReason: 'no_t1_eligible',
    }))
    expect(d.kind).toBe('supply_empty')
    expect(d.page).toBe(false)
    expect(d.invokeSequence).toBe(false)
  })
})

describe('shouldPageSupplyDraining', () => {
  it('keeps the two-day under-cap warning when the reason is not Dex throttle', () => {
    expect(shouldPageSupplyDraining({
      sentToday: 10,
      capToday: 20,
      sentYesterday: 11,
      capYesterday: 20,
      t1StarveReason: 't1_eligible_but_not_sent',
    })).toBe(true)
  })

  it('does not page SUPPLY DRAINING when Dex combined/new-touch cap is the reason', () => {
    expect(shouldPageSupplyDraining({
      sentToday: 0,
      capToday: 20,
      sentYesterday: 8,
      capYesterday: 20,
      t1StarveReason: 'combined_daily_cap',
    })).toBe(false)
  })
})

describe('hard bans — no Dex raise, no blast, no touch 93', () => {
  it('does not raise Dex caps and does not invent warm touch 93', () => {
    expect(DAILY_SEND_LIMIT).toBe(20)
    expect(NEW_TOUCH_DAILY_CAP).toBe(50)
    expect(SECOND_TOUCH_DAILY_CAP).toBe(50)
    expect(COMBINED_DAILY_CAP).toBe(100)
    const src = readFileSync('server/os/sendHealthPage.ts', 'utf8')
    expect(src).toMatch(/no touch 93/)
    expect(src).toMatch(/no blast/)
    expect(src).not.toMatch(/WARM_CTA.*,\s*93|touch:\s*93|touch_number\s*=\s*93/)
    expect(src).not.toMatch(/DAILY_SEND_LIMIT\s*=/)
    expect(HEALABLE_OPS_AGENTS).toEqual(['researcher', 'discover'])
    expect(HEALABLE_OPS_AGENTS).not.toContain('aria')
  })

  it('funnel no longer sends send-cron/send-zero homework Telegrams', () => {
    const harvest = readFileSync('server/os/agents/mspHubHarvest.ts', 'utf8')
    expect(harvest).toContain('decideOutreachSendHealth')
    expect(harvest).not.toContain('PhishSim SEND FAILED')
    expect(harvest).not.toContain('PhishSim SEND BROKEN')
    expect(harvest).not.toMatch(/Check \/api\/os\/sequence/)
    expect(harvest).toContain('runFullSequence')
  })

  it('founder 1:1 and bounce-breaker pages stay legitimate elsewhere', () => {
    const oneToOne = readFileSync('server/os/founderOneToOne.ts', 'utf8')
    expect(oneToOne).toMatch(/FOUNDER 1:1/)
    const watchdog = readFileSync('server/os/watchdog.ts', 'utf8')
    expect(watchdog).toContain('PHISHSIMAI BOUNCE ALERT')
    expect(watchdog).toContain('verifierEmptyAlertMessage')
  })
})
