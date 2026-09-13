export function ageDays(createdAt: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 86_400_000))
}

/** Not a founder legal/spend decision — paging daily does not unblock it. */
export function isOperatorOwnedEscalation(row: { category: string; payload?: any; created_at?: string }): boolean {
  const payload = row.payload || {}
  const blob = `${payload.last_error || ''} ${payload.janetReasoning || ''} ${payload.trip_reason || ''}`
  if (/PRE-FLIGHT REFUSED:.*protected path/i.test(blob)) return true
  const age = row.created_at ? ageDays(row.created_at) : 0
  if (/Grok output format mismatch/i.test(blob) && age >= 7) return true
  return false
}
