// ─────────────────────────────────────────────────────────────────────────────
//  PS-INVARIANT-01 — the four business truths, continuously asserted.
//
//  #72 guards the CODE: Marcus may not write auth, money, webhooks, the send rails or his own gate.
//  These guard the BUSINESS: things that must be true of the running company regardless of which
//  code path produced them. A code-level guard cannot catch a correct function fed a wrong premise.
//
//  Each invariant returns a VERDICT, never a boolean, and every verdict routes through scanVerdict
//  so that "we could not check" can never read as "clean" (INV-3 is that rule, applied to the other
//  three as well as to itself).
//
//    INV-1  no fabricated MRR    — two independent derivations must agree, and money may not exist
//                                  without a subscription behind it
//    INV-2  suppression rails    — no outreach send path may stop filtering
//                                  bounced / unsubscribed / ps_outreach_suppression
//    INV-3  NOT_CHECKED is not clean — a scan of zero units is never a pass
//    INV-4  pricing frozen       — code price claims match live Stripe
//
//  WHAT A VIOLATION DOES
//    halt=true. The caller stops and alarms. These are not advisory metrics; each one is a
//    condition under which continuing to operate produces a false statement to a customer, to the
//    founder, or to a regulator.
// ─────────────────────────────────────────────────────────────────────────────
import { scanVerdict, NOT_CHECKED } from './agents/scanVerdict'

export type InvariantId = 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4'
export type InvariantStatus = 'HOLDS' | 'VIOLATED' | typeof NOT_CHECKED

export type InvariantResult = {
  id: InvariantId
  name: string
  status: InvariantStatus
  /** True only on VIOLATED. NOT_CHECKED does not halt — it alarms as unmeasured. */
  halt: boolean
  /** The measurement, so a reader can re-derive rather than trust. */
  evidence: string
  /** Units actually examined. 0 => NOT_CHECKED, always. */
  unitsScanned: number
}

function resolve(
  id: InvariantId,
  name: string,
  unitsScanned: number,
  findings: number,
  evidence: string,
  dependencyAvailable = true,
): InvariantResult {
  const status = scanVerdict({
    unitsScanned,
    findings,
    pass: 'HOLDS' as const,
    fail: 'VIOLATED' as const,
    dependencyAvailable,
  })
  return { id, name, status, halt: status === 'VIOLATED', evidence, unitsScanned }
}

// ─── INV-1 — no fabricated MRR ───────────────────────────────────────────────

/**
 * STRUCTURAL-ONLY, and honestly so (PS-INV1-STRUCTURAL-01).
 *
 * The live guarantee is: MONEY MAY NOT EXIST WITHOUT A SUBSCRIPTION BEHIND IT. `mrr > 0 &&
 * activeSubs === 0` is the exact shape of the $99/$249/$499/$999 phantom ladder and of every
 * fabricated-MRR path this codebase has removed; the mirror (`mrr === 0 && activeSubs > 0`) is a
 * broken read. Both are checked here.
 *
 * DRIFT RECONCILIATION IS NOT IMPLEMENTED — and this says so rather than faking it. A genuine
 * second, INDEPENDENT MRR derivation would let us catch one path silently drifting (a hardcoded
 * price creeping back). None exists on the Stripe API `finn.ts` uses:
 *   · `subscriptions.list` exposes no "reported MRR" figure to reconcile against;
 *   · a plan-price x count second path FALSE-FIRES on annual subs — annual is 10x monthly here,
 *     not 12x — so it would halt the business on healthy annual customers;
 *   · upcoming-invoice `amount_due` carries proration, tax and discounts and the annual billing
 *     amount, so it does not match list-price MRR either.
 * Feeding the same read in as a fake "independent" value (which the collector used to do) makes an
 * inert comparison read as a working reconciliation guard — the latent-fabrication shape. Removed.
 * If a real second source is ever added, reinstate the drift check with THAT source.
 */
