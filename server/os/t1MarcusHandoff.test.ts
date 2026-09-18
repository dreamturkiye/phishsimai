import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { diagnoseRevenueFailure, assignmentSkipReason, operatingCrisisTasks, isSendPathFixTitle } from './cgoMandate'
import {
  t1MarcusTicket,
  applyT1MarcusTicket,
  T1_MARCUS_EMPTY_HOURS,
  diagnoseFromT1Scoreboard,
} from './t1MarcusHandoff'
import { T1_QUALITY_REFILL_MAX } from './sequenceBacklog'

const liveSep17 = {
  operatingCrisis: true,
  daysSinceLastT1: 5,
  sanitizedEligible: 0,
  unsanitizedEligible: 6435,
  pauseNewTouch1: true,
  verifier: { mev: false, qev: false, any: false },
  drainableOverdue: 1120,
}

describe('t1MarcusTicket — dual crisis + T1 dead must queue a NAMED bug', () => {
  it('queues PS-T1-QEV-EMPTY when dual crisis, T1 dead 5d, sanitized=0, verifier empty (live 2026-09-17)', () => {
    const t = t1MarcusTicket(liveSep17)
    expect(t.queue).toBe(true)
    expect(t.bug).toBe('PS-T1-QEV-EMPTY')
    expect(t.task).toMatch(/Named bug: PS-T1-QEV-EMPTY/)
    expect(t.task).toMatch(/QEV_API_KEY/)
    expect(t.task).toMatch(/Do not raise DAILY_SEND_LIMIT/)
    expect(t.task).toMatch(/Do not add touch 93/)
    expect(t.task).toMatch(/Do not set REFILL_ALLOW_MX_ONLY=1/)
  })

  it('queues PS-T1-STARVE when starvation.alert or sendable untouched=0 for N hours', () => {
    const t = t1MarcusTicket({
      ...liveSep17,
      verifier: { mev: true, qev: true, any: true },
      pauseNewTouch1: false,
      starvationAlert: true,
    })
    expect(t.queue).toBe(true)
    expect(t.bug).toBe('PS-T1-STARVE')
    expect(t.task).toMatch(/PS-T1-STARVE/)
    expect(T1_MARCUS_EMPTY_HOURS).toBe(6)
  })

  it('queues PS-T1-PAUSE-LOCK when pause locks a small quality pool (e.g. 40)', () => {
    const t = t1MarcusTicket({
      operatingCrisis: true,
      daysSinceLastT1: 0.2,
      sanitizedEligible: 40,
      unsanitizedEligible: 6000,
      pauseNewTouch1: true,
      verifier: { mev: true, qev: true, any: true },
      drainableOverdue: 1120,
      sendableUntouched: 40,
    })
    expect(t.queue).toBe(true)
    expect(t.bug).toBe('PS-T1-PAUSE-LOCK')
    expect(t.task).toMatch(/PS-T1-PAUSE-LOCK/)
    expect(t.task).toMatch(String(T1_QUALITY_REFILL_MAX))
  })

  it('does not queue a healthy T1 with a large sanitized pool', () => {
    const t = t1MarcusTicket({
      operatingCrisis: true,
      daysSinceLastT1: 0.1,
      sanitizedEligible: 400,
      unsanitizedEligible: 6000,
      pauseNewTouch1: false,
      verifier: { mev: true, qev: true, any: true },
      drainableOverdue: 10,
    })
    expect(t.queue).toBe(false)
    expect(t.bug).toBeNull()
  })

  it('does not queue PS-T1-STARVE when T1 sent 0 is Dex combined/new-touch cap', () => {
    const combined = t1MarcusTicket({
      operatingCrisis: true,
      daysSinceLastT1: 2,
      sanitizedEligible: 150,
      unsanitizedEligible: 6000,
      pauseNewTouch1: false,
      verifier: { mev: true, qev: true, any: true },
      starvationAlert: true,
      t1StarveReason: 'combined_daily_cap',
    })
    expect(combined.queue).toBe(false)
    expect(combined.bug).toBeNull()
    const t1Cap = t1MarcusTicket({
      operatingCrisis: true,
      daysSinceLastT1: 2,
      sanitizedEligible: 150,
      unsanitizedEligible: 6000,
      pauseNewTouch1: false,
      verifier: { mev: true, qev: true, any: true },
      starvationAlert: true,
      t1StarveReason: 'new_touch_daily_cap',
    })
    expect(t1Cap.queue).toBe(false)
  })
})

describe('applyT1MarcusTicket actually queues (not Telegram theater)', () => {
  it('dual crisis + T1 dead → Marcus task queued once', async () => {
    const queued: string[] = []
    const ticket = t1MarcusTicket(liveSep17)
    const first = await applyT1MarcusTicket(ticket, {
      queueTask: async ({ task }) => {
        queued.push(task)
        return 'arch-1'
      },
      alreadyQueuedToday: async () => false,
      markQueuedToday: async () => {},
      day: '2026-09-17',
    })
    expect(first.queued).toBe(true)
    expect(first.bug).toBe('PS-T1-QEV-EMPTY')
    expect(first.id).toBe('arch-1')
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatch(/PS-T1-QEV-EMPTY/)

    const second = await applyT1MarcusTicket(ticket, {
      queueTask: async ({ task }) => {
        queued.push(task)
        return 'arch-2'
      },
      alreadyQueuedToday: async () => true,
      markQueuedToday: async () => {},
      day: '2026-09-17',
    })
    expect(second.queued).toBe(false)
    expect(queued).toHaveLength(1)
  })

  it('still cancels Lead Eligibility Checker clones when the named bug is already queued today', async () => {
    const ticket = t1MarcusTicket(liveSep17)
    const superseded: string[] = []
    const second = await applyT1MarcusTicket(ticket, {
      queueTask: async () => 'arch-2',
      alreadyQueuedToday: async () => true,
      markQueuedToday: async () => {},
      day: '2026-09-17',
      supersedeSpam: async (keepId) => {
        superseded.push(keepId)
      },
    })
    expect(second.queued).toBe(false)
    expect(superseded).toHaveLength(1)
  })
})

