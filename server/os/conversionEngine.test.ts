import { describe, expect, it } from 'vitest'
import { conversionLesson, rankWarmLeads, conversionQueued } from './conversionEngine'
import {
  TRIAL_CTA_URL,
  WARM_CONVERSION_TOUCH,
  CRISIS_WARM_FOLLOWUP_HOURS,
  WARM_CTA_COOLDOWN_DAYS,
  shouldCrisisWarmFollowup,
  warmCtaCooldownHours,
  nextWarmCtaTouch,
} from './sequences'
import { readFileSync } from 'node:fs'

describe('CGO conversion ranking', () => {
  it('puts replied/engaged ahead of unopened prospects', () => {
    const ranked = rankWarmLeads([
      { email: 'cold@x.com', pipeline_stage: 'prospect' },
      { email: 'hot@x.com', replied: true, pipeline_stage: 'engaged' },
      { email: 'mid@x.com', pipeline_stage: 'lead' },
    ])
    expect(ranked[0].email).toBe('hot@x.com')
    expect(ranked[ranked.length - 1].email).toBe('cold@x.com')
  })
})

describe('conversionLesson is honest', () => {
  it('treats a Dex trip as a failed conversion, not a send', () => {
    const l = conversionLesson({ sent: 0, skipped: 0, blocked: 0, tripped: true, results: [] })
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/breaker tripped/)
  })

  it('records a real send as success', () => {
    const l = conversionLesson({ sent: 2, skipped: 0, blocked: 1, tripped: false, results: [] })
    expect(l.success).toBe(true)
    expect(l.lesson).toMatch(/Sent 2/)
  })

  it('does not celebrate an empty run', () => {
    const l = conversionLesson({ sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] })
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/No warm sendable/)
  })

  it('names the 14-engaged / 0-CTA trap instead of "wait for replies"', () => {
    const l = conversionLesson(
      { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] },
      undefined,
      undefined,
      { replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 14, exhausted: 0, eligible: 0, autoReplyPending: 12 },
    )
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/REVENUE BLOCKER/)
    expect(l.lesson).toMatch(/15 replied/)
    expect(l.lesson).toMatch(/cooldown=14/)
    expect(l.lesson).not.toMatch(/wait for replies/)
  })

  it('does not convert_warm when eligible=0 and T1 is starved', () => {
    const l = conversionLesson(
      { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] },
      undefined,
      undefined,
      { replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 14, exhausted: 0, eligible: 0, autoReplyPending: 12 },
      { t1Starved: true },
    )
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/PS-T1-STARVE/)
    expect(l.lesson).toMatch(/queue_marcus/)
    expect(l.lesson).toMatch(/Do not convert_warm/)
    expect(l.lesson).not.toMatch(/fire convert_warm/)
  })

  it('names Dex combined cap as a throttle, not PS-T1-STARVE', () => {
    const l = conversionLesson(
      { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] },
      undefined,
      undefined,
      { replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 0, exhausted: 12, eligible: 0, autoReplyPending: 0 },
      { t1Starved: false, t1StarveReason: 'combined_daily_cap' },
    )
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/combined_daily_cap/)
    expect(l.lesson).toMatch(/wait UTC/)
    expect(l.lesson).toMatch(/Do not queue PS-T1-STARVE/)
    expect(l.lesson).toMatch(/Do not raise Dex caps/)
  })

  it('eligible=0 exhausted + T1 healthy → LinkedIn / Grey Box, not fire convert_warm', () => {
    const l = conversionLesson(
      { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] },
      undefined,
      undefined,
      { replied: 15, engaged: 14, sendable: 14, suppressed: 2, cooldown: 0, exhausted: 12, eligible: 0, autoReplyPending: 0 },
      { t1Starved: false },
    )
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/REVENUE BLOCKER/)
    expect(l.lesson).toMatch(/exhausted=12/)
    expect(l.lesson).toMatch(/Do not convert_warm/)
    expect(l.lesson).toMatch(/LinkedIn/)
    expect(l.lesson).toMatch(/Grey Box/)
    expect(l.lesson).not.toMatch(/fire convert_warm/)
  })

  it('counts founder 1:1 queue as conversion progress when 90/91/92 are exhausted', () => {
    const l = conversionLesson(
      { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] },
      undefined,
      undefined,
      { replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 0, exhausted: 14, eligible: 0, autoReplyPending: 0 },
      { founder1to1: { queued: 3, escalated: false, skipped: 0, reason: 'queued 3', drafts: [] } },
    )
    expect(l.success).toBe(true)
    expect(l.lesson).toMatch(/founder 1:1/)
    expect(l.lesson).toMatch(/not touch 93/i)
  })

  it('counts trial-org nudges as conversion progress when warm CTAs are empty', () => {
    const l = conversionLesson({ sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] }, { sent: 3, scanned: 93 })
    expect(l.success).toBe(true)
    expect(l.lesson).toMatch(/trial nudge/)
  })
})