export type MrrInput = {
  /** Finn's per-subscription computation (finn.ts). */
  computedMrrUsd: number
  activeSubs: number
  /** False when Stripe was unreachable — verdict must be NOT_CHECKED, never HOLDS. */
  stripeChecked: boolean
}

export function checkMrrInvariant(i: MrrInput): InvariantResult {
  if (!i.stripeChecked) {
    return resolve('INV-1', 'no fabricated MRR (structural)', 0, 0, 'Stripe NOT CHECKED — no MRR asserted', false)
  }
  const findings: string[] = []
  // Money without a subscription is fabrication — the phantom-ladder signature.
  if (i.computedMrrUsd > 0 && i.activeSubs === 0) {
    findings.push(`MRR $${i.computedMrrUsd.toFixed(2)} reported over ZERO active subscriptions`)
  }
  // ...and the mirror: subscriptions that produce no money is a broken read.
  if (i.computedMrrUsd === 0 && i.activeSubs > 0) {
    findings.push(`${i.activeSubs} active subscription(s) but MRR computed as $0`)
  }
  const evidence = findings.length
    ? findings.join(' · ')
    : `structural OK: MRR $${i.computedMrrUsd.toFixed(2)} consistent with ${i.activeSubs} active sub(s) ` +
      `(structural check only — drift reconciliation INERT: no independent MRR source on the Stripe API)`
  return resolve('INV-1', 'no fabricated MRR (structural)', 1, findings.length, evidence)
}

// ─── INV-2 — the suppression rails may not be silently removed ───────────────

/**
 * RAIL AUDIT, same shape as #72's protected-path enforcement, aimed at the door that needs it.
 *
 * WHY THE SIMULATION PATH IS DELIBERATELY EXEMPT
 *   `enqueueCampaignSend` sends a customer's own phishing simulation to their own enrolled
 *   employees. There is no CAN-SPAM relationship and no opt-out to honour — an employee cannot
 *   unsubscribe from their employer's security training. Its floor is domain enrolment
 *   (`checkSendAllowed` + trg_assert_target_domain_enrolled, migration 0002). Adding a suppression
 *   check there would be enforcing the wrong rule on the wrong recipients.
 *
 * WHERE IT DOES BELONG
 *   Cold outreach to prospects. `sequences.ts` already filters in the SELECT (the strongest
 *   position — an excluded lead is never even a candidate), and `outreachSequence.ts` is disabled
 *   as a raw sender for exactly this reason (PS-BYPASS-CLOSE-01).
 *
 * WHAT THIS CATCHES
 *   The regression: someone rewrites the query and drops a clause. The filter is three separate
 *   conditions and losing ANY ONE re-opens a real hole — a bounced address, an unsubscribed
 *   recipient, or a globally suppressed one.
 */
export const OUTREACH_SEND_PATHS = ['server/os/sequences.ts'] as const

/** Every clause that must survive in an outreach candidate query. Losing one is a violation. */
export const REQUIRED_SUPPRESSION_RAILS = [
  { key: 'bounced', re: /bounced\s*=\s*false/i, why: 'a bounced address can never convert and re-sending damages reputation' },
  { key: 'unsubscribed', re: /unsubscribed\s*=\s*false/i, why: 'sending to an unsubscribed recipient is a CAN-SPAM violation' },
  { key: 'suppression_list', re: /ps_outreach_suppression/i, why: 'the global suppression list is the cross-campaign do-not-contact record' },
] as const

export type RailFinding = { file: string; missing: string; why: string }

/**
 * @param files  path -> source text. A file that could not be READ contributes 0 units, so an
 *               unreadable tree yields NOT_CHECKED rather than a green over nothing.
 */