describe('diagnoseRevenueFailure names the T1/sanitize bottleneck', () => {
  it('Sep-17 live shape includes daysSinceLastT1, sanitizedEligible, pause, verifier, warm CTA→TRUE=0', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1,
      paying: 0,
      t1: {
        daysSinceLastT1: 5,
        sanitizedEligible: 0,
        unsanitizedEligible: 6435,
        pauseNewTouch1: true,
        verifier: { mev: false, qev: false, any: false },
        warmCtaToTrue: { ctaSent: 17, trueTrials: 0 },
      },
    })
    expect(d.crisis).toBe(true)
    expect(d.line).toMatch(/REVENUE FAILURE/)
    expect(d.line).toMatch(/daysSinceLastT1=5/)
    expect(d.line).toMatch(/sanitizedEligible=0/)
    expect(d.line).toMatch(/T1 sanitize bottleneck/)
    expect(d.line).toMatch(/pauseNewTouch1=true/)
    expect(d.line).toMatch(/verifierMode=empty/)
    expect(d.line).toMatch(/missing QEV/)
    expect(d.line).toMatch(/warm CTA→TRUE=0/)
    expect(d.nextActions.join(' ')).toMatch(/queue_marcus/)
    expect(d.nextActions.join(' ')).not.toMatch(/convert_warm/)
  })

  it('diagnoseFromT1Scoreboard carries the same bottleneck', () => {
    const d = diagnoseFromT1Scoreboard({
      daysSinceLastT1: 5,
      sanitizedEligible: 0,
      unsanitizedEligible: 6435,
      pauseNewTouch1: true,
      verifier: { mev: false, qev: false, any: false },
      warmCtaToTrue: { ctaSent: 17, trueTrials: 0 },
      trueTrials: 1,
      paying: 0,
    })
    expect(d.line).toMatch(/T1 sanitize bottleneck/)
    expect(d.line).toMatch(/queue_marcus/)
  })
})

describe('Nova/Dex can queue_marcus send-path bugs during dual crisis', () => {
  it('does not skip a T1 sanitize / QEV ticket as TOF or analysis', () => {
    expect(isSendPathFixTitle('Fix T1 sanitize refill QEV env')).toBe(true)
    expect(assignmentSkipReason({
      title: 'Fix T1 sanitize refill / QEV empty',
      description: 'sanitizedEligible=0 pauseNewTouch1 locks quality pool',
      operatingCrisis: true,
      breakerTripped: true,
    })).toBeNull()
    expect(assignmentSkipReason({
      title: 'Mason cold outreach 500 MSP',
      operatingCrisis: true,
      breakerTripped: true,
    })).toBe('breaker_tripped_cold_send')
  })

  it('crisis pack includes Marcus + Nova/Dex queue_marcus without waiting for a human', () => {
    const pack = operatingCrisisTasks({ liveProductTrials: 1, crmTrials: 0, payingCustomers: 0 })
    const nova = pack.find((t) => t.agentId === 'nova')
    const dex = pack.find((t) => t.agentId === 'dex')
    const marcus = pack.find((t) => t.agentId === 'marcus')
    expect(nova?.description).toMatch(/queue_marcus/)
    expect(nova?.description).toMatch(/do not wait for a human/i)
    expect(dex?.description).toMatch(/queue_marcus/)
    expect(dex?.description).toMatch(/PS-T1-STARVE/)
    expect(marcus?.title).toMatch(/PS-T1-STARVE/)
    expect(marcus?.description).toMatch(/QEV empty/)
  })
})

describe('handoff is wired (watchdog + conversion, not Telegram-only)', () => {
  it('watchdog and conversion engine call maybeQueueT1Marcus', () => {
    expect(readFileSync('server/os/watchdog.ts', 'utf8')).toContain('maybeQueueT1Marcus')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('maybeQueueT1Marcus')
    expect(readFileSync('server/os/sanitizeRefill.ts', 'utf8')).toContain('maybeQueueT1Marcus')
    expect(readFileSync('server/os/founderBrief.ts', 'utf8')).toContain('diagnoseFromT1Scoreboard')
    expect(readFileSync('server/lib/kaan_os_v4.ts', 'utf8')).toContain('queue_marcus')
    expect(readFileSync('server/lib/kaan_os_v4.ts', 'utf8')).toContain('escalateCategoryFor')
    expect(readFileSync('server/lib/kaan_os_v4.ts', 'utf8')).not.toMatch(/VALUES \(\$\{companyId\}, 'founder_decision'/)
  })
})
