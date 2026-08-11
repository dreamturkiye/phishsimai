// PS-MASON-01 — tests for the full-operator expansion.
//
// The expansion is only safe if it ADDS. Two families of test:
//   1. THE LINE HOLDS — every guarantee from salesReplies.ts survives, and Mason delegates to it
//      rather than carrying a second classifier.
//   2. HE DEFERS — Dex's send-health and Rex's funnel-trust verdicts actually stop him acting, and
//      the deferral is reported rather than silent.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  decideActions,
  stepLine,
  buildMasonLine,
  runHygiene,
  readDexVerdict,
  readRexVerdict,
  STALE_DAYS,
  MIN_N,
  type FoundationVerdicts,
  type ActionPermissions,
} from './mason'
import { SUPPRESS_MIN_CONFIDENCE, decideAction, classifyByRules } from './salesReplies'

const MASON_SRC = fs.readFileSync('server/os/agents/mason.ts', 'utf8')

const verdicts = (over: { dex?: Partial<FoundationVerdicts['dex']>; rex?: Partial<FoundationVerdicts['rex']> } = {}): FoundationVerdicts => ({
  dex: { checked: true, paused: false, tripped: false, measured: true, rate: 0.017, threshold: 0.03, reason: 'ok', ...over.dex },
  rex: { checked: true, openCritical: 0, stageViolations: 0, funnelTrustworthy: true, reason: 'ok', ...over.rex },
})

