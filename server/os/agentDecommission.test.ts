// ─────────────────────────────────────────────────────────────────────────────
//  PS-DECOMMISSION-01 — an empty funnel is NEVER a firing offence.
//
//  The honest rule: only an unbroken 90-day run of DEGRADED (produced no verdict) proposes
//  decommission. AWAITING_DATA (armed, honest, empty funnel) breaks the streak. Thin history never
//  fires. And it PROPOSES — it never auto-pauses.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { evaluateDecommission, summariseDecommission, DECOMMISSION_DAYS } from './agentDecommission'

const deg = (n: number) => Array(n).fill('DEGRADED') as any
const awaiting = (n: number) => Array(n).fill('AWAITING_DATA') as any

describe('the honest decommission rule', () => {
  it('proposes decommission only after a FULL window of DEGRADED', () => {
    const v = evaluateDecommission('mason', deg(DECOMMISSION_DAYS))
    expect(v.candidate).toBe(true)
    expect(v.consecutiveDegraded).toBe(DECOMMISSION_DAYS)
  })

  it('AWAITING_DATA over an empty funnel is NOT a firing offence — never a candidate', () => {
    const v = evaluateDecommission('vera', awaiting(DECOMMISSION_DAYS + 30))
    expect(v.candidate).toBe(false)
    expect(v.consecutiveDegraded).toBe(0)
  })

  it('a single AWAITING_DATA day breaks the DEGRADED streak (contribution resets the clock)', () => {
    // 89 DEGRADED, then one AWAITING_DATA most-recent -> streak 0 despite mostly-degraded history.
    const history = ['AWAITING_DATA', ...deg(DECOMMISSION_DAYS)] as any
    const v = evaluateDecommission('nova', history)
    expect(v.consecutiveDegraded).toBe(0)
    expect(v.candidate).toBe(false)
  })

  it('THIN HISTORY never fires — insufficient observation is not zero contribution', () => {
    const v = evaluateDecommission('scout', deg(DECOMMISSION_DAYS - 1))
    expect(v.candidate).toBe(false)
    expect(v.reason).toMatch(/not watched long enough/i)
  })

  it('a DELIVERING day anywhere in the leading streak keeps the agent safe', () => {
    const history = ['DELIVERING', ...deg(DECOMMISSION_DAYS + 5)] as any
    expect(evaluateDecommission('rex', history).candidate).toBe(false)
  })
})

describe('DETECT + PROPOSE, never auto-pause', () => {
  it('the summary line frames candidates as PROPOSALS the founder decides', () => {
    const sweep = summariseDecommission([evaluateDecommission('mason', deg(DECOMMISSION_DAYS))])
    expect(sweep.candidates).toHaveLength(1)
    expect(sweep.line).toMatch(/founder decides/i)
    expect(sweep.line).toMatch(/not auto-paused/i)
  })

  it('a clean sweep says so and names no one', () => {
    const sweep = summariseDecommission([
      evaluateDecommission('rex', awaiting(DECOMMISSION_DAYS)),
      evaluateDecommission('scout', deg(10)),
    ])
    expect(sweep.candidates).toHaveLength(0)
    expect(sweep.line).toMatch(/no decommission proposals/i)
  })

  it('the module NEVER auto-pauses — no pause/disable/delete call in the source', () => {
    const SRC = require('node:fs').readFileSync('server/os/agentDecommission.ts', 'utf8')
    for (const banned of ['pauseAgent(', 'disableAgent(', 'DELETE FROM', 'UPDATE os_autonomy']) {
      expect(SRC).not.toContain(banned)
    }
  })
})
