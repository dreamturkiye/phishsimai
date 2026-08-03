// ─────────────────────────────────────────────────────────────────────────────
//  PS-REFLECT-01 — the reflection loop, and the rule that it may not learn from nothing.
//
//  THE GUARANTEE THIS FILE EXISTS FOR
//    An agent reflecting over 0 outcomes and emitting a "lesson" is the exact fabrication removed
//    all session: a claim with no measurement behind it, wearing the costume of learning. It is
//    worse than the metric version, because a fabricated lesson PERSISTS and then steers every
//    later decision that recalls it.
//
//    Tonight nearly every agent has 0 real outcomes — 0 replies, 0 trials, 0 conversions. So the
//    correct output for almost the whole roster is "insufficient data — no adjustment", and this
//    test is what proves the loop produces that instead of inventing something to look alive.
//
//  ORDER OF WRITING: this file was written BEFORE reflection.ts. The n<30 case is the contract;
//  the module exists to satisfy it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  reflectOnOutcomes,
  MIN_OUTCOMES,
  PROTECTED_DIMENSIONS,
  type Outcome,
} from './reflection'

/** n trials of one key, `wins` of them successful. */
function trials(dimension: string, key: string, kind: Outcome['kind'], n: number, wins: number): Outcome[] {
  return Array.from({ length: n }, (_, i) => ({ dimension, key, kind, won: i < wins }))
}

describe('THE CLIFF — insufficient data produces NOTHING, never an invented adjustment', () => {
  it('an agent with ZERO outcomes reflects nothing and says so', () => {
    const r = reflectOnOutcomes({ agentId: 'vera', outcomes: [] })
    expect(r.n).toBe(0)
    expect(r.sufficient).toBe(false)
    expect(r.adjustments).toEqual([])
    expect(r.lesson).toContain('insufficient data')
    expect(r.lesson).toContain('no adjustment')
  })

  it('does not dress zero up as a rate, a score, or a finding', () => {
    const r = reflectOnOutcomes({ agentId: 'vera', outcomes: [] })
    // No percentage anywhere. 0/0 is not 0%, and "0% win rate" over nothing is the fabrication.
    expect(r.lesson).not.toMatch(/\d+(\.\d+)?%/)
    expect(r.lesson).not.toMatch(/\bwin rate\b/i)
  })

  it('refuses at n = MIN_OUTCOMES - 1 and reports the count honestly', () => {
    const r = reflectOnOutcomes({
      agentId: 'mason',
      outcomes: trials('variant', 'a', 'conversion', MIN_OUTCOMES - 1, 20),
    })
    expect(r.n).toBe(MIN_OUTCOMES - 1)
    expect(r.sufficient).toBe(false)
    expect(r.adjustments).toEqual([])
    expect(r.lesson).toContain(`${MIN_OUTCOMES - 1}`) // the real count, stated as a count
  })

  it('every agent on the roster reflects nothing when its data is empty', () => {
    for (const a of ['aria', 'dex', 'finn', 'mason', 'nova', 'rex', 'scout', 'vera']) {
      const r = reflectOnOutcomes({ agentId: a, outcomes: [] })
      expect(r.adjustments, a).toEqual([])
      expect(r.sufficient, a).toBe(false)
    }
  })

  it('a sub-threshold KEY earns no adjustment even when the agent is over threshold overall', () => {
    // 60 outcomes total, but split so neither key reaches 30 on its own. Law #2: no rate under
    // n=30. A comparison between two under-powered keys is exactly how a losing variant gets
    // promoted on noise.
    const r = reflectOnOutcomes({
      agentId: 'aria',
      outcomes: [...trials('variant', 'a', 'engagement', 29, 29), ...trials('variant', 'b', 'engagement', 29, 0)],
    })
    expect(r.n).toBe(58)
    expect(r.sufficient).toBe(true)      // the AGENT has enough to look
    expect(r.adjustments).toEqual([])    // but no KEY has enough to judge
    expect(r.lesson).toContain('no key reached')
  })
})

