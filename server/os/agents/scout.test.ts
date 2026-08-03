// PS-SCOUT-01 — tests for the agent that replaced the research ghost.
//
// The ghost's specific sin was stating COMPETITOR DOLLAR FIGURES from a developer's memory at
// confidence 0.9. So the load-bearing tests are: Scout has no hardcoded competitor facts to fall
// back on, he says NOT CHECKED when no fetch wrote a row, and he never resolves a pricing
// contradiction himself.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  scoreSegment,
  segmentLine,
  intelLine,
  contradictionIncidents,
  buildScoutLine,
  readIntelState,
  countDisqualified,
  scoreSegments,
  SEGMENTS,
  DISQUALIFY,
  SCOUT_SOURCES,
  LOWEST_PRICE_CLAIM,
  MIN_N,
  type IntelState,
} from './scout'
import { COMPETITORS } from '../competitorIntel'

const SCOUT_SRC = fs.readFileSync('server/os/agents/scout.ts', 'utf8')

/**
 * Scout's source with all comments removed.
 *
 * The header DOCUMENTS the ghost's sins verbatim ("KnowBe4: enterprise $30+/user/yr") so the reason
 * for this agent's design survives. Scanning raw source for those strings therefore fails on the
 * documentation rather than on a defect. The property that matters is "no competitor fact in
 * EXECUTABLE CODE", so the comments come out before the scan.
 */
const SCOUT_CODE = SCOUT_SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('Scout carries NO remembered competitor facts', () => {
  it('states no competitor dollar figure anywhere in his source', () => {
    // research.ts contained "$30+/user/yr" and "$50K+ contracts" — both from memory, both quoted by
    // Janet. Scout must have nothing of the kind to fall back on.
    const dollarFigures = SCOUT_CODE.match(/\$\d[\d,.]*\s*(?:\+|K|M)?/g) ?? []
    expect(dollarFigures).toEqual([])
  })

  it('names no competitor price, tier or feature as a literal', () => {
    expect(SCOUT_CODE).not.toMatch(/KnowBe4/i)
    expect(SCOUT_CODE).not.toMatch(/Proofpoint/i)
    expect(SCOUT_CODE).not.toMatch(/per user\/yr/i)
    expect(SCOUT_CODE).not.toMatch(/Hoxhunt|CanIPhish|PhishingBox/i) // set comes from COMPETITORS
  })

  it('sources its competitor set from the fetch module, not a local list', () => {
    expect(SCOUT_SRC).toContain("from '../competitorIntel'")
    expect(SCOUT_SOURCES.length).toBe(COMPETITORS.length)
    expect(SCOUT_SOURCES.every((s) => s.kind === 'competitor')).toBe(true)
  })
})

describe('with no verified capture, nothing may be said', () => {
  it('reports 0 verified rows as a WRITER problem, not an absence of competition', () => {
    const line = intelLine(7, 0, COMPETITORS.map((c) => c.name), null)
    expect(line).toContain('0/7')
    expect(line).toContain('NOTHING may be stated')
    expect(line).toContain('read surface with no successful writer')
    expect(line).not.toMatch(/no competitors|no competition/i)
  })

  it('lists every unfetched competitor as NOT CHECKED', () => {
    const line = intelLine(7, 3, ['GoPhish', 'usecure'], 2)
    expect(line).toContain('NOT CHECKED: GoPhish, usecure')
  })

  it('marks an old capture as stale rather than current', () => {
    expect(intelLine(7, 7, [], 40)).toContain('OLDEST CAPTURE 40d OLD')
    expect(intelLine(7, 7, [], 3)).not.toContain('stale')
  })

  it('reports NOT CHECKED when the intel query fails', async () => {
    const throwing: any = { query: async () => { throw new Error('no table') } }
    const s = await readIntelState(throwing)
    expect(s.checked).toBe(false)
    expect(s.withVerifiedRow).toBe(0)
    expect(s.notChecked.length).toBe(COMPETITORS.length)
  })
})

describe('ICP scoring refuses to rank on zero signal', () => {
  it('returns null — not 0 — when a segment has volume but no outcomes', () => {
    // 933 contacted, 0 replied is the real state. Scoring every segment 0 would still RANK them,
    // and a ranking over zero signal is an invented preference.
    const s = scoreSegment(SEGMENTS[0], { contacted: 618, replied: 0, trials: 0, customers: 0 })
    expect(s.icpScore).toBeNull()
    expect(s.verdict).toContain('UNMEASURED')
    expect(s.verdict).toContain('No segment can be called better than another on zero signal')
  })

  it('refuses to score below n=30', () => {
    const s = scoreSegment(SEGMENTS[0], { contacted: 12, replied: 3, trials: 1, customers: 0 })
    expect(s.icpScore).toBeNull()
    expect(s.verdict).toContain('UNSCORED')
  })

  it('scores once there are real outcomes at n>=30', () => {
    const s = scoreSegment(SEGMENTS[0], { contacted: 100, replied: 10, trials: 2, customers: 1 })
    expect(s.icpScore).toBeCloseTo(((10 + 10 + 20) / 100) * 100, 2)
    expect(s.verdict).toContain('SCORED')
  })

  it('weights a paying customer far above a reply', () => {
    const reply = scoreSegment(SEGMENTS[0], { contacted: 100, replied: 1, trials: 0, customers: 0 })
    const paid = scoreSegment(SEGMENTS[0], { contacted: 100, replied: 0, trials: 0, customers: 1 })
    expect(paid.icpScore!).toBeGreaterThan(reply.icpScore!)
  })

  it('never prints a rate below n=30', () => {
    expect(segmentLine('reply', 1, 10)).toContain('counts only')
    expect(segmentLine('reply', 1, 10)).not.toContain('%')
    expect(segmentLine('reply', 0, 0)).toContain('N/A, n=0')
    expect(segmentLine('reply', 3, 100)).toContain('(3.0%)')
  })

  it('every segment is a predicate over columns that actually exist', () => {
    // An ICP defined over fields nobody populates is a read surface with no writer in a strategy hat.
    for (const s of SEGMENTS) {
      expect(s.predicate).toMatch(/\bl\.(source|country|industry|email)\b/)
      expect(s.thesis.length).toBeGreaterThan(20)
    }
  })

  it('reports NOT CHECKED when segment scoring fails', async () => {
    const throwing: any = { query: async () => { throw new Error('boom') } }
    const r = await scoreSegments(throwing)
    expect(r.checked).toBe(false)
    expect(r.scores).toEqual([])
  })
})

