/**
 * PS-TELEGRAM-NOISE-01 — founder Telegram is for hard failures / money / real wins.
 *
 * Reclaimable / recurring homework must not page every agent every standup:
 *   • Ollama / LLM provider payment-failed (same root cause across finn/vera/dex/janet/marcus)
 *   • Hourly ARIA SEQUENCE digests (fold into once/day; founder brief already carries funnel)
 *   • Routine TASK status flips
 *   • daily-report duplicate when founder-brief already fired the same UTC day
 *
 * Keep: bounce breaker, verifier empty, T1 starve, real hard stops, breaker_trip,
 * one coalesced LLM billing page, founder brief once/day, Grey Box paid send, real wins.
 * Caps unchanged. No blast. No touch 93.
 */

/** Shared LLM / Ollama Cloud billing failure — one money page, not N agent_critical rows. */
export const LLM_PROVIDER_BILLING_ALERT = 'llm_provider_billing'

const LLM_BILLING_RE =
  /\b(402|payment required|payment failed|pay(?:ment)? (?:is )?required|insufficient (?:credits?|balance|funds)|out of credits?|billing (?:issue|error|required)|quota exceeded.*(?:ollama|cerebras|deepinfra|groq)|account (?:suspended|past due)|requires? payment)\b/i

const LLM_PROVIDER_HINT =
  /\b(ollama|cerebras|deepinfra|groq|gemini|llm|openai|glm-5\.2|provider (?:chain|failed)|No LLM provider succeeded|All providers failed)\b/i

/** True when the error is a shared LLM/provider billing / payment failure (money — page once). */
export function isLlmProviderBillingFailure(error?: string | null): boolean {
  const e = String(error || '')
  if (!e.trim()) return false
  if (LLM_BILLING_RE.test(e)) return true
  // Ollama Cloud often returns a bare "Payment required" / HTTP 402 without naming ollama.
  if (/\bHTTP\s*402\b|\bstatus(?:Code)?[=:\s]*402\b/i.test(e) && LLM_PROVIDER_HINT.test(e)) return true
  return false
}

/** agent_critical rows caused by shared LLM billing are reclaimable noise (coalesce elsewhere). */
export function isLlmBillingAgentCritical(row: {
  category: string
  payload?: Record<string, any> | null
}): boolean {
  if (row.category !== 'agent_critical') return false
  const p = row.payload || {}
  const blob = [
    p.lastError,
    p.last_error,
    p.error,
    p.message,
    typeof p === 'object' ? JSON.stringify(p) : '',
  ]
    .filter(Boolean)
    .join(' ')
  return isLlmProviderBillingFailure(blob)
}

/** HQ task status flips that are not failures — do not Telegram. */
export function shouldTelegramTaskStatus(status?: string | null): boolean {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return false
  // Failures / hard stops only.
  return /^(fail|failed|error|blocked|critical|rejected|timeout|timed_out)$/i.test(s)
}

/**
 * Hourly sequence digests flood when Dex drip sends a few every hour.
 * Allow at most one ARIA SEQUENCE digest per UTC day; bounce/hard errors stay separate.
 */
export function shouldSendSequenceDigest(opts: {
  totalSent: number
  lastDigestUtcDay?: string | null
  nowUtcDay: string
}): boolean {
  if (opts.totalSent <= 0) return false
  if (opts.lastDigestUtcDay && opts.lastDigestUtcDay === opts.nowUtcDay) return false
  return true
}

export function utcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** daily-report @ 21:00 duplicates founder-brief @ 21:00 — skip digest Telegram when brief exists. */
export function shouldSendDailyReportTelegram(opts: {
  founderBriefExistsForUtcDay: boolean
}): boolean {
  return !opts.founderBriefExistsForUtcDay
}

/** Coalesced money page copy — one alert for the shared LLM billing outage. */
export function llmBillingAlertDetail(sampleError: string, agentId?: string): string {
  const sample = String(sampleError || '').slice(0, 180)
  const who = agentId ? ` (seen on ${agentId})` : ''
  return (
    `Shared LLM/provider billing failure${who}. ` +
    `Agents will keep running the non-LLM half of their cron; do not page per-agent. ` +
    `Top up / fix Ollama Cloud (or LLM_PROVIDER_CHAIN). Sample: ${sample}`
  )
}
