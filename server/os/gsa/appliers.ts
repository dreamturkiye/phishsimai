// ─────────────────────────────────────────────────────────────────────────────
//  GSA §2.1.1 — Tier A application: the registry, and the honesty rule around it.
//
//  A tier decision says a fix MAY be applied autonomously. It does not say the
//  engine KNOWS HOW. Those are different facts and conflating them is how a
//  governance layer starts lying: a Tier A finding that silently does nothing
//  looks, in every report, exactly like a Tier A finding that was handled.
//
//  So an applier must be registered per standard, and a Tier A finding with no
//  applier is reported as UNHANDLED — loudly, in the digest — rather than
//  skipped. The engine would rather say "I can't do this" than imply it did.
// ─────────────────────────────────────────────────────────────────────────────
import type { CheckResult } from './types'

export interface FixApplier {
  standardId: string
  /** Applies the fix. Returns what changed, for the digest and for rollback. */
  apply(result: CheckResult): Promise<{ before: unknown; after: unknown }>
  /** Puts it back. Called when apply() throws, or when verification fails. */
  rollback(before: unknown): Promise<void>
}

/**
 * Registered Tier A appliers.
 *
 * DELIBERATELY EMPTY FOR PHISHSIM, and that is a finding rather than an omission.
 * Auditing what the engine could actually act on today:
 *
 *   · METRICS-EXTERNAL / PS-SIM-PROVENANCE — the provenance note is rendered in
 *     kaan_os_v4.ts. Fixing it means editing code, and an engine that rewrites
 *     source autonomously is a much larger trust decision than "toggle a setting".
 *   · PIPELINE-REAL / PS-ORG-EXCLUSION — NON_LEAD_ORG_ADMIN_EMAILS is a code
 *     constant for the same reason. Note also that auto-ADDING a suspected
 *     internal account would violate the fail-open rule already written into that
 *     list ("we never hide a real org, we only subtract KNOWN internal/test
 *     ones") — guessing which accounts are ours is a detection needing human
 *     confirmation, not a mechanical remediation.
 *
 *   · The only DB-backed operational toggles in the system are send/posting gates
 *     (outreach_ramp_enabled, outreach_reply_autopost, linkedin_autopost). Every
 *     one has external-recipients blast radius, so every one is Tier B by
 *     construction and none is eligible here.
 *
 * The conclusion is not "Tier A is pointless" — it is that PhishSim currently
 * keeps its auditable settings in code rather than in operational config. Tier A
 * is armed and the machinery below is exercised by tests; the moment a genuinely
 * DB-backed setting becomes auditable, registering it here is a few lines.
 */
export const PHISHSIM_APPLIERS: FixApplier[] = []

export function findApplier(reg: FixApplier[], standardId: string): FixApplier | null {
  return reg.find(a => a.standardId === standardId) ?? null
}
