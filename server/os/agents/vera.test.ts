// PS-VERA-01 — tests for the BUILD-AND-ARM customer success agent.
//
// The bar the founder set: she reports insufficient-data honestly, and CANNOT emit an at-risk count
// or a health score over zero accounts. The ghost's sharpest edge was `retentionScore = 100` over an
// empty book, which Janet printed as "100% retention" every morning — so that specific number is
// pinned as impossible.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  isVerasAccount,
  scoreAccountHealth,
  retentionScore,
  atRiskAccounts,
  buildVeraLine,
  readAccounts,
  runVeraAgent,
  ONBOARDING,
  CHURN_SIGNALS,
  EXPANSION_SIGNALS,
  INTERNAL_ORG_NAMES,
  INTERNAL_ORG_EXCLUSION_SQL,
  type AccountUsage,
  type AccountBook,
} from './vera'

const NOW = Date.parse('2026-08-03T12:00:00Z')
const usage = (over: Partial<AccountUsage> = {}): AccountUsage => ({
  orgId: 'o1', name: 'Acme MSP', plan: 'free', hasSubscription: false,
  createdAt: '2026-07-01T00:00:00Z', campaigns: 0, lastCampaignAt: null, resultRows: 0, verifiedDomains: 0, ...over,
})

const emptyBook: AccountBook = { checked: true, external: [], internalExcluded: 3, paying: 0, trialing: 0, free: 0 }