// ─────────────────────────────────────────────────────────────────────────────
//  1. THE LINE HOLDS
// ─────────────────────────────────────────────────────────────────────────────
describe('the expansion does not loosen anything the live agent guarantees', () => {
  it('delegates to the live classifier instead of carrying a second copy', () => {
    // Two classifiers is two answers. Mason must CALL salesReplies, not reimplement it.
    expect(MASON_SRC).toContain("from './salesReplies'")
    expect(MASON_SRC).toContain('runSalesReplyAgent(sql)')
    // No rival classification logic smuggled in.
    expect(MASON_SRC).not.toMatch(/UNSUB_RE|HOSTILE_RE|classifyByModel/)
  })

  it('suppression still requires >= 0.8 confidence — unchanged', () => {
    expect(SUPPRESS_MIN_CONFIDENCE).toBe(0.8)
    expect(decideAction({ cls: 'unsubscribe', confidence: 0.79, why: '' })).toBe('draft_for_kaan')
    expect(decideAction({ cls: 'unsubscribe', confidence: 0.8, why: '' })).toBe('auto_suppress')
  })

  it('ambiguity still drafts rather than suppressing', () => {
    expect(decideAction({ cls: 'hostile', confidence: 0.5, why: '' })).toBe('draft_for_kaan')
    expect(classifyByRules('', 'maybe later, we already use something')).toMatchObject({ cls: 'objection' })
  })

  it('interested and objection still gate to a human — never auto-sent', () => {
    expect(decideAction({ cls: 'interested', confidence: 0.99, why: '' })).toBe('draft_for_kaan')
    expect(decideAction({ cls: 'objection', confidence: 0.99, why: '' })).toBe('draft_for_kaan')
    expect(MASON_SRC).toContain('No draft was sent to a prospect')
  })

  it('an empty reply queue is reported as correct, not as a failure', () => {
    const line = buildMasonLine({
      status: 'ACTIVE', verdicts: verdicts(), permissions: decideActions(verdicts()),
      replies: { queued: 0, classified: 0, tasksIssued: 0, suppressed: 0, draftsForKaan: 0, noAction: 0, byClass: {}, line: '' },
      funnel: { checked: true, contacted: 933, replied: 0, engaged: 0, trials: 0, customers: 0, lines: ['touched→replied: 0/933 (0.0%)'] },
      priority: [],
      hygiene: { bouncedActive: 0, retired: 0, staleProposed: 0, gate: 'allowed', gateReason: 'nothing to retire', proposals: [] },
    })
    expect(line).toContain('correct at the current funnel state')
  })

  it('invents no priority list when there are no engaged leads', () => {
    const line = buildMasonLine({
      status: 'ACTIVE', verdicts: verdicts(), permissions: decideActions(verdicts()), replies: null,
      funnel: { checked: true, contacted: 933, replied: 0, engaged: 0, trials: 0, customers: 0, lines: [] },
      priority: [],
      hygiene: { bouncedActive: 0, retired: 0, staleProposed: 0, gate: 'allowed', gateReason: '', proposals: [] },
    })
    expect(line).toContain('none invented')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  2. HE DEFERS TO THE FOUNDATION AGENTS
// ─────────────────────────────────────────────────────────────────────────────
describe('Mason defers to Dex on send health', () => {
  it('will not tune a sequence when the breaker is TRIPPED', () => {
    const p = decideActions(verdicts({ dex: { tripped: true, paused: true, reason: 'Dex: breaker TRIPPED' } }))
    expect(p.maySequenceTune).toBe(false)
    expect(p.deferrals.join(' ')).toContain('DEFERRED to Dex')
  })

  it('will not tune when the send window is UNMEASURED — no data is not permission', () => {
    const p = decideActions(verdicts({ dex: { measured: false, paused: true, reason: 'unmeasured' } }))
    expect(p.maySequenceTune).toBe(false)
  })

  it("fails closed when Dex's verdict cannot be read", async () => {
    const throwing: any = () => Promise.reject(new Error('down'))
    const v = await readDexVerdict(throwing)
    expect(v.checked).toBe(false)
    expect(v.paused).toBe(true)
    expect(decideActions({ dex: v, rex: verdicts().rex }).maySequenceTune).toBe(false)
  })

  it('DOES tune when Dex reports healthy — deferral is not permanent paralysis', () => {
    expect(decideActions(verdicts()).maySequenceTune).toBe(true)
  })
})

describe('Mason defers to Rex on funnel trust', () => {
  it('will not prioritise or retire while a stage violation is OPEN', () => {
    const p = decideActions(verdicts({ rex: { stageViolations: 2, funnelTrustworthy: false, reason: 'Rex: 2 OPEN stage violation(s)' } }))
    expect(p.mayPrioritise).toBe(false)
    expect(p.mayRetire).toBe(false)
    expect(p.deferrals.join(' ')).toContain('DEFERRED to Rex')
  })

  it('is NOT paralysed by critical incidents in other agents domains', () => {
    // A fabricating marketing module and a hardcoded price are real defects, but neither makes
    // pipeline_stage untrue. Standing down on those would make Mason permanently inert for other
    // people's bugs.
    const p = decideActions(verdicts({ rex: { openCritical: 4, stageViolations: 0, funnelTrustworthy: true } }))
    expect(p.mayPrioritise).toBe(true)
    expect(p.mayRetire).toBe(true)
  })

  it("fails closed when Rex's verdict cannot be read", async () => {
    const throwing: any = () => Promise.reject(new Error('down'))
    const v = await readRexVerdict(throwing)
    expect(v.checked).toBe(false)
    expect(v.funnelTrustworthy).toBe(false)
  })

  it('reads open incidents and classifies stage violations specifically', async () => {
    const sql: any = () => Promise.resolve([
      { detector: 'stage_violation', severity: 'critical' },
      { detector: 'pricing_drift', severity: 'critical' },
      { detector: 'blind_gate', severity: 'high' },
    ])
    const v = await readRexVerdict(sql)
    expect(v.stageViolations).toBe(1)
    expect(v.openCritical).toBe(2)
    expect(v.funnelTrustworthy).toBe(false)
  })
})

describe('replies are deliberately NOT gated on the foundation verdicts', () => {
  it('reply handling runs even when both foundation agents say stand down', () => {
    // Gating replies on the bounce rate would leave an interested prospect unanswered because a
    // deliverability metric moved — trading the scarcest thing we have for a number.
    const p = decideActions(verdicts({ dex: { paused: true, tripped: true }, rex: { funnelTrustworthy: false, stageViolations: 3 } }))
    expect(p.maySequenceTune).toBe(false)
    expect(p.mayPrioritise).toBe(false)
    // No permission flag governs replies at all — the absence is the point.
    expect(Object.keys(p)).not.toContain('mayHandleReplies')
    expect(MASON_SRC).toContain('why replies are not')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  ASYMMETRIC RETIREMENT
// ─────────────────────────────────────────────────────────────────────────────
function hygieneSql(bouncedActive: number, stale: number, updated = 0) {
  const calls: string[] = []
  const fn: any = (strings: TemplateStringsArray) => { calls.push(strings.join('?')); const p: any = Promise.resolve([]); p.catch = () => p; return p }
  fn.calls = calls
  fn.query = async (text: string) => {
    calls.push(text.replace(/\s+/g, ' ').trim())
    if (/UPDATE ps_outreach_leads/.test(text)) return Array.from({ length: updated }, (_, i) => ({ id: String(i) }))
    if (/bounced = true/.test(text)) return [{ n: bouncedActive }]
    return [{ n: stale }]
  }
  return fn
}

describe('retirement is asymmetric — bounced is retired, silence is only proposed', () => {
  const allow: ActionPermissions = { maySequenceTune: true, mayPrioritise: true, mayRetire: true, deferrals: [] }

  it('NEVER auto-retires stale-no-reply leads, however many there are', async () => {
    const sql = hygieneSql(0, 159)
    const r = await runHygiene(sql, allow, { dryRun: true })
    expect(r.staleProposed).toBe(159)
    expect(r.retired).toBe(0)
    expect(r.proposals.join(' ')).toContain('silence is not refusal')
    expect(r.proposals.join(' ')).toContain('founder decision')
    expect(sql.calls.filter((c: string) => /UPDATE ps_outreach_leads/.test(c))).toEqual([])
  })

  it('reports the stale count with the window that defined it', async () => {
    const r = await runHygiene(hygieneSql(0, 159), allow, { dryRun: true })
    expect(r.proposals.join(' ')).toContain(`>${STALE_DAYS}d`)
  })

  it('writes nothing when retirement is deferred', async () => {
    const sql = hygieneSql(18, 159)
    const deferred: ActionPermissions = { ...allow, mayRetire: false, deferrals: ['x'] }
    const r = await runHygiene(sql, deferred)
    expect(r.bouncedActive).toBe(18)
    expect(r.retired).toBe(0)
    expect(r.gate).toBe('deferred')
    expect(sql.calls.filter((c: string) => /UPDATE ps_outreach_leads/.test(c))).toEqual([])
  })

  it('a dry run counts but writes nothing', async () => {
    const sql = hygieneSql(18, 0)
    const r = await runHygiene(sql, allow, { dryRun: true })
    expect(r.gate).toBe('dry_run')
    expect(r.retired).toBe(0)
    expect(sql.calls.filter((c: string) => /UPDATE ps_outreach_leads/.test(c))).toEqual([])
  })

  it('does nothing at all when the pipeline is already clean', async () => {
    const r = await runHygiene(hygieneSql(0, 0), allow)
    expect(r.gate).toBe('allowed')
    expect(r.gateReason).toBe('nothing to retire')
  })
})

describe('conversion math obeys the denominator rule', () => {
  it('says N/A at n=0 rather than 0%', () => {
    expect(stepLine('trial→paid', 0, 0)).toContain('N/A, n=0')
  })

  it('gives counts only below n=30', () => {
    expect(stepLine('touched→replied', 1, 20)).toContain(`no rate below n=${MIN_N}`)
    expect(stepLine('touched→replied', 1, 20)).not.toContain('%')
  })

  it('gives a rate at n>=30', () => {
    expect(stepLine('touched→replied', 3, 100)).toContain('(3.0%)')
  })
})

describe('the report never hides a deferral', () => {
  it('says who told it to stand down and why', () => {
    const v = verdicts({ dex: { tripped: true, paused: true, reason: 'Dex: breaker TRIPPED at 9.00% vs 3.00%' } })
    const line = buildMasonLine({
      status: 'ACTIVE', verdicts: v, permissions: decideActions(v), replies: null,
      funnel: { checked: true, contacted: 933, replied: 0, engaged: 0, trials: 0, customers: 0, lines: ['x'] },
      priority: [],
      hygiene: { bouncedActive: 0, retired: 0, staleProposed: 0, gate: 'deferred', gateReason: '', proposals: [] },
    })
    // "Mason did nothing" and "Mason was told to stand down" must not look identical.
    expect(line).toContain('DEFERRED')
    expect(line).toContain('breaker TRIPPED')
  })

  it('claims nothing when the funnel could not be read', () => {
    const line = buildMasonLine({
      status: 'INSUFFICIENT_DATA', verdicts: verdicts(), permissions: decideActions(verdicts()), replies: null,
      funnel: { checked: false, contacted: 0, replied: 0, engaged: 0, trials: 0, customers: 0, lines: [] },
      priority: [],
      hygiene: { bouncedActive: 0, retired: 0, staleProposed: 0, gate: 'deferred', gateReason: '', proposals: [] },
    })
    expect(line).toContain('insufficient data')
    expect(line).toContain('No pipeline claim is possible')
  })
})
