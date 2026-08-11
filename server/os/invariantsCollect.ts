// ─────────────────────────────────────────────────────────────────────────────
//  PS-INVARIANT-WIRE-01 — feed the four business invariants their REAL inputs.
//
//  invariants.ts shipped pure and tested but with no live caller — a judgement with no execution
//  loop, which by this codebase's own bar is a ghost. This is the loop: it gathers real inputs and
//  hands them to the four checks, and Janet's 08:00 brief renders the verdict line.
//
//  ANTI-FABRICATION, unchanged: every check routes through scanVerdict, so an unmeasurable input
//  reads NOT_CHECKED, never a false HOLDS. Where an input genuinely cannot be read here (no Stripe
//  key; no source files in a serverless bundle), NOT_CHECKED is the correct output, not a failure.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import {
  checkMrrInvariant,
  auditSuppressionRails,
  checkNotCheckedInvariant,
  checkPricingFrozen,
  summariseInvariants,
  OUTREACH_SEND_PATHS,
  type InvariantResult,
  type ReportedVerdict,
} from './invariants'
import { readStripeTruth, auditPriceClaims, type PriceClaim } from './agents/finn'

/**
 * INV-1 — no fabricated MRR (STRUCTURAL), from the live Stripe read.
 *
 * The live guarantee is the structural one: mrr>0 iff activeSubs>0 (the phantom-MRR signature),
 * the half that has actually cost money. Drift reconciliation is NOT implemented and is not faked —
 * no independent MRR source exists on the Stripe API (see checkMrrInvariant's header). The former
 * fake second-derivation same-read feed is removed. At 0 subs / $0 this reads HOLDS
 * honestly (invariant satisfied), exactly as the empty funnel should.
 */
async function inv1(): Promise<InvariantResult> {
  const truth = await readStripeTruth().catch(() => null)
  if (!truth) {
    return checkMrrInvariant({ computedMrrUsd: 0, activeSubs: 0, stripeChecked: false })
  }
  return checkMrrInvariant({
    computedMrrUsd: truth.mrrUsd,
    activeSubs: truth.activeSubs,
    stripeChecked: truth.checked,
  })
}

/** INV-4 — pricing frozen, reusing Finn's own comparison against live Stripe. */
async function inv4(): Promise<InvariantResult> {
  const truth = await readStripeTruth().catch(() => null)
  let claims: PriceClaim[] = []
  try {
    const snap = JSON.parse(fs.readFileSync('server/os/agents/priceClaims.generated.json', 'utf8'))
    claims = Array.isArray(snap.claims) ? snap.claims : []
  } catch {
    claims = [] // snapshot unreadable -> 0 claims scanned -> NOT_CHECKED, never a green over nothing
  }
  const stripeChecked = truth?.checked === true
  const incidents = stripeChecked ? auditPriceClaims(claims, truth!.monthlyUsd, true) : []
  return checkPricingFrozen(incidents, claims.length, stripeChecked)
}

/** INV-2 — suppression rails on the outreach send paths, read from disk. */
function inv2(): InvariantResult {
  const files: Record<string, string> = {}
  for (const p of OUTREACH_SEND_PATHS) {
    // In a serverless bundle the .ts source does not ship, so this reads empty -> NOT_CHECKED, which
    // is the honest verdict there (the CI static detector covers commit-time; this covers dev/runtime
    // where source exists). Never a pass over unreadable files.
    try { files[p] = fs.readFileSync(p, 'utf8') } catch { /* leave absent */ }
  }
  return auditSuppressionRails(files)
}

/**
 * INV-3 — NOT_CHECKED never reads clean. Fed the verdicts OTHER checks produced this run, so a
 * pass-over-zero anywhere is caught. Includes INV-4's own scan (claims vs zero) as a reported verdict.
 */
function inv3(others: InvariantResult[]): InvariantResult {
  const verdicts: ReportedVerdict[] = others.map((r) => ({
    subject: r.id,
    verdict: r.status,
    unitsScanned: r.unitsScanned,
  }))
  return checkNotCheckedInvariant(verdicts)
}

export async function collectInvariants() {
  const [r1, r4] = await Promise.all([inv1(), inv4()])
  const r2 = inv2()
  // INV-3 inspects the other three — their own verdicts must not be a pass over zero units.
  const r3 = inv3([r1, r2, r4])
  return summariseInvariants([r1, r2, r3, r4])
}
