import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseLinkedInPreviewDispatch,
  handleLinkedInPreview,
  collectOsQuery,
  dispatchSarahSocialRoute,
} from './linkedinPreviewDispatch'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './publicPostingLockout'
import { shouldReviseLinkedInCopy } from './sarahLinkedIn'
import { wantsPricingFirstMarketing, PRICING_FIRST_SUBHEADLINE, marketingImageFromFeedback } from './sarahLinkedInImage'

vi.mock('./sarahLinkedIn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sarahLinkedIn')>()
  return {
    ...actual,
    getNextSarahLinkedInPreview: vi.fn(async () => ({ hook: 'next-preview' })),
    generateSarahLinkedInDraft: vi.fn(async () => ({ hook: 'draft-preview' })),
    reviseSarahLinkedInDraft: vi.fn(async () => ({
      hook: 'revised-preview',
      previewToken: 'newtok',
      previewUrl: 'https://phishsimai.com/preview/social/newtok',
      imageUrl: 'https://phishsimai.com/brand/sarah-linkedin-reference-v2.png',
    })),
    produceSarahLinkedInForApproval: vi.fn(async () => ({ hook: 'final-preview' })),
    queueSarahLinkedInDraft: vi.fn(async () => ({ hook: 'queued-preview' })),
  }
})

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

describe('collectOsQuery — Vercel rewrite can empty req.query', () => {
  it('reads action/mode/token from originalUrl when req.query is empty', () => {
    const q = collectOsQuery({
      query: {},
      originalUrl: '/api/os/sarah-social?action=linkedin-preview&mode=revise&token=tok_live',
      url: '/api/index.js',
    })
    expect(q.action).toBe('linkedin-preview')
    expect(q.mode).toBe('revise')
    expect(q.token).toBe('tok_live')
  })

  it('reads Vercel x-invoke-query when Express query is empty', () => {
    const q = collectOsQuery({
      query: {},
      url: '/api/index.js',
      headers: { 'x-invoke-query': encodeURIComponent('action=linkedin-preview&mode=produce-final&token=abc') },
    })
    expect(q.action).toBe('linkedin-preview')
    expect(q.mode).toBe('produce-final')
    expect(q.token).toBe('abc')
  })
})

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

describe('dispatchSarahSocialRoute — cron Bearer path must not fall through to Reddit', () => {
  it('returns false so the Reddit cron still runs when action is unset', async () => {
    const cronFallback = vi.fn(async () => ({ reddit: { queued: 1 }, linkedinMonitor: {}, linkedinPublish: {} }))
    const res = mockRes()
    const handledPreview = await dispatchSarahSocialRoute(
      { query: {}, method: 'get', body: {} } as any,
      res as any,
      cronFallback,
    )
    expect(handledPreview).toBe(false)
    expect(cronFallback).toHaveBeenCalledTimes(1)
    expect(res.body).toEqual({ ok: true, reddit: { queued: 1 }, linkedinMonitor: {}, linkedinPublish: {} })
  })

  it('mode=revise with token calls reviseSarahLinkedInDraft and never the cron payload', async () => {
    const { reviseSarahLinkedInDraft } = await import('./sarahLinkedIn')
    const cronFallback = vi.fn(async () => ({ reddit: { fromCron: true }, linkedinMonitor: {}, linkedinPublish: {} }))
    const res = mockRes()
    const handledPreview = await dispatchSarahSocialRoute(
      { query: { action: 'linkedin-preview', mode: 'revise', token: 'tok_live' }, method: 'get', body: {} } as any,
      res as any,
      cronFallback,
    )
    expect(handledPreview).toBe(true)
    expect(cronFallback).not.toHaveBeenCalled()
    expect(reviseSarahLinkedInDraft).toHaveBeenCalledWith('tok_live')
    expect(res.body).toMatchObject({ ok: true, preview: { hook: 'revised-preview' } })
    expect(JSON.stringify(res.body)).not.toContain('fromCron')
  })

  it('still revises when query is empty but originalUrl carries action/mode/token', async () => {
    const { reviseSarahLinkedInDraft } = await import('./sarahLinkedIn')
    vi.mocked(reviseSarahLinkedInDraft).mockClear()
    const cronFallback = vi.fn(async () => ({ reddit: { fromCron: true }, linkedinMonitor: {}, linkedinPublish: {} }))
    const res = mockRes()
    const handledPreview = await dispatchSarahSocialRoute(
      {
        query: {},
        method: 'get',
        body: {},
        originalUrl: '/api/os/sarah-social?action=linkedin-preview&mode=revise&token=from_url',
        url: '/api/index.js',
      } as any,
      res as any,
      cronFallback,
    )
    expect(handledPreview).toBe(true)
    expect(cronFallback).not.toHaveBeenCalled()
    expect(reviseSarahLinkedInDraft).toHaveBeenCalledWith('from_url')
  })

  it('mode=produce-final does not return the reddit cron payload', async () => {
    const { produceSarahLinkedInForApproval } = await import('./sarahLinkedIn')
    const cronFallback = vi.fn(async () => ({ reddit: { fromCron: true }, linkedinMonitor: {}, linkedinPublish: {} }))
    const res = mockRes()
    await dispatchSarahSocialRoute(
      { query: { action: 'linkedin-preview', mode: 'produce-final', token: 'tok' }, method: 'get', body: {} } as any,
      res as any,
      cronFallback,
    )
    expect(cronFallback).not.toHaveBeenCalled()
    expect(produceSarahLinkedInForApproval).toHaveBeenCalledWith('tok')
    expect(res.body).toMatchObject({ ok: true, preview: { hook: 'final-preview' } })
  })
})