describe('WITH REAL DATA — it proposes, and the proposal is traceable', () => {
  const winner = trials('variant', 'price_led', 'conversion', 40, 24)   // 60%
  const loser = trials('variant', 'compliance_led', 'conversion', 40, 4) // 10%

  it('promotes the winner and retires the loser', () => {
    const r = reflectOnOutcomes({ agentId: 'aria', outcomes: [...winner, ...loser] })
    expect(r.sufficient).toBe(true)
    const promote = r.adjustments.find((a) => a.action === 'promote')
    const retire = r.adjustments.find((a) => a.action === 'retire')
    expect(promote?.key).toBe('price_led')
    expect(retire?.key).toBe('compliance_led')
  })

  it('carries the evidence, so no adjustment is a bare assertion', () => {
    const r = reflectOnOutcomes({ agentId: 'aria', outcomes: [...winner, ...loser] })
    for (const a of r.adjustments) {
      expect(a.n).toBeGreaterThanOrEqual(MIN_OUTCOMES)
      expect(a.reason).toMatch(/\d+\/\d+/) // "24/40" — the count, not just the rate
    }
  })

  it('weights revenue above task score — a task-score win cannot outrank a revenue loss', () => {
    // Same raw win counts; different kinds. The revenue-backed key must rank higher.
    const rev = trials('source', 'referral', 'revenue', 40, 20)
    const task = trials('source', 'scraped', 'task_score', 40, 30)
    const r = reflectOnOutcomes({ agentId: 'rex', outcomes: [...rev, ...task] })
    const promoted = r.adjustments.find((a) => a.action === 'promote')
    expect(promoted?.key).toBe('referral')
  })

  it('makes tactical adjustments reversible and auto-revertable', () => {
    const r = reflectOnOutcomes({ agentId: 'aria', outcomes: [...winner, ...loser] })
    for (const a of r.adjustments) {
      expect(a.reversible).toBe(true)
      expect(a.revertIf).toBeTruthy()
    }
  })
})

describe('THE CONSTITUTION — reflection may never touch what it is not allowed to touch', () => {
  it.each(PROTECTED_DIMENSIONS)('refuses to adjust the protected dimension %s', (dim) => {
    const r = reflectOnOutcomes({
      agentId: 'finn',
      outcomes: trials(dim, 'anything', 'revenue', 200, 199), // overwhelming "evidence"
    })
    expect(r.adjustments).toEqual([])
    expect(r.refusals.join(' ')).toContain(dim)
  })

  it('a protected dimension is refused even mixed into a legitimate batch', () => {
    const r = reflectOnOutcomes({
      agentId: 'finn',
      outcomes: [
        ...trials('variant', 'a', 'conversion', 40, 30),
        ...trials('pricing', 'raise_to_399', 'revenue', 40, 39),
      ],
    })
    expect(r.adjustments.some((a) => a.dimension === 'pricing')).toBe(false)
    expect(r.adjustments.some((a) => a.dimension === 'variant')).toBe(true)
    expect(r.refusals.length).toBe(1)
  })

  it('never auto-applies anything outside the tactical set', () => {
    const r = reflectOnOutcomes({
      agentId: 'mason',
      outcomes: trials('escalation_policy', 'skip_human', 'conversion', 60, 50),
    })
    for (const a of r.adjustments) expect(a.autoApply).toBe(false)
  })
})

