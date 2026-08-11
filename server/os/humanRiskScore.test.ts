// ─────────────────────────────────────────────────────────────────────────────
//  PS-HUMAN-RISK-01 — the composite is honest: a missing dimension is never invented.
//
//  Same discipline as posture-50 and the invariants: over zero data the score is null ("not enough
//  data yet"), never 0/50/a fabricated number; a partial composite is labelled "N of 3", never
//  dressed as complete.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  computeHumanRisk,
  phishingDimension,
  trainingDimension,
  departmentDimension,
  ALL_DIMENSIONS,
} from './humanRiskScore'

describe('the composite never fabricates a missing dimension', () => {
  it('ZERO measurable dimensions => null score, "not enough data yet", never 0 or 50', () => {
    const r = computeHumanRisk([
      phishingDimension([]),
      trainingDimension(0, 0),
      departmentDimension(),
    ])
    expect(r.score).toBeNull()
    expect(r.measured).toBe(0)
    expect(r.line).toContain('not enough data yet')
    expect(r.line).not.toMatch(/\b(50|0)\/100/)
  })

  it('averages ONLY the measured dimensions, excluding nulls', () => {
    const r = computeHumanRisk([
      phishingDimension([{ riskScore: 80 }, { riskScore: 40 }]), // avg 60
      trainingDimension(4, 1),                                    // 100*(1-0.25)=75
      departmentDimension(),                                      // null, excluded
    ])
    // (60 + 75) / 2 = 67.5 -> 68, over 2 measured of 3
    expect(r.score).toBe(68)
    expect(r.measured).toBe(2)
    expect(r.total).toBe(3)
  })

  it('labels a partial composite "2 of 3", never as complete', () => {
    const r = computeHumanRisk([
      phishingDimension([{ riskScore: 50 }]),
      trainingDimension(2, 2),      // fully completed -> 0 risk
      departmentDimension(),        // absent
    ])
    expect(r.line).toContain('2 of 3 dimensions')
    expect(r.line).toContain('not measured: department')
    expect(r.line).not.toContain('All dimensions measured')
  })

  it('says "All dimensions measured" ONLY when every dimension has data', () => {
    const r = computeHumanRisk([
      { key: 'phishing', risk: 30, note: '' },
      { key: 'training', risk: 20, note: '' },
      { key: 'department', risk: 10, note: '' },
    ])
    expect(r.measured).toBe(3)
    expect(r.line).toContain('All dimensions measured')
  })
})

describe('the dimensions read null over empty inputs, not a default', () => {
  it('phishing over zero scored targets is null, not 50', () => {
    const d = phishingDimension([])
    expect(d.risk).toBeNull()
    expect(d.note).toMatch(/no scored targets/)
  })

  it('training over zero assignments is null — never "100% complete" over nothing', () => {
    const d = trainingDimension(0, 0)
    expect(d.risk).toBeNull()
    expect(d.note).toMatch(/no training assignments/)
  })

  it('department is honestly absent with the reason recorded (schema exists, model does not)', () => {
    const d = departmentDimension()
    expect(d.risk).toBeNull()
    expect(d.note).toMatch(/departmentId exists/)
    expect(d.note).toMatch(/not modelled/)
  })
})

describe('training risk rises as completion falls (the remediation payoff)', () => {
  it('full completion => 0 risk; no completion => 100 risk', () => {
    expect(trainingDimension(3, 3).risk).toBe(0)
    expect(trainingDimension(3, 0).risk).toBe(100)
    expect(trainingDimension(4, 1).risk).toBe(75)
  })

  it('the denominator is fixed at 3 dimensions — an omission cannot shrink it to look full', () => {
    expect(ALL_DIMENSIONS).toEqual(['phishing', 'training', 'department'])
    const r = computeHumanRisk([phishingDimension([{ riskScore: 10 }])])
    expect(r.total).toBe(3) // not 1
    expect(r.measured).toBe(1)
  })
})
