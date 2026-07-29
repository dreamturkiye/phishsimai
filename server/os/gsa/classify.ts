// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1.1 — remediation risk tiers.
//
//  This file is the safety boundary of the whole 7.4 layer (§5): "the engine can
//  be wrong about a Tier-A fix and it's reversible + logged; it is never allowed
//  to be wrong-and-irreversible."
//
//  It is deliberately small, pure, and total — no I/O, no DB, no LLM, no
//  company knowledge. A tier decision must be reproducible from its inputs alone
//  and reviewable by reading one screen, because the cost of a wrong answer here
//  is asymmetric: a safe change misrouted to Tier B costs one approval tap, and a
//  destructive change misrouted to Tier A is the exact failure this rule exists
//  to prevent. Everything below is written to fail toward the cheap mistake.
// ─────────────────────────────────────────────────────────────────────────────
import type { CheckResult, ChangeKind, Remediation, Tier } from './types'

/**
 * The ONLY change kinds eligible for autonomous application (§2.1.1 "pre-declared
 * bounded set of change types"). An allowlist, not a blocklist: a kind nobody has
 * classified must not become auto-fixable by being forgotten. Adding to this list
 * is a deliberate human act.
 */
const TIER_A_ELIGIBLE_KINDS: ReadonlySet<ChangeKind> = new Set<ChangeKind>([
  'metric-tagging',
  'exclusion-list',
  'display-annotation',
  'cache-header',
  'internal-config-flag',
])

/**
 * Blast radii that can never be autonomous, whatever the change kind claims and
 * however reversible it is. `external-recipients` is here because of the
 * multi-touch case: enabling follow-ups is a reversible flag flip whose effect —
 * thousands of emails to real people, against a domain still in warm-up — cannot
 * be un-sent. Reversing the CONFIG does not reverse the CONSEQUENCE, and tier is
 * about consequence.
 */
const NEVER_AUTONOMOUS_RADIUS = new Set(['external-recipients', 'money', 'irreversible'])

export interface TierDecision {
  tier: Tier
  reason: string
}

/**
 * Classify one remediation. Pure function of the remediation plus which standards
 * currently pass (for dependency checks).
 *
 * Order matters and is chosen so the fail-safe cannot be skipped: every rejecting
 * rule runs BEFORE the single accepting rule, and the accepting rule requires all
 * four conditions together.
 */
export function classifyRemediation(
  rem: Remediation | undefined,
  passingStandardIds: ReadonlySet<string> = new Set(),
): TierDecision {
  // No proposed fix ⇒ nothing to classify. A standard that reports a DEVIATION
  // without a remediation is telling us it does not know how to fix it, which is
  // a Tier B escalation, not a silent no-op.
  if (!rem) {
    return { tier: 'B', reason: 'No remediation proposed — escalated for human diagnosis (unknown ⇒ Tier B).' }
  }

  // §2.1.1 fail-safe, stated first so it cannot be reached around.
  if (rem.changeKind === 'unknown') {
    return { tier: 'B', reason: 'Change kind is explicitly unknown ⇒ Tier B (fail-safe).' }
  }

  if (NEVER_AUTONOMOUS_RADIUS.has(rem.blastRadius)) {
    const why: Record<string, string> = {
      'external-recipients':
        'Blast radius reaches people outside the company: the change causes outbound contact, and no config rollback un-sends an email.',
      money: 'Blast radius touches money (payment, pricing, billing, or spend).',
      irreversible: 'Blast radius is irreversible.',
    }
    return { tier: 'B', reason: `${why[rem.blastRadius]} Tier B regardless of reversibility.` }
  }

  if (!rem.reversible) {
    return { tier: 'B', reason: 'The engine cannot programmatically restore the prior value ⇒ Tier B.' }
  }

  if (!TIER_A_ELIGIBLE_KINDS.has(rem.changeKind)) {
    return {
      tier: 'B',
      reason: `Change kind "${rem.changeKind}" is not in the pre-declared Tier A set ⇒ Tier B (fail-safe).`,
    }
  }

  // A fix whose safety rests on another standard holding cannot run while that
  // standard is unproven. This is what stops "enable follow-ups" from going out
  // while reply capture is UNVERIFIABLE — the dependency is unmet, so even an
  // otherwise-clean change is proposed rather than applied.
  const unmet = (rem.dependsOn ?? []).filter(id => !passingStandardIds.has(id))
  if (unmet.length > 0) {
    return {
      tier: 'B',
      reason: `Depends on ${unmet.join(', ')}, which ${unmet.length === 1 ? 'is' : 'are'} not currently PASSing ⇒ Tier B until satisfied.`,
    }
  }

  // Rollback is a precondition, not a nicety: Tier A's entire safety argument is
  // "we can put it back". Without a recorded prior value we cannot, so the claim
  // of reversibility is unbacked and the change is not eligible.
  if (rem.prior === undefined) {
    return { tier: 'B', reason: 'No prior value recorded, so the engine could not roll the change back ⇒ Tier B.' }
  }

  return {
    tier: 'A',
    reason: `Reversible ${rem.changeKind} with ${rem.blastRadius} blast radius and a recorded prior value — safe to apply and report.`,
  }
}

/**
 * Assign a tier to a whole result. PASS has nothing to remediate; UNVERIFIABLE
 * must NEVER be remediated (§2.1.1: "you can't fix what you can't measure").
 *
 * The UNVERIFIABLE branch is the one that matters most. The tempting behaviour is
 * to treat "we couldn't confirm reply capture" as "reply capture is broken, go
 * wire it up" — which would have the engine reconfiguring a mail path on the
 * strength of a measurement it just admitted it could not take.
 */
export function assignTier(result: CheckResult, passingStandardIds: ReadonlySet<string>): CheckResult {
  if (result.outcome === 'PASS') {
    return { ...result, tier: 'NONE', tierReason: 'Standard passes — nothing to remediate.' }
  }
  if (result.outcome === 'UNVERIFIABLE') {
    return {
      ...result,
      tier: 'NONE',
      tierReason:
        'UNVERIFIABLE is never auto-remediated: the engine could not measure the thing it would be changing. Escalated for human investigation.',
    }
  }
  const decision = classifyRemediation(result.remediation, passingStandardIds)
  return { ...result, tier: decision.tier, tierReason: decision.reason }
}
