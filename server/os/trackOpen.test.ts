// ─────────────────────────────────────────────────────────────────────────────
//  PS-OPEN-TRACK-VALIDATE-01 — validating PS-OPEN-TRACK-01's data capture.
//
//  Two things needed proving, not just reading:
//   1. Data capture: a valid open token must produce exactly the UPDATE that
//      0030_ps_outreach_leads_open_tracking.sql's columns expect — COALESCE on
//      first_opened_at, unconditional bump on last_opened_at/open_count, scoped by
//      LOWER(email) — and a bad/garbage/missing token must never reach the DB at all
//      (same fail-open contract as unsubscribe.ts).
//   2. Latency: the gap between the open event landing and the write finishing is
//      now logged (t0 captured before decode, ms computed after the UPDATE settles,
//      success or failure) so that gap is actually measurable in prod logs instead of
//      being an unverified assumption.
//
//  Both paths must still return the 1x1 GIF with Cache-Control: no-store — the
//  recipient's mail client gets a valid image no matter what happened server-side.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'

const queries: string[] = []
const params: any[][] = []
let failNextWrite = false

vi.mock('./conn', () => ({
  getSql: () => {
    const fn = async (strings: TemplateStringsArray, ...vals: any[]) => {
      queries.push(strings.join(' ? ').replace(/\s+/g, ' ').trim())
      params.push(vals)
      if (failNextWrite) throw new Error('write failed')
      return []
    }
    return fn as any
  },
}))

const { trackOpenPixel } = await import('./trackOpen')

function token(email: string): string {
  return Buffer.from(email).toString('base64url')
}

function fakeReq(query: Record<string, string>): any {
  return { query }
}

function fakeRes(): any {
  const headers: Record<string, string> = {}
  return {
    headers,
    statusCode: undefined as number | undefined,
    body: undefined as Buffer | undefined,
    setHeader(name: string, value: string) { headers[name] = value },
    status(code: number) { this.statusCode = code; return this },
    send(body: Buffer) { this.body = body; return this },
  }
}

beforeEach(() => {
  queries.length = 0
  params.length = 0
  failNextWrite = false
  vi.restoreAllMocks()
})

describe('trackOpenPixel — data capture', () => {
  it('a valid token issues the exact UPDATE the migration expects, scoped by lowercased email', async () => {
    const req = fakeReq({ e: token('Lead@Example.com') })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    const q = queries.find(s => /UPDATE ps_outreach_leads/.test(s))!
    expect(q).toMatch(/first_opened_at\s*=\s*COALESCE\(first_opened_at/)
    expect(q).toMatch(/last_opened_at\s*=/)
    expect(q).toMatch(/open_count\s*=\s*open_count \+ 1/)
    expect(q).toMatch(/WHERE LOWER\(email\) = LOWER\(/)
    // params: [ts, ts, email] in source order — the email must be the actual address, unmangled.
    expect(params.at(-1)).toContain('Lead@Example.com')
  })

  it('always returns the 1x1 GIF with no-store caching, on a successful write', async () => {
    const req = fakeReq({ e: token('lead@example.com') })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('image/gif')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.body).toBeInstanceOf(Buffer)
    expect(res.body!.length).toBeGreaterThan(0)
  })

  it('a garbage token never reaches the database, but still serves the pixel', async () => {
    const req = fakeReq({ e: 'not-valid-base64url-email' })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    expect(queries.length).toBe(0)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('image/gif')
  })

  it('a missing token never reaches the database, but still serves the pixel', async () => {
    const req = fakeReq({})
    const res = fakeRes()
    await trackOpenPixel(req, res)

    expect(queries.length).toBe(0)
    expect(res.statusCode).toBe(200)
  })

  it('a DB write failure is swallowed — the recipient still gets a valid pixel', async () => {
    failNextWrite = true
    const req = fakeReq({ e: token('lead@example.com') })
    const res = fakeRes()
    await expect(trackOpenPixel(req, res)).resolves.toBeUndefined()

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('image/gif')
  })
})

describe('trackOpenPixel — write latency is measured', () => {
  it('logs a numeric latency on a successful write, covering decode through commit', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const req = fakeReq({ e: token('lead@example.com') })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    const call = logSpy.mock.calls.find(args => String(args[0]).includes('[trackOpen] write ok'))
    expect(call).toBeDefined()
    const latencyArg = call!.find(a => typeof a === 'string' && a.startsWith('latency_ms=')) as string
    expect(latencyArg).toBeDefined()
    const ms = Number(latencyArg.split('=')[1])
    expect(Number.isFinite(ms)).toBe(true)
    expect(ms).toBeGreaterThanOrEqual(0)
  })

  it('logs a numeric latency on a failed write too — a failure must stay measurable', async () => {
    failNextWrite = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = fakeReq({ e: token('lead@example.com') })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    const call = errSpy.mock.calls.find(args => String(args[0]).includes('[trackOpen] write FAILED'))
    expect(call).toBeDefined()
    const latencyArg = call!.find(a => typeof a === 'string' && a.startsWith('latency_ms=')) as string
    expect(latencyArg).toBeDefined()
    expect(Number.isFinite(Number(latencyArg.split('=')[1]))).toBe(true)
  })

  it('does not log a write latency when there is no email to write (fail-open path is silent)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = fakeReq({ e: 'garbage' })
    const res = fakeRes()
    await trackOpenPixel(req, res)

    expect(logSpy.mock.calls.some(args => String(args[0]).includes('[trackOpen]'))).toBe(false)
    expect(errSpy.mock.calls.some(args => String(args[0]).includes('[trackOpen]'))).toBe(false)
  })
})
