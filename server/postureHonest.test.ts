// ─────────────────────────────────────────────────────────────────────────────
//  PS-POSTURE-HONEST-01 — a customer-facing score may not be invented over zero data.
//
//  THE DEFECT
//    getOrgPostureScore returned a hardcoded 50 in TWO cases: the database being unreachable, and
//    the org having no scored targets. A brand-new trial saw "Security Score 50/100" on the
//    dashboard with nothing behind it — a measured-looking number over an empty denominator,
//    pointed at a paying prospect rather than at an internal brief.
//
//    Same class as truthReport.ts:36 NOT_MEASURED and scanVerdict's zero-units rule. INV-3 exists
//    to halt this shape; it was living in the analytics dashboard the whole time.
//
//  WHY NULL AND NOT 0
//    0/100 is not a safe default — it reads as catastrophic security, which is a worse lie than 50.
//    Both render sites coalesced with `?? 0`, so returning null WITHOUT fixing the UI would have
//    swapped one fabrication for a scarier one. All three layers are asserted below.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const DB = fs.readFileSync('server/db.ts', 'utf8')
const DASH = fs.readFileSync('client/src/pages/Dashboard.tsx', 'utf8')
const ANALYTICS = fs.readFileSync('client/src/pages/Analytics.tsx', 'utf8')

/** The function body, isolated so assertions can't accidentally match neighbouring code. */
const FN = DB.slice(
  DB.indexOf('export async function getOrgPostureScore'),
  DB.indexOf('export async function getUserByEmail'),
)

describe('the server never invents a posture score', () => {
  it('returns number | null, not number', () => {
    expect(FN).toContain('Promise<number | null>')
  })

  it('an org with ZERO scored targets gets null, not 50', () => {
    expect(FN).toMatch(/scores\.length === 0\)\s*return null/)
  })

  it('an unreachable database gets null, not 50', () => {
    expect(FN).toMatch(/!db\)\s*return null/)
  })

  it('the literal 50 default is gone from the function entirely', () => {
    // The exact fabrication being removed. If this returns, the test fails.
    expect(FN).not.toMatch(/return 50/)
  })

  it('still computes honestly when there IS data', () => {
    expect(FN).toContain('Math.round(100 - avg)')
  })
})

describe('neither render site turns null back into a number', () => {
  it('the Dashboard tile says "Not enough data yet" instead of a score', () => {
    expect(DASH).toContain('Not enough data yet')
  })

  it('the Dashboard no longer coalesces the score to 0', () => {
    // `?? 0` here would render "0/100" — catastrophic-looking, and still fabricated.
    expect(DASH).not.toMatch(/postureScore \?\? 0/)
  })

  it('the Dashboard drops the /100 suffix when there is no score', () => {
    // "Not enough data yet/100" would be its own small lie.
    expect(DASH).toMatch(/suffix: analytics\?\.postureScore == null \? "" : "\/100"/)
  })

  it('the Analytics page says so in words and offers the next action', () => {
    expect(ANALYTICS).toContain('Not enough data yet')
    expect(ANALYTICS).toContain('run a campaign to establish a baseline')
  })

  it('the Analytics page no longer coalesces to 0', () => {
    expect(ANALYTICS).not.toMatch(/postureScore \?\? 0/)
  })

  it('neither page carries a hardcoded 50 fallback', () => {
    for (const [name, src] of [['Dashboard', DASH], ['Analytics', ANALYTICS]] as const) {
      expect(src, name).not.toMatch(/postureScore \?\? 50/)
    }
  })
})

describe('both tRPC call sites pass the value through untouched', () => {
  const ROUTERS = fs.readFileSync('server/routers.ts', 'utf8')

  it('neither procedure re-introduces a default on the way out', () => {
    // A `?? 50` or `?? 0` in the router would restore the defect server-side, where the UI fix
    // could not see it. Both sites must hand the null straight to the client.
    // Split on the CALL form, not the bare name — the name also appears once as an import (:45).
    const calls = ROUTERS.split('getOrgPostureScore(').slice(1)
    expect(calls.length).toBe(2) // routers.ts:900 and :1073
    for (const c of calls) {
      const window = c.slice(0, 200)
      expect(window).not.toMatch(/postureScore \?\? \d+/)
    }
  })
})
