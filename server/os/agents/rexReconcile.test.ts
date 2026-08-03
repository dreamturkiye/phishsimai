// PS-REX-RECONCILE-01 — tests for the gated writer behind Rex's suppression findings.
//
// The property that matters most is the GATE: this is the only code in the org permitted to rewrite
// funnel state, so "denied means nothing was written" has to be true by construction, not by
// convention. A dry run must consult the gate too — a preview that skips the permission check
// describes an action the system would refuse, which is the version a human reads before approving.
import { describe, it, expect } from 'vitest'
import { decideAutonomy, MIN_LEVEL } from '../autonomyGate'

describe('the crm_write gate governs this writer', () => {
  it('requires L4 — the level the spec assigns to CRM writes', () => {
    expect(MIN_LEVEL.crm_write).toBe('l4')
  })

  it('denies crm_write below L4, fail-closed', () => {
    for (const level of ['manual', 'l2', 'l3']) {
      const d = decideAutonomy('crm_write', level)
      expect(d.allowed, `${level} must not permit crm_write`).toBe(false)
      expect(d.reason).toBe('below_min_level:l4')
    }
  })

  it('permits crm_write at L4 and above', () => {
    expect(decideAutonomy('crm_write', 'l4').allowed).toBe(true)
    expect(decideAutonomy('crm_write', 'l5').allowed).toBe(true)
  })

  it('treats an unknown or missing level as manual — a read failure must not become an allow', () => {
    expect(decideAutonomy('crm_write', null).allowed).toBe(false)
    expect(decideAutonomy('crm_write', undefined).allowed).toBe(false)
    expect(decideAutonomy('crm_write', 'l9-superuser').allowed).toBe(false)
  })
})

// Minimal SQL stand-in: records every statement so the tests can assert on what was (not) written.
function fakeSql(responses: any[][] = []) {
  let i = 0
  const fn: any = (strings: TemplateStringsArray, ...vals: any[]) => {
    const text = strings.join('?')
    fn.calls.push(text.replace(/\s+/g, ' ').trim())
    const p: any = Promise.resolve(responses[i++] ?? [])
    p.catch = () => p
    return p
  }
  fn.calls = []
  return fn
}

describe('the plan is read-only', () => {
  it('issues no UPDATE or INSERT while building the evidence', async () => {
    const { planReconciliation } = await import('./rexReconcile')
    const sql = fakeSql([[], []])
    await planReconciliation(sql)
    const writes = sql.calls.filter((c: string) => /^\s*(UPDATE|INSERT|DELETE)/i.test(c))
    expect(writes).toEqual([])
    expect(sql.calls).toHaveLength(2) // exactly the two SELECTs, nothing more
  })
})

describe('correction ordering is load-bearing', () => {
  it('flags suppressed leads BEFORE forcing stages terminal', async () => {
    // Flagging a suppressed lead unsubscribed CREATES a group-A violation. Doing group A first would
    // leave those rows behind for the next run, so one pass would never converge.
    const mod = await import('./rexReconcile')
    const source = (await import('node:fs')).readFileSync(
      new URL('./rexReconcile.ts', import.meta.url).pathname,
      'utf8',
    )
    const flagIdx = source.indexOf('SET unsubscribed = true')
    const stageIdx = source.indexOf("SET pipeline_stage = 'dead'")
    expect(flagIdx).toBeGreaterThan(-1)
    expect(stageIdx).toBeGreaterThan(-1)
    expect(flagIdx).toBeLessThan(stageIdx)
    expect(typeof mod.applyReconciliation).toBe('function')
  })
})

describe('the send-eligibility proof is independent', () => {
  it('re-implements the predicate rather than importing touch2Eligible', async () => {
    // Importing the same function the data is being checked against would make the proof circular —
    // it would agree with itself by construction rather than by observation.
    const source = (await import('node:fs')).readFileSync(
      new URL('./rexReconcile.ts', import.meta.url).pathname,
      'utf8',
    )
    expect(source).not.toMatch(/import[^\n]*touch2Eligible/)
    expect(source).toContain('ps_outreach_suppression')
    expect(source).toContain('NOT EXISTS')
  })

  it('counts nothing when given no addresses', async () => {
    const { countStillSendEligible } = await import('./rexReconcile')
    expect(await countStillSendEligible(fakeSql(), [])).toBe(0)
  })
})
