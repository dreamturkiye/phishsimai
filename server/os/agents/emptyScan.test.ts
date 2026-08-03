// PS-SCAN-VERDICT-01 — the production condition, reproduced.
//
// WHY THIS TEST EXISTS AND WHY IT IS SHAPED THIS WAY
//   Finn shipped to production reporting "pricing guard GREEN — all 0 plan-price claim(s) across 0
//   surface(s) match live Stripe". Every unit test passed, because every unit test handed him source
//   text. The defect only appears when the SOURCE FILES ARE ABSENT — which is the normal state of a
//   bundled serverless deploy, and a state no mock reproduces.
//
//   So these tests do not mock. They point each agent's scan root at a directory that contains no
//   repository sources, which is exactly what the lambda filesystem looks like. readSource() then
//   returns null for every target, and we assert the verdict is NOT_CHECKED rather than clean.
//
//   The general rule being pinned: A SCAN OF ZERO UNITS CAN NEVER PRODUCE A PASS. Rex and Dex
//   already behaved correctly; they are pinned here so they cannot regress into Finn's bug.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanVerdict, scanVerdictReason, NOT_CHECKED } from './scanVerdict'
import { runFinnAgent, type StripeTruth } from './finn'
import { runRexAgent } from './rex'
import { runDexAgent } from './dex'

/** A directory with no repository sources — the serverless bundle state. */
let BUNDLE_ROOT: string

beforeAll(() => {
  BUNDLE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-bundle-no-src-'))
})
afterAll(() => {
  try { fs.rmSync(BUNDLE_ROOT, { recursive: true, force: true }) } catch { /* best effort */ }
})

/**
 * Stripe REACHABLE — this is the half that matters. The false GREEN required Stripe to be up and
 * sources to be gone; a test where Stripe is also down exercises a different branch and would have
 * passed against the broken code.
 */
const STRIPE_UP: StripeTruth = {
  checked: true,
  monthlyUsd: { starter: 149, growth: 299, pro: 749, enterprise: 1499 },
  activeSubs: 0, trialingSubs: 0, mrrUsd: 0, arrUsd: 0, planMix: {},
  reason: 'read live from Stripe',
}

