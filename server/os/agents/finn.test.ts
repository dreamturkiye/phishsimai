// PS-FINN-01 — tests for the CFO that replaced the $99.
//
// The ghost's sin was computing a company's revenue picture from a constant that matched no live
// price, then projecting from it. So the load-bearing properties are:
//   1. no price constant exists in Finn's executable code — every figure comes from Stripe;
//   2. an unreachable Stripe yields NOT CHECKED, never $0 and never a fallback;
//   3. there is NO forecast function at all;
//   4. the pricing guard catches a $99-shaped claim.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as finn from './finn'
import {
  extractPriceClaims,
  auditPriceClaims,
  buildRevenuePack,
  buildFinnLine,
  mrrDisplay,
  coverageGaps,
  stripComments,
  PRICE_CLAIM_SURFACES,
  type StripeTruth,
  type FinnReport,
} from './finn'

const FINN_SRC = fs.readFileSync('server/os/agents/finn.ts', 'utf8')
const FINN_CODE = stripComments(FINN_SRC)

const truth = (over: Partial<StripeTruth> = {}): StripeTruth => ({
  checked: true, monthlyUsd: { starter: 149, growth: 299, pro: 749, enterprise: 1499 },
  activeSubs: 0, trialingSubs: 0, mrrUsd: 0, arrUsd: 0, planMix: {}, reason: 'read live from Stripe', ...over,
})

describe('the $99 cannot come back', () => {
  it('Finn executable code contains no price constant at all', () => {
    // Any bare 3-4 digit number bound to a price-ish identifier is the exact shape of `avgRevenue = 99`.
    const priceLiterals = FINN_CODE.match(/\b(avg\w*revenue|price|mrr|arr|amount)\w*\s*[:=]\s*\d{2,5}\b/gi) ?? []
    expect(priceLiterals).toEqual([])
  })

  it('has NO forecast function — the ghost only ever had a fabricated one', () => {
    const names = Object.keys(finn)
    expect(names.filter((n) => /forecast|project|predict|estimate/i.test(n))).toEqual([])
    expect(FINN_CODE).not.toMatch(/projectedMrr/i)
  })

  it('reads prices from the live Stripe module, not a local table', () => {
    expect(FINN_SRC).toContain("from '../../stripe/prices'")
    expect(FINN_SRC).toContain('loadPhishSimPrices')
  })

  it('the deleted ghost is really gone', () => {
    expect(fs.existsSync('server/os/agents/finance.ts')).toBe(false)
  })

  it('neither standup path imports or calls it', () => {
    for (const f of ['server/os/janet.ts', 'server/os/janetReport.ts']) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src, f).not.toContain("from './agents/finance'")
      expect(src, f).not.toContain('runFinanceAgent(')
      expect(src, f).toContain('runFinnAgent(')
    }
  })
})

describe('unreachable Stripe is NOT CHECKED, never $0', () => {
  it('renders NOT CHECKED rather than a zero', () => {
    const pack = buildRevenuePack(truth({ checked: false, reason: 'no key' }), 0)
    expect(pack.lines[0]).toContain('NOT CHECKED')
    expect(pack.mrrUsd).toBeNull()
    expect(pack.lines[0]).not.toMatch(/\$0/)
  })

  it('mrrDisplay distinguishes "nobody is paying" from "we did not ask"', () => {
    // The ghost blurred exactly this line by computing a number when it had none.
    expect(mrrDisplay(null)).toContain('NOT CHECKED')
    expect(mrrDisplay({ stripe: truth({ checked: false }) } as FinnReport)).toContain('NOT CHECKED')
    expect(mrrDisplay({ stripe: truth({ mrrUsd: 0, activeSubs: 0 }) } as FinnReport)).toContain('MRR $0.00')
    expect(mrrDisplay({ stripe: truth({ mrrUsd: 299, activeSubs: 1 }) } as FinnReport)).toContain('MRR $299.00')
  })

  it('files no drift incident when Stripe was NOT CHECKED — a guard that guesses is worse than one that abstains', () => {
    const claims = extractPriceClaims('x.tsx', 'Starter $99/mo')
    expect(auditPriceClaims(claims, {}, false)).toEqual([])
  })
})

