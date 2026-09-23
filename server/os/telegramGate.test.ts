import { describe, expect, it } from 'vitest'
import { classifyTelegramKind, gateTelegram, isTelegramAllowed, TELEGRAM_ALLOWLIST } from './telegramGate'
import { readFileSync } from 'node:fs'

describe('PS-TELEGRAM-GATE-01 — hard_failure | founder_brief only', () => {
  it('allowlist is exactly hard_failure and founder_brief', () => {
    expect([...TELEGRAM_ALLOWLIST].sort()).toEqual(['founder_brief', 'hard_failure'])
    expect(isTelegramAllowed('hard_failure')).toBe(true)
    expect(isTelegramAllowed('founder_brief')).toBe(true)
    expect(isTelegramAllowed('status')).toBe(false)
    expect(isTelegramAllowed('win')).toBe(false)
  })

  it('classifies founder brief', () => {
    expect(classifyTelegramKind('# Founder Brief — 2026-09-23\n\n- **MRR:** no data')).toBe('founder_brief')
    expect(classifyTelegramKind("☀️ *KAAN'S MORNING BRIEF — PhishSim AI*\n\nhi")).toBe('founder_brief')
  })

  it('classifies hard failures and money', () => {
    expect(classifyTelegramKind('🚨 <b>PhishSim BOUNCE BREAKER</b> — outbound halted')).toBe('hard_failure')
    expect(classifyTelegramKind('🚨 <b>PhishSim T1 STARVED</b> — sanitized sendable=0')).toBe('hard_failure')
    expect(classifyTelegramKind('Shared LLM/provider billing failure (seen on finn). Sample: Payment required')).toBe('hard_failure')
    expect(classifyTelegramKind('🔴 <b>ESCALATION — breaker_trip</b>\nProduct: phishsimai')).toBe('hard_failure')
  })

  it('silences status spam (sequence digests, tasks, nudges, wins)', () => {
    expect(gateTelegram('PHISHSIMAI ARIA SEQUENCE: 5 sent\nT1: Acme').allowed).toBe(false)
    expect(gateTelegram('PHISHSIMAI TASK COMPLETED: shipped').allowed).toBe(false)
    expect(gateTelegram('🎣 *PhishSim — daily*\nOrgs signed up today: 0').allowed).toBe(false)
    expect(gateTelegram('✉️ <b>PhishSim trial nudges</b> — sent 1: org 11 (D181)').allowed).toBe(false)
    expect(gateTelegram('PHISHSIMAI WARM TRIAL CTA: 2 sent').allowed).toBe(false)
    expect(gateTelegram('✅ Janet restarted researcher\nok').allowed).toBe(false)
    expect(gateTelegram('🌅 *DAILY STANDUP — PhishSim AI*\n...').allowed).toBe(false)
  })

  it('explicit kind overrides body when provided', () => {
    expect(gateTelegram('anything', 'founder_brief').allowed).toBe(true)
    expect(gateTelegram('# Founder Brief', 'status').allowed).toBe(false)
    expect(gateTelegram('Payment required', 'money').kind).toBe('hard_failure')
  })

  it('sendTelegram choke-points through telegramGate', () => {
    const src = readFileSync('server/os/telegram.ts', 'utf8')
    expect(src).toContain('gateTelegram')
    expect(src).toContain('telegramGate')
  })
})