describe('disqualification rules are stated, counted, and NOT acted on', () => {
  it('every rule carries a written reason', () => {
    for (const r of DISQUALIFY) expect(r.why.length).toBeGreaterThan(30)
  })

  it('catches free mailboxes, role addresses and missing country', () => {
    expect(DISQUALIFY.map((r) => r.key).sort()).toEqual(['free_mailbox', 'no_country', 'role_address'])
  })

  it('Scout never writes to leads — retirement is Mason gated action', () => {
    // Two agents writing the same rows is how state races. Scout counts; Mason acts.
    expect(SCOUT_CODE).not.toMatch(/UPDATE ps_outreach_leads/)
    expect(SCOUT_CODE).not.toMatch(/DELETE FROM ps_outreach_leads/)
  })

  it('reports NOT CHECKED when the query fails', async () => {
    const throwing: any = { query: async () => { throw new Error('boom') } }
    const r = await countDisqualified(throwing)
    expect(r.checked).toBe(false)
  })
})

describe('a contradicting competitor price is SURFACED, never resolved', () => {
  const facts = (price: string | null): IntelState['facts'] => [
    { competitor: 'caniphish', headline_price: price, pricing_model: 'per_seat', capturedAt: '2026-08-03' },
  ]

  it('raises a decision when a fetched price undercuts our per-seat rate', () => {
    const [i] = contradictionIncidents(facts('$0.35/user/month'), 0.598)
    expect(i).toBeTruthy()
    expect(i.summary).toContain(LOWEST_PRICE_CLAIM)
    expect(i.summary).toContain('decision for Kaan')
    expect(i.summary).toContain('copy edit for Aria')
    expect(i.summary).toContain('Scout states the contradiction and stops')
  })

  it('does NOT raise when our price is lower', () => {
    expect(contradictionIncidents(facts('$4.50/user/month'), 0.598)).toEqual([])
  })

  it('ignores a competitor with no fetched price — silence is not evidence', () => {
    expect(contradictionIncidents(facts(null), 0.598)).toEqual([])
  })

  it('ignores a price string it cannot parse rather than guessing', () => {
    expect(contradictionIncidents(facts('contact sales for pricing'), 0.598)).toEqual([])
  })

  it('never proposes a price change of our own', () => {
    const [i] = contradictionIncidents(facts('$0.35/user/month'), 0.598)
    expect(i.summary).not.toMatch(/we should (lower|raise|change|match)/i)
    expect(SCOUT_SRC).toContain('never proposes a price')
  })
})

describe('the report line', () => {
  const intel: IntelState = { checked: true, configured: 7, withVerifiedRow: 0, notChecked: ['A'], staleDays: null, facts: [], line: 'Competitor intel: 0/7 ...' }

  it('claims nothing when neither source was readable', () => {
    const line = buildScoutLine({ status: 'INSUFFICIENT_DATA', icpVerdict: '', intel, disqualified: [], incidents: [], notChecked: [] })
    expect(line).toContain('insufficient data')
    expect(line).toContain('No targeting or competitor claim is possible')
  })

  it('always restates the data-side-only guardrail', () => {
    const line = buildScoutLine({ status: 'ACTIVE', icpVerdict: 'ICP: UNMEASURED', intel, disqualified: [], incidents: [], notChecked: [] })
    expect(line).toContain('never edits copy')
    expect(line).toContain('never proposes a price')
  })

  it('flags off-ICP leads that are still in an active stage', () => {
    const line = buildScoutLine({
      status: 'ACTIVE', icpVerdict: 'x', intel,
      disqualified: [{ key: 'role_address', why: 'w', total: 40, stillActive: 12 }],
      incidents: [], notChecked: [],
    })
    expect(line).toContain('off-ICP still active: 12 role_address')
  })
})

describe('the ghost is actually gone', () => {
  it('research.ts no longer exists', () => {
    expect(fs.existsSync('server/os/agents/research.ts')).toBe(false)
  })

  it('neither standup path imports it or calls it', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, f).not.toContain("from './agents/research'")
      expect(src, f).not.toContain('runResearchAgent(')
      expect(src, f).toContain('runScoutAgent(')
    }
  })
})
