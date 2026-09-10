import { describe, expect, it } from 'vitest'
import { OWNER_RULING, applyOwnerAutonomyRuling, rungsFromTo } from './ownerRuling'

describe('owner autonomy ruling', () => {
  it('walks one rung at a time from manual to l5 and never skips', () => {
    expect(rungsFromTo('manual', 'l5')).toEqual([
      { from: 'manual', to: 'l2' },
      { from: 'l2', to: 'l3' },
      { from: 'l3', to: 'l4' },
      { from: 'l4', to: 'l5' },
    ])
    expect(rungsFromTo('l4', 'l5')).toEqual([{ from: 'l4', to: 'l5' }])
    expect(rungsFromTo('l5', 'l5')).toEqual([])
    expect(rungsFromTo('l5', 'manual')).toEqual([])
  })

  it('targets enforcement l5 and posture L5.7 by owner name', () => {
    expect(OWNER_RULING.declaredBy).toBe('kaan')
    expect(OWNER_RULING.enforcementLevel).toBe('l5')
    expect(OWNER_RULING.posture).toBe('l5_7')
    expect(OWNER_RULING.reason).toMatch(/20 verified free trials/)
  })

  it('writes a grant token before each raise and refuses when a kill flag is active', async () => {
    const writes: string[] = []
    let level = 'manual'
    const sql = async (strings: TemplateStringsArray, ...vals: any[]) => {
      const q = strings.join('?').replace(/\s+/g, ' ')
      writes.push(q)
      if (/os_kill_flags/.test(q)) return []
      if (/FROM os_autonomy_state/.test(q)) return [{ level }]
      if (/INSERT INTO os_autonomy_state/.test(q)) return []
      if (/INSERT INTO autonomy_grants/.test(q)) return []
      if (/UPDATE os_autonomy_state SET level/.test(q)) {
        level = String(vals[0])
        return []
      }
      if (/INSERT INTO os_posture_state/.test(q)) return []
      if (/INSERT INTO audit_log/.test(q)) return []
      return []
    }
    const declarePosture = async () => ({ ok: true, reason: 'declared (FORCED past blockers)' })
    const out = await applyOwnerAutonomyRuling(sql as any, 'phishsimai', declarePosture, { declaredBy: 'kaan' })
    expect(out.ok).toBe(true)
    expect(out.to).toBe('l5')
    expect(out.trail).toHaveLength(4)
    expect(writes.filter((w) => /INSERT INTO autonomy_grants/.test(w))).toHaveLength(4)
    expect(writes.filter((w) => /UPDATE os_autonomy_state SET level/.test(w))).toHaveLength(4)
  })

  it('does not raise when a kill flag is active', async () => {
    const sql = async (strings: TemplateStringsArray) => {
      const q = strings.join('?')
      if (/os_kill_flags/.test(q)) return [{ '?column?': 1 }]
      if (/FROM os_autonomy_state/.test(q)) return [{ level: 'manual' }]
      return []
    }
    const out = await applyOwnerAutonomyRuling(sql as any, 'phishsimai', async () => ({ ok: true, reason: 'no' }), {
      declaredBy: 'kaan',
    })
    expect(out.ok).toBe(false)
    expect(out.killFlag).toBe(true)
    expect(out.reason).toMatch(/kill_flag_active/)
  })
})
