import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mailboxVerifierKeys,
  whyT1SentZero,
  touch1Starvation,
  verifierEmptyAlertMessage,
  sendablePoolEmptyAlertMessage,
  T1_SILENCE_MS,
  ELIGIBLE_ALERT_FLOOR,
} from './touch1Health'

describe('mailboxVerifierKeys — empty Vercel MEV is unset', () => {
  it('treats missing and empty-string MEV as no verifier (the 2026-09-17 prod shape)', () => {
    expect(mailboxVerifierKeys({}).any).toBe(false)
    expect(mailboxVerifierKeys({ MYEMAILVERIFIER_API_KEY: '' }).mev).toBe(false)
    expect(mailboxVerifierKeys({ MYEMAILVERIFIER_API_KEY: '   ' }).any).toBe(false)
  })

  it('QEV_API_KEY is an alternate mailbox verifier', () => {
    const k = mailboxVerifierKeys({ QEV_API_KEY: 'qk_live_example_not_a_real_key' })
    expect(k.qev).toBe(true)
    expect(k.mev).toBe(false)
    expect(k.any).toBe(true)
  })

  it('non-empty MEV still counts', () => {
    expect(mailboxVerifierKeys({ MYEMAILVERIFIER_API_KEY: 'mev-key' }).any).toBe(true)
  })

  it('alert copy names both keys and forbids inventing REFILL_ALLOW_MX_ONLY', () => {
    const msg = verifierEmptyAlertMessage({ mev: false, qev: false, any: false })
    expect(msg).toMatch(/MYEMAILVERIFIER_API_KEY/)
    expect(msg).toMatch(/QEV_API_KEY/)
    expect(msg).toMatch(/Do not set REFILL_ALLOW_MX_ONLY=1/)
  })

  it('pages when sendable sanitized untouched hits 0 (live 2026-09-17 money path)', () => {
    expect(sendablePoolEmptyAlertMessage(0)).toMatch(/sendable sanitized untouched = 0/)
    expect(sendablePoolEmptyAlertMessage(12)).toBeNull()
  })
})

describe('whyT1SentZero — Sep 12 sanitized-pool starve', () => {
  it('proves sent:0 when sanitized=0 and 6435 unsanitized GEO never-touched remain', () => {
    expect(whyT1SentZero({ sanitizedEligible: 0, unsanitizedEligible: 6435 })).toEqual({
      sent: 0,
      reason: 'pool_starved_sanitized: T1 requires sanitized_at IS NOT NULL; sanitized=0 unsanitized=6435',
    })
  })

  it('does not blame the pool when bounce or autonomy already halted', () => {
    expect(whyT1SentZero({ sanitizedEligible: 0, unsanitizedEligible: 6435, tripped: true }).reason).toBe(
      'bounce_breaker_tripped',
    )
    expect(whyT1SentZero({ sanitizedEligible: 12, unsanitizedEligible: 100, autonomyDenied: true }).reason).toBe(
      'autonomy_denied',
    )
  })

  it('names pause_new_touch1 only when the sanitized pool still has leads to send', () => {
    // Pause is for mass scale (>150), not a 12-lead quality refill.
    expect(
      whyT1SentZero({ sanitizedEligible: 400, unsanitizedEligible: 100, pauseNewTouch1: true }).reason,
    ).toBe('pause_new_touch1')
    expect(
      whyT1SentZero({ sanitizedEligible: 0, unsanitizedEligible: 6435, pauseNewTouch1: true }).reason,
    ).toMatch(/pool_starved_sanitized/)
  })

  it('names combined_daily_cap when the sanitized pool is healthy and Dex combined is the blocker', () => {
    // Live 2026-09-17: sanitizedEligible≈150, pauseNewTouch1=false, sent=0,
    // naive secondSentToday≈134 → combined 149/100. Do not hide that as t1_eligible_but_not_sent.
    expect(
      whyT1SentZero({
        sanitizedEligible: 150,
        unsanitizedEligible: 6000,
        pauseNewTouch1: false,
        newSentToday: 15,
        secondSentToday: 134,
        newTouchAllowance: 0,
      }).reason,
    ).toBe('combined_daily_cap')
    expect(
      whyT1SentZero({
        sanitizedEligible: 150,
        unsanitizedEligible: 6000,
        newSentToday: 50,
        secondSentToday: 0,
        newTouchAllowance: 0,
      }).reason,
    ).toBe('new_touch_daily_cap')
    expect(
      whyT1SentZero({
        sanitizedEligible: 150,
        unsanitizedEligible: 6000,
        pauseNewTouch1: false,
        newSentToday: 15,
        secondSentToday: 20,
        newTouchAllowance: 35,
      }).reason,
    ).toBe('t1_eligible_but_not_sent')
  })
})

describe('touch1Starvation alerts', () => {
  const now = new Date('2026-09-17T07:00:00Z')

  it('alerts when sanitized eligible hits 0 while reservoir >100', () => {
    const s = touch1Starvation({
      touch1LastAt: '2026-09-12T07:00:00Z',
      sanitizedEligible: 0,
      unsanitizedEligible: 6435,
      now,
    })
    expect(s.alert).toBe(true)
    expect(s.code).toBe('sanitized_pool_empty')
    expect(s.silent).toBe(true)
    expect(s.silentHours).toBeGreaterThan(36)
  })

  it('alerts T1 silent >36h while eligible>100 even if some sanitized remain', () => {
    const s = touch1Starvation({
      touch1LastAt: new Date(now.getTime() - T1_SILENCE_MS - 60_000).toISOString(),
      sanitizedEligible: 12,
      unsanitizedEligible: ELIGIBLE_ALERT_FLOOR,
      now,
    })
    expect(s.alert).toBe(true)
    expect(s.code).toBe('t1_silent')
  })

  it('does not alert a fresh T1 with a healthy sanitized pool', () => {
    const s = touch1Starvation({
      touch1LastAt: now.toISOString(),
      sanitizedEligible: 40,
      unsanitizedEligible: 6000,
      now,
    })
    expect(s.alert).toBe(false)
  })

  it('does not alert T1 silent when Dex combined/new-touch cap is the binder', () => {
    const s = touch1Starvation({
      touch1LastAt: new Date(now.getTime() - T1_SILENCE_MS - 60_000).toISOString(),
      sanitizedEligible: 150,
      unsanitizedEligible: 6000,
      now,
      dexThrottle: true,
    })
    expect(s.alert).toBe(false)
    expect(s.code).toBe('dex_daily_throttle')
  })
})

describe('runFullSequence T1 SQL still requires sanitized_at (the starve gate)', () => {
  it('the T1 select is fail-closed on sanitized_at IS NOT NULL', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toMatch(/sanitized_at IS NOT NULL/)
    expect(seq).toMatch(/t1StarveReason/)
    expect(seq).toMatch(/touch1LastAt/)
    expect(seq).toContain('loadTouch1HealthForPause')
    expect(seq).toContain('secondSentToday: throttleCounts.secondSentToday')
    expect(seq).toContain('newTouchAllowance: newTouchAllowance(throttleCounts)')
  })
})
