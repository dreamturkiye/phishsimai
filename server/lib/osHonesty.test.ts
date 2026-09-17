import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_SCORE_CEILING,
  applyConversionScoreCeiling,
  conversionEvidenceInResult,
  HONEST_BLOCKER_SCORE_FLOOR,
  IDLE_THEATER_SCORE_CEILING,
  isHonestStructuralBlockerDiagnosis,
  isIdleTheaterOrWrongConvertWarm,
  osHealthHonesty,
  pickOpenTaskToKeep,
} from './kaan_os_v4'
import { overlayActivityStatus } from '../os/agentHealth_v2'

describe('pickOpenTaskToKeep — one open task, conversion wins', () => {
  it('keeps conversion-bound work over an analysis twin', () => {
    const keep = pickOpenTaskToKeep([
      { id: 'new', title: 'Analyze funnel conversion', status: 'queued' },
      { id: 'old', title: 'Send warm trial CTAs and follow up existing trial orgs today', status: 'queued' },
    ])
    expect(keep.id).toBe('old')
  })

  it('prefers an executing row so a drain in flight is not cancelled', () => {
    const keep = pickOpenTaskToKeep([
      { id: 'queued', title: 'Send warm trial CTAs', status: 'queued' },
      { id: 'running', title: 'Send warm trial CTAs', status: 'executing' },
    ])
    expect(keep.id).toBe('running')
  })
})

describe('osHealthHonesty — idle workforce is not all-agents-normal', () => {
  it('flags zero completions with open tasks as WORKFORCE IDLE', () => {
    const h = osHealthHonesty({ completions24h: 0, openTasks: 9, executedThisRun: 0, nothingCompletedReports: 8 })
    expect(h.healthy).toBe(false)
    expect(h.line).toMatch(/WORKFORCE IDLE/)
    expect(h.line).toMatch(/NOT 'all agents normal'/)
  })

  it('does not treat 0 executed-this-run as an infra outage when work completed', () => {
    const h = osHealthHonesty({ completions24h: 4, openTasks: 2, executedThisRun: 0, nothingCompletedReports: 0 })
    expect(h.healthy).toBe(true)
  })

  it('flags an issuance gap when nothing is open and nothing completed', () => {
    const h = osHealthHonesty({ completions24h: 0, openTasks: 0, executedThisRun: 0, nothingCompletedReports: 0 })
    expect(h.healthy).toBe(false)
    expect(h.line).toMatch(/ISSUANCE GAP/)
  })

  it('flags a true-trial drought even when the workforce completed work', () => {
    const h = osHealthHonesty({
      completions24h: 4, openTasks: 2, executedThisRun: 1, nothingCompletedReports: 0,
      trueTrials: 1, payingCustomers: 0,
    })
    expect(h.healthy).toBe(false)
    expect(h.line).toMatch(/REVENUE FAILURE/)
    expect(h.line).toMatch(/Never declare/)
    expect(h.line).toMatch(/Canary/)
  })

  it('does not treat canary inflation as healthy — 20 TRUE + 5 paying is the floor', () => {
    const h = osHealthHonesty({
      completions24h: 4, openTasks: 2, executedThisRun: 1, nothingCompletedReports: 0,
      trueTrials: 20, payingCustomers: 5,
    })
    expect(h.healthy).toBe(true)
  })
})

describe('applyConversionScoreCeiling', () => {
  it('caps analysis-only output at 6 even if Janet scores 9', () => {
    expect(applyConversionScoreCeiling(9, 'I analyzed the funnel. Findings: drop-off exists. Next steps: more research. Confidence: 8')).toBe(ANALYSIS_SCORE_CEILING)
  })

  it('does not cap a real convert_warm send', () => {
    expect(applyConversionScoreCeiling(8, '**CONVERSION SHIFT:** sent=2 blocked=0 skipped=0\nconvert_warm sent=2')).toBe(8)
    expect(conversionEvidenceInResult('trial_nudges sent=3')).toBe(true)
  })

  it('caps analysis-only output at 4 during operating crisis', () => {
    expect(applyConversionScoreCeiling(9, 'I analyzed the funnel.', true)).toBe(4)
  })

  it('leaves an unscored review unscored', () => {
    expect(applyConversionScoreCeiling(null, 'no score')).toBeNull()
  })

  it('floors honest structural-blocker diagnosis + correct next step at 5, even if Janet scored 2', () => {
    const honest =
      'Warm pool blocked: eligible=0 exhausted=12 (90/91/92 already sent). ' +
      'Do not convert_warm. Next: ACTION: queue_marcus if CTA path is broken; otherwise LinkedIn founder-review and Grey Box nurture.'
    expect(isHonestStructuralBlockerDiagnosis(honest)).toBe(true)
    expect(applyConversionScoreCeiling(2, honest, true)).toBe(HONEST_BLOCKER_SCORE_FLOOR)
    expect(applyConversionScoreCeiling(9, honest, true)).toBe(ANALYSIS_SCORE_CEILING)
    expect(applyConversionScoreCeiling(5, honest, true)).toBeGreaterThanOrEqual(5)
  })

  it('caps idle theater and wrong convert_warm hammer at 3', () => {
    const idle = 'Nothing completed. All agents normal. Confidence: 8'
    expect(isIdleTheaterOrWrongConvertWarm(idle)).toBe(true)
    expect(applyConversionScoreCeiling(8, idle, true)).toBe(IDLE_THEATER_SCORE_CEILING)
    const hammer =
      'CONVERSION SHIFT: sent=0 blocked=0 skipped=0\nconvert_warm sent=0\n' +
      'eligible=0 exhausted=12. Fire convert_warm: hottest again tomorrow.'
    expect(isIdleTheaterOrWrongConvertWarm(hammer)).toBe(true)
    expect(applyConversionScoreCeiling(9, hammer, true)).toBeLessThanOrEqual(3)
    expect(applyConversionScoreCeiling(2, hammer, true)).toBeLessThanOrEqual(3)
  })
})

describe('overlayActivityStatus — heartbeat healthy + zero completions is warning', () => {
  it('does not report healthy when work was issued but none completed', () => {
    expect(overlayActivityStatus('healthy', 0, 3, true)).toBe('warning')
  })

  it('stays critical on a real failure', () => {
    expect(overlayActivityStatus('critical', 0, 3, true)).toBe('critical')
  })

  it('is healthy when completions exist', () => {
    expect(overlayActivityStatus('unknown', 2, 3, false)).toBe('healthy')
  })
})
