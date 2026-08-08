/**
 * QEV (QuickEmailVerification) client — PORTED VERBATIM from ScrollFuel
 * (ugc-agency-fable5 lib/leadgen/verifierClient.ts), with two additions marked
 * PS-* below.
 *
 * Ported rather than rewritten deliberately: a second implementation of a
 * safety contract is how two products drift, and drift here means one of them
 * sending to addresses the other would hold.
 *
 *   GET https://api.quickemailverification.com/v1/verify?email=<enc>&apikey=<KEY>
 *   -> { result: "valid"|"invalid"|"unknown", reason, disposable, accept_all,
 *        role, free, safe_to_send, did_you_mean, success, message, ... }
 *
 *   result is valid/invalid/unknown (never 'risky'); catch-all is accept_all=true;
 *   safe_to_send is QEV's overall deliverability verdict and is the tiebreaker.
 *
 * Sandbox: /v1/verify/sandbox costs NO credits — prove wiring before spending.
 * Icypeas is FINDING only. Verification is QEV in both products: Icypeas's
 * /email-verification returned a person-search payload with no deliverability
 * verdict and no catch-all field (measured 2026-08-08, 2 credits).
 */
import { recordProviderCall } from './providerUsage'

export type VerifierStatus = 'valid' | 'risky' | 'invalid' | 'unknown'

export interface VerifierVerdict {
  status: VerifierStatus
  catchAll: boolean
  isRole: boolean
  reason: string
  /** True only when a verdict actually came back from QEV (vs failed closed). */
  reached: boolean
  remainingCredits: number | null
}

const REAL_ENDPOINT = 'https://api.quickemailverification.com/v1/verify'
const SANDBOX_ENDPOINT = 'https://api.quickemailverification.com/v1/verify/sandbox'
const TIMEOUT_MS = 15_000

/**
 * PS-QEV-CAP-01 — per-run spend ceiling, mirroring the finder's finderDailyBudget.
 *
 * The balance is 1,000 credits and a day's pool is 50-100 leads, so a runaway
 * draw could drain a fifth of the balance in one cron run. Past the cap we HOLD
 * rather than spend: an unsent lead is recoverable tomorrow, a spent credit is not.
 */
const DAILY_CAP = Number(process.env.QEV_DAILY_CAP || 100)
let _spentThisRun = 0

/**
 * In-process credit latch. Two triggers:
 *   1. X-QEV-Remaining-Credits <= 0        (ported from ScrollFuel)
 *   2. PS-QEV-LATCH-01: success:false + "Low credit. Payment required"
 *
 * (2) was measured on 2026-08-08: the balance hit zero mid-sample and the
 * remaining 98 calls each held CORRECTLY but still went out over the wire.
 * Holding without spending is the point of a latch. BACKPORT THIS TO SCROLLFUEL.
 */
let _creditsExhausted = false

export function resetCreditLatch(): void {
  _creditsExhausted = false
  _spentThisRun = 0
}

/** Credits spent by this process — for the run summary and the meter. */
export function creditsSpentThisRun(): number {
  return _spentThisRun
}

function held(reason: string, remainingCredits: number | null = null): VerifierVerdict {
  return { status: 'unknown', catchAll: false, isRole: false, reason, reached: false, remainingCredits }
}

export function verifierConfigured(): boolean {
  return !!process.env.QEV_API_KEY?.trim()
}

function useSandbox(): boolean {
  return process.env.QEV_SANDBOX === 'true'
}

/**
 * Map QEV onto our four tiers. PRECEDENCE MATTERS:
 *   disposable      -> invalid
 *   accept_all      -> risky   (catch-all: acceptance proves nothing) — even if result=valid
 *   result=invalid  -> invalid
 *   result=valid    -> valid IFF safe_to_send; else risky
 *   anything else   -> unknown (HOLD)
 * role never changes the tier — carried as a flag for downstream deprioritisation.
 */
