import { describe, expect, it } from 'vitest'
import { conversionLesson, rankWarmLeads } from './conversionEngine'
import { TRIAL_CTA_URL, WARM_CONVERSION_TOUCH } from './sequences'
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
      { replied: 15, engaged: 14, sendable: 14, suppressed: 0, cooldown: 0, exhausted: 0, eligible: 0, autoReplyPending: 14 },
    )
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/REVENUE BLOCKER/)
    expect(l.lesson).toMatch(/15 replied/)
    expect(l.lesson).not.toMatch(/wait for replies/)
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
    expect(seq).toContain(TRIAL_CTA_URL)
    expect(seq).toContain('assertSendable')
    expect(seq).toContain('hasMx')
    expect(seq).toContain('ps_outreach_suppression')
    expect(WARM_CONVERSION_TOUCH).toBe(90)
    expect(seq).toContain("COALESCE(l.bounced, false)")
    expect(seq).toContain("touch IN (90, 91, 92)")
    expect(seq).toContain("INTERVAL '4 days'")
    expect(seq).toContain('nextWarmCtaTouch')
    expect(readFileSync('server/os/agents/salesReplies.ts', 'utf8')).toContain('reopenFalseAutoReplies')
    expect(TRIAL_CTA_URL).toContain('login?mode=register')
    expect(readFileSync('server/os/agents/dex.ts', 'utf8')).toContain('warm_conversion')
    expect(readFileSync('server/os/agents/dex.ts', 'utf8')).toContain('trial_nudge')
    expect(seq).toMatch(/one of the lowest per-seat prices in the industry/i)
    expect(seq).toContain('$299/mo for 500')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('queueFounderReviewTrialDraft')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('maybeQueueAutonomyBlocker')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('autonomyGate.ts')
  })
})
