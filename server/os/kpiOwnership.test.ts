// ─────────────────────────────────────────────────────────────────────────────
//  PS-KPI-OWNERSHIP-01 — the honest verdict: "owned work ran + produced a verdict", never a
//  fabricated number, and an ARMED agent over an empty funnel is NOT marked failing.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { KPI_REGISTRY, KPI_AGENTS, scoreAgentKpi, summariseKpiOwnership } from './kpiOwnership'

describe('the registry: one exclusive primary KPI per agent', () => {
  it('all 8 domain agents own exactly one KPI', () => {
    expect(KPI_AGENTS.sort()).toEqual(['aria', 'dex', 'finn', 'mason', 'nova', 'rex', 'scout', 'vera'])
  })
  it('KPIs are EXCLUSIVE — no two agents own the same one', () => {
    const kpis = KPI_AGENTS.map((a) => KPI_REGISTRY[a].kpi)
    expect(new Set(kpis).size).toBe(kpis.length)
  })
})

describe('the honest verdict', () => {
  it('DELIVERING only when owned work ran AND produced a verdict AND has real data', () => {
    const s = scoreAgentKpi('scout', { ran: true, producedVerdict: true, hasRealData: true })
    expect(s.verdict).toBe('DELIVERING')
  })

  it('AWAITING_DATA over an empty funnel — an armed agent that ran honestly is NOT failing', () => {
    const s = scoreAgentKpi('vera', { ran: true, producedVerdict: true, hasRealData: false })
    expect(s.verdict).toBe('AWAITING_DATA')
    expect(s.evidence).toMatch(/not a failure/i)
  })

  it('DEGRADED when the KPI owner did NOT run', () => {
    const s = scoreAgentKpi('mason', { ran: false, producedVerdict: false, hasRealData: false })
    expect(s.verdict).toBe('DEGRADED')
    expect(s.evidence).toMatch(/did NOT run/i)
  })

  it('DEGRADED when it ran but produced no verdict (NOT_CHECKED / error)', () => {
    const s = scoreAgentKpi('finn', { ran: true, producedVerdict: false, hasRealData: false })
    expect(s.verdict).toBe('DEGRADED')
    expect(s.evidence).toMatch(/no verdict/i)
  })

  it('empty-funnel is NOT the same as failing — AWAITING_DATA and DEGRADED are distinct', () => {
    const armed = scoreAgentKpi('nova', { ran: true, producedVerdict: true, hasRealData: false })
    const broken = scoreAgentKpi('nova', { ran: false, producedVerdict: false, hasRealData: false })
    expect(armed.verdict).not.toBe(broken.verdict)
  })
})

describe('the summary never fabricates a score', () => {
  it('reports verdict counts, no invented 0-100 number', () => {
    const scores = KPI_AGENTS.map((a) => scoreAgentKpi(a, { ran: true, producedVerdict: true, hasRealData: false }))
    const sum = summariseKpiOwnership(scores)
    expect(sum.awaiting).toBe(8)
    expect(sum.delivering).toBe(0)
    // No "/100", no fabricated percentage.
    expect(sum.line).not.toMatch(/\d+\/100|\d+%/)
    expect(sum.line).toMatch(/awaiting data/i)
  })

  it('NAMES the degraded KPI owners — a non-producing owner is the thing to act on', () => {
    const scores = [
      scoreAgentKpi('rex', { ran: false, producedVerdict: false, hasRealData: false }),
      ...KPI_AGENTS.filter((a) => a !== 'rex').map((a) => scoreAgentKpi(a, { ran: true, producedVerdict: true, hasRealData: true })),
    ]
    const sum = summariseKpiOwnership(scores)
    expect(sum.degraded).toBe(1)
    expect(sum.line).toContain('rex/funnel_integrity')
  })

  it('the empty-funnel today reads honestly — mostly AWAITING_DATA, none marked failing falsely', () => {
    // The real state: agents run and report insufficient data; the line must not imply failure.
    const scores = KPI_AGENTS.map((a) => scoreAgentKpi(a, { ran: true, producedVerdict: true, hasRealData: false }))
    const sum = summariseKpiOwnership(scores)
    expect(sum.degraded).toBe(0)
    expect(sum.line).toMatch(/honest/i)
  })
})

describe('wired into Janet', () => {
  const JANET = require('node:fs').readFileSync('server/os/janet.ts', 'utf8')
  it('Janet computes and renders the KPI ownership line', () => {
    expect(JANET).toContain('summariseKpiOwnership')
    expect(JANET).toContain('KPI OWNERSHIP')
  })
  it("hasRealData is gated on status==='ACTIVE' — armed/insufficient are awaiting, not failing", () => {
    expect(JANET).toContain("r.status === 'ACTIVE'")
  })
})
