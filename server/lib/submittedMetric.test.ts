// ─────────────────────────────────────────────────────────────────────────────
//  PS-CREDPHANTOM-01 — the metric carries its own reason.
//
//  Context injection did not hold: a "capture is built" sentence elsewhere in the
//  prompt loses to the number itself, and the crisis is re-derived the next morning
//  from "Credentials submitted: 0". These tests pin the property that actually
//  fixes it — the value and its explanation are ONE string, so no rendering of the
//  metric can reach an agent without the reason attached.
//
//  The live funnel on 2026-07-26 was 5 sent / 5 opened / 2 clicked / 0 submitted.
//  Marcus's 10/10 "the technical chain for the attack vector is broken" was a zero
//  over a denominator of TWO.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { submittedMetric, revenueMetric, reportRateMetric } from './kaan_os_v4'

describe('submittedMetric — 0 submissions cannot be read as a fault', () => {
  it('the real 2026-07-26 case: 0 submitted over 2 clicks', () => {
    const m = submittedMetric(0, 2)
    expect(m).toMatch(/BUILT AND LIVE/)
    expect(m).toMatch(/2026-07-24/)
    expect(m).toMatch(/2 click-throughs/)
    expect(m).toMatch(/BEHAVIOURAL/)
    expect(m).toMatch(/CLOSED on 2026-07-24/)
    expect(m).toMatch(/CONVERSION question/)
  })

  it('names the denominator, so the zero can never be read as a large sample', () => {
    expect(submittedMetric(0, 2)).toMatch(/over 2 opportunities/)
    expect(submittedMetric(0, 1)).toMatch(/over 1 opportunity/)
    expect(submittedMetric(0, 1)).toMatch(/1 click-through,/) // singular, not "click-throughs"
  })

  it('says WHY the number is uninformative — capture and no-attempt look identical', () => {
    expect(submittedMetric(0, 2)).toMatch(/a working capture and an untried one look identical/)
  })

  it('0 clicks is a different statement: the zero is upstream of capture entirely', () => {
    const m = submittedMetric(0, 0)
    expect(m).toMatch(/0 click-throughs have reached the submit step/)
    expect(m).toMatch(/nothing this number could have counted/)
    expect(m).toMatch(/VISITOR BEHAVIOUR/)
  })

  it('the explanation travels WITH the value — never a separate sentence to forget', () => {
    // The property that makes this hold: you cannot obtain the number without the reason.
    for (const clicked of [0, 1, 2, 50]) {
      const m = submittedMetric(0, clicked)
      expect(m.startsWith('Credentials submitted: 0'), `clicked=${clicked}`).toBe(true)
      expect(m.length, `clicked=${clicked}`).toBeGreaterThan(120)
    }
  })
})

describe('submittedMetric — the annotation is conditional, not a permanent disclaimer', () => {
  it('disappears the moment a real submission lands', () => {
    const m = submittedMetric(1, 4)
    expect(m).toBe('Credentials submitted: 1 of 4 click-through(s)')
    // Critically: it must STOP defending the number once the number is real. A standing
    // "capture is built, do not investigate" would keep excusing a 0 that HAD become suspicious.
    expect(m).not.toMatch(/BUILT AND LIVE/)
    expect(m).not.toMatch(/do NOT|CLOSED/i)
  })

  it('a later genuine breakage is still reportable — nothing here suppresses it', () => {
    // 40 clicks and 12 submits: healthy. The metric makes no excuse and asserts nothing.
    expect(submittedMetric(12, 40)).toBe('Credentials submitted: 12 of 40 click-through(s)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  PS-BAREMETRIC-01 — the rest of the class.
//  The credential 0 was not special, only the one that got caught. Any zero read
//  by agents whose job is finding problems needs its reason attached.
// ─────────────────────────────────────────────────────────────────────────────
describe('revenueMetric — $0 must say WHICH kind of zero it is', () => {
  it('pre-revenue: nothing ever activated, so there is nothing to have lost', () => {
    const m = revenueMetric(0, 0, 4, 0, 5)
    expect(m).toMatch(/PRE-REVENUE, not a decline/)
    expect(m).toMatch(/no org has ever activated a paid plan/)
    expect(m).toMatch(/4 org\(s\) are on free\/trial/)
    expect(m).toMatch(/oldest org is 5 day\(s\) old/)
    expect(m).toMatch(/FIRST CONVERSION/)
    expect(m).not.toMatch(/⚠️/) // not an alarm
  })

  it('churn to zero is the OPPOSITE emergency and must NOT be excused', () => {
    // Same string "$0" — opposite meaning. This is the distinction the bare number cannot express.
    const m = revenueMetric(0, 0, 4, 3, 90)
    expect(m).toMatch(/⚠️/)
    expect(m).toMatch(/drop to zero, NOT a pre-revenue state/)
    expect(m).toMatch(/Treat as churn and investigate/)
    expect(m).not.toMatch(/expected value|not a fault/i)
  })

  it('once revenue exists the explanation disappears', () => {
    expect(revenueMetric(1490, 3, 2, 3, 120)).toBe('MRR: $1,490 from 3 paying org(s)')
  })

  it('omits the age clause when org age is unknown rather than inventing one', () => {
    expect(revenueMetric(0, 0, 4, 0, null)).not.toMatch(/day\(s\) old/)
  })
})

describe('reportRateMetric — states the good direction', () => {
  it('says higher is better, so it is not read as a failure rate', () => {
    const m = reportRateMetric(3, 5)
    expect(m).toMatch(/Reported 3\/5 \(60\.0%\)/)
    expect(m).toMatch(/HIGHER IS BETTER/)
    expect(m).toMatch(/not a failure rate and not a complaint rate/)
  })

  it('nothing sent is unmeasurable, not 0%', () => {
    expect(reportRateMetric(0, 0)).toMatch(/not measurable/)
  })
})
