// ─────────────────────────────────────────────────────────────────────────────
//  PS-POSTURE-ALARM-01 — the clean-day verdict pages instead of waiting to be read.
//
//  Founder's rule (the `sent: 0`-for-8-days lesson): an expectation you have to
//  remember to check is the weakest monitoring there is. buildPostureAlarm inverts
//  it — SILENCE MEANS CLEAN; a not-clean day returns a loud message naming exactly
//  which criterion failed and whether it was a violation or unmeasured.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildPostureAlarm } from './posture'
import type { DayVerdict, Evaluation } from './posture'

const clean: DayVerdict = {
  clean: true,
  counters: { failed_actions: 0, compliance_rejections: 0, open_breakers: 0, hard_stop_violations: 0, ungranted_level_changes: 0, incidents: 0, deploy_mismatches: 0 },
  violations: [],
  unmeasured: [],
}
const ev = (streak: number): Evaluation => ({
  posture: 'pre_l5_7', label: 'pre-L5.7', baselineFrom: '2026-07-23', streak, lastJudgedDay: '2026-07-24',
  needDays: 5, handled: 1, needHandled: 1, eligibleFor: null, blockers: [], nextStep: '', drill: null,
})

describe('buildPostureAlarm — silence means clean', () => {
  it('returns null on a clean day (no page — the streak advancing needs no announcement)', () => {
    expect(buildPostureAlarm('2026-07-24', clean, ev(2))).toBeNull()
  })

  it('pages on a VIOLATION, naming it and the stalled streak', () => {
    const v: DayVerdict = { ...clean, clean: false, violations: ['1 failed action(s)'] }
    const msg = buildPostureAlarm('2026-07-24', v, ev(1))!
    expect(msg).toContain('did NOT judge clean')
    expect(msg).toContain('still 1/5')
    expect(msg).toContain('1 failed action(s)')
  })

  it('pages on an UNMEASURED criterion — the exact silent-pass this guards against', () => {
    const v: DayVerdict = { ...clean, clean: false, unmeasured: ['deploy: no deploy-target verification for this day'] }
    const msg = buildPostureAlarm('2026-07-24', v, ev(1))!
    expect(msg).toContain('UNMEASURED')
    expect(msg).toContain('deploy: no deploy-target verification')
  })

  it('names BOTH when a day has a violation and an unmeasured criterion', () => {
    const v: DayVerdict = { ...clean, clean: false, violations: ['2 filed incident(s)'], unmeasured: ['metrics: no metrics_daily snapshot for this day'] }
    const msg = buildPostureAlarm('2026-07-24', v, ev(0))!
    expect(msg).toContain('2 filed incident(s)')
    expect(msg).toContain('metrics: no metrics_daily snapshot')
    expect(msg).toContain('still 0/5')
  })
})