function mapResponse(body: any, remainingCredits: number | null): VerifierVerdict {
  const result = String(body?.result ?? '').toLowerCase().trim()
  const acceptAll = body?.accept_all === true || body?.accept_all === 'true'
  const disposable = body?.disposable === true || body?.disposable === 'true'
  const isRole = body?.role === true || body?.role === 'true'
  const safeToSend = body?.safe_to_send === true || body?.safe_to_send === 'true'
  const reason = String(body?.reason ?? '').slice(0, 160)
  const base = { catchAll: acceptAll, isRole, reached: true, remainingCredits }

  if (disposable) return { status: 'invalid', reason: reason || 'disposable', ...base }
  if (acceptAll) return { status: 'risky', reason: reason || 'accept_all (catch-all)', ...base }
  if (result === 'invalid') return { status: 'invalid', reason: reason || 'invalid', ...base }
  if (result === 'valid') {
    return safeToSend
      ? { status: 'valid', reason: reason || 'valid', ...base }
      : { status: 'risky', reason: reason || 'valid but not safe_to_send', ...base }
  }
  return { status: 'unknown', reason: reason || `result='${result}'`, ...base }
}

function readCredits(res: Response): number | null {
  const h = res.headers.get('X-QEV-Remaining-Credits') ?? res.headers.get('x-qev-remaining-credits')
  if (h == null) return null
  const n = Number(h)
  return Number.isFinite(n) ? n : null
}

/** Reachability via the SANDBOX — no credits spent. */
export async function verifierHealth(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.QEV_API_KEY?.trim()
  if (!key) return { ok: false, detail: 'QEV_API_KEY not set' }
  try {
    const url = `${SANDBOX_ENDPOINT}?email=${encodeURIComponent('valid@example.com')}&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { ok: res.ok, detail: `sandbox ${res.status}` }
  } catch (e: any) {
    return { ok: false, detail: `unreachable: ${String(e?.message).slice(0, 80)}` }
  }
}

/**
 * Verify ONE address. The single verification authority. FAILS CLOSED to HOLD:
 * no key, no credit, cap reached, HTTP error or unparseable body all return
 * 'unknown' — never 'valid'.
 */
export async function verifyViaService(email: string): Promise<VerifierVerdict> {
  const key = process.env.QEV_API_KEY?.trim()
  if (!key) return held('QEV not configured (QEV_API_KEY)')
  if (_creditsExhausted) return held('QEV credits exhausted — holding')
  if (_spentThisRun >= DAILY_CAP) {
    return held(`QEV per-run cap reached (${DAILY_CAP}) — holding`)
  }

  const endpoint = useSandbox() ? SANDBOX_ENDPOINT : REAL_ENDPOINT
  try {
    const url = `${endpoint}?email=${encodeURIComponent(email)}&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const remaining = readCredits(res)
    if (remaining != null && remaining <= 0) {
      _creditsExhausted = true
      console.log('[qev] X-QEV-Remaining-Credits=0 — remaining leads HOLD')
    }
    if (!res.ok) {
      await recordProviderCall({ provider: 'qev', endpoint: 'verify', sent: false })
      return held(`QEV HTTP ${res.status}`, remaining)
    }
    const body = await res.json().catch(() => null)
    if (!body) {
      await recordProviderCall({ provider: 'qev', endpoint: 'verify', sent: false })
      return held('QEV returned unparseable body', remaining)
    }

    // PS-QEV-LATCH-01 — a 200 carrying success:false is NOT a verdict and was NOT billed.
    if (body.success === false || body.success === 'false') {
      const msg = String(body.message ?? '').slice(0, 120)
      if (/low credit|payment required|insufficient/i.test(msg)) {
        _creditsExhausted = true
        console.error(`[qev] ${msg} — LATCHED; remaining leads HOLD without further calls`)
      }
      await recordProviderCall({ provider: 'qev', endpoint: 'verify', sent: false })
      return held(`QEV: ${msg || 'success=false'}`, remaining)
    }

    // Only a real verdict counts as spend.
    _spentThisRun++
    await recordProviderCall({ provider: 'qev', endpoint: 'verify', sent: true, results: 1 })
    return mapResponse(body, remaining)
  } catch (e: any) {
    await recordProviderCall({ provider: 'qev', endpoint: 'verify', sent: false })
    return held(`QEV unreachable: ${String(e?.message).slice(0, 80)}`)
  }
}
