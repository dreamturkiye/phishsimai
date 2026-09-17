/**
 * LinkedIn founder-preview HTTP dispatch.
 *
 * Production review auto-revise (and curl with CRON_SECRET) hits
 * GET /api/os/sarah-social?action=linkedin-preview&mode=revise&token=…
 * cronSarahSocial used to ignore action/mode/token and always run the Reddit cron.
 * HQ /api/os/hq/social had the real dispatcher. Both routes now share this handler.
 *
 * Publish stays lockout-gated inside publishSarahLinkedInPost — this does not enable
 * public LinkedIn auto-publish.
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

function q(query: Request['query'] | Record<string, unknown>, key: string): string {
  const v = (query as Record<string, unknown>)[key]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v || '').trim()
}

/** Parse query so cron vs HQ share one contract. Bare /sarah-social stays the Reddit cron. */
export function parseLinkedInPreviewDispatch(
  query: Request['query'] | Record<string, unknown>,
  method = 'get',
): LinkedInPreviewDispatch {
  const action = q(query, 'action')
  if (action !== 'linkedin-preview') return { kind: 'cron' }

  const mode = q(query, 'mode') || 'next'
  const token = q(query, 'token')
  const topic = q(query, 'topic') || undefined

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
  const parsed = parseLinkedInPreviewDispatch(req.query, req.method)
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