describe('the revenue pack is honest over an empty funnel', () => {
  it('reports $0 with 0 paying, and says the rest is not measurable', () => {
    const pack = buildRevenuePack(truth(), 0)
    expect(pack.armed).toBe(true)
    expect(pack.mrrUsd).toBe(0)
    expect(pack.lines.join(' ')).toContain('MRR $0.00')
    expect(pack.lines.join(' ')).toContain('NOT MEASURABLE')
    expect(pack.lines.join(' ')).toContain('a projection over zero conversion outcomes is a fabrication')
  })

  it('computes real MRR the moment a subscription exists', () => {
    const pack = buildRevenuePack(truth({ activeSubs: 2, mrrUsd: 598, arrUsd: 7176 }), 2)
    expect(pack.mrrUsd).toBe(598)
    expect(pack.lines[0]).toContain('$598.00')
    expect(pack.lines.join(' ')).not.toContain('NOT MEASURABLE')
  })

  it('flags a CRM/Stripe reconciliation gap and names Stripe as the truth', () => {
    const pack = buildRevenuePack(truth({ activeSubs: 0 }), 3)
    expect(pack.lines.join(' ')).toContain('RECONCILIATION GAP')
    expect(pack.lines.join(' ')).toContain('Stripe is the revenue truth')
  })
})

describe('the pricing guard catches a $99-shaped claim', () => {
  const live = { starter: 149, growth: 299, pro: 749, enterprise: 1499 } as const

  it('flags a plan price that contradicts live Stripe', () => {
    const claims = extractPriceClaims('client/src/pages/Home.tsx', '{ name: "Starter", price: "$99", period: "/mo" }')
    const [i] = auditPriceClaims(claims, live, true)
    expect(i).toBeTruthy()
    expect(i.severity).toBe('critical')
    expect(i.summary).toContain('claims starter at $99')
    expect(i.summary).toContain('live Stripe says $149')
    expect(i.summary).toContain('never edits a price')
  })

  it('flags the invented $49 founding rate', () => {
    const claims = extractPriceClaims('x.ts', 'Starter founding rate $49/mo for early MSPs')
    expect(auditPriceClaims(claims, live, true)).toHaveLength(1)
  })

  it('passes a correct claim', () => {
    const claims = extractPriceClaims('x.tsx', '{ name: "Growth", price: "$299" }')
    expect(auditPriceClaims(claims, live, true)).toEqual([])
  })

  it('matches a plan word on EITHER side of the figure', () => {
    expect(extractPriceClaims('a', 'Growth $299')).toHaveLength(1)
    expect(extractPriceClaims('b', '$99 Starter plan')).toHaveLength(1)
  })

  // Regression pin for a real false positive from Finn's FIRST live run. The copy below is verbatim
  // from abTest.ts and is CORRECT: $299 is the Growth price and "Pro" names the 30c tier. The first
  // extractor used a 40-char window in both directions, paired them across a sentence boundary, and
  // reported Pro-at-$299 against Stripe's $749.
  it('does NOT pair a price with a plan word across a sentence boundary', () => {
    const copy = 'One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Drops to 30¢ on Pro. Flat MSP pricing.'
    const claims = extractPriceClaims('server/os/abTest.ts', copy)
    expect(claims.filter((c) => c.plan === 'pro')).toEqual([])
    expect(auditPriceClaims(claims, live, true)).toEqual([])
  })

  it('still catches a genuine drift in the same sentence shape', () => {
    // Proof the narrowing did not blind the guard: plan-then-price still fires.
    const claims = extractPriceClaims('x', 'Our Pro plan is $299/mo')
    expect(auditPriceClaims(claims, live, true)).toHaveLength(1)
  })

  it('does NOT pair a compliance penalty with a nearby plan word', () => {
    // Home.tsx really does contain "$1.9M per violation" and "$250,000 per violation" beside prose.
    // Widening the match window is how a guard starts crying wolf and gets ignored.
    const claims = extractPriceClaims('client/src/pages/Home.tsx',
      'Enterprise-grade compliance. Penalty: up to $250,000 per violation under NY DFS Part 500 rules for covered entities.')
    expect(claims).toEqual([])
  })

  it('ignores prices written in comments — a comment quotes nobody', () => {
    expect(extractPriceClaims('x.ts', '// PS-PRICE: Starter $99 was the old wrong value')).toEqual([])
    expect(extractPriceClaims('x.ts', '/* Starter $99 */')).toEqual([])
  })

  it('reports a plan sold in Stripe but stated nowhere', () => {
    const claims = extractPriceClaims('x', 'Starter $149')
    const gaps = coverageGaps(claims, live)
    expect(gaps.join(' ')).toContain('growth')
    expect(gaps.join(' ')).toContain('sold in Stripe but stated in no scanned surface')
  })

  it('scans the real customer-facing surfaces', () => {
    for (const f of PRICE_CLAIM_SURFACES) expect(fs.existsSync(f), f).toBe(true)
    expect(PRICE_CLAIM_SURFACES).toContain('client/src/pages/Home.tsx')
  })
})

