import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ARCHITECT_SECRET = 'arch-secret'
  process.env.HQ_SECRET = 'hq-secret'
  process.env.CRON_SECRET = 'cron-secret'
})

vi.mock('./conn', () => ({ getSql: () => () => Promise.resolve([]) }))
vi.mock('./marcusBreaker', () => ({
  guardMarcusAllowed: async () => true,
  guardMarcusDiff: async () => ({ verdict: 'allow', analysis: {} }),
  recordMarcusOutcome: async () => {},
  fileSetToDiff: () => [],
  makeMarcusBreakerDeps: () => ({}),
}))
vi.mock('./telegram', () => ({ sendTelegram: async () => ({ ok: true }) }))
vi.mock('./marcus', () => ({
  GROQ_ARCHITECT_MODEL: 'test-model',
  MARCUS_SYSTEM: 'test',
  buildMarcusCodePrompt: () => 'test prompt',
  getMarcusMemoryContext: async () => '',
}))

import { architectCode, isArchitectCodeAuthorized } from './architectCode'

function mockRes() {
  const r: { statusCode: number; body: unknown; status: (c: number) => typeof r; json: (b: unknown) => typeof r } = {
    statusCode: 200,
    body: null,
    status(c: number) { r.statusCode = c; return r },
    json(b: unknown) { r.body = b; return r },
  }
  return r
}

describe('isArchitectCodeAuthorized — HQ watcher must not 401', () => {
  it('accepts x-os-secret matching HQ_SECRET (the pending-queue header)', () => {
    expect(isArchitectCodeAuthorized({
      headers: { 'x-os-secret': 'hq-secret' },
      query: {},
      body: {},
    })).toBe(true)
  })

  it('accepts x-hq-secret and Bearer CRON_SECRET', () => {
    expect(isArchitectCodeAuthorized({ headers: { 'x-hq-secret': 'hq-secret' } })).toBe(true)
    expect(isArchitectCodeAuthorized({ headers: { authorization: 'Bearer cron-secret' } })).toBe(true)
  })

  it('accepts query/body ARCHITECT_SECRET (legacy watcher)', () => {
    expect(isArchitectCodeAuthorized({ query: { secret: 'arch-secret' }, body: {} })).toBe(true)
    expect(isArchitectCodeAuthorized({ query: {}, body: { secret: 'arch-secret' } })).toBe(true)
  })

  it('rejects a wrong secret', () => {
    expect(isArchitectCodeAuthorized({
      headers: { 'x-os-secret': 'nope' },
      query: { secret: 'also-nope' },
      body: { secret: 'still-nope' },
    })).toBe(false)
  })

  it('architectCode returns 401 before any generation when unauthorized', async () => {
    const res = mockRes()
    await architectCode(
      { headers: { 'x-os-secret': 'wrong' }, query: {}, body: { task: 'Fix the failing guard in the handler' } } as any,
      res as any,
    )
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })
})
