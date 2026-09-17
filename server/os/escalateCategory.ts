/**
 * Prod CHECK (0010): category IN pricing_billing, capital_spend, legal_contract,
 * new_subsidiary, protected_path, breaker_trip, autonomy_change, marcus_dispatch,
 * agent_critical. There is NO founder_decision — Aria 2026-09-14 escalate 500'd.
 */
import { isSendPathFixTitle } from './cgoMandate'

export const ESCALATION_CATEGORIES = [
  'pricing_billing',
  'capital_spend',
  'legal_contract',
  'new_subsidiary',
  'protected_path',
  'breaker_trip',
  'autonomy_change',
  'marcus_dispatch',
  'agent_critical',
] as const

export type EscalationCategory = (typeof ESCALATION_CATEGORIES)[number]

/** Map ACTION: escalate to a CHECK-legal category. Send-path/ops → marcus_dispatch. */
export function escalateCategoryFor(title: string, detail = ''): EscalationCategory {
  const t = `${title} ${detail}`
  if (/\b(price|pricing|billing|stripe|mrr)\b/i.test(t)) return 'pricing_billing'
  if (/\b(legal|contract|tos|terms of service)\b/i.test(t)) return 'legal_contract'
  if (/\b(spend|budget|capital|purchase|invoice)\b/i.test(t)) return 'capital_spend'
  if (/\b(new subsidiary|new product line)\b/i.test(t)) return 'new_subsidiary'
  if (/\b(protected path|assertSendable|dex rail)\b/i.test(t)) return 'protected_path'
  if (isSendPathFixTitle(title, detail) || /\b(sanitize|qev|touch-?1|send.?path|t1 starve)\b/i.test(t)) {
    return 'marcus_dispatch'
  }
  return 'agent_critical'
}