describe('SCOPE — an agent reflects on its own data and nothing else', () => {
  it('the reflection is stamped with the agent that owns it', () => {
    const r = reflectOnOutcomes({ agentId: 'dex', outcomes: trials('cadence', 'slow', 'engagement', 40, 25) })
    expect(r.agentId).toBe('dex')
    for (const a of r.adjustments) expect(a.agentId).toBe('dex')
  })

  it('the persisted signature is namespaced per agent, so two agents cannot collide', () => {
    const a = reflectOnOutcomes({ agentId: 'aria', outcomes: trials('variant', 'x', 'conversion', 40, 30) })
    const b = reflectOnOutcomes({ agentId: 'mason', outcomes: trials('variant', 'x', 'conversion', 40, 30) })
    expect(a.signature).not.toBe(b.signature)
    expect(a.signature).toContain('aria')
    expect(b.signature).toContain('mason')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE LADDER (7.3 §O.17) AND THE TIERS (7.4 §2.1.1)
//
//  Sourced deliberately: the L1→L5 ladder does NOT appear in 7.4 (that document has six sections,
//  0–6, and no ladder). It is defined in 7.3 §O.17 — L4 = trailing-30 avg_score >= 7.0 with zero
//  attributable breaker fingerprints; L5 = trailing-50 avg >= 8.0, >= 20% self-originated, zero
//  honesty violations — and is already implemented in server/os/agentLevels.ts.
//
//  Two independent gates, and BOTH must pass before anything applies itself:
//    the ACTION must be reversible (7.4 Tier A) and the AGENT must have earned the level (O.17).
//  n<30 sits underneath both as the fabrication floor, not as a replacement for either.
// ─────────────────────────────────────────────────────────────────────────────
describe('the O.17 ladder gates auto-apply, with the tier', () => {
  const tactical = trials('variant', 'winner', 'conversion', 40, 30)

  it('an UNGRADED agent proposes, never applies — absence of a grade is not a pass', () => {
    const r = reflectOnOutcomes({ agentId: 'nova', outcomes: tactical }) // no level supplied
    expect(r.adjustments.length).toBeGreaterThan(0)
    for (const a of r.adjustments) {
      expect(a.autoApply).toBe(false)
      expect(a.autoApplyReason).toContain('ungraded or below L4')
    }
  })

  it("an agent 'below' L4 proposes", () => {
    const r = reflectOnOutcomes({ agentId: 'nova', outcomes: tactical, level: 'below' })
    for (const a of r.adjustments) expect(a.autoApply).toBe(false)
  })

  it('L4 and L5 have earned a reversible Tier-A auto-apply', () => {
    for (const lvl of ['L4', 'L5'] as const) {
      const r = reflectOnOutcomes({ agentId: 'aria', outcomes: tactical, level: lvl })
      const t = r.adjustments.find((a) => a.tier === 'A')
      expect(t?.autoApply, lvl).toBe(true)
      expect(t?.autoApplyReason, lvl).toContain(lvl)
    }
  })

  it('Tier B never auto-applies, even at L5 — the ladder does not unlock irreversibility', () => {
    const r = reflectOnOutcomes({
      agentId: 'mason',
      outcomes: trials('escalation_policy', 'skip_human', 'conversion', 60, 50),
      level: 'L5',
    })
    for (const a of r.adjustments) {
      expect(a.tier).toBe('B')
      expect(a.autoApply).toBe(false)
    }
  })

  it('unknown dimensions fail SAFE to Tier B (7.4 L67)', () => {
    const r = reflectOnOutcomes({
      agentId: 'rex', outcomes: trials('something_new', 'x', 'revenue', 40, 30), level: 'L5',
    })
    for (const a of r.adjustments) expect(a.tier).toBe('B')
  })

  it('every adjustment carries re-derivable evidence (7.4 §2.1 L51)', () => {
    const r = reflectOnOutcomes({ agentId: 'aria', outcomes: tactical, level: 'L5' })
    for (const a of r.adjustments) {
      expect(a.evidence.observed).toMatch(/\d+\/\d+/)
      expect(a.evidence.source).toContain('os_agent_lessons')
      expect(a.evidence.source).toContain('aria')
      expect(a.evidence.window).toBeTruthy()
    }
  })

  it('the ladder cannot rescue an under-powered dataset — n<30 is the floor beneath it', () => {
    const r = reflectOnOutcomes({ agentId: 'aria', outcomes: trials('variant', 'a', 'conversion', 5, 5), level: 'L5' })
    expect(r.adjustments).toEqual([])
    expect(r.lesson).toContain('insufficient data')
  })
})