describe('warm CTA stays on the Dex-registered send path', () => {
  it('lives in sequences.ts with rails and the live trial URL', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toContain('export async function sendWarmTrialCtas')
    expect(seq).toContain('trialCtaUrl')
    expect(seq).toContain('assertSendable')
    expect(seq).toContain('hasMx')
    expect(seq).toContain('ps_outreach_suppression')
    expect(WARM_CONVERSION_TOUCH).toBe(90)
    expect(seq).toContain("COALESCE(l.bounced, false)")
    expect(seq).toContain("touch IN (90, 91, 92)")
    expect(seq).toContain('nextWarmCtaTouch')
    expect(seq).toContain('shouldCrisisWarmFollowup')
    expect(seq).toContain('CRISIS_WARM_FOLLOWUP_HOURS')
    expect(seq).toContain("INTERVAL '1 hour'")
    expect(readFileSync('server/os/agents/salesReplies.ts', 'utf8')).toContain('reopenFalseAutoReplies')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain("reopenFalseAutoReplies(getSql(), { crisis: true })")
    expect(TRIAL_CTA_URL).toContain('/trial')
    expect(TRIAL_CTA_URL).not.toContain('login')
    expect(readFileSync('server/os/agents/dex.ts', 'utf8')).toContain('warm_conversion')
    expect(readFileSync('server/os/agents/dex.ts', 'utf8')).toContain('trial_nudge')
    expect(seq).toMatch(/one of the lowest per-seat prices in the industry/i)
    expect(seq).toContain('$299/mo for 500')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('advanceLinkedInAcquisition')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('runGreyBoxPaidNudge')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('measureWarmCtaToTrial')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('queueFounderOneToOneReviews')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('maybeQueueAutonomyBlocker')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('autonomyGate.ts')
  })
})

describe('crisis warm follow-up does not park 14 sendable leads for 4 days', () => {
  const parked = {
    replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 14, exhausted: 0, eligible: 0, autoReplyPending: 12,
  }

  it('fires when dual crisis and every sendable lead is on cooldown', () => {
    expect(shouldCrisisWarmFollowup(parked, true)).toBe(true)
    expect(warmCtaCooldownHours(parked, true)).toBe(CRISIS_WARM_FOLLOWUP_HOURS)
    expect(CRISIS_WARM_FOLLOWUP_HOURS).toBe(6)
    expect(CRISIS_WARM_FOLLOWUP_HOURS).toBeLessThan(WARM_CTA_COOLDOWN_DAYS * 24)
  })

  it('does not bypass when not in crisis or when some leads are still eligible', () => {
    expect(shouldCrisisWarmFollowup(parked, false)).toBe(false)
    expect(warmCtaCooldownHours(parked, false)).toBe(WARM_CTA_COOLDOWN_DAYS * 24)
    expect(shouldCrisisWarmFollowup({ ...parked, eligible: 3, cooldown: 11 }, true)).toBe(false)
    expect(shouldCrisisWarmFollowup({ ...parked, sendable: 0, cooldown: 0 }, true)).toBe(false)
  })

  it('nextWarmCtaTouch allows 91 after 6h in crisis, not after 3h, and never resends 90', async () => {
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
    const sql = async () => [{ touch: 90, status: 'sent', updated_at: ago(7) }]
    expect(await nextWarmCtaTouch(sql as any, '00000000-0000-4000-8000-000000000001', 6)).toBe(91)
    const recent = async () => [{ touch: 90, status: 'sent', updated_at: ago(3) }]
    expect(await nextWarmCtaTouch(recent as any, '00000000-0000-4000-8000-000000000001', 6)).toBeNull()
    expect(await nextWarmCtaTouch(sql as any, '00000000-0000-4000-8000-000000000001', 96)).toBeNull()
  })
})

describe('convert_warm is queued/executed when work is available', () => {
  it('queues when eligible>0 even if this tick has not sent yet', () => {
    expect(conversionQueued({ sent: 0, eligible: 6 })).toBe(true)
    expect(conversionQueued({ sent: 2, eligible: 0 })).toBe(true)
    expect(conversionQueued({ sent: 0, eligible: 0, linkedinEscalated: true })).toBe(true)
    expect(conversionQueued({ sent: 0, eligible: 0, greyBoxSent: true })).toBe(true)
    expect(conversionQueued({ sent: 0, eligible: 0, founderOneToOneQueued: true })).toBe(true)
    expect(conversionQueued({ sent: 0, eligible: 0 })).toBe(false)
  })
})