export function auditSuppressionRails(files: Record<string, string>): InvariantResult {
  const findings: RailFinding[] = []
  let units = 0
  for (const path of OUTREACH_SEND_PATHS) {
    const src = files[path]
    if (typeof src !== 'string' || src.length === 0) continue // unreadable: not a pass, not a fail
    units++
    for (const rail of REQUIRED_SUPPRESSION_RAILS) {
      if (!rail.re.test(src)) findings.push({ file: path, missing: rail.key, why: rail.why })
    }
  }
  const evidence = findings.length
    ? findings.map((f) => `${f.file} lost '${f.missing}' — ${f.why}`).join(' · ')
    : `${units}/${OUTREACH_SEND_PATHS.length} outreach path(s) retain all ${REQUIRED_SUPPRESSION_RAILS.length} suppression rails`
  return resolve('INV-2', 'suppression rails intact on every outreach send path', units, findings.length, evidence)
}

// ─── INV-3 — NOT_CHECKED never reads clean ───────────────────────────────────

/**
 * The law applied to itself. Given the verdicts other detectors produced, assert that none of them
 * reported a PASS over zero examined units.
 *
 * This is the Finn GREEN-over-zero defect (§2 #8) as a standing check rather than a one-time fix:
 * the exact law the org exists to enforce, violated in the agent that enforces it.
 */
export type ReportedVerdict = { subject: string; verdict: string; unitsScanned: number }

export function checkNotCheckedInvariant(verdicts: ReportedVerdict[]): InvariantResult {
  const findings = verdicts.filter(
    (v) => v.unitsScanned <= 0 && v.verdict !== NOT_CHECKED,
  )
  const evidence = findings.length
    ? findings.map((f) => `${f.subject} reported '${f.verdict}' over ${f.unitsScanned} units`).join(' · ')
    : `${verdicts.length} verdict(s) checked, none asserts a result over zero units`
  return resolve('INV-3', 'NOT_CHECKED never reads clean', verdicts.length, findings.length, evidence)
}

// ─── INV-4 — pricing frozen ──────────────────────────────────────────────────

/**
 * Code price claims must match live Stripe. Reuses Finn's existing comparison rather than
 * re-deriving it — one definition of "the price drifted", not two that can disagree.
 *
 * @param claimIncidents  output of finn.auditPriceClaims()
 * @param claimsScanned   how many claims were actually compared (0 => NOT_CHECKED)
 * @param stripeChecked   false when live prices were unavailable
 */
export function checkPricingFrozen(
  claimIncidents: unknown[],
  claimsScanned: number,
  stripeChecked: boolean,
): InvariantResult {
  const evidence = !stripeChecked
    ? 'live Stripe prices unavailable — no pricing verdict asserted'
    : claimIncidents.length
      ? `${claimIncidents.length} price claim(s) drifted from live Stripe`
      : `${claimsScanned} price claim(s) match live Stripe`
  return resolve('INV-4', 'pricing frozen', claimsScanned, claimIncidents.length, evidence, stripeChecked)
}

// ─── The suite ───────────────────────────────────────────────────────────────

export type InvariantSuite = {
  results: InvariantResult[]
  /** Any VIOLATED. The caller must stop and alarm. */
  halt: boolean
  /** Any NOT_CHECKED. Not a halt, but never silence — unmeasured is its own alarm. */
  unmeasured: InvariantId[]
  line: string
}

export function summariseInvariants(results: InvariantResult[]): InvariantSuite {
  const violated = results.filter((r) => r.status === 'VIOLATED')
  const unmeasured = results.filter((r) => r.status === NOT_CHECKED).map((r) => r.id)
  const line = violated.length
    ? `🛑 INVARIANT VIOLATION — ${violated.map((v) => `${v.id} ${v.name}: ${v.evidence}`).join(' · ')}. HALTED.`
    : unmeasured.length
      ? `Invariants: ${results.length - unmeasured.length}/${results.length} hold · NOT CHECKED: ${unmeasured.join(', ')} (unmeasured is not clean).`
      : `Invariants: all ${results.length} hold.`
  return { results, halt: violated.length > 0, unmeasured, line }
}
