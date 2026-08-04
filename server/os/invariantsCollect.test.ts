// ─────────────────────────────────────────────────────────────────────────────
//  PS-INVARIANT-WIRE-01 — the live collector renders NOT_CHECKED honestly, never a false HOLDS.
//
//  The wiring's whole risk is that feeding real inputs re-introduces fabrication: an unmeasurable
//  invariant (no Stripe key, no source files) reporting HOLDS as though it were checked. These tests
//  prove the collector preserves the scanVerdict discipline end to end.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  checkMrrInvariant,
  checkPricingFrozen,
  auditSuppressionRails,
  summariseInvariants,
} from './invariants'
import { NOT_CHECKED } from './agents/scanVerdict'

describe('unmeasurable inputs render NOT_CHECKED, never a false HOLDS', () => {
  it('INV-1 with no Stripe read is NOT_CHECKED, not HOLDS', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 0, stripeChecked: false })
    expect(r.status).toBe(NOT_CHECKED)
    expect(r.status).not.toBe('HOLDS')
    expect(r.halt).toBe(false)
  })

  it('INV-4 with no live prices is NOT_CHECKED, not HOLDS', () => {
    expect(checkPricingFrozen([], 0, false).status).toBe(NOT_CHECKED)
    // Stripe reachable but zero claims compared is ALSO not a pass — the defect #8 shape.
    expect(checkPricingFrozen([], 0, true).status).toBe(NOT_CHECKED)
  })

  it('INV-2 over unreadable source (serverless bundle) is NOT_CHECKED, not HOLDS', () => {
    const r = auditSuppressionRails({})
    expect(r.status).toBe(NOT_CHECKED)
    expect(r.unitsScanned).toBe(0)
  })
})

describe('INV-1 satisfied over an empty funnel reads HOLDS, honestly', () => {
  it('mrr $0 with 0 subs is the invariant SATISFIED, not violated', () => {
    // The user-stated case: mrr $0 iff 0 subs = HOLDS, not VIOLATED.
    const r = checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 0, stripeChecked: true })
    expect(r.status).toBe('HOLDS')
    expect(r.halt).toBe(false)
  })

  it('but mrr > 0 over 0 subs still HALTS even when Stripe was read', () => {
    const r = checkMrrInvariant({ computedMrrUsd: 249, independentMrrUsd: 249, activeSubs: 0, stripeChecked: true })
    expect(r.status).toBe('VIOLATED')
    expect(r.halt).toBe(true)
  })
})

describe('the summary line never overstates', () => {
  it('does NOT say "all hold" when any invariant is unmeasured', () => {
    const s = summariseInvariants([
      checkMrrInvariant({ computedMrrUsd: 0, independentMrrUsd: 0, activeSubs: 0, stripeChecked: false }), // NOT_CHECKED
      checkPricingFrozen([], 12, true), // HOLDS
    ])
    expect(s.halt).toBe(false)
    expect(s.unmeasured).toContain('INV-1')
    expect(s.line).not.toMatch(/all \d+ hold/)
    expect(s.line).toContain('unmeasured is not clean')
  })

  it('says "all hold" ONLY when every invariant was measured and passed', () => {
    const s = summariseInvariants([checkPricingFrozen([], 12, true)])
    expect(s.line).toBe('Invariants: all 1 hold.')
  })

  it('a real violation produces a HALT line, not a soft note', () => {
    const s = summariseInvariants([
      checkMrrInvariant({ computedMrrUsd: 249, independentMrrUsd: 249, activeSubs: 0, stripeChecked: true }),
    ])
    expect(s.halt).toBe(true)
    expect(s.line).toContain('INVARIANT VIOLATION')
    expect(s.line).toContain('HALTED')
  })
})

describe('the collector is wired into Janet, and the ghost is closed', () => {
  const JANET = fs.readFileSync('server/os/janet.ts', 'utf8')

  it("Janet's brief calls collectInvariants and renders the line", () => {
    expect(JANET).toContain('collectInvariants()')
    expect(JANET).toContain('BUSINESS INVARIANTS')
  })

  it('a failed sweep renders NOT CHECKED, never an assumed hold', () => {
    expect(JANET).toContain('the invariant sweep failed to run')
    expect(JANET).toContain('Do not assert the invariants hold')
  })

  it('collectInvariants is exported and imported by exactly one caller (Janet) — no longer a ghost', () => {
    const COLLECT = fs.readFileSync('server/os/invariantsCollect.ts', 'utf8')
    expect(COLLECT).toContain('export async function collectInvariants')
    expect(JANET).toContain("from './invariantsCollect'")
  })
})
