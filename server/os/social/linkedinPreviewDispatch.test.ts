import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseLinkedInPreviewDispatch, handleLinkedInPreview } from './linkedinPreviewDispatch'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './publicPostingLockout'

vi.mock('./sarahLinkedIn', () => ({
  getNextSarahLinkedInPreview: vi.fn(async () => ({ hook: 'next-preview' })),
  generateSarahLinkedInDraft: vi.fn(async () => ({ hook: 'draft-preview' })),
  reviseSarahLinkedInDraft: vi.fn(async () => ({ hook: 'revised-preview' })),
  produceSarahLinkedInForApproval: vi.fn(async () => ({ hook: 'final-preview' })),
  queueSarahLinkedInDraft: vi.fn(async () => ({ hook: 'queued-preview' })),
}))

vi.mock('./publishSarahLinkedIn', () => ({
  publishSarahLinkedInPost: vi.fn(async () => {
    throw new Error('publish must stay lockout-gated; test should not call this for revise')
  }),
}))

function mockRes() {
  const res: {
    statusCode: number
    body: unknown
    status: (code: number) => typeof res
    json: (body: unknown) => typeof res
  } = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(body) {
      res.body = body
      return res
    },
  }
  return res
}

describe('parseLinkedInPreviewDispatch', () => {
  it('bare sarah-social (Vercel cron) stays the Reddit/LinkedIn monitor payload', () => {
    expect(parseLinkedInPreviewDispatch({})).toEqual({ kind: 'cron' })
    expect(parseLinkedInPreviewDispatch({ action: 'run' })).toEqual({ kind: 'cron' })
  })

  it('dispatches linkedin-preview modes used by production auto-revise', () => {
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview' })).toEqual({ kind: 'next' })
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview', mode: 'draft', topic: 'MSP trial' })).toEqual({
      kind: 'draft',
      topic: 'MSP trial',
    })
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview', mode: 'revise', token: 'abc' })).toEqual({
      kind: 'revise',
      token: 'abc',
    })
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview', mode: 'produce-final', token: 'abc' })).toEqual({
      kind: 'produce-final',
      token: 'abc',
    })
  })

  it('revise/produce-final without token is 400, not a silent cron no-op', () => {
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview', mode: 'revise' })).toEqual({
      kind: 'error',
      status: 400,
      error: 'token required',
    })
    expect(parseLinkedInPreviewDispatch({ action: 'linkedin-preview', mode: 'produce-final' })).toEqual({
      kind: 'error',
      status: 400,
      error: 'token required',
    })
  })
})

describe('handleLinkedInPreview — cron Bearer path', () => {
  it('returns false so the Reddit cron still runs when action is unset', async () => {
    const res = mockRes()
    const handled = await handleLinkedInPreview({ query: {}, method: 'get', body: {} } as any, res as any)
    expect(handled).toBe(false)
    expect(res.body).toBeNull()
  })

  it('mode=revise with token calls reviseSarahLinkedInDraft (not the cron payload)', async () => {
    const { reviseSarahLinkedInDraft } = await import('./sarahLinkedIn')
    const res = mockRes()
    const handled = await handleLinkedInPreview(
      { query: { action: 'linkedin-preview', mode: 'revise', token: 'tok_live' }, method: 'get', body: {} } as any,
      res as any,
    )
    expect(handled).toBe(true)
    expect(reviseSarahLinkedInDraft).toHaveBeenCalledWith('tok_live')
    expect(res.body).toEqual({ ok: true, preview: { hook: 'revised-preview' } })
  })

  it('mode=draft and default next also dispatch', async () => {
    const { generateSarahLinkedInDraft, getNextSarahLinkedInPreview } = await import('./sarahLinkedIn')
    const draftRes = mockRes()
    await handleLinkedInPreview(
      { query: { action: 'linkedin-preview', mode: 'draft', topic: 'trial' }, method: 'get', body: {} } as any,
      draftRes as any,
    )
    expect(generateSarahLinkedInDraft).toHaveBeenCalledWith('trial')
    const nextRes = mockRes()
    await handleLinkedInPreview(
      { query: { action: 'linkedin-preview' }, method: 'get', body: {} } as any,
      nextRes as any,
    )
    expect(getNextSarahLinkedInPreview).toHaveBeenCalled()
  })
})

describe('cron + HQ both mount the dispatcher; lockout stays on', () => {
  it('cronSarahSocial dispatches before Reddit cron; hqSarahSocial still uses the same handler', () => {
    const routes = readFileSync('server/os/routes.ts', 'utf8')
    const handler = readFileSync('api/handler.ts', 'utf8')
    expect(handler).toContain('if (path === "/api/os/sarah-social") return routes.cronSarahSocial(req, res)')
    expect(handler).toContain('if (path === "/api/os/hq/social") return routes.hqSarahSocial(req, res)')
    const cronStart = routes.indexOf('export async function cronSarahSocial')
    const cronEnd = routes.indexOf('export async function analyticsCollect')
    const cronBody = routes.slice(cronStart, cronEnd)
    expect(cronBody).toContain('handleLinkedInPreview')
    expect(cronBody.indexOf('handleLinkedInPreview')).toBeLessThan(cronBody.indexOf('runSarahSocialCron'))
    expect(routes).toMatch(/export async function hqSarahSocial[\s\S]*handleLinkedInPreview/)
  })

  it('does not enable public LinkedIn auto-publish', () => {
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })
})
