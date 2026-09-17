/**
 * PS-T1-STARVE-01 — why cold touch-1 died 2026-09-12 and how to alarm next time.
 *
 * Measured: T1_READY sanitized=0, unsanitized=6435 GEO US/GB/AU never-touched.
 * runFullSequence requires sanitized_at IS NOT NULL, so the hourly cron returned
 * sent:0 while T2/T3 kept the GREATEST(touch*) liveness line green.
 *
 * Pure decision helpers live here so HQ, watchdog, and tests share one rule:
 *   • T1 silent >36h while GEO-eligible never-touched >100 → alert
 *   • sanitized eligible = 0 while that reservoir >100 → alert (pool starved)
 */
export const T1_SILENCE_MS = 36 * 60 * 60 * 1000
export const ELIGIBLE_ALERT_FLOOR = 100
export const GEO_ALLOWLIST = ['US', 'GB', 'AU'] as const

export type MailboxVerifierKeys = { mev: boolean; qev: boolean; any: boolean }

/** Empty string (Vercel MEV name-exists-value-empty) is unset. */
export function mailboxVerifierKeys(env: NodeJS.ProcessEnv = process.env): MailboxVerifierKeys {
  const mev = !!(env.MYEMAILVERIFIER_API_KEY || '').trim()
  const qev = !!(env.QEV_API_KEY || '').trim()
  return { mev, qev, any: mev || qev }
}

export function verifierEmptyAlertMessage(keys: MailboxVerifierKeys = mailboxVerifierKeys()): string {
  return (
    '🚨 PhishSim mailbox verifier EMPTY — MYEMAILVERIFIER_API_KEY ' +
    (keys.mev ? 'set' : 'empty') +
    ' and QEV_API_KEY ' +
    (keys.qev ? 'set' : 'empty') +
    '. sanitizeRefill will promote 0 mailbox-verified leads. Set QEV_API_KEY in Vercel Production ' +
    '(or a non-empty MYEMAILVERIFIER_API_KEY). Do not invent keys. Do not set REFILL_ALLOW_MX_ONLY=1.'
  )
}

/** Live 2026-09-17: sendable sanitized untouched hit 0; T1 sent 0 while T2/T3 stayed green. */
export function sendablePoolEmptyAlertMessage(sendableUntouched: number): string | null {
  if (sendableUntouched > 0) return null
  return (
    '🚨 PhishSim sendable sanitized untouched = 0 — T1 cannot send (sanitized_at IS NOT NULL required). ' +
    'Refill promoted 0 mailbox-verified personal inboxes. Check QEV_API_KEY fallback + /api/os/sanitize-refill. ' +
    'Do not set REFILL_ALLOW_MX_ONLY=1.'
  )
}

export type T1StarveInput = {
  sanitizedEligible: number
  unsanitizedEligible: number
  tripped?: boolean
  autonomyDenied?: boolean
  pauseNewTouch1?: boolean
}

/**
 * Why runFullSequence's T1 loop sends 0 when the send path is otherwise healthy.
 * Bounce/autonomy are checked first by the caller; this is the sanitized-pool gate.
 */
export function whyT1SentZero(input: T1StarveInput): { sent: 0; reason: string } {
  if (input.tripped) return { sent: 0, reason: 'bounce_breaker_tripped' }
  if (input.autonomyDenied) return { sent: 0, reason: 'autonomy_denied' }
  if (input.pauseNewTouch1 && input.sanitizedEligible > 0) {
    return { sent: 0, reason: 'pause_new_touch1' }
  }
  if (input.sanitizedEligible <= 0 && input.unsanitizedEligible > 0) {
    return {
      sent: 0,
      reason: `pool_starved_sanitized: T1 requires sanitized_at IS NOT NULL; sanitized=0 unsanitized=${input.unsanitizedEligible}`,
    }
  }
  if (input.sanitizedEligible <= 0) return { sent: 0, reason: 'no_t1_eligible' }
  return { sent: 0, reason: 't1_eligible_but_not_sent' }
}

