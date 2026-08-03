// PS-NOVA-01 — tests for the BUILD-AND-ARM product growth agent.
//
// The founder's bar: activation funnel instrumented, structure reported honestly, NO invented
// activation rate over n=1. The ghost's sin was ranking features by "revenue impact" with zero
// revenue and zero usage — every "(HIGH)" was a guess wearing a metric's clothes. So the pinned
// properties are: no rate below n=30, and nothing is ranked until the ranking is earned.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  stepReport,
  buildFunnel,
  biggestDropOff,
  rankFeatures,
  buildNovaLine,
  runNovaAgent,
  measureActivation,
  MILESTONES,
  FEATURE_CANDIDATES,
  MIN_N,
  type FunnelCounts,
} from './nova'

const NOVA_SRC = fs.readFileSync('server/os/agents/nova.ts', 'utf8')

const counts = (over: Partial<FunnelCounts> = {}): FunnelCounts => ({
  checked: true, signup: 1, domainVerified: 0, campaignCreated: 0, campaignResult: 0, paid: 0, internalExcluded: 3, ...over,
})

// ─────────────────────────────────────────────────────────────────────────────
//  NO INVENTED RATE OVER n=1
// ─────────────────────────────────────────────────────────────────────────────
describe('no activation rate over n=1', () => {
  it('reports counts only, never a percentage, below n=30', () => {
    const s = stepReport('campaign_created', 'Created a first campaign', 0, 1)
    expect(s.line).toContain('0/1')
    expect(s.line).toContain(`no rate below n=${MIN_N}`)
    expect(s.line).not.toContain('%')
  })

  it('never renders 100% for a step everyone reached at n=1', () => {
    // The seductive one: 1/1 looks like 100% activation.
    const s = stepReport('signup', 'Signed up', 1, 1)
    expect(s.line).not.toContain('100')
    expect(s.line).toContain('1/1')
  })

  it('says N/A at n=0 rather than 0%', () => {
    expect(stepReport('x', 'X', 0, 0).line).toContain('N/A, n=0')
  })

  it('gives a real rate once n>=30', () => {
    expect(stepReport('x', 'X', 12, 100).line).toContain('(12.0%)')
  })

  it('the whole funnel is rate-free at n=1', () => {
    const lines = buildFunnel(counts()).map((s) => s.line).join(' ')
    expect(lines).not.toContain('%')
  })

  it('the report line refuses the rate explicitly and says why', () => {
    const funnel = buildFunnel(counts())
    const line = buildNovaLine({ status: 'BUILT_AND_ARMED', counts: counts(), funnel, dropOff: biggestDropOff(funnel), rankedFeatures: [] })
    expect(line).toContain('No activation rate is stated')
    expect(line).toContain('fabrication with a decimal point')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  RANKING IS EARNED, NOT ASSERTED
// ─────────────────────────────────────────────────────────────────────────────
describe('feature ranking is derived, never labelled by hand', () => {
  it('no candidate carries a hand-written priority label', () => {
    // product.ts shipped "(HIGH)" inside the backlog strings.
    for (const f of FEATURE_CANDIDATES) {
      expect(f.label, f.key).not.toMatch(/\b(HIGH|MEDIUM|LOW|P0|P1|critical)\b/i)
      expect(f.unblocks, f.key).toBeTruthy()
    }
  })

  it('ranks NOTHING when no milestone has a big enough denominator', () => {
    expect(rankFeatures(buildFunnel(counts()))).toEqual([])
  })

  it('ranks by MEASURED loss once there is volume', () => {
    const c = counts({ signup: 100, domainVerified: 40, campaignCreated: 35, campaignResult: 30, paid: 2 })
    const ranked = rankFeatures(buildFunnel(c))
    expect(ranked.length).toBeGreaterThan(0)
    // 60 lost at domain verification dwarfs the rest, so guided DNS must rank first.
    expect(ranked[0].key).toBe('guided_dns')
    expect(ranked[0].lostAtMilestone).toBe(60)
    expect(ranked[0].rationale).toContain('60 of 100')
  })

  it('the ranking is ordered by loss, not by author preference', () => {
    const c = counts({ signup: 100, domainVerified: 95, campaignCreated: 40, campaignResult: 38, paid: 1 })
    const ranked = rankFeatures(buildFunnel(c))
    expect(ranked[0].key).toBe('template_quickstart') // 55 lost here, only 5 at domain
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].lostAtMilestone).toBeGreaterThanOrEqual(ranked[i].lostAtMilestone)
    }
  })

  it('says plainly that nothing is ranked and why', () => {
    const funnel = buildFunnel(counts())
    const line = buildNovaLine({ status: 'BUILT_AND_ARMED', counts: counts(), funnel, dropOff: biggestDropOff(funnel), rankedFeatures: [] })
    expect(line).toContain('BUILT but UNEARNED')
    expect(line).toContain('no ')
    expect(line).toContain('denominator large enough')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE INSTRUMENTATION IS REAL
// ─────────────────────────────────────────────────────────────────────────────
describe('milestones are counted over rows that exist', () => {
  it('every milestone maps to a real table, not an unlogged UI event', () => {
    // A funnel over columns nobody populates is a read surface with no writer.
    expect(MILESTONES.map((m) => m.key)).toEqual(['signup', 'domain_verified', 'campaign_created', 'campaign_result', 'paid'])
    for (const m of MILESTONES) expect(m.why.length, m.key).toBeGreaterThan(25)
    expect(NOVA_SRC).not.toMatch(/logged_in|page_view|dashboard_viewed/)
  })

  it('finds the first real drop-off', () => {
    const d = biggestDropOff(buildFunnel(counts({ signup: 1, domainVerified: 0 })))
    expect(d).toBeTruthy()
    expect(d!.lostFrom.key).toBe('signup')
    expect(d!.step.key).toBe('domain_verified')
  })

  it('reports no drop-off when nobody has fallen out', () => {
    expect(biggestDropOff(buildFunnel(counts({ signup: 2, domainVerified: 2, campaignCreated: 2, campaignResult: 2, paid: 2 })))).toBeNull()
  })

  it('frames the drop-off at n=1 as one account behaviour, not a diagnosis', () => {
    const funnel = buildFunnel(counts())
    const line = buildNovaLine({ status: 'BUILT_AND_ARMED', counts: counts(), funnel, dropOff: biggestDropOff(funnel), rankedFeatures: [] })
    expect(line).toContain("one account's behaviour, not a funnel diagnosis")
  })

  it('files the never-activated observation as MEDIUM, not a critical verdict', async () => {
    const sql: any = () => Promise.resolve([{ n: 4 }])
    sql.query = async () => [{ signup: 1, domain_verified: 0, campaign_created: 0, campaign_result: 0, paid: 0 }]
    const r = await runNovaAgent({ sql, skipCurrency: true })
    expect(r.status).toBe('BUILT_AND_ARMED')
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].severity).toBe('medium')
    expect(r.incidents[0].summary).toContain('observation, not a diagnosis')
  })

  it('excludes our own organizations, reusing Vera single definition', () => {
    // One definition of "our org", imported — not a second copy to drift.
    expect(NOVA_SRC).toContain("from './vera'")
    expect(NOVA_SRC).toContain('INTERNAL_ORG_EXCLUSION_SQL')
  })

  it('claims nothing when the funnel is unreadable', async () => {
    const sql: any = () => Promise.reject(new Error('down'))
    sql.query = async () => { throw new Error('down') }
    const r = await runNovaAgent({ sql, skipCurrency: true })
    expect(r.status).toBe('INSUFFICIENT_DATA')
    expect(r.line).toContain('No activation claim is possible')
  })

  it('reports NOT CHECKED rather than zeros when the query fails', async () => {
    const throwing: any = { query: async () => { throw new Error('x') } }
    const c = await measureActivation(throwing)
    expect(c.checked).toBe(false)
  })
})

describe('the ghost is gone', () => {
  it('product.ts no longer exists', () => {
    expect(fs.existsSync('server/os/agents/product.ts')).toBe(false)
  })

  it('neither standup path imports or calls it', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, f).not.toContain("from './agents/product'")
      expect(src, f).not.toContain('runProductAgent(')
      expect(src, f).toContain('runNovaAgent(')
    }
  })
})
