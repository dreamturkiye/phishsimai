// ─────────────────────────────────────────────────────────────────────────────
//  PS-CREDPAGE-01 — the fake login page NEVER captures a credential.
//
//  PhishSim sells credential_harvest simulation; the click path used to end at a
//  training page with no form, so credentialSubmittedAt was structurally always
//  NULL and Janet inferred a "broken capture layer" from a metric that could not
//  be non-zero. This builds the capture the defensible way: record that a
//  submission happened, never what was submitted.
//
//  THE CONSTRAINT, pinned three ways:
//    1. the password <input> has NO name attribute — a browser will not submit it;
//    2. the /submit handler records the event reading ONLY the token;
//    3. even if a crafted client POSTs a `password` field anyway (urlencoded is
//       mounted exactly as prod mounts it), it is never read, logged, or passed to
//       any writer — trackEvent is called with (token, "submit", {ip,ua}) and no
//       body value ever reaches it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'

// Mock the DB layer: capture every trackEvent argument, and let each test choose the attack type.
const trackEvent = vi.fn(async () => {})
let attackType: string | null = 'credential_harvest'
vi.mock('./db', () => ({
  trackEvent: (...args: any[]) => trackEvent(...args),
  getAttackTypeForToken: async () => attackType,
  assignTrainingForToken: async () => null,
}))

import { registerTrackingRoutes } from './email/tracker'

let server: Server
let base = ''
const TOKEN = 'CredPageProofToken000000000000aa' // 32 chars, URL-safe

beforeAll(async () => {
  const app = express()
  // Mounted EXACTLY as _core/index.ts does — so the crafted-field test exercises the real parser.
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ limit: '5mb', extended: true }))
  registerTrackingRoutes(app)
  await new Promise<void>(r => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as any).port}`
})
afterAll(() => new Promise<void>(r => server.close(() => r())))
beforeEach(() => { trackEvent.mockClear(); attackType = 'credential_harvest' })

describe('the login page HTML cannot submit a password', () => {
  it('serves the fake login on /c/ for a credential_harvest simulation', async () => {
    const r = await fetch(`${base}/c/${TOKEN}`, { redirect: 'manual' })
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain('Sign in')
    expect(html).toMatch(/action="\/submit\//)
  })

  it('the password input has type=password but NO name — so the browser never sends it', () => {
    return fetch(`${base}/c/${TOKEN}`).then(async r => {
      const html = await r.text()
      const pw = html.match(/<input[^>]*type="password"[^>]*>/i)?.[0] ?? ''
      expect(pw, 'a password input must exist').toBeTruthy()
      expect(pw, 'the password input must NOT have a name attribute').not.toMatch(/\bname=/i)
    })
  })

  it('the only named submittable fields are email and the fixed marker', () => {
    return fetch(`${base}/c/${TOKEN}`).then(async r => {
      const html = await r.text()
      const names = [...html.matchAll(/<input[^>]*\bname="([^"]+)"/gi)].map(m => m[1]).sort()
      expect(names).toEqual(['email', 'submitted'])
    })
  })
})

describe('a non-credential simulation is unaffected', () => {
  it('/c/ still 302s to training when the attack type is not credential_harvest', async () => {
    attackType = 'link_click'
    const r = await fetch(`${base}/c/${TOKEN}`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`/landing/${TOKEN}`)
  })

  it('defaults to training when the attack type cannot be resolved', async () => {
    attackType = null
    const r = await fetch(`${base}/c/${TOKEN}`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`/landing/${TOKEN}`)
  })
})

describe('/submit records the event but never the credential', () => {
  it('records a submit and redirects to training', async () => {
    const r = await fetch(`${base}/submit/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=victim%40acme.com&submitted=1',
      redirect: 'manual',
    })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`/landing/${TOKEN}`)
    expect(trackEvent).toHaveBeenCalledOnce()
    const [tok, event] = trackEvent.mock.calls[0]
    expect(tok).toBe(TOKEN)
    expect(event).toBe('submit')
  })

  it('NEVER passes a credential to any writer — even a crafted password field is ignored', async () => {
    // A hostile/curious client can always add fields. The guarantee is that the SERVER never
    // reads them: trackEvent must be called with only (token, "submit", {ip,ua}) and no argument
    // may contain the password value anywhere.
    const SECRET = 'hunter2-should-never-be-stored'
    const r = await fetch(`${base}/submit/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `email=victim%40acme.com&password=${encodeURIComponent(SECRET)}&submitted=1`,
      redirect: 'manual',
    })
    expect(r.status).toBe(302)
    const serialized = JSON.stringify(trackEvent.mock.calls)
    expect(serialized).not.toContain(SECRET)
    // And the recorded args are exactly the shape we intend — token, event, and a meta object
    // whose only keys are ip/ua. No body, no password, no email in the tracked payload.
    const [, , meta] = trackEvent.mock.calls[0]
    expect(Object.keys(meta ?? {}).sort()).toEqual(['ip', 'ua'])
  })

  it('rejects a malformed token without recording anything', async () => {
    const r = await fetch(`${base}/submit/short`, { method: 'POST', redirect: 'manual' })
    expect(r.status).toBe(404)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