export type Touch1Starvation = {
  silent: boolean
  alert: boolean
  code: string | null
  message: string | null
  silentHours: number | null
}

export function touch1Starvation(input: {
  touch1LastAt: Date | string | null
  sanitizedEligible: number
  unsanitizedEligible: number
  now?: Date
}): Touch1Starvation {
  const now = input.now ?? new Date()
  const last = input.touch1LastAt ? new Date(input.touch1LastAt).getTime() : NaN
  const silentHours = Number.isFinite(last) ? (now.getTime() - last) / 3_600_000 : null
  const silent = !Number.isFinite(last) || now.getTime() - last > T1_SILENCE_MS
  const reservoir = input.unsanitizedEligible + input.sanitizedEligible

  if (input.sanitizedEligible <= 0 && input.unsanitizedEligible > ELIGIBLE_ALERT_FLOOR) {
    return {
      silent,
      alert: true,
      code: 'sanitized_pool_empty',
      silentHours,
      message:
        `🚨 PhishSim T1 STARVED — sanitized eligible=0 while ${input.unsanitizedEligible} GEO-eligible never-touched remain. ` +
        `Last T1 ${input.touch1LastAt ? new Date(input.touch1LastAt).toISOString() : 'never'}. ` +
        `Refill is not promoting (empty mailbox verifier or exhausted checked-rejects). Check /api/os/sanitize-refill.`,
    }
  }

  if (silent && reservoir > ELIGIBLE_ALERT_FLOOR) {
    const hours = silentHours == null ? 'never' : `${silentHours.toFixed(0)}h`
    return {
      silent: true,
      alert: true,
      code: 't1_silent',
      silentHours,
      message:
        `🚨 PhishSim T1 SILENT ${hours} — last T1 ${input.touch1LastAt ? new Date(input.touch1LastAt).toISOString() : 'never'} ` +
        `while ${reservoir} GEO-eligible never-touched remain (sanitized=${input.sanitizedEligible}). Check refill + /api/os/sequence.`,
    }
  }

  return { silent, alert: false, code: null, message: null, silentHours }
}

export type Touch1HealthSnapshot = {
  touch1LastAt: string | null
  sanitizedEligible: number
  unsanitizedEligible: number
  verifier: MailboxVerifierKeys
  starvation: Touch1Starvation
}

/** Shared HQ / watchdog census. */
export async function loadTouch1Health(sql: any, now: Date = new Date()): Promise<Touch1HealthSnapshot> {
  const geo = [...GEO_ALLOWLIST]
  const lastRows = (await sql`
    SELECT max(touch1_sent_at) AS t
    FROM ps_outreach_leads
    WHERE country = ANY(${geo})`) as Array<{ t: string | Date | null }>
  const sanitizedRows = (await sql`
    SELECT count(*)::int AS n FROM ps_outreach_leads
    WHERE country = ANY(${geo}) AND touch1_sent_at IS NULL AND bounced = false
      AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')
      AND sanitized_at IS NOT NULL`) as Array<{ n: number }>
  const unsanitizedRows = (await sql`
    SELECT count(*)::int AS n FROM ps_outreach_leads
    WHERE country = ANY(${geo}) AND touch1_sent_at IS NULL AND bounced = false
      AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')
      AND sanitized_at IS NULL`) as Array<{ n: number }>
  const touch1LastAt = lastRows[0]?.t ? new Date(lastRows[0].t).toISOString() : null
  const sanitizedEligible = Number(sanitizedRows[0]?.n ?? 0)
  const unsanitizedEligible = Number(unsanitizedRows[0]?.n ?? 0)
  const verifier = mailboxVerifierKeys()
  const starvation = touch1Starvation({
    touch1LastAt,
    sanitizedEligible,
    unsanitizedEligible,
    now,
  })
  return { touch1LastAt, sanitizedEligible, unsanitizedEligible, verifier, starvation }
}
