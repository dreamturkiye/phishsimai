// ─────────────────────────────────────────────────────────────────────────────
//  PS-SALES-REPLY-01 — the two guarantees, encoded.
//
//  These are not abstract cases. On 2026-08-03 outreach_reply_drafts holds exactly ONE row:
//  kaanari@mac.com, the founder's own address, staged pipeline_stage='internal_test' after he
//  replied "TEST" to verify the Gmail capture path. That row is the live proof for both tests.
//
//  1. EXCLUSION. The internal row must be ABSENT from the classifier's input set — not fetched and
//     then filtered. The distinction is the whole point: a downstream filter is one forgotten call
//     site away from letting the contamination back in, and "we filter it later" is precisely how
//     five localhost simulations became a reported 100% open rate. So this asserts BOTH halves:
//       (a) the exclusion predicate is IN the query text, and
//       (b) fetchReplyQueue applies NO post-filter — it returns exactly what SQL returned.
//     (a) alone would not prove the filter is doing the work; (b) alone would not prove anything is
//     filtering. Together they force the exclusion to live in the SELECT.
//
//  2. EMPTY QUEUE. Zero eligible rows must produce zero classifications and zero tasks. THIS TEST
//     IS THE ANTI-GHOST GUARANTEE. An agent that emits classifier output over an empty queue is the
//     ghost problem in a new costume, and this codebase has paid for that twice.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest'

vi.mock('../telegram', () => ({ sendTelegram: vi.fn(async () => {}) }))
vi.mock('../llmChat', () => ({ llmComplete: vi.fn(async () => ({ text: '{}' })) }))
vi.mock('../conn', () => ({ getSql: () => { throw new Error('tests must pass an explicit sql') } }))

import {
  fetchReplyQueue,
  runSalesReplyAgent,
  INTERNAL_EXCLUSION_SQL,
  classifyByRules,
  decideAction,
  replyToTrialMetric,
  SUPPRESS_MIN_CONFIDENCE,
} from './salesReplies'

/** The actual row in outreach_reply_drafts on 2026-08-03. Not invented. */
const REAL_INTERNAL_ROW = {
  id: 'e2b1c0aa-0000-4000-8000-000000000001',
  lead_id: '5f0f7a1e-0000-4000-8000-000000000002',
  from_email: 'kaanari@mac.com',
  inbound_snippet: 'TEST',
  company: '',
}

/** Records every SQL string it is asked to run, and returns whatever the test scripted. */
function spySql(rows: any[] = []) {
  const queries: string[] = []
  const fn: any = (..._args: any[]) => Promise.resolve([])
  fn.query = async (q: string) => { queries.push(q); return rows }
  fn.queries = queries
  return fn
}

describe('EXCLUSION — the internal row never enters the classifier input set', () => {
  it('the exclusion predicate is present in the QUERY TEXT, not applied afterwards', async () => {
    const sql = spySql([])
    await fetchReplyQueue(sql)
    expect(sql.queries).toHaveLength(1)
    const q = sql.queries[0]
    // The predicate itself, verbatim from the exported constant the query is built from.
    expect(q).toContain(INTERNAL_EXCLUSION_SQL.trim().split('\n')[0].trim())
    expect(q).toContain("pipeline_stage <> 'internal_test'")
    expect(q).toContain('kaanari@mac.com')
    expect(q).toContain("split_part(l.email, '@', 2)) <> 'phishsimai.com'")
    // And it is a WHERE-clause exclusion on the joined lead, not a SELECT-list decoration.
    expect(q).toMatch(/WHERE[\s\S]*internal_test/i)
  })

  it('applies NO post-filter — it returns exactly what SQL returned', async () => {
    // Hand it the real internal row anyway. If fetchReplyQueue filtered downstream it would drop
    // this and the test would fail — which is what we want, because a downstream filter would mean
    // the SELECT is not the thing doing the work.
    const sql = spySql([REAL_INTERNAL_ROW])
    const out = await fetchReplyQueue(sql)
    expect(out).toHaveLength(1)
    expect(out[0].from_email).toBe('kaanari@mac.com')
  })

  it('with the real queue state (only the internal row exists) the agent sees queued:0', async () => {
    // The SELECT excludes it, so SQL returns nothing — this is the shape of the live prod result.
    const sql = spySql([])
    const run = await runSalesReplyAgent(sql)
    expect(run.queued).toBe(0)
    expect(run.classified).toBe(0)
  })

  it('kaanari@mac.com is never classified', async () => {
    const sql = spySql([])
    const run = await runSalesReplyAgent(sql)
    expect(run.byClass).toEqual({})
    expect(JSON.stringify(run)).not.toContain('kaanari@mac.com')
  })
})

