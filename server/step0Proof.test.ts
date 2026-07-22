// STEP 0 — end-to-end proof harness for the campaign send path.
// TEMPORARY: delete after the launch fix lands. Exercises the REAL route handlers and the
// REAL DNS resolver. No mocks except the DB (tracking writes were proven separately against
// prod inside a rolled-back transaction).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'

vi.mock('./db', () => ({ trackEvent: vi.fn(async () => {}) }))

import { registerTrackingRoutes } from './email/tracker'
import { verifyDomainTxt, buildVerificationToken, txtMatches, flattenTxt } from './lib/domainVerify'

let server: Server
let base = ''

beforeAll(async () => {
  const app = express()
  registerTrackingRoutes(app) // mounted EXACTLY as productApiMount.ts / _core/index.ts do
  await new Promise<void>(r => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as any).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const TOKEN = 'Step0ProofToken0000000000000000a' // 32 chars, URL-safe alphabet

describe('tracking routes (never executed in prod — 0 campaign_results rows ever)', () => {
  it('/t/:token returns a 1x1 GIF and does not cache', async () => {
    const r = await fetch(`${base}/t/${TOKEN}`)
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('image/gif')
    expect(r.headers.get('cache-control')).toContain('no-store')
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('/c/:token 302-redirects to the landing page', async () => {
    const r = await fetch(`${base}/c/${TOKEN}`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`/landing/${TOKEN}`)
  })

  it('/landing/:token renders the training page', async () => {
    const r = await fetch(`${base}/landing/${TOKEN}`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('You Clicked a Simulated Phishing Link')
  })

  it('rejects a malformed token on /c/ and /landing/', async () => {
    expect((await fetch(`${base}/c/../../etc/passwd`, { redirect: 'manual' })).status).toBe(404)
    expect((await fetch(`${base}/landing/short`)).status).toBe(404)
  })

  // REGRESSION (PS-TRACK-01): the report control used to be <a href> (a GET) against a
  // POST-only route, so it 404'd and reportedAt could never be set by a real user.
  it('landing page "Report" control posts to the report endpoint and succeeds', async () => {
    const html = await (await fetch(`${base}/landing/${TOKEN}`)).text()
    const action = html.match(/<form[^>]+action="(\/api\/report\/[^"]+)"/)?.[1]
    expect(action, 'report control must be a FORM (GET is prefetched by scanners)').toBeTruthy()
    expect(html).not.toMatch(/href="\/api\/report\//)
    const r = await fetch(`${base}${action}`, { method: 'POST' })
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('Thank You')
  })

  it('report endpoint reports FAILURE when the write fails — never a false thank-you', async () => {
    const { trackEvent } = await import('./db')
    vi.mocked(trackEvent).mockRejectedValueOnce(new Error('db down'))
    const r = await fetch(`${base}/api/report/${TOKEN}`, { method: 'POST' })
    expect(r.status).toBe(500)
    const body = await r.text()
    expect(body).toContain('Could Not Record')
    expect(body).not.toContain('Thank You')
  })
})

describe('domain verification against the REAL DNS resolver', () => {
  // REGRESSION (PS-VERIFY-01): a domain with ZERO TXT records makes node's resolveTxt throw
  // ENODATA. That was reported as 'dns_lookup_failed' — telling a customer mid-onboarding
  // their DNS was broken when they simply had not added the record yet.
  // Injected, not live: phishsimai.com had zero TXT records when this bug was found, but a
  // record has since been published, so asserting against real DNS made the test depend on
  // mutable external state and it broke the moment the domain was enrolled.
  it('ENODATA (domain resolves, no TXT records) says txt_not_found, not dns_lookup_failed', async () => {
    const enodata = Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' })
    const res = await verifyDomainTxt('no-txt.example', buildVerificationToken(), async () => { throw enodata })
    expect(res).toBe('txt_not_found')
  })

  it('real DNS still resolves and grades phishsimai.com without throwing', async () => {
    const res = await verifyDomainTxt('phishsimai.com', buildVerificationToken())
    console.log('  [real DNS] phishsimai.com ->', res)
    // A wrong token must never pass, whatever is published today.
    expect(['txt_not_found', 'token_mismatch']).toContain(res)
  })

  it('a genuinely unresolvable domain still fails closed', async () => {
    const res = await verifyDomainTxt('nx-does-not-exist-phishsim-0x1.example', buildVerificationToken())
    expect(res).toBe('dns_lookup_failed')
  })

  it('an exact token match verifies (injected resolver — the positive path)', async () => {
    const token = buildVerificationToken()
    const res = await verifyDomainTxt('acme.test', token, async () => [['unrelated'], [token]])
    expect(res).toBe('verified')
  })

  it('a different phishsim token is a mismatch, not a pass', async () => {
    const res = await verifyDomainTxt('acme.test', buildVerificationToken(), async () => [[buildVerificationToken()]])
    expect(res).toBe('token_mismatch')
  })

  it('TXT chunk reassembly works (DNS splits >255-char values)', () => {
    const token = buildVerificationToken()
    const mid = Math.floor(token.length / 2)
    expect(txtMatches([[token.slice(0, mid), token.slice(mid)]], token)).toBe(true)
    expect(flattenTxt([['a', 'b']])).toEqual(['ab'])
  })
})