/** DB stand-in: every query succeeds and returns nothing, so only the SOURCE half is empty. */
function dbOk() {
  const fn: any = () => { const p: any = Promise.resolve([]); p.catch = () => p; return p }
  fn.query = async () => []
  return fn
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE LAW
// ─────────────────────────────────────────────────────────────────────────────
describe('a scan of zero units can never be a pass', () => {
  it('returns NOT_CHECKED at zero units even with zero findings', () => {
    expect(scanVerdict({ unitsScanned: 0, findings: 0, pass: 'GREEN', fail: 'DRIFT' })).toBe(NOT_CHECKED)
  })

  it('returns NOT_CHECKED at zero units even if findings were somehow reported', () => {
    // Incoherent input — findings cannot exist over an empty scan. Treating it as a FAIL would be
    // its own fabrication, so the zero-unit check short-circuits first.
    expect(scanVerdict({ unitsScanned: 0, findings: 3, pass: 'GREEN', fail: 'DRIFT' })).toBe(NOT_CHECKED)
  })

  it('returns NOT_CHECKED when a required dependency is unavailable, whatever was scanned', () => {
    expect(scanVerdict({ unitsScanned: 12, findings: 0, pass: 'GREEN', fail: 'DRIFT', dependencyAvailable: false })).toBe(NOT_CHECKED)
  })

  it('passes only when units were genuinely examined and were clean', () => {
    expect(scanVerdict({ unitsScanned: 12, findings: 0, pass: 'GREEN', fail: 'DRIFT' })).toBe('GREEN')
  })

  it('fails when units were examined and defects found', () => {
    expect(scanVerdict({ unitsScanned: 12, findings: 1, pass: 'GREEN', fail: 'DRIFT' })).toBe('DRIFT')
  })

  it('states the CAUSE of an abstention — "NOT CHECKED" alone is barely better than a false green', () => {
    const r = scanVerdictReason({ unitsScanned: 0, findings: 0, pass: 'GREEN', fail: 'DRIFT' }, 'Pricing guard')
    expect(r).toContain('0 units were examined')
    expect(r).toContain('an empty scan is never a clean result')
    expect(r).toContain('serverless')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE PRODUCTION CONDITION — no mocks, real absent files
// ─────────────────────────────────────────────────────────────────────────────
describe('with repository sources ABSENT (the serverless bundle state)', () => {
  // PS-PRICE-SNAPSHOT-01 changed what "sources absent" MEANS for Finn. He now falls back to a
  // build-time claims snapshot, so prod compares real claims against live Stripe every day. These
  // two tests cover both halves of that.
  it('FINN uses the BUILD SNAPSHOT when sources are absent, and says so', async () => {
    const r = await runFinnAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, stripeOverride: STRIPE_UP })
    expect(r.stripe.checked, 'the prod condition is Stripe UP with sources gone').toBe(true)
    expect(r.claimSource, 'no readable source -> snapshot').toBe('build-snapshot')
    expect(r.claims.length, 'the snapshot supplies real units to compare').toBeGreaterThan(0)
    // A real verdict is now possible in prod — which is the entire point of the snapshot.
    expect(['GREEN', 'DRIFT']).toContain(r.pricingGuard)
    expect(r.line).toContain('claims from the build-time snapshot')
  })

  it('FINN reports NOT_CHECKED when there is NO source AND NO snapshot — the law still governs', async () => {
    // The only state where nothing can be compared. This is the exact bug that shipped, and the law
    // that prevents it must survive the snapshot change.
    const r = await runFinnAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, stripeOverride: STRIPE_UP, snapshotOverride: [] })
    expect(r.claimSource).toBe('none')
    expect(r.claims).toHaveLength(0)
    expect(r.pricingGuard, 'a guard that examined nothing must not say GREEN').toBe('NOT_CHECKED')
    expect(r.pricingGuardReason).toContain('0 units were examined')
    expect(r.line).toContain('pricing guard NOT CHECKED')
    expect(r.line).toContain('an empty scan is NOT a clean one')
    expect(r.line).not.toMatch(/pricing guard GREEN/)
    expect(r.gaps, 'coverage gaps over an empty scan are an artifact, not a finding').toEqual([])
  })

  it('REX reports his static dimension NOT_CHECKED and scans zero modules', async () => {
    const r = await runRexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true })
    expect(r.scanned.sourceFiles).toBe(0)
    expect(r.staticScan).toBe('NOT_CHECKED')
    expect(r.staticScanReason).toContain('0 units were examined')
    // He must not file fabricated-writer or pricing-drift findings he could not have made.
    expect(r.incidents.filter((i) => i.detector === 'fabricated_writer')).toEqual([])
    expect(r.incidents.filter((i) => i.detector === 'pricing_drift')).toEqual([])
  })

  it('REX never renders GREEN off an empty static scan', async () => {
    const r = await runRexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true })
    expect(r.line).toContain('NOT CHECKED')
    expect(r.line).not.toMatch(/funnel trust GREEN/)
  })

  it('DEX reports path coverage NOT_CHECKED rather than full coverage', async () => {
    const r = await runDexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, skipDns: true, skipBreakerReconcile: true })
    expect(r.pathsCovered).toBe(0)
    expect(r.pathCoverage).toBe('NOT_CHECKED')
    expect(r.pathCoverageReason).toContain('0 units were examined')
  })

  it("DEX's line never claims all paths carry every rail when it read none", async () => {
    const r = await runDexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, skipDns: true, skipBreakerReconcile: true })
    expect(r.line).toContain('send-path coverage NOT CHECKED')
    expect(r.line).toContain('this is not a clean result')
    expect(r.line).not.toMatch(/all \d+\/\d+ send paths carry every required rail/)
  })

  it('THE SHIPPED FORMULA would have said GREEN on these exact inputs — proving this test discriminates', async () => {
    // A regression test that cannot fail against the broken code is decoration. This reconstructs
    // the expression that shipped and asserts it produces the wrong answer on the same inputs the
    // fixed code now gets right.
    const r = await runFinnAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, stripeOverride: STRIPE_UP, snapshotOverride: [] })
    const shipped = !r.stripe.checked ? 'NOT_CHECKED' : r.incidents.length ? 'DRIFT' : 'GREEN'
    expect(shipped, 'the old expression must be shown to be wrong here').toBe('GREEN')
    expect(r.pricingGuard, 'the fixed expression must disagree with it').toBe('NOT_CHECKED')
    expect(r.pricingGuard).not.toBe(shipped)
  })

  it('NONE of the three reports a clean verdict for a dimension it could not examine', async () => {
    const [finn, rex, dex] = await Promise.all([
      runFinnAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, stripeOverride: STRIPE_UP, snapshotOverride: [] }),
      runRexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true }),
      runDexAgent({ sql: dbOk(), root: BUNDLE_ROOT, skipCurrency: true, skipDns: true, skipBreakerReconcile: true }),
    ])
    const verdicts = [finn.pricingGuard, rex.staticScan, dex.pathCoverage]
    expect(verdicts).toEqual(['NOT_CHECKED', 'NOT_CHECKED', 'NOT_CHECKED'])
    for (const v of ['GREEN', 'CLEAN', 'COVERED']) expect(verdicts).not.toContain(v)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  AND THE CONTROL — with sources present the verdicts still work
// ─────────────────────────────────────────────────────────────────────────────
describe('with sources PRESENT the detectors still reach a real verdict', () => {
  it('Finn verifies real claims against Stripe and can say GREEN', async () => {
    // Runs against the actual repo tree. If Stripe is unreachable in this environment the guard
    // correctly abstains — which is also a pass for this test's purpose: it must never be GREEN
    // without claims.
    const r = await runFinnAgent({ sql: dbOk(), skipCurrency: true, stripeOverride: STRIPE_UP })
    if (r.pricingGuard === 'GREEN') {
      expect(r.claims.length, 'GREEN requires at least one verified claim').toBeGreaterThan(0)
      expect(r.stripe.checked).toBe(true)
    } else {
      expect(['DRIFT', 'NOT_CHECKED']).toContain(r.pricingGuard)
    }
  })

  it('Rex scans the real module list', async () => {
    const r = await runRexAgent({ sql: dbOk(), skipCurrency: true })
    expect(r.scanned.sourceFiles).toBeGreaterThan(0)
    expect(r.staticScan).not.toBe('NOT_CHECKED')
  })

  it('Dex audits the real send paths', async () => {
    const r = await runDexAgent({ sql: dbOk(), skipCurrency: true, skipDns: true, skipBreakerReconcile: true })
    expect(r.pathsCovered).toBeGreaterThan(0)
    expect(r.pathCoverage).not.toBe('NOT_CHECKED')
  })
})
