// ─────────────────────────────────────────────────────────────────────────────
//  SENTRY — SERVER CAPTURE (@sentry/node)
//
//  Captures unhandled server errors and routes them into the EXISTING self-heal
//  pipeline (see sentryBridge.ts): Sentry → bug_reports → architectAgent → gate.
//
//  FAIL-SAFE BY CONSTRUCTION. Sentry is observability; it must never be able to
//  take down the thing it is observing:
//    • SENTRY_DSN unset  → every export here is an inert no-op. Nothing throws.
//    • init() throws     → swallowed; the app runs un-instrumented.
//    • capture() throws  → swallowed.
//  Consequently `isSentryEnabled()` is the honest answer to "did init succeed",
//  not merely "was a DSN present".
//
//  PII: every event passes through beforeSend → scrubEvent, which reuses the one
//  shared scrub in piiScrub.ts. No user emails, tokens, cookies, or auth headers
//  leave this process.
//
//  We deliberately do NOT use Sentry.setupExpressErrorHandler / OpenTelemetry
//  auto-instrumentation: this app is bundled by esbuild into a single CJS file for
//  Vercel, and OTel's dynamic requires do not survive that reliably. An explicit
//  Express error middleware (sentryErrorMiddleware) does the same job predictably.
// ─────────────────────────────────────────────────────────────────────────────
import * as Sentry from '@sentry/node'
import { scrubText, scrubUrl, scrubDeep } from '../../shared/piiScrub'

let enabled = false
let initAttempted = false

export function isSentryEnabled(): boolean {
  return enabled
}

// Redact an outbound Sentry event. Runs on EVERY event before it leaves the
// process. Anything unexpected in here must not drop the event silently by
// throwing, so the whole body is guarded — on failure we drop the event (null),
// which is the fail-closed choice: better to lose telemetry than to leak PII.
export function scrubEvent(event: any): any | null {
  try {
    if (!event) return null

    if (event.message) event.message = scrubText(event.message)

    if (Array.isArray(event.exception?.values)) {
      for (const ex of event.exception.values) {
        if (ex?.value) ex.value = scrubText(ex.value)
      }
    }

    if (event.request) {
      // Headers and cookies are pure liability — drop them wholesale.
      delete event.request.headers
      delete event.request.cookies
      delete event.request.data
      if (event.request.url) event.request.url = scrubUrl(event.request.url)
      if (event.request.query_string) delete event.request.query_string
    }

    // Never attach an identifiable user. We want the bug, not the person.
    delete event.user

    if (event.extra) event.extra = scrubDeep(event.extra)
    if (event.tags) event.tags = scrubDeep(event.tags)
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map((b: any) => scrubDeep(b))
    }

    return event
  } catch {
    return null // fail closed — drop rather than risk leaking an unscrubbed event
  }
}

// Idempotent. Safe to call on every cold start. Returns whether Sentry is live.
export function initSentry(): boolean {
  if (initAttempted) return enabled
  initAttempted = true

  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    // The documented, supported, silent path. Not an error.
    console.log('[sentry] SENTRY_DSN unset — error capture disabled (no-op)')
    enabled = false
    return false
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // Errors only. No perf tracing — it is pure cost here.
      tracesSampleRate: 0,
      // Do not let the SDK harvest request bodies / user identity on our behalf.
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
    })
    enabled = true
    console.log('[sentry] server error capture ENABLED')
    return true
  } catch (e: any) {
    console.warn(`[sentry] init failed — continuing without capture: ${e?.message}`)
    enabled = false
    return false
  }
}

// Capture an exception. No-op when Sentry is disabled. NEVER throws.
export function captureServerError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(scrubDeep(context) as Record<string, unknown>)
      Sentry.captureException(err)
    })
  } catch {
    /* observability must never break the request path */
  }
}

// Best-effort flush. Vercel can freeze the lambda the instant a response is sent,
// so an un-flushed event is simply lost. Bounded so it cannot hang a response.
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    /* ignore */
  }
}