describe('handleLinkedInPreview — cron Bearer path', () => {
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
    const review = readFileSync('server/os/social/socialPreviewPage.ts', 'utf8')
    expect(handler).toContain('if (path === "/api/os/sarah-social") return routes.cronSarahSocial(req, res)')
    expect(handler).toContain('if (path === "/api/os/hq/social") return routes.hqSarahSocial(req, res)')
    const cronStart = routes.indexOf('export async function cronSarahSocial')
    const cronEnd = routes.indexOf('export async function analyticsCollect')
    const cronBody = routes.slice(cronStart, cronEnd)
    expect(cronBody).toContain('dispatchSarahSocialRoute')
    expect(cronBody.indexOf('dispatchSarahSocialRoute')).toBeLessThan(cronBody.indexOf('runSarahSocialCron'))
    expect(routes).toMatch(/export async function hqSarahSocial[\s\S]*handleLinkedInPreview/)
    expect(review).toContain('await reviseSarahLinkedInDraft(token)')
    expect(review).not.toMatch(/void \(async \(\) => \{[\s\S]*reviseSarahLinkedInDraft/)
  })

  it('does not enable public LinkedIn auto-publish', () => {
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })
})

describe('founder feedback revises copy AND hero when dropping 50–500 seats', () => {
  it('shouldReviseLinkedInCopy is true for pricing/positioning, not only tone|copy|cta', () => {
    expect(shouldReviseLinkedInCopy('drop the 50–500 seats framing; showcase best industry per-seat pricing')).toBe(true)
    expect(shouldReviseLinkedInCopy('pricing-first')).toBe(true)
    expect(shouldReviseLinkedInCopy('soften the CTA')).toBe(true)
    expect(shouldReviseLinkedInCopy('make the laptop bigger')).toBe(false)
  })

  it('marketing default is pricing-first, not 50–500 seats', () => {
    expect(wantsPricingFirstMarketing('remove Built for MSPs who manage 50–500 seats; showcase per-seat pricing')).toBe(true)
    expect(marketingImageFromFeedback('drop 50-500 seats framing').subheadline).toBe(PRICING_FIRST_SUBHEADLINE)
    expect(PRICING_FIRST_SUBHEADLINE).not.toMatch(/50–500 seats/)
    expect(PRICING_FIRST_SUBHEADLINE).toMatch(/60¢/)
  })
})