// ─────────────────────────────────────────────────────────────────────────────
//  THE ANTI-FABRICATION BAR
// ─────────────────────────────────────────────────────────────────────────────
describe('she cannot invent anything over zero accounts', () => {
  it('retention over an empty book is NULL, never 100', () => {
    // The ghost: `retentionScore = customers.length === 0 ? 100 : ...`
    expect(retentionScore(0, 0)).toBeNull()
    expect(retentionScore(0, 0)).not.toBe(100)
  })

  it('retention computes honestly once there IS a book', () => {
    expect(retentionScore(3, 1)).toBe(75)
    expect(retentionScore(1, 0)).toBe(100) // 100 is legitimate here — one account, none churned
  })

  it('emits no at-risk items over an empty health list', () => {
    expect(atRiskAccounts([])).toEqual([])
  })

  it('the report says "no accounts to assess", NOT "0 at-risk"', () => {
    // "0 at-risk" implies a check ran over a population. There is no population.
    const line = buildVeraLine({ status: 'BUILT_AND_ARMED', book: emptyBook, healths: [], atRisk: [], retention: null })
    expect(line).toContain('No paying or trialing account exists to assess')
    expect(line).toContain('none is invented')
    expect(line).not.toMatch(/\b0 at-risk\b/)
  })

  it('the report explicitly refuses the 100% retention claim', () => {
    const line = buildVeraLine({ status: 'BUILT_AND_ARMED', book: emptyBook, healths: [], atRisk: [], retention: null })
    expect(line).toContain('NOT MEASURABLE with nothing to retain')
    expect(line).toContain('not 100%')
    expect(line).not.toMatch(/100%\s*retention/)
  })

  // Found by running her: she scored the one free signup as at_risk while her own line said "no
  // accounts to assess". Both could not be true, and "at-risk" was the wrong frame — a signup that
  // never ran a campaign has not churned and cannot. It never activated.
  it('does NOT treat a free signup as an at-risk customer — that is Nova activation problem', async () => {
    const sql: any = () => Promise.resolve([{ n: 4 }])
    sql.query = async () => [{
      org_id: 'o1', name: 'egroth', plan: 'free', has_sub: false,
      created_at: '2026-07-25T00:00:00Z', campaigns: 0, last_campaign_at: null, result_rows: 0, verified_domains: 0,
    }]
    const r = await runVeraAgent({ sql, skipCurrency: true, now: NOW })
    expect(r.atRisk).toEqual([])
    expect(r.healths).toEqual([])
    expect(r.referredToNova).toEqual(['egroth'])
    expect(r.line).toContain('referred to Nova')
    expect(r.line).toContain('activation problem, not churn')
  })

  it('the ownership boundary is explicit', () => {
    expect(isVerasAccount({ ...usage(), hasSubscription: true })).toBe(true)
    expect(isVerasAccount({ ...usage(), plan: 'growth' })).toBe(true)
    expect(isVerasAccount({ ...usage(), plan: 'free', hasSubscription: false })).toBe(false)
  })

  it('an end-to-end run over an empty book emits no at-risk and no retention', async () => {
    const sql: any = () => Promise.resolve([{ n: 3 }])
    sql.query = async () => []
    const r = await runVeraAgent({ sql, skipCurrency: true, now: NOW })
    expect(r.status).toBe('BUILT_AND_ARMED')
    expect(r.atRisk).toEqual([])
    expect(r.healths).toEqual([])
    expect(r.retention).toBeNull()
    expect(r.incidents).toEqual([])
  })

  it('claims nothing at all when the book is unreadable', async () => {
    const sql: any = () => Promise.reject(new Error('down'))
    sql.query = async () => { throw new Error('down') }
    const r = await runVeraAgent({ sql, skipCurrency: true, now: NOW })
    expect(r.status).toBe('INSUFFICIENT_DATA')
    expect(r.line).toContain('insufficient data')
    expect(r.line).toContain('No health or retention claim is possible')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE MACHINERY IS REAL, NOT DESCRIBED
// ─────────────────────────────────────────────────────────────────────────────
describe('the armed machinery computes the moment an account exists', () => {
  it('scores a healthy engaged account', () => {
    const h = scoreAccountHealth(usage({
      hasSubscription: true, verifiedDomains: 1, campaigns: 4, resultRows: 120,
      lastCampaignAt: '2026-08-01T00:00:00Z',
    }), NOW)
    expect(h.score).toBe(100)
    expect(h.band).toBe('healthy')
  })

  it('scores a paying account that never verified a domain as at-risk', () => {
    const h = scoreAccountHealth(usage({ hasSubscription: true, verifiedDomains: 0, campaigns: 0 }), NOW)
    expect(h.band).toBe('at_risk')
    expect(h.reasons.join(' ')).toContain('NO verified sending domain')
  })

  it('penalises a dormant account', () => {
    const active = scoreAccountHealth(usage({ hasSubscription: true, verifiedDomains: 1, campaigns: 2, resultRows: 10, lastCampaignAt: '2026-08-01T00:00:00Z' }), NOW)
    const dormant = scoreAccountHealth(usage({ hasSubscription: true, verifiedDomains: 1, campaigns: 2, resultRows: 10, lastCampaignAt: '2026-05-01T00:00:00Z' }), NOW)
    expect(dormant.score!).toBeLessThan(active.score!)
    expect(dormant.reasons.join(' ')).toMatch(/\d+d since last campaign/)
  })

  it('returns null for an account too new to judge — new is not unhealthy', () => {
    const h = scoreAccountHealth(usage({ createdAt: '2026-08-03T06:00:00Z' }), NOW)
    expect(h.score).toBeNull()
    expect(h.band).toBeNull()
    expect(h.reasons.join(' ')).toContain('too new to judge')
  })

  it('files a critical incident for a PAYING account with no sending domain', async () => {
    const rows = [{
      org_id: 'o9', name: 'Real MSP', plan: 'growth', has_sub: true,
      created_at: '2026-07-01T00:00:00Z', campaigns: 0, last_campaign_at: null, result_rows: 0, verified_domains: 0,
    }]
    const sql: any = () => Promise.resolve([{ n: 4 }])
    sql.query = async (t: string) => (/FROM organizations o/.test(t) ? rows : [])
    const r = await runVeraAgent({ sql, skipCurrency: true, now: NOW })
    expect(r.status).toBe('ACTIVE')
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].severity).toBe('critical')
    expect(r.incidents[0].summary).toContain('NO verified sending domain')
  })

  it('every onboarding step names a measurable success signal, not an activity', () => {
    // "we sent the day-3 email" is activity; "they ran a campaign" is value.
    expect(ONBOARDING.length).toBeGreaterThanOrEqual(5)
    for (const s of ONBOARDING) {
      expect(s.successSignal.length, s.key).toBeGreaterThan(15)
      expect(s.successSignal, s.key).not.toMatch(/^sent |^email /i)
    }
  })

  it('every churn signal carries a why AND an intervention', () => {
    expect(CHURN_SIGNALS.length).toBeGreaterThanOrEqual(4)
    for (const c of CHURN_SIGNALS) {
      expect(c.why.length, c.key).toBeGreaterThan(30)
      expect(c.intervention.length, c.key).toBeGreaterThan(30)
    }
  })

  it('expansion triggers are evidence-backed, not pitches', () => {
    expect(EXPANSION_SIGNALS.length).toBeGreaterThanOrEqual(3)
    for (const e of EXPANSION_SIGNALS) expect(e.why.length).toBeGreaterThan(20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  INTERNAL ACCOUNTS ARE NOT CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────────
describe('our own organizations never count as accounts', () => {
  it('excludes all three by name, at the SELECT level', () => {
    for (const n of INTERNAL_ORG_NAMES) expect(INTERNAL_ORG_EXCLUSION_SQL).toContain(n)
    expect(INTERNAL_ORG_EXCLUSION_SQL).toContain('o.name <> ALL')
  })

  it('names them explicitly rather than pattern-matching the slug', () => {
    // A rule like "contains phishsim" would silently exclude a real customer called
    // "PhishSim Partners".
    expect(INTERNAL_ORG_EXCLUSION_SQL).not.toMatch(/LIKE|ILIKE|~~/)
  })

  it('reports how many were excluded, so the number is auditable', async () => {
    const sql: any = () => Promise.resolve([{ n: 4 }])
    sql.query = async () => [{
      org_id: 'o1', name: 'egroth', plan: 'free', has_sub: false,
      created_at: '2026-07-25T00:00:00Z', campaigns: 0, last_campaign_at: null, result_rows: 0, verified_domains: 0,
    }]
    const book = await readAccounts(sql)
    expect(book.external).toHaveLength(1)
    expect(book.internalExcluded).toBe(3)
    expect(book.paying).toBe(0)
  })
})

describe('the ghost is replaced', () => {
  it('neither standup path calls the old CS agent', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, f).not.toContain('runCSAgent(')
      expect(src, f).toContain('runVeraAgent(')
    }
  })

  it('customerSuccess.ts is gone', () => {
    expect(fs.existsSync('server/os/agents/customerSuccess.ts')).toBe(false)
  })
})
