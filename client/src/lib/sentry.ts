// ─────────────────────────────────────────────────────────────────────────────
//  SENTRY — CLIENT CAPTURE (@sentry/react)
//
//  Sits ALONGSIDE the existing errorTelemetry.ts → POST /api/os/bug-report path,
//  which already feeds the self-heal pipeline. Sentry is a second, independent sink
//  for the same errors: it gives us grouping, release tracking, and breadcrumbs that
//  a bug_reports row does not. Neither sink depends on the other, so if Sentry is
//  disabled the self-heal pipeline is completely unaffected.
//
//  FAIL-SAFE: VITE_SENTRY_DSN unset → inert no-op, never throws, app unaffected.
//
//  NOTE ON THE ENV VAR NAME. The server reads SENTRY_DSN; the browser bundle CANNOT
//  — Vite only exposes vars prefixed with VITE_ to client code, and a bare SENTRY_DSN
//  would simply be undefined at build time. So the client DSN must be set in Vercel
//  as VITE_SENTRY_DSN. Use a SEPARATE Sentry project from the server DSN: this value
//  is compiled into the public JS bundle and is world-readable.
//
//  PII: reuses the one shared scrub (@shared/piiScrub) via beforeSend, so a browser
//  event is redacted by exactly the same rules as a server event.
// ─────────────────────────────────────────────────────────────────────────────
import * as Sentry from '@sentry/react'
import { scrubText, scrubUrl, scrubDeep } from '@shared/piiScrub'

let enabled = false

export function isSentryEnabled(): boolean {
  return enabled
}

// Same fail-closed contract as the server: on any doubt, drop the event.
export function scrubClientEvent(event: any): any | null {
  try {
    if (!event) return null
    if (event.message) event.message = scrubText(event.message)
    if (Array.isArray(event.exception?.values)) {
      for (const ex of event.exception.values) {
        if (ex?.value) ex.value = scrubText(ex.value)
      }
    }
    if (event.request) {
      delete event.request.headers
      delete event.request.cookies
      delete event.request.data
      if (event.request.url) event.request.url = scrubUrl(event.request.url)
      if (event.request.query_string) delete event.request.query_string
    }
    delete event.user
    if (event.extra) event.extra = scrubDeep(event.extra)
    if (event.tags) event.tags = scrubDeep(event.tags)
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((b: any) => scrubDeep(b))
    }
    return event
  } catch {
    return null
  }
}

export function initClientSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    enabled = false
    return false
  }
  try {
    Sentry.init({
      dsn,
      enabled: true,
      environment: import.meta.env.MODE || 'development',
      tracesSampleRate: 0, // errors only
      sendDefaultPii: false,
      // No session replay: it would capture the user's screen, including target
      // lists and campaign content. Not worth the exposure on a phishing-sim product.
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications.',
      ],
      beforeSend: (event) => scrubClientEvent(event),
    })
    enabled = true
    return true
  } catch {
    enabled = false // never break app boot over telemetry
    return false
  }
}

// No-op when disabled. Never throws.
export function captureClientError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(scrubDeep(context) as Record<string, unknown>)
      Sentry.captureException(err)
    })
  } catch {
    /* telemetry must never break the UI */
  }
}
