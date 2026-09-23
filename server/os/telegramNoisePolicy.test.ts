import { describe, expect, it } from 'vitest'
import {
  isLlmProviderBillingFailure,
  isLlmBillingAgentCritical,
  shouldTelegramTaskStatus,
  shouldSendSequenceDigest,
  shouldSendDailyReportTelegram,
  llmBillingAlertDetail,
  utcDayKey,
} from './telegramNoisePolicy'
import { shouldPageFounderForEscalation } from './escalationTriagePolicy'
import { readFileSync } from 'node:fs'

describe('PS-TELEGRAM-NOISE-01 — silence reclaimable flood', () => {
  it('detects Ollama / LLM payment-failed shapes', () => {
    expect(isLlmProviderBillingFailure('Payment required')).toBe(true)
    expect(isLlmProviderBillingFailure('HTTP 402 Payment Required from ollama')).toBe(true)
    expect(isLlmProviderBillingFailure('insufficient credits on ollama cloud')).toBe(true)
    expect(isLlmProviderBillingFailure('No LLM provider succeeded')).toBe(false)
    expect(isLlmProviderBillingFailure('bounce rate 4.2%')).toBe(false)
  })

  it('agent_critical with payment-failed does not page the founder', () => {
    expect(
      shouldPageFounderForEscalation({
        category: 'agent_critical',
        payload: { agentId: 'finn', lastError: 'Payment required' },
        status: 'pending',
      }),
    ).toBe(false)
    expect(
      isLlmBillingAgentCritical({
        category: 'agent_critical',
        payload: { lastError: 'ollama: payment failed' },
      }),
    ).toBe(true)
    // Real agent faults still page.
    expect(
      shouldPageFounderForEscalation({
        category: 'agent_critical',
        payload: { agentId: 'aria', lastError: 'TypeError: cannot read x' },
        status: 'pending',
      }),
    ).toBe(true)
  })

  it('breaker_trip and bounce-class faults still page', () => {
    expect(
      shouldPageFounderForEscalation({
        category: 'breaker_trip',
        payload: { trip_reason: 'consecutive_failures', last_error: 'boom' },
        status: 'pending',
      }),
    ).toBe(true)
  })

  it('task status telegram only for failures', () => {
    expect(shouldTelegramTaskStatus('failed')).toBe(true)
    expect(shouldTelegramTaskStatus('error')).toBe(true)
    expect(shouldTelegramTaskStatus('completed')).toBe(false)
    expect(shouldTelegramTaskStatus('in_progress')).toBe(false)
    expect(shouldTelegramTaskStatus('done')).toBe(false)
  })

  it('ARIA SEQUENCE digest at most once per UTC day', () => {
    const day = utcDayKey()
    expect(shouldSendSequenceDigest({ totalSent: 5, lastDigestUtcDay: null, nowUtcDay: day })).toBe(true)
    expect(shouldSendSequenceDigest({ totalSent: 5, lastDigestUtcDay: day, nowUtcDay: day })).toBe(false)
    expect(shouldSendSequenceDigest({ totalSent: 0, lastDigestUtcDay: null, nowUtcDay: day })).toBe(false)
  })

  it('daily-report skips Telegram when founder brief already exists', () => {
    expect(shouldSendDailyReportTelegram({ founderBriefExistsForUtcDay: true })).toBe(false)
    expect(shouldSendDailyReportTelegram({ founderBriefExistsForUtcDay: false })).toBe(true)
  })

  it('coalesced billing detail names the shared outage', () => {
    expect(llmBillingAlertDetail('Payment required', 'vera')).toMatch(/Shared LLM/)
    expect(llmBillingAlertDetail('Payment required', 'vera')).toMatch(/vera/)
  })

  it('agentHealth_v2 coalesces LLM billing instead of per-agent escalate', () => {
    const src = readFileSync('server/os/agentHealth_v2.ts', 'utf8')
    expect(src).toContain('LLM_PROVIDER_BILLING_ALERT')
    expect(src).toContain('isLlmProviderBillingFailure')
    expect(src).toContain('llmBillingCoalesced')
  })

  it('sequences rate-limits ARIA SEQUENCE digests', () => {
    const src = readFileSync('server/os/sequences.ts', 'utf8')
    expect(src).toContain('shouldSendSequenceDigest')
    expect(src).toContain('aria_sequence_digest_day')
  })

  it('hqTask does not Telegram routine status flips', () => {
    const src = readFileSync('server/os/routes.ts', 'utf8')
    expect(src).toContain('shouldTelegramTaskStatus')
  })

  it('does not invent touch 93 or raise Dex caps', () => {
    const policy = readFileSync('server/os/telegramNoisePolicy.ts', 'utf8')
    expect(policy).toContain('No touch 93')
    expect(policy).toContain('Caps unchanged')
    expect(policy).not.toMatch(/touch\s*[=:]\s*93/)
  })
})
