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
 * Stripe exposes no "reported MRR" endpoint on the API `finn.ts` uses (`subscriptions.list`); the
 * Dashboard figure is not retrievable that way. So this reconciles TWO INDEPENDENT DERIVATIONS over
 * the same subscription objects, which catches the failure that actually happens: one path drifting
 * (a hardcoded price creeping back, an annual plan not normalised, quantity ignored).
 *
 * It also asserts the structural rule that no derivation can rescue — MONEY MAY NOT EXIST WITHOUT A
 * SUBSCRIPTION BEHIND IT. `mrr > 0 && activeSubs === 0` is the exact shape of the $99/$249/$499/$999
 * phantom ladder and of every fabricated-MRR path this codebase has removed.
 */
export type MrrInput = {
  /** Finn's per-subscription computation (finn.ts:88-108). */
  computedMrrUsd: number
  /** An independent recomputation over the same subscriptions. */
  independentMrrUsd: number
  activeSubs: number
  /** False when Stripe was unreachable — verdict must be NOT_CHECKED, never HOLDS. */
  stripeChecked: boolean
}

/** Cents of tolerance. Two derivations of the same money should agree exactly; rounding is the only slack. */
export const MRR_TOLERANCE_USD = 0.01

export function checkMrrInvariant(i: MrrInput): InvariantResult {
  if (!i.stripeChecked) {
    return resolve('INV-1', 'no fabricated MRR', 0, 0, 'Stripe NOT CHECKED — no MRR asserted', false)
  }
  // Rounded to cents BEFORE comparing. Money in floats does not subtract cleanly:
  // |100 - 100.01| evaluates to 0.010000000000005, which a bare `> 0.01` reads as drift and would
  // halt the business on a rounding artefact. Caught by the tolerance test.
  const drift = Math.round(Math.abs(i.computedMrrUsd - i.independentMrrUsd) * 100) / 100
  const findings: string[] = []
  if (drift > MRR_TOLERANCE_USD) {
    findings.push(`derivations disagree by $${drift.toFixed(2)} (computed $${i.computedMrrUsd.toFixed(2)} vs independent $${i.independentMrrUsd.toFixed(2)})`)
  }
  // Money without a subscription is fabrication regardless of how the two paths agree.
  if (i.computedMrrUsd > 0 && i.activeSubs === 0) {
    findings.push(`MRR $${i.computedMrrUsd.toFixed(2)} reported over ZERO active subscriptions`)
  }
  // ...and the mirror: subscriptions that produce no money is equally a broken read.
  if (i.computedMrrUsd === 0 && i.activeSubs > 0) {
    findings.push(`${i.activeSubs} active subscription(s) but MRR computed as $0`)
  }
  const evidence = findings.length
    ? findings.join(' · ')
    : `computed $${i.computedMrrUsd.toFixed(2)} == independent $${i.independentMrrUsd.toFixed(2)} over ${i.activeSubs} active sub(s)`
  // 1 unit = the reconciliation itself, and it only exists when Stripe answered.
  return resolve('INV-1', 'no fabricated MRR', 1, findings.length, evidence)
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
