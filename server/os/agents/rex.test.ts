// PS-REX-01 — tests for the agent that polices everyone else's data.
//
// The properties worth pinning are the ones that would let a FALSE GREEN through, because a false
// green from Rex is worse than no Rex at all: the other seven would treat contaminated data as
// certified. So the emphasis here is on "NOT CHECKED never reads as clean" and "a blind scan cannot
// auto-resolve anything".
import { describe, it, expect } from 'vitest'
import {
  detectFabricatedWriters,
  detectPricingDrift,
  detectBlindGates,
  detectStageViolations,
  resolveMissing,
  buildRexLine,
  isLegalTransition,
  readSource,
  INTERNAL_EXCLUSION_SQL,
  STAGE_CHECKS,
  READ_SURFACES,
  SCAN_TARGETS,
  type SourceFile,
  type SurfaceState,
  type Incident,
} from './rex'
import { INTERNAL_EXCLUSION_SQL as SALES_EXCLUSION } from './salesReplies'

const src = (relPath: string, text: string | null): SourceFile => ({ relPath, text })

describe('stage machine', () => {
  it('allows the forward path prospect → engaged → trial → customer', () => {
    expect(isLegalTransition('prospect', 'engaged')).toBe(true)
    expect(isLegalTransition('engaged', 'trial')).toBe(true)
    expect(isLegalTransition('trial', 'customer')).toBe(true)
  })

  it('treats dead as terminal — resurrection is the one funnel error with a legal consequence', () => {
    expect(isLegalTransition('dead', 'prospect')).toBe(false)
    expect(isLegalTransition('dead', 'customer')).toBe(false)
  })

  it('treats internal_test as terminal — leaving it re-enters the metrics it was excluded from', () => {
    expect(isLegalTransition('internal_test', 'prospect')).toBe(false)
  })

  it('rejects a stage outside the declared machine', () => {
    expect(isLegalTransition('prospect', 'nurturing')).toBe(false)
    expect(isLegalTransition('made_up', 'prospect')).toBe(false)
  })
})

describe('the exclusion predicate has exactly one definition', () => {
  // Two copies exist deliberately (salesReplies must prove it at its own SELECT level). If they ever
  // diverge there are two different answers to "is this row ours", which is an integrity defect in
  // itself — so the agreement is pinned rather than trusted.
  it('Rex and the Sales agent agree, character for character', () => {
    expect(INTERNAL_EXCLUSION_SQL.replace(/\s+/g, ' ').trim())
      .toBe(SALES_EXCLUSION.replace(/\s+/g, ' ').trim())
  })

  it('excludes the founder address, the internal stage, and our own domain', () => {
    expect(INTERNAL_EXCLUSION_SQL).toContain('kaanari@mac.com')
    expect(INTERNAL_EXCLUSION_SQL).toContain("pipeline_stage <> 'internal_test'")
    expect(INTERNAL_EXCLUSION_SQL).toContain('phishsimai.com')
  })
})

describe('detector 1 — fabricated writers', () => {
  it('flags a module that asserts facts while reading no data', () => {
    const { incidents } = detectFabricatedWriters([
      src('a.ts', `import { rememberFact } from '../memory'
        export async function run() {
          await rememberFact({ value: 'hardcoded', confidence: 0.9, source: 'x' })
        }`),
    ])
    expect(incidents).toHaveLength(1)
    expect(incidents[0].detector).toBe('fabricated_writer')
    expect(incidents[0].severity).toBe('critical')
    expect(incidents[0].evidence.statedConfidence).toBe('0.9')
  })

  it('does NOT flag a module that reads the database before it speaks', () => {
    const { incidents } = detectFabricatedWriters([
      src('b.ts', `import { getSql } from '../conn'
        import { rememberFact } from '../memory'
        export async function run() {
          const sql = getSql()
          const rows = await sql\`SELECT 1\`
          await rememberFact({ value: String(rows.length), confidence: 1, source: 'x' })
        }`),
    ])
    expect(incidents).toHaveLength(0)
  })

  it('does NOT flag a module that writes no facts at all', () => {
    const { incidents } = detectFabricatedWriters([src('c.ts', 'export const x = 1')])
    expect(incidents).toHaveLength(0)
  })

  it('reports an unreadable file as NOT CHECKED rather than clean', () => {
    const { incidents, notChecked } = detectFabricatedWriters([src('gone.ts', null)])
    expect(incidents).toHaveLength(0)
    expect(notChecked).toEqual(['gone.ts'])
  })
})

