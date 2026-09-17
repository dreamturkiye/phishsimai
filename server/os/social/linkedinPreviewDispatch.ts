/**
 * LinkedIn founder-preview HTTP dispatch.
 *
 * Live 2026-09-17: GET /api/os/sarah-social?action=linkedin-preview&mode=revise
 * with Bearer CRON_SECRET returned the Reddit cron payload because:
 *   1. cronSarahSocial never read action/mode/token (HQ-only dispatcher).
 *   2. Vercel rewrite to /api/index.js can leave Express req.query empty while
 *      the original query still sits on originalUrl / x-invoke-query.
 *
 * Both cron and HQ routes share handleLinkedInPreview. Publish stays lockout-gated.
 */
import type { Request, Response } from 'express'

export type LinkedInPreviewDispatch =
  | { kind: 'cron' }
  | { kind: 'error'; status: number; error: string }
  | { kind: 'draft'; topic?: string }
  | { kind: 'revise'; token: string }
  | { kind: 'produce-final'; token: string }
  | { kind: 'publish'; token: string }
  | { kind: 'queue'; topic?: string; method: string }
  | { kind: 'next' }

function assignQuery(out: Record<string, string>, key: string, v: unknown) {
  if (v == null || v === '') return
  if (Array.isArray(v)) {
    assignQuery(out, key, v[0])
    return
  }
  if (typeof v === 'object') return
  const s = String(v).trim()
  if (s) out[key] = s
}

function parseSearch(search: string, out: Record<string, string>) {
  const qs = search.startsWith('?') ? search.slice(1) : search
  if (!qs) return
  const sp = new URLSearchParams(qs.split('#')[0])
  for (const [k, v] of sp.entries()) assignQuery(out, k, v)
}

/**
 * Merge query from Express, the original URL, and Vercel's x-invoke-query.
 * A rewrite to /api/index.js can drop req.query while leaving the string on originalUrl.
 */
export function collectOsQuery(req: {
  query?: Record<string, unknown>
  url?: string
  originalUrl?: string
  headers?: Record<string, unknown>
  body?: Record<string, unknown>
}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.query || {})) assignQuery(out, k, v)

  for (const src of [req.originalUrl, req.url]) {
    if (typeof src !== 'string' || !src.includes('?')) continue
    parseSearch(src.slice(src.indexOf('?')), out)
  }

  const invoke = req.headers?.['x-invoke-query']
  if (typeof invoke === 'string' && invoke.trim()) {
    try {
      const decoded = decodeURIComponent(invoke)
      if (decoded.startsWith('{')) {
        const obj = JSON.parse(decoded) as Record<string, unknown>
        for (const [k, v] of Object.entries(obj)) assignQuery(out, k, v)
      } else {
        parseSearch(decoded, out)
      }
    } catch {
      /* ignore malformed invoke query */
    }
  }

  if (req.body && typeof req.body === 'object') {
    for (const k of ['action', 'mode', 'token', 'topic'] as const) {
      assignQuery(out, k, req.body[k])
    }
  }
  return out
}

/** Parse query so cron vs HQ share one contract. Bare /sarah-social stays the Reddit cron. */
export function parseLinkedInPreviewDispatch(
  query: Request['query'] | Record<string, unknown>,
  method = 'get',
): LinkedInPreviewDispatch {
  const collected = collectOsQuery({ query: query as Record<string, unknown> })
  const action = collected.action || ''
  if (action !== 'linkedin-preview') return { kind: 'cron' }

  const mode = collected.mode || 'next'
  const token = collected.token || ''
  const topic = collected.topic || undefined

  if (mode === 'draft') return { kind: 'draft', topic }
  if (mode === 'revise') {
    if (!token) return { kind: 'error', status: 400, error: 'token required' }
    return { kind: 'revise', token }
  }
  if (mode === 'produce-final') {
    if (!token) return { kind: 'error', status: 400, error: 'token required' }
    return { kind: 'produce-final', token }
  }
  if (mode === 'publish') {
    if (!token) return { kind: 'error', status: 400, error: 'token required' }
    return { kind: 'publish', token }
  }
  if (mode === 'queue') return { kind: 'queue', topic, method: method.toLowerCase() }
  return { kind: 'next' }
}

/**
 * Handle action=linkedin-preview. Returns true when this request was a preview
 * dispatch (response already sent). Returns false when the caller should run
 * the default Reddit/LinkedIn cron payload.
 */
export async function handleLinkedInPreview(req: Request, res: Response): Promise<boolean> {
  const query = collectOsQuery(req as unknown as Parameters<typeof collectOsQuery>[0])
  const parsed = parseLinkedInPreviewDispatch(query, req.method)
  if (parsed.kind === 'cron') return false
  if (parsed.kind === 'error') {
    res.status(parsed.status).json({ error: parsed.error })
    return true
  }

  const {
    getNextSarahLinkedInPreview,
    generateSarahLinkedInDraft,
    queueSarahLinkedInDraft,
  } = await import('./sarahLinkedIn')

  if (parsed.kind === 'draft') {
    res.json({ ok: true, preview: await generateSarahLinkedInDraft(parsed.topic) })
    return true
  }
  if (parsed.kind === 'revise') {
    const { reviseSarahLinkedInDraft } = await import('./sarahLinkedIn')
    res.json({ ok: true, preview: await reviseSarahLinkedInDraft(parsed.token) })
    return true
  }
  if (parsed.kind === 'produce-final') {
    const { produceSarahLinkedInForApproval } = await import('./sarahLinkedIn')
    res.json({ ok: true, preview: await produceSarahLinkedInForApproval(parsed.token) })
    return true
  }
  if (parsed.kind === 'publish') {
    const { publishSarahLinkedInPost } = await import('./publishSarahLinkedIn')
    res.json({ ok: true, result: await publishSarahLinkedInPost(parsed.token) })
    return true
  }
  if (parsed.kind === 'queue') {
    if (parsed.method !== 'post') {
      res.status(400).json({ error: 'queue requires POST' })
      return true
    }
    const topic = (req.body?.topic as string | undefined) || parsed.topic
    res.json({ ok: true, preview: await queueSarahLinkedInDraft(topic) })
    return true
  }

  res.json({ ok: true, preview: await getNextSarahLinkedInPreview() })
  return true
}

/** Cron Bearer path: preview dispatch first; Reddit/LinkedIn monitor only when action is unset. */
export async function dispatchSarahSocialRoute(
  req: Request,
  res: Response,
  cronFallback: () => Promise<{ reddit: unknown; linkedinMonitor: unknown; linkedinPublish: unknown }>,
): Promise<boolean> {
  if (await handleLinkedInPreview(req, res)) return true
  const payload = await cronFallback()
  res.json({ ok: true, ...payload })
  return false
}
