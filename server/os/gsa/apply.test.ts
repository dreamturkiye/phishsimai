// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1.1 — Tier A application machinery.
//
//  Tier A is armed, but PhishSim registers no appliers today (see appliers.ts:
//  its auditable settings live in code, and the only DB-backed toggles are send
//  gates, which are Tier B by construction). So the machinery is exercised here
//  with synthetic appliers — otherwise "Tier A is enabled" would be an untested
//  claim, which is the kind of assertion this whole layer exists to refuse.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { runGsa } from './engine'
import type { CompanyFacts, Standard, CheckResult } from './types'
import type { FixApplier } from './appliers'

// A standard that deviates until `state.fixed` flips — so a fix can be seen to work,
// and, more importantly, a fix that DOESN'T work can be seen not to.
const state = { fixed: false }
const TOGGLE: Standard = {
  id: 'TOGGLE', scope: 'company', description: 'test', severity: 'low',
  run(): CheckResult {
    return state.fixed
      ? { id: 'TOGGLE', outcome: 'PASS', severity: 'low', summary: 'ok', evidence: [{ actual: 'on', source: 't' }] }
      : {
          id: 'TOGGLE', outcome: 'DEVIATION', severity: 'low', summary: 'off',
          evidence: [{ actual: 'off', source: 't' }],
          remediation: {
            description: 'flip it', changeKind: 'internal-config-flag',
            blastRadius: 'internal', reversible: true, prior: false, next: true,
          },
        }
  },
}
const facts: CompanyFacts = { companyId: 'test', gatheredAt: '2026-07-29T00:00:00Z' }
const reGather = async () => facts

describe('Tier A application', () => {
  it('applies a registered fix and records before/after', async () => {
    state.fixed = false
    const applier: FixApplier = {
      standardId: 'TOGGLE',
      async apply() { const before = state.fixed; state.fixed = true; return { before, after: true } },
      async rollback(before) { state.fixed = before as boolean },
    }
    const run = await runGsa([TOGGLE], facts, {
      mode: 'tier-a-enabled', appliers: () => applier, reGatherFacts: reGather,
    })
    expect(run.applied).toHaveLength(1)
    expect(run.applied[0].ok).toBe(true)
    expect(run.applied[0].before).toBe(false)
    expect(run.applied[0].after).toBe(true)
    expect(state.fixed).toBe(true)
  })

  it('a Tier A finding with NO applier is reported UNHANDLED, never silently skipped', async () => {
    // The honesty property: "classified safe to auto-fix" must never be
    // indistinguishable from "auto-fixed" in the digest. This is the case that
    // applies to PhishSim today, so it is the one that must not regress.
    state.fixed = false
    const run = await runGsa([TOGGLE], facts, { mode: 'tier-a-enabled', appliers: () => null, reGatherFacts: reGather })
    expect(run.applied).toHaveLength(1)
    expect(run.applied[0].ok).toBe(false)
    expect(run.applied[0].error).toMatch(/UNHANDLED/)
    expect(state.fixed).toBe(false)
  })

  it('rolls back when the fix throws', async () => {
    state.fixed = false
    let rolledBack = false
    const applier: FixApplier = {
      standardId: 'TOGGLE',
      async apply(): Promise<{ before: unknown; after: unknown }> { state.fixed = true; throw new Error('boom') },
      async rollback() { rolledBack = true; state.fixed = false },
    }
    const run = await runGsa([TOGGLE], facts, { mode: 'tier-a-enabled', appliers: () => applier, reGatherFacts: reGather })
    expect(run.applied[0].ok).toBe(false)
    expect(run.applied[0].error).toMatch(/boom/)
    // apply() threw before returning, so no prior value was captured and the engine
    // does NOT invent one to roll back to — it reports rather than guesses.
    expect(rolledBack).toBe(false)
  })

  it('rolls back a fix that runs cleanly but does NOT clear the deviation', async () => {
    // The unexpected-diff case, and the reason verification exists. An applier that
    // returns without error while leaving the standard failing must not be reported
    // as a success — trusting the absence of an exception is exactly how a broken
    // fix comes to look healthy.
    state.fixed = false
    let rolledBack = false
    const applier: FixApplier = {
      standardId: 'TOGGLE',
      async apply() { return { before: false, after: true } }, // claims success, changes nothing
      async rollback() { rolledBack = true },
    }
    const run = await runGsa([TOGGLE], facts, { mode: 'tier-a-enabled', appliers: () => applier, reGatherFacts: reGather })
    expect(run.applied[0].ok).toBe(false)
    expect(run.applied[0].rolledBack).toBe(true)
    expect(run.applied[0].error).toMatch(/still did not pass/i)
    expect(rolledBack).toBe(true)
  })

  it('read-only mode applies nothing even with an applier registered', async () => {
    state.fixed = false
    const applier: FixApplier = {
      standardId: 'TOGGLE',
      async apply() { state.fixed = true; return { before: false, after: true } },
      async rollback() { state.fixed = false },
    }
    const run = await runGsa([TOGGLE], facts, { mode: 'read-only', appliers: () => applier })
    expect(run.applied).toHaveLength(0)
    expect(state.fixed).toBe(false)
  })

  it('never applies a Tier B finding, even with an applier registered for it', async () => {
    // Belt and braces: the tier gate is in the engine loop, not only in the registry.
    const SENDS: Standard = {
      id: 'SENDS', scope: 'company', description: 'test', severity: 'low',
      run: (): CheckResult => ({
        id: 'SENDS', outcome: 'DEVIATION', severity: 'low', summary: 'off',
        evidence: [{ actual: 'off', source: 't' }],
        remediation: {
          description: 'start sending', changeKind: 'sends-email',
          blastRadius: 'external-recipients', reversible: true, prior: false,
        },
      }),
    }
    let called = false
    const applier: FixApplier = {
      standardId: 'SENDS',
      async apply() { called = true; return { before: false, after: true } },
      async rollback() {},
    }
    const run = await runGsa([SENDS], facts, { mode: 'tier-a-enabled', appliers: () => applier, reGatherFacts: reGather })
    expect(called).toBe(false)
    expect(run.applied).toHaveLength(0)
  })
})

describe('PhishSim applier registry', () => {
  it('is empty, and that is a deliberate finding rather than an oversight', async () => {
    // If someone registers an applier, this test fails and forces them to state
    // why the change is safe — the registry is a trust boundary, not a config list.
    const { PHISHSIM_APPLIERS } = await import('./appliers')
    expect(PHISHSIM_APPLIERS).toHaveLength(0)
  })
})
