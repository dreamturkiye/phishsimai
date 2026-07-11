// ─────────────────────────────────────────────────────────────────────────────
//  EXPRESS ERROR MIDDLEWARE → Sentry + the self-heal pipeline
//
//  The last thing in the middleware chain. Any error that escapes a route lands
//  here, gets captured to Sentry, and is bridged into bug_reports — which is what
//  feeds architectAgent → the (gated) Marcus path.
//
//  Three things this must never do:
//   1. RECURSE. An error raised while handling /api/os/bug-report must not bridge
//      back into a bug report, which would raise another error, and so on.
//   2. HANG. The first occurrence of a new bug triggers one LLM diagnosis inline
//      (the existing pipeline is synchronous). That is bounded here so a failing
//      hot path cannot turn a 500 into a timeout. Repeat occurrences are deduped
//      before the LLM is reached, so they cost one UPDATE.
//   3. SWALLOW THE RESPONSE. Whatever happens in capture, the client still gets a
//      500 — and if headers were already sent, we delegate to Express.
// ─────────────────────────────────────────────────────────────────────────────
import type { ErrorRequestHandler } from 'express'
import { captureServerError, flushSentry, isSentryEnabled } from './sentryServer'
import { captureErrorToBugReport } from './sentryBridge'
import { scrubUrl } from '../../shared/piiScrub'

// Bound the inline diagnosis so an error response is never held hostage by an LLM.
const BRIDGE_TIMEOUT_MS = 10_000

// Paths that must NOT be bridged back into bug_reports (recursion guard).
function isSelfReferential(path: string): boolean {
  return path.startsWith('/api/os/bug-report') || path.startsWith('/api/os/architect')
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[sentry-express] ${label} exceeded ${ms}ms — responding without it`)
          resolve(null)
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const sentryErrorMiddleware: ErrorRequestHandler = async (err, req, res, next) => {
  // Express delegates to its default handler once headers are out. Respect that.
  if (res.headersSent) return next(err)

  const route = scrubUrl(req?.path || req?.url || 'unknown')
  const status = Number((err as any)?.status || (err as any)?.statusCode || 500)

  try {
    // 4xx are client mistakes, not production bugs. Capture 5xx / unclassified only.
    const isServerFault = !Number.isFinite(status) || status >= 500

    if (isServerFault) {
      captureServerError(err, { route, method: req?.method })

      if (!isSelfReferential(route)) {
        await withTimeout(
          captureErrorToBugReport({
            message: (err as any)?.message ? String((err as any).message) : String(err),
            stack: (err as any)?.stack ?? null,
            route,
            severity: 'high',
            source: 'sentry:server',
          }),
          BRIDGE_TIMEOUT_MS,
          'bug_reports bridge',
        )
      }

      if (isSentryEnabled()) await withTimeout(flushSentry(2000), 2500, 'sentry flush')
    }
  } catch (e: any) {
    // Capture failed. That is not the caller's problem — still return the 500.
    console.warn(`[sentry-express] capture failed: ${e?.message}`)
  }

  res.status(Number.isFinite(status) && status >= 400 ? status : 500).json({
    error: 'Internal Server Error',
    // Never echo the raw error to the client — it may carry PII or internals.
    ref: 'logged',
  })
}