describe('detector 2 — pricing drift', () => {
  const financeLike = src('server/os/agents/finance.ts', 'const avgRevenue = 99\nconst mrr = customers * avgRevenue')

  it('flags a hardcoded price literal even when Stripe was NOT CHECKED', () => {
    const { incidents } = detectPricingDrift([financeLike], null)
    expect(incidents).toHaveLength(1)
    // High, not critical: without live prices we can only prove the hardcoding, not the mismatch.
    expect(incidents[0].severity).toBe('high')
    expect(incidents[0].evidence.value).toBe(99)
    expect(incidents[0].evidence.livePricesUsd).toBe('NOT CHECKED')
  })

  it('escalates to critical when the literal matches no live Stripe price', () => {
    const { incidents } = detectPricingDrift([financeLike], [149, 299, 749, 1499])
    expect(incidents[0].severity).toBe('critical')
    expect(incidents[0].evidence.matchesLivePrice).toBe(false)
    expect(incidents[0].summary).toContain('matches NO live Stripe price')
  })

  it('still flags a literal that happens to match Stripe today — a copy is drift waiting to happen', () => {
    const { incidents } = detectPricingDrift([src('x.ts', 'const price = 299')], [149, 299])
    expect(incidents).toHaveLength(1)
    expect(incidents[0].severity).toBe('high')
    expect(incidents[0].evidence.matchesLivePrice).toBe(true)
  })

  it('ignores identifiers that look price-ish but are not money', () => {
    const { incidents } = detectPricingDrift(
      [src('y.ts', 'const price_id = 1234\nconst mrr_cents = 29900\nconst maxPrice = 500')],
      null,
    )
    expect(incidents).toHaveLength(0)
  })

  it('does NOT flag an MRR milestone ladder — those are goal thresholds, not prices', () => {
    // Regression pin for a real false positive from Rex's first live run: these four milestone
    // entries buried the one true finding (avgRevenue = 99) under four wrong ones.
    const { incidents } = detectPricingDrift(
      [
        src(
          'server/os/agents/finance.ts',
          `const milestones = [
             { mrr: 500, label: '$500 MRR' },
             { mrr: 2500, label: '$2.5K MRR' },
             { mrr: 5000, label: '$5K MRR' },
             { mrr: 10000, label: '$10K MRR' },
           ]`,
        ),
      ],
      [149, 299, 749, 1499],
    )
    expect(incidents).toEqual([])
  })

  it('still finds the one true price literal when the milestone ladder sits beside it', () => {
    const { incidents } = detectPricingDrift(
      [src('server/os/agents/finance.ts', 'const avgRevenue = 99\nconst milestones = [{ mrr: 500 }, { mrr: 2500 }]')],
      [149, 299, 749, 1499],
    )
    expect(incidents).toHaveLength(1)
    expect(incidents[0].subject).toContain('avgRevenue')
  })

  it('never scans the Stripe reader itself — it is the source of truth, not a consumer', () => {
    const { incidents } = detectPricingDrift([src('server/stripe/prices.ts', 'const price = 299')], null)
    expect(incidents).toHaveLength(0)
  })
})

describe('detector 3 — blind gates', () => {
  const surface = READ_SURFACES[0]
  const state = (rows: number, checked = true): SurfaceState => ({ surface, rows, lastWriteISO: null, checked })

  it('flags a read surface with 0 rows and consumers', () => {
    const { incidents } = detectBlindGates([state(0)])
    expect(incidents).toHaveLength(1)
    expect(incidents[0].detector).toBe('blind_gate')
    expect(incidents[0].subject).toBe(surface.table)
    expect(incidents[0].evidence.consumers).toEqual(surface.consumers)
  })

  it('does not flag a surface whose writer has proven it fires', () => {
    expect(detectBlindGates([state(1)]).incidents).toHaveLength(0)
  })

  it('separates "unreachable" from "empty" — they are different facts', () => {
    const { incidents, notChecked } = detectBlindGates([state(0, false)])
    expect(incidents).toHaveLength(0)
    expect(notChecked).toEqual([surface.table])
  })
})

// A minimal stand-in supporting both call styles the module uses: sql.query(text) and sql`...`.
function fakeSql(counts: Record<string, number>) {
  const fn: any = (strings: TemplateStringsArray, ...vals: any[]) => {
    const text = strings.join('?')
    fn.calls.push({ text, vals })
    const p: any = Promise.resolve([])
    p.catch = () => Promise.resolve([])
    return p
  }
  fn.calls = []
  fn.query = async (text: string) => {
    const key = Object.keys(counts).find((k) => text.includes(k))
    return [{ n: key ? counts[key] : 0 }]
  }
  return fn
}

