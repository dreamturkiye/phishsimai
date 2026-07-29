// ─────────────────────────────────────────────────────────────────────────────
//  PS-INTERNAL-SIM-01 / PS-TOPFUNNEL-01 (2026-07-29, founder directive)
//
//  Two failures in one standup, both traceable to what the agents' context did and
//  did not contain:
//
//   1. Vera: "The 40% click rate across our 5 sent simulations is a critical urgency
//      lever. Standard industry benchmarks are 10-15%." Measured that morning: all 5
//      campaign_results rows belong to org 8, "PhishSim Internal" — the founder's own
//      org. Zero external recipients. The rate is real; the market claim built on it
//      is fabricated. A sample-size caveat cannot fix this, because the defect is
//      provenance, not precision — n=5 says the number is noisy, not that it is OURS.
//
//   2. All five agents proposed conversion work (landing page, pricing to "4 free
//      orgs", follow-up cadence, CRM stages) on a funnel nobody has entered. The
//      context described the bottom of the funnel in detail and never mentioned the
//      top, so cold outreach — the only channel actually acquiring anyone — was
//      invisible in the prompt and therefore invisible in the plans.
//
//  These pin the properties that fix both: provenance travels with the metric, and
//  the top of the funnel is stated with the two ambiguities a raw count hides
//  (a stalled sender, and replies we may be unable to hear).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { simProvenanceNote, topOfFunnelMetric } from './kaan_os_v4'

const HOUR = 3_600_000
const NOW = Date.parse('2026-07-29T15:00:00Z')
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString()

// The real top-of-funnel state on 2026-07-29, measured from prod.
const LIVE = {
  touchedEver: 523, touched7d: 350, touchedToday: 50, lastSendIso: ago(8),
  touch2: 16, replied: 0, bounced: 20, unsubscribed: 24,
  readyPool: 541, replyDraftsEver: 0, newRealSignups7d: 1, realLeadsTotal: 1,
  nowMs: NOW,
}

describe('simProvenanceNote — our own test sends are not market data', () => {
  it('the real 2026-07-29 case: 5 internal, 0 external', () => {
    const n = simProvenanceNote(5, 0, 0)
    expect(n).toMatch(/NOT MARKET DATA/i)
    expect(n).toMatch(/own internal\/test org/i)
    // The specific move that has to be forbidden by name — Vera made it verbatim.
    expect(n).toMatch(/industry benchmark/i)
    expect(n).toMatch(/urgency/i)
    expect(n).toMatch(/fabricated insight/i)
  })

  it('does not pretend the product is broken — self-tests still prove it works', () => {
    // Over-correcting here would just mint a different phantom for Marcus to investigate.
    expect(simProvenanceNote(5, 0, 0)).toMatch(/product works end-to-end/i)
  })

  it('counts unattributable sends as unknown — never silently as external', () => {
    // Folding unknowns into "external" would rebuild the exact illusion this removes.
    const n = simProvenanceNote(5, 0, 3)
    expect(n).toMatch(/NOT MARKET DATA/i)
    expect(n).toMatch(/could not be attributed/i)
  })

  it('narrows to a mixed-sample warning once real external sends exist', () => {
    const n = simProvenanceNote(5, 40, 0)
    expect(n).toMatch(/MIXED SAMPLE/i)
    expect(n).toMatch(/40 went to external/)
    // Downgraded from the all-internal alarm: the blended rates are still not market
    // data, but the external subset now is, so the note points at it instead of
    // discrediting everything.
    expect(n).not.toMatch(/🚨/)
    expect(n).toMatch(/Only the 40 external send\(s\) can support a claim/)
  })

  it('gets out of the way entirely when every send is external', () => {
    const n = simProvenanceNote(0, 40, 0)
    expect(n).toMatch(/real customer data/i)
    expect(n).not.toMatch(/⚠️|🚨/)
  })

  it('says nothing to interpret when nothing has been sent', () => {
    expect(simProvenanceNote(0, 0, 0)).toMatch(/No simulations have been sent/i)
  })
})

describe('topOfFunnelMetric — the constraint, stated first', () => {
  it('reports a live sender as live, with real external counts', () => {
    const t = topOfFunnelMetric(LIVE)
    expect(t).toMatch(/LIVE/)
    expect(t).toMatch(/350 real MSP/)
    expect(t).toMatch(/50 today/)
    expect(t).toMatch(/NOT our test orgs/i)
  })

  it('a stalled sender cannot hide behind a healthy lifetime total', () => {
    // The failure this exists to catch: 523 lifetime sends still reads as "sending"
    // when the last one went out a week ago.
    const t = topOfFunnelMetric({ ...LIVE, lastSendIso: ago(72), touchedToday: 0 })
    expect(t).toMatch(/STALLED/)
    expect(t).toMatch(/outranks every conversion task/i)
  })

  it('never-sent is called out as the only thing that matters', () => {
    const t = topOfFunnelMetric({ ...LIVE, touchedEver: 0, touched7d: 0, touchedToday: 0, lastSendIso: null })
    expect(t).toMatch(/NEVER SENT/)
  })

  it('flags the single-touch sequence as the expected cause of low replies', () => {
    // 16 of 523 ever got a touch 2. Without this, a 0% reply rate reads as a broken
    // offer or a bad ICP, and the team rewrites copy that was never sent twice.
    const t = topOfFunnelMetric(LIVE)
    expect(t).toMatch(/SINGLE-TOUCH/)
    expect(t).toMatch(/16 of 523/)
    expect(t).toMatch(/EXPECTED/)
  })

  it('refuses to report 0 replies as "nobody replied" when capture never fired', () => {
    // The distinction that matters: no one answered vs. we cannot hear answers.
    const t = topOfFunnelMetric(LIVE)
    expect(t).toMatch(/UNVERIFIED/)
    expect(t).toMatch(/DO NOT REPORT AS/i)
    expect(t).toMatch(/ZERO rows ever/i)
  })

  it('states a plain reply count once capture is provably working', () => {
    const t = topOfFunnelMetric({ ...LIVE, replied: 3, replyDraftsEver: 7 })
    expect(t).toMatch(/Replies: 3 from 523/)
    expect(t).not.toMatch(/UNVERIFIED/)
  })

  it('says outreach opens are not instrumented rather than implying a rate', () => {
    const t = topOfFunnelMetric(LIVE)
    expect(t).toMatch(/NOT INSTRUMENTED/)
    // The open rate in the brief belongs to internal sims — say so where it is read.
    expect(t).toMatch(/own internal org/i)
  })

  it('names the tiny real denominator and redirects to top-of-funnel work', () => {
    const t = topOfFunnelMetric(LIVE)
    expect(t).toMatch(/NEW real prospects that entered this week: 1/)
    expect(t).toMatch(/REAL prospects ever: 1/)
    expect(t).toMatch(/nobody\s+in the funnel to convert/i)
    expect(t).toMatch(/Bringing NEW real MSPs in is the priority/i)
  })
})