describe('comment stripping', () => {
  it('removes block and line comments but leaves URLs intact', () => {
    expect(stripComments('a // gone\nb')).not.toContain('gone')
    expect(stripComments('/* gone */ b')).not.toContain('gone')
    expect(stripComments("const u = 'https://x.com/y'")).toContain('https://x.com/y')
  })
})

describe('the report line', () => {
  const base = {
    status: 'ACTIVE' as const, stripe: truth(), claims: [], incidents: [], gaps: [],
    revenue: buildRevenuePack(truth(), 0), notChecked: [],
  }

  it('always restates the hard stop', () => {
    const line = buildFinnLine({ ...base, pricingGuard: 'GREEN' })
    expect(line).toContain('HARD STOP')
    expect(line).toContain('never edits a price')
  })

  it('says GREEN only when claims were actually compared', () => {
    expect(buildFinnLine({ ...base, pricingGuard: 'GREEN' })).toContain('pricing guard GREEN')
    expect(buildFinnLine({ ...base, pricingGuard: 'NOT_CHECKED' })).toContain('NOT CHECKED')
    expect(buildFinnLine({ ...base, pricingGuard: 'NOT_CHECKED' })).not.toContain('GREEN')
  })

  it('names the drifting surfaces when RED', () => {
    const line = buildFinnLine({
      ...base, pricingGuard: 'DRIFT',
      incidents: [{ detector: 'pricing_drift', severity: 'critical', subject: 'Home.tsx:starter', summary: '', evidence: {}, signature: 's' }],
    })
    expect(line).toContain('pricing guard RED')
    expect(line).toContain('Home.tsx:starter')
  })

  it('claims nothing when neither Stripe nor a surface was readable', () => {
    const line = buildFinnLine({ ...base, status: 'INSUFFICIENT_DATA', pricingGuard: 'NOT_CHECKED' })
    expect(line).toContain('insufficient data')
    expect(line).toContain('No revenue or pricing claim is possible')
  })
})

describe('PS-FINN-PLANMIX-KILL-01 — no dead empty-field that looks populated', () => {
  const SRC = require('node:fs').readFileSync('server/os/agents/finn.ts', 'utf8')
  it('planMix is gone — a returned-but-never-populated field is a latent fabrication', () => {
    // It was declared in StripeTruth, set to {} in EMPTY_TRUTH, and returned, but the loop never
    // filled it and nothing downstream read it. Removed rather than left looking populated.
    expect(SRC).not.toContain('planMix')
  })
})
