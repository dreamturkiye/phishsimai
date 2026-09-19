/**
 * PS-SEND-HEALTH-DEX-FALSE-POSITIVE-01
 *
 * The 08:30 outreach funnel used to Telegram SEND FAILED / SEND BROKEN and tell
 * the founder to hit /api/os/sequence. That is homework for a reclaimable drip
 * or a Dex daily throttle. This module classifies the leftover send-cron /
 * send-zero shapes: self-heal stale Aria, defer fresh Aria, suppress Dex-cap
 * false positives. Verifier-empty, real T1 starve, and bounce-breaker stay
 * legitimate pages. No Dex raise, no blast, no touch 93.
 */
import { SEQUENCE_STALE_MS, type AgentTiming } from './stallReclaim'
import {
  isDexDailyThrottle,
  verifierEmptyAlertMessage,
  type MailboxVerifierKeys,
} from './touch1Health'

export const SEND_HEALTH_BACKLOG_FLOOR = 100

export type OutreachSendHealthKind =
  | 'ok'
  | 'throttle'
  | 'defer'
  | 'heal'
  | 'starve'
  | 'verifier_empty'
  | 'bounce_breaker'
  | 'supply_empty'

export type OutreachSendHealthInput = {
  sentToday: number
  capToday: number
  sendableNow: number
  backlogVerifiable: number
  ariaRanToday: boolean
  sequence: Pick<AgentTiming, 'ageMs' | 'lastFailed'>
  t1StarveReason?: string | null
  verifier: MailboxVerifierKeys
  bounceTripped: boolean
  ariaLastRun?: string | null
}

export type OutreachSendHealthDecision = {
  kind: OutreachSendHealthKind
  page: boolean
  invokeSequence: boolean
  healthLine: string
  telegram: string | null
  action: string
}

export function sequenceRunIsStale(timing: Pick<AgentTiming, 'ageMs' | 'lastFailed'>): boolean {
  return timing.ageMs == null || timing.ageMs > SEQUENCE_STALE_MS || timing.lastFailed
}

export function shouldPageSupplyDraining(input: {
  sentToday: number
  capToday: number
  sentYesterday: number
  capYesterday: number
  t1StarveReason?: string | null
}): boolean {
  if (isDexDailyThrottle(input.t1StarveReason)) return false
  return input.sentToday < input.capToday && input.sentYesterday < input.capYesterday && input.sentYesterday > 0
}

export function decideOutreachSendHealth(input: OutreachSendHealthInput): OutreachSendHealthDecision {
  const {
    sentToday,
    capToday,
    sendableNow,
    backlogVerifiable,
    ariaRanToday,
    sequence,
    t1StarveReason,
    verifier,
    bounceTripped,
    ariaLastRun,
  } = input
  const stale = sequenceRunIsStale(sequence)

  if (bounceTripped && sentToday === 0) {
    return {
      kind: 'bounce_breaker',
      page: true,
      invokeSequence: false,
      healthLine: '🚨 SEND 0 — bounce breaker tripped',
      telegram:
        '🚨 <b>PhishSim BOUNCE BREAKER</b> — outbound halted on a measured bounce trip. ' +
        'Not a Dex-cap miss. Sequence/researcher were not assigned as founder homework.',
      action: 'bounce breaker page (legitimate)',
    }
  }

  if (sentToday > 0) {
    return {
      kind: 'ok',
      page: false,
      invokeSequence: false,
      healthLine: `✅ SEND ${sentToday}/${capToday}${sentToday < capToday ? ' ⚠️ below cap' : ''}`,
      telegram: null,
      action: 'send ok',
    }
  }

  if (!verifier.any) {
    return {
      kind: 'verifier_empty',
      page: true,
      invokeSequence: false,
      healthLine: '🚨 sent 0 — mailbox verifier EMPTY',
      telegram: verifierEmptyAlertMessage(verifier),
      action: 'verifier empty page (legitimate)',
    }
  }

  if (sendableNow === 0 && backlogVerifiable > SEND_HEALTH_BACKLOG_FLOOR) {
    return {
      kind: 'starve',
      page: true,
      invokeSequence: false,
      healthLine: `🚨 sent 0 — sanitized pool empty while ${backlogVerifiable} GEO-eligible unsanitized remain`,
      telegram:
        `🚨 <b>PhishSim T1 STARVED</b> — sanitized sendable=0 while ${backlogVerifiable} GEO-eligible never-touched remain. ` +
        'This is NOT "supply expected". Check /api/os/sanitize-refill (QEV_API_KEY / non-empty MYEMAILVERIFIER_API_KEY).',
      action: 't1 starve page (legitimate)',
    }
  }

  if (isDexDailyThrottle(t1StarveReason)) {
    return {
      kind: 'throttle',
      page: false,
      invokeSequence: false,
      healthLine: `⚪ SEND 0 — Dex daily throttle (${t1StarveReason}); wait UTC reset`,
      telegram: null,
      action: 'dex throttle — no founder page',
    }
  }

  const reclaimable = !ariaRanToday || sendableNow > 0
  if (reclaimable) {
    if (stale) {
      return {
        kind: 'heal',
        page: false,
        invokeSequence: true,
        healthLine: !ariaRanToday
          ? `⏳ SEND cron stale (last: ${ariaLastRun ?? 'never'}) — self-heal invoked`
          : `⏳ SEND 0 with ${sendableNow} sendable — self-heal invoked`,
        telegram: null,
        action: 'self-heal stale sequence — no founder page',
      }
    }
    return {
      kind: 'defer',
      page: false,
      invokeSequence: false,
      healthLine: !ariaRanToday
        ? '⏳ SEND cron — queued on hourly Dex-capped drip (last run fresh)'
        : `⏳ SEND 0 with ${sendableNow} sendable — queued on hourly Dex-capped drip`,
      telegram: null,
      action: 'defer fresh sequence — no second slice',
    }
  }

  return {
    kind: 'supply_empty',
    page: false,
    invokeSequence: false,
    healthLine: '⚪ sent 0 — pool empty (supply, expected, not a fault)',
    telegram: null,
    action: 'supply empty',
  }
}
