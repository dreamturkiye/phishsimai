/**
 * PS-TRIAL-START-01 — the public URL a prospect hits to start a TRUE 30-day trial.
 *
 * `/login?mode=register` was a working register API behind a login-looking card.
 * Warm CTA → TRUE trial was 0/17 in 14d (2026-09-17). Destination is now `/trial`:
 * one form, no card, UTM + optional email prefill. Old `/login?mode=register`
 * emails still work (client redirects, preserving query).
 *
 * Magic-link trial start stays staged (five hard stops / protected auth).
 */

export const TRIAL_CTA_ORIGIN = 'https://phishsimai.com'
export const TRIAL_CTA_PATH = '/trial'
/** Canonical no-query URL. Prefer trialCtaUrl() on any send so UTM is present. */
export const TRIAL_CTA_URL = `${TRIAL_CTA_ORIGIN}${TRIAL_CTA_PATH}`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanParam(value: string | null | undefined, max = 80): string {
  return String(value || '')
    .trim()
    .slice(0, max)
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export type TrialCtaOpts = {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  email?: string | null
}

export function trialCtaUrl(opts: TrialCtaOpts = {}): string {
  const u = new URL(TRIAL_CTA_PATH, TRIAL_CTA_ORIGIN)
  u.searchParams.set('utm_source', cleanParam(opts.source) || 'product')
  u.searchParams.set('utm_medium', cleanParam(opts.medium) || 'web')
  u.searchParams.set('utm_campaign', cleanParam(opts.campaign) || 'trial')
  const email = String(opts.email || '').trim().toLowerCase()
  if (EMAIL_RE.test(email)) u.searchParams.set('email', email)
  return u.toString()
}

export type SignupAttribution = {
  source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  orgId?: number
}

function attrString(value: unknown): string | undefined {
  const s = String(value ?? '').trim().slice(0, 80)
  return s || undefined
}

export function parseSignupAttribution(
  body: Record<string, unknown> | null | undefined,
): SignupAttribution {
  const utm_source = attrString(body?.utm_source)
  const utm_medium = attrString(body?.utm_medium)
  const utm_campaign = attrString(body?.utm_campaign)
  const source = attrString(body?.source) || utm_source
  const out: SignupAttribution = {}
  if (source) out.source = source
  if (utm_source) out.utm_source = utm_source
  if (utm_medium) out.utm_medium = utm_medium
  if (utm_campaign) out.utm_campaign = utm_campaign
  return out
}

export function signupAttrMemoryKey(email: string): string {
  return `signup_attr:${String(email || '').trim().toLowerCase()}`
}

export function isTrialStartPath(pathname: string): boolean {
  const p = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/'
  return p === '/trial' || p === '/signup' || p === '/register'
}
