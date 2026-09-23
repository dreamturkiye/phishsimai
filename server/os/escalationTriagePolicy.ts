import { autonomyFloorFor, resolveReadableLevel, LEVEL_ORDER } from './autonomyGate'
import { isLlmBillingAgentCritical } from './telegramNoisePolicy'

/** Send-path / T1 starve / sanitize empty — Marcus owns this, not a founder gate. */
export const CRISIS_AUTO_MARCUS = 'crisis_auto_marcus'

/** Dex combined / new-touch daily cap — wait UTC reset, do not page. */
export const DEX_DAILY_THROTTLE = 'dex_daily_throttle'

export function isCrisisAutoMarcusEscalation(row: { category: string; payload?: any }): boolean {
  if (row.category !== 'marcus_dispatch') return false
  const blob = JSON.stringify(row.payload || '')
  if (isDexThrottleEscalation(row)) return false
  return /PS-T1-(STARVE|QEV-EMPTY|PAUSE-LOCK)|sanitiz|qev_api|qev empty|mailbox verifier|pauseNewTouch1|touch-?1 starve|t1 starve/i.test(blob)
}

export function isDexThrottleEscalation(row: { category: string; payload?: any }): boolean {
  const blob = JSON.stringify(row.payload || '')
  return /combined_daily_cap|new_touch_daily_cap|dex daily (cap|throttle)/i.test(blob)
}

export function ageDays(createdAt: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 86_400_000))
}

/** Not a founder legal/spend decision — paging daily does not unblock it. */
export function isOperatorOwnedEscalation(row: { category: string; payload?: any; created_at?: string }): boolean {
  if (isCrisisAutoMarcusEscalation(row) || isDexThrottleEscalation(row)) return true
  const payload = row.payload || {}
  const blob = `${payload.last_error || ''} ${payload.janetReasoning || ''} ${payload.trip_reason || ''}`
  if (/PRE-FLIGHT REFUSED:.*protected path/i.test(blob)) return true
  const age = row.created_at ? ageDays(row.created_at) : 0
  if (/Grok output format mismatch/i.test(blob) && age >= 7) return true
  return false
}

/** Terminal statuses — do not Telegram, do not grow urgency. */
export const TERMINAL_ESCALATION_STATUSES = ['approved', 'rejected', 'deferred'] as const

/** Auto-resolve reason written to escalations.resolved_via / payload.janetTriage. */
export const ALREADY_AT_L5_FLOOR = 'already_at_l5_floor'

/** Posture already at or past L5.7 — autonomy raises are not a founder decision. */
export const HELD_L57_POSTURES = ['l5_7', 'drill_3', 'drill_7', 'drill_15', 'l5_8'] as const

export type AutonomyNagContext = {
  category: string
  payload?: Record<string, any> | null
  status?: string
  companyId?: string
  liveLevel?: string | null
  storedLevel?: string | null
  posture?: string | null
}

function asLevelRank(value: string): number {
  return (LEVEL_ORDER as readonly string[]).indexOf(value)
}

function payloadStr(payload: Record<string, any> | null | undefined, ...keys: string[]): string {
  const p = payload || {}
  for (const k of keys) {
    const v = p[k]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

/**
 * PhishSim is already at the L5 enforcement floor / L5.7+ posture. Founder Telegram
 * must not nag about autonomy_change / raise_refused insert artifacts (escalation #202:
 * false raise_refused→manual on INSERT while live level stayed l5).
 *
 * Does NOT swallow breaker_trip, protected_path, spend, or hard-stop categories.
 * drop / row_deleted stay visible unless they are already terminal.
 */
export function isAlreadyAtL5FloorAutonomyNoise(row: AutonomyNagContext): boolean {
  if (row.category !== 'autonomy_change') return false
  const companyId = row.companyId || 'phishsimai'
  if (companyId !== 'phishsimai') return false
  if (row.status && (TERMINAL_ESCALATION_STATUSES as readonly string[]).includes(row.status)) return true

  const payload = row.payload || {}
  if (payload.already_at_l5_floor === true || payload.janetTriage === ALREADY_AT_L5_FLOOR) return true

  const outcome = payloadStr(payload, 'outcome')
  // Demotion / row delete are tamper-or-safety events. Breaker_trip still pages separately;
  // these stay visible unless already terminal or stamped already_at_l5_floor.
  if (outcome === 'drop' || outcome === 'row_deleted') return false
  const attempted = payloadStr(payload, 'attempted', 'target', 'to')
  const effective = payloadStr(payload, 'effective')
  const from = payloadStr(payload, 'from')
  const storedGuess =
    row.storedLevel ??
    (effective && effective !== '(row gone)' && effective !== '(insert)' ? effective : null)
  const live = String(resolveReadableLevel(companyId, row.liveLevel ?? storedGuess) || '')
  const floor = autonomyFloorFor(companyId) || 'l5'
  const liveIsFloor = live === floor
  const attemptedRank = asLevelRank(attempted)
  const floorRank = asLevelRank(floor)
  const attemptedAtOrBelowFloor = attemptedRank >= 0 && attemptedRank <= floorRank

  // 1. Attempted/target at or below the L5 floor and live/stored is already l5.
  if (attemptedAtOrBelowFloor && liveIsFloor) return true

  // 2. raise_refused insert artifact: trigger rewrote INSERT to manual, floor still l5.
  if (outcome === 'raise_refused') {
    const stillFloor =
      resolveReadableLevel(companyId, effective) === floor ||
      resolveReadableLevel(companyId, attempted) === floor ||
      resolveReadableLevel(companyId, storedGuess) === floor ||
      resolveReadableLevel(companyId, from === '(insert)' ? null : from) === floor ||
      liveIsFloor
    if (stillFloor) return true
  }

  // 3. Posture already L5.7 / drill_3 / higher — raise/insert noise is not a founder decision.
  //    drop / row_deleted remain founder-visible (tamper / demotion).
  const postureHeld = !!row.posture && (HELD_L57_POSTURES as readonly string[]).includes(row.posture)
  const raiseNoise = !outcome || outcome === 'raise_refused' || outcome === 'raise_authorized' || outcome === 'insert'
  if (postureHeld && raiseNoise) return true

  return false
}

/** Should deliverPending / reAlertFounder page the founder? */
export function shouldPageFounderForEscalation(row: AutonomyNagContext): boolean {
  if (row.status && (TERMINAL_ESCALATION_STATUSES as readonly string[]).includes(row.status)) return false
  if (isAlreadyAtL5FloorAutonomyNoise(row)) return false
  if (isCrisisAutoMarcusEscalation(row) || isDexThrottleEscalation(row)) return false
  // Shared Ollama/LLM payment-failed — one money page via llm_provider_billing, not N agent_critical.
  if (isLlmBillingAgentCritical(row)) return false
  return true
}