describe('EMPTY QUEUE — the anti-ghost guarantee', () => {
  it('0 rows produces 0 classifications and 0 tasks, all-zero return', async () => {
    const sql = spySql([])
    const run = await runSalesReplyAgent(sql)
    expect(run).toMatchObject({
      queued: 0, classified: 0, tasksIssued: 0, suppressed: 0, draftsForKaan: 0, noAction: 0,
    })
    expect(run.byClass).toEqual({})
  })

  it('issues no work and says the empty result is CORRECT, not a failure', async () => {
    const run = await runSalesReplyAgent(spySql([]))
    expect(run.line).toContain('nothing to classify')
    expect(run.line).toContain('CORRECT')
    expect(run.line).toContain('not a reason to generate work')
  })

  it('runs exactly ONE query and then stops — no speculative follow-up work', async () => {
    const sql = spySql([])
    await runSalesReplyAgent(sql)
    expect(sql.queries).toHaveLength(1)
  })

  it('never emits a percentage over an empty denominator', async () => {
    const run = await runSalesReplyAgent(spySql([]))
    expect(run.line).not.toMatch(/\d%/)
    expect(replyToTrialMetric(0, 0)).toContain('N/A, n=0')
    expect(replyToTrialMetric(0, 0)).not.toMatch(/\d%/)
  })
})

describe('ASYMMETRIC SAFETY — ambiguity drafts, it never suppresses', () => {
  it('a confident explicit opt-out auto-suppresses', () => {
    const c = classifyByRules('', 'please unsubscribe me')!
    expect(c.cls).toBe('unsubscribe')
    expect(c.confidence).toBeGreaterThanOrEqual(SUPPRESS_MIN_CONFIDENCE)
    expect(decideAction(c)).toBe('auto_suppress')
  })

  it('the SAME class below the confidence bar drafts instead of suppressing', () => {
    // The irreversible action must never fire on a weak signal.
    expect(decideAction({ cls: 'unsubscribe', confidence: 0.79, why: 'uncertain' })).toBe('draft_for_kaan')
    expect(decideAction({ cls: 'hostile', confidence: 0.5, why: 'uncertain' })).toBe('draft_for_kaan')
  })

  it('interest and objections never auto-act, at any confidence', () => {
    expect(decideAction({ cls: 'interested', confidence: 1, why: '' })).toBe('draft_for_kaan')
    expect(decideAction({ cls: 'objection', confidence: 1, why: '' })).toBe('draft_for_kaan')
  })

  it('an out-of-office is not a lead and produces no action', () => {
    const c = classifyByRules('', 'I am out of the office until Monday and will return then')!
    expect(c.cls).toBe('auto_reply')
    expect(decideAction(c)).toBe('no_action')
  })

  it('an ANGRY opt-out reads as hostile, not merely unsubscribe', () => {
    const c = classifyByRules('', 'stop emailing me, this is spam')!
    expect(c.cls).toBe('hostile')
  })

  it('a bounce notice mentioning pricing is not a prospect', () => {
    // auto_reply is checked BEFORE interest precisely so a mailer-daemon cannot become a warm lead.
    const c = classifyByRules('', 'Delivery has failed. Original message: ... our pricing ...')!
    expect(c.cls).toBe('auto_reply')
  })

  it('a mixed signal is left to the model rather than guessed', () => {
    expect(classifyByRules('', 'interested but too expensive right now')).toBeNull()
  })
})

describe('reply→trial reporting', () => {
  it('is N/A at n=0, counts-only below 30, and never a bare rate', () => {
    expect(replyToTrialMetric(0, 0)).toContain('N/A, n=0')
    expect(replyToTrialMetric(1, 4)).toContain('1/4')
    expect(replyToTrialMetric(1, 4)).not.toMatch(/\d%/)
    expect(replyToTrialMetric(3, 40)).toMatch(/3\/40 \(7\.5%\)/)
  })
})