describe('detector 4 — stage violations', () => {
  it('files an incident per predicate that returns rows', async () => {
    const sql = fakeSql({ "pipeline_stage='customer' AND customer_at IS NULL": 3 })
    const { incidents } = await detectStageViolations(sql)
    expect(incidents).toHaveLength(1)
    expect(incidents[0].evidence.rows).toBe(3)
    expect(incidents[0].signature).toBe('stage_violation:customer_without_customer_at')
    expect(incidents[0].severity).toBe('critical')
  })

  it('stays silent when every predicate returns zero', async () => {
    const { incidents } = await detectStageViolations(fakeSql({}))
    expect(incidents).toHaveLength(0)
  })

  it('reports a failing query as NOT CHECKED, not as a passing check', async () => {
    const throwing: any = { query: async () => { throw new Error('relation does not exist') } }
    const { incidents, notChecked } = await detectStageViolations(throwing)
    expect(incidents).toHaveLength(0)
    expect(notChecked).toHaveLength(STAGE_CHECKS.length)
  })

  it('treats an unsubscribed lead in an active stage as critical', () => {
    const c = STAGE_CHECKS.find((c) => c.key === 'suppressed_but_active_stage')!
    expect(c.severity).toBe('critical')
  })

  // PS-REX-RECONCILE-01 — both invariants are now enforced at the DB by triggers
  // (0018_suppression_invariants.sql). These two checks are RETAINED deliberately as the assertion
  // that the triggers are actually working: if a trigger is ever dropped, disabled, or bypassed by a
  // bulk load, Rex is what notices. A guard with no independent verifier is a guard nobody audits.
  it('keeps asserting both suppression invariants on every run', () => {
    const keys = STAGE_CHECKS.map((c) => c.key)
    expect(keys).toContain('suppressed_but_active_stage')
    expect(keys).toContain('suppression_not_reconciled')
  })
})

describe('resolution safety — a blind scan may never mark defects fixed', () => {
  it('resolves nothing when no detector produced a result', async () => {
    const sql = fakeSql({})
    // This is THE property: if the static scan went blind (no readable files), auto-resolving would
    // silently close every fabrication incident because we stopped looking, not because it was fixed.
    expect(await resolveMissing(sql, [], [])).toBe(0)
    expect(sql.calls).toHaveLength(0)
  })
})

describe('the report line', () => {
  const base = { incidents: [] as Incident[], bySeverity: { critical: 0, high: 0, medium: 0 }, readable: 8, total: 8, notChecked: [], resolved: 0 }

  it('never says green when nothing was scanned', () => {
    const line = buildRexLine({ ...base, status: 'INSUFFICIENT_DATA', readable: 0 })
    expect(line).toContain('insufficient data')
    expect(line).toContain('UNKNOWN, which is NOT the same as green')
    expect(line).not.toMatch(/\bGREEN\b/)
  })

  it('says GREEN only with a real scan and zero incidents', () => {
    expect(buildRexLine({ ...base, status: 'ACTIVE' })).toContain('funnel trust GREEN')
  })

  it('says RED when anything critical is open', () => {
    const line = buildRexLine({
      ...base,
      status: 'ACTIVE',
      incidents: [{ detector: 'pricing_drift', severity: 'critical', subject: 'finance.ts:avgRevenue', summary: '', evidence: {}, signature: 's' }],
      bySeverity: { critical: 1, high: 0, medium: 0 },
    })
    expect(line).toContain('funnel trust RED')
    expect(line).toContain('finance.ts:avgRevenue')
  })

  it('says AMBER when there are findings but nothing critical', () => {
    const line = buildRexLine({
      ...base,
      status: 'ACTIVE',
      incidents: [{ detector: 'blind_gate', severity: 'high', subject: 't', summary: '', evidence: {}, signature: 's' }],
      bySeverity: { critical: 0, high: 1, medium: 0 },
    })
    expect(line).toContain('funnel trust AMBER')
  })

  it('surfaces NOT CHECKED in the line so a partial scan cannot read as complete', () => {
    const line = buildRexLine({ ...base, status: 'ACTIVE', notChecked: ['source:a.ts'] })
    expect(line).toContain('NOT CHECKED')
  })
})

describe('scan targets are real files in this repo', () => {
  // Guards the rename-drift failure: a scan list pointing at moved files silently scans nothing and
  // reports zero incidents, which looks exactly like a healthy codebase.
  it('every SCAN_TARGET resolves', () => {
    const missing = SCAN_TARGETS.filter((p) => readSource(p).text === null)
    expect(missing).toEqual([])
  })
})
