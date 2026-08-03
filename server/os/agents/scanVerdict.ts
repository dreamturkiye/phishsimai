// ─────────────────────────────────────────────────────────────────────────────
//  PS-SCAN-VERDICT-01 — a scan of zero units can never be a pass.
//
//  THE DEFECT THIS GENERALISES
//    Finn's pricing guard shipped to production reporting:
//        "pricing guard GREEN — all 0 plan-price claim(s) across 0 surface(s) match live Stripe"
//    It had verified nothing. The bundled serverless deploy does not ship .ts sources, so every
//    price-claim surface read back empty, and the verdict logic asked the wrong question:
//        pricingGuard = !stripe.checked ? 'NOT_CHECKED' : incidents.length ? 'DRIFT' : 'GREEN'
//    Stripe WAS reachable, so it skipped NOT_CHECKED; there were no findings because there was
//    nothing to find; so it declared GREEN. Reachability of a dependency was mistaken for evidence
//    that the check ran.
//
//  THE LAW, STATED ONCE SO EVERY DETECTOR INHERITS IT
//    A verdict has three states, not two. "I looked and found nothing wrong" and "I did not look"
//    are different facts, and only the first is a pass. Any detector whose input set can be empty
//    — because a file is missing, a table is unreachable, a bundle omitted the sources — must
//    resolve to NOT_CHECKED rather than to its clean value.
//
//  WHY A SHARED FUNCTION RATHER THAN A CONVENTION
//    Rex and Dex already got this right by hand; Finn got it wrong by hand. A rule that each
//    detector re-implements is a rule that each detector can re-break. Routing all three through
//    one function makes the correct behaviour the default and the incorrect one unreachable.
//
//  THIS IS THE SAME RULE AS "NOT CHECKED IS A FIRST-CLASS OUTCOME", applied to the verdict layer
//  instead of the data layer. A green light over an empty scan is worse than a red one, because it
//  actively certifies the thing it never examined.
// ─────────────────────────────────────────────────────────────────────────────

/** Every scan-derived verdict carries this state, in addition to its own pass/fail values. */
export const NOT_CHECKED = 'NOT_CHECKED' as const
export type NotChecked = typeof NOT_CHECKED

export type ScanInput<P extends string, F extends string> = {
  /**
   * How many units the detector ACTUALLY examined — files read, claims parsed, paths audited.
   * Not how many it intended to examine. This is the number the law turns on.
   */
  unitsScanned: number
  /** How many defects it found among those units. */
  findings: number
  /** The verdict when units were scanned and nothing was wrong. */
  pass: P
  /** The verdict when units were scanned and something was wrong. */
  fail: F
  /**
   * Optional extra precondition. When false the verdict is NOT_CHECKED regardless of unit count —
   * for a dependency the detector needs in order to judge at all (e.g. live Stripe prices).
   */
  dependencyAvailable?: boolean
}

/**
 * Resolve a verdict. NOT_CHECKED whenever nothing was examined or a required dependency was absent.
 *
 * Note the ordering: unitsScanned === 0 short-circuits BEFORE findings are consulted. A detector
 * cannot have findings over an empty scan, so a `findings > 0` result with `unitsScanned === 0`
 * would be incoherent — and silently treating it as a fail would be its own kind of fabrication.
 */
export function scanVerdict<P extends string, F extends string>(i: ScanInput<P, F>): P | F | NotChecked {
  if (i.dependencyAvailable === false) return NOT_CHECKED
  if (!Number.isFinite(i.unitsScanned) || i.unitsScanned <= 0) return NOT_CHECKED
  return i.findings > 0 ? i.fail : i.pass
}

/**
 * Human-readable reason, so a report can say WHY it abstained rather than just that it did.
 * "NOT CHECKED" with no cause is only marginally better than a false green.
 */
export function scanVerdictReason(i: ScanInput<string, string>, subject: string): string {
  if (i.dependencyAvailable === false) return `${subject}: NOT CHECKED — a required dependency was unavailable, so no verdict can be given.`
  if (!Number.isFinite(i.unitsScanned) || i.unitsScanned <= 0) {
    return (
      `${subject}: NOT CHECKED — 0 units were examined, so there is nothing to pass. ` +
      `On a bundled serverless deploy the repository sources are absent, which is the usual cause; ` +
      `an empty scan is never a clean result.`
    )
  }
  return i.findings > 0
    ? `${subject}: ${i.findings} finding(s) across ${i.unitsScanned} unit(s) examined.`
    : `${subject}: clean across ${i.unitsScanned} unit(s) actually examined.`
}
