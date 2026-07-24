// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEPLOY-VERIFY-01 — the writer + the honest posture probe, together.
//
//  Shipped as a pair on purpose. The honest half (a day with no verification is
//  `unmeasured`) makes posture probe 7 able to FAIL; the writer half ensures a
//  genuinely-verified day is measured, so the fix does not permanently strand
//  L5.7 the way shipping the honest half alone would (the PS-POSTURE-02 lesson).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { judgeDeployHtml, probeDeployTarget, EXPECTED_DOMAIN } from './deployVerify'
import { computeDayCounters } from './posture'

const OUR_HTML = `<!doctype html><title>PhishSim AI — phishing simulation for MSPs</title><body>PhishSim</body>`

describe('judgeDeployHtml — the three properties', () => {
  it('our own app: brand present, no cross-product markers', () => {
    const ev = judgeDeployHtml(200, OUR_HTML, `https://${EXPECTED_DOMAIN}/`)
    expect(ev.brandPresent).toBe(true)
    expect(ev.crossHits).toEqual([])
  })

  it('flags ScrollFuel content served at our domain — the cross-wiring case', () => {
    const ev = judgeDeployHtml(200, `<title>ScrollFuel</title><body>fanvue creators</body>`, null)
    expect(ev.crossHits).toContain('scrollfuel')
    expect(ev.crossHits).toContain('fanvue')
  })

  it('flags the wrong app even when it is NOT the other product (no brand at all)', () => {
    const ev = judgeDeployHtml(200, `<title>Vercel</title><body>The deployment could not be found</body>`, null)
    expect(ev.brandPresent).toBe(false)
    expect(ev.crossHits).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(judgeDeployHtml(200, 'PHISHSIM', null).brandPresent).toBe(true)
    expect(judgeDeployHtml(200, 'ScRoLlFuEl', null).crossHits).toContain('scrollfuel')
  })
})

describe('probeDeployTarget — a transient failure is UNMEASURED, never a mismatch', () => {
  const okFetch = (status: number, html: string) =>
    (async () => ({ status, url: `https://${EXPECTED_DOMAIN}/`, text: async () => html })) as any

  it('network error → measured:false (no row will be written)', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED') }) as any
    try {
      const v = await probeDeployTarget()
      expect(v.measured).toBe(false)
      if (!v.measured) expect(v.reason).toMatch(/unreachable/)
    } finally { globalThis.fetch = orig }
  })

  it('5xx → measured:false (prod unwell is not prod being the wrong app)', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = okFetch(503, 'error')
    try {
      const v = await probeDeployTarget()
      expect(v.measured).toBe(false)
    } finally { globalThis.fetch = orig }
  })

  it('200 with our app → measured MATCH', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = okFetch(200, OUR_HTML)
    try {
      const v = await probeDeployTarget()
      expect(v.measured).toBe(true)
      if (v.measured) expect(v.match).toBe(true)
    } finally { globalThis.fetch = orig }
  })

  it('200 serving ScrollFuel → measured MISMATCH', async () => {
    const orig = globalThis.fetch
    globalThis.fetch = okFetch(200, '<title>ScrollFuel</title>')
    try {
      const v = await probeDeployTarget()
      expect(v.measured).toBe(true)
      if (v.measured) { expect(v.match).toBe(false); expect(v.reason).toMatch(/CROSS-WIRED/) }
    } finally { globalThis.fetch = orig }
  })
})

// ── the honest half: posture probe 7 now blocks on absence ───────────────────
function sqlWith(deployRows: any[], birth: string | null = '2026-07-24') {
  // A tiny fake that returns [{n}] counts. Everything not about deploy_verifications returns 0,
  // and metrics returns 1 so the ONLY thing under test is the deploy probe. `birth` is the
  // instrument-birth date returned by the MIN(checked_at) query (PS-DEPLOY-VERIFY-02).
  return (async (strings: TemplateStringsArray) => {
    const q = strings.join(' ')
    if (/MIN\(checked_at\)/.test(q)) return [{ birth }]
    if (/deploy_verifications/.test(q) && /match=false/.test(q)) return [{ n: deployRows.filter(r => r.match === false).length }]
    if (/deploy_verifications/.test(q)) return [{ n: deployRows.length }]
    if (/metrics_daily/.test(q)) return [{ n: 1 }]
    return [{ n: 0 }]
  }) as any
}

describe('computeDayCounters — a day with no deploy verification is unmeasured', () => {
  it('UNMEASURED (blocks) when the table has no row for the day', async () => {
    const v = await computeDayCounters(sqlWith([]), 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(false)
    expect(v.unmeasured.join(' ')).toMatch(/deploy: no deploy-target verification/)
  })

  it('MEASURED clean when the day has a match=true row and nothing else is wrong', async () => {
    const v = await computeDayCounters(sqlWith([{ match: true }]), 'phishsimai', '2026-07-24')
    expect(v.unmeasured.join(' ')).not.toMatch(/deploy:/)
    expect(v.clean).toBe(true)
  })

  it('VIOLATION when the day has a match=false row', async () => {
    const v = await computeDayCounters(sqlWith([{ match: false }, { match: true }]), 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(false)
    expect(v.violations.join(' ')).toMatch(/unverified deploy/)
  })
})

// PS-DEPLOY-VERIFY-02 — the instrument is not retroactive. A day BEFORE the writer's first row
// must not be marked unmeasured, or recomputing any pre-writer day silently voids it — which is
// exactly how the streak's 07-23 baseline got broken the day the writer shipped.
describe('computeDayCounters — the deploy criterion does not reach backwards', () => {
  it('EXEMPTS a day before the instrument was born (07-23 vs writer birth 07-24)', async () => {
    // No deploy rows for 07-23, birth is 07-24: pre-instrument, so NOT unmeasured.
    const v = await computeDayCounters(sqlWith([], '2026-07-24'), 'phishsimai', '2026-07-23')
    expect(v.unmeasured.join(' ')).not.toMatch(/deploy:/)
    expect(v.clean).toBe(true)
  })

  it('still BLOCKS a day at/after birth that has no row (a real outage, not pre-instrument)', async () => {
    const v = await computeDayCounters(sqlWith([], '2026-07-24'), 'phishsimai', '2026-07-25')
    expect(v.clean).toBe(false)
    expect(v.unmeasured.join(' ')).toMatch(/deploy: no deploy-target verification/)
  })

  it('EXEMPTS every day when the writer has never run (birth = null) — no criterion from a dead instrument', async () => {
    const v = await computeDayCounters(sqlWith([], null), 'phishsimai', '2026-07-24')
    expect(v.unmeasured.join(' ')).not.toMatch(/deploy:/)
  })
})
