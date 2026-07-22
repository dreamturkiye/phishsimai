// PS-TRIAL-01 / PS-GATE-01 — the conversion mechanism. Until this existed, `free` had full access
// forever, so paying bought nothing. Every gate keys off ONE helper so free/trial/paid can never
// drift between enforcement points.
//
// Model:
//   • paid (plan !== 'free')            → full access
//   • trial (free + planExpiresAt future)→ full access, with a day countdown
//   • grandfathered (free + planExpiresAt NULL) → full access. NULL = an org created before the
//     trial system (6/7/8). We never retroactively gate someone mid-use.
//   • free_expired (free + planExpiresAt past)  → the GATED tier below.
//
// "14-day trial" is now TRUE: createOrganization stamps planExpiresAt = now + TRIAL_DAYS, and once
// it passes the org is treated as free_expired (a dynamic check — no cron flip needed).
import type { Organization } from "../../drizzle/schema";

export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

export interface Limits {
  campaigns: number;        // lifetime campaigns
  targets: number;          // total targets
  customTemplates: number;  // custom templates (also covers the single AI-generation "taste")
  scheduling: boolean;      // scheduled / recurring campaigns
  analyticsExport: boolean; // CSV/PDF export + reports
  complianceCerts: boolean; // auditor-facing compliance certificates
}

// Free (post-trial) caps — the founder-approved split (2026-07-22).
export const FREE_LIMITS: Limits = {
  campaigns: 1,
  targets: 10,
  customTemplates: 1,
  scheduling: false,
  analyticsExport: false,
  complianceCerts: false,
};

const FULL: Limits = {
  campaigns: Infinity,
  targets: Infinity,
  customTemplates: Infinity,
  scheduling: true,
  analyticsExport: true,
  complianceCerts: true,
};

export type OrgTier = "paid" | "trial" | "grandfathered" | "free_expired";

export interface Entitlements {
  tier: OrgTier;
  full: boolean;
  limits: Limits;
  trialDaysLeft: number | null; // days remaining on an active trial; null otherwise
}

export function entitlementsFor(
  org: Pick<Organization, "plan" | "planExpiresAt">,
  now: Date = new Date(),
): Entitlements {
  if (org.plan && org.plan !== "free") return { tier: "paid", full: true, limits: FULL, trialDaysLeft: null };
  if (!org.planExpiresAt) return { tier: "grandfathered", full: true, limits: FULL, trialDaysLeft: null };
  const exp = new Date(org.planExpiresAt).getTime();
  if (exp > now.getTime()) {
    return { tier: "trial", full: true, limits: FULL, trialDaysLeft: Math.max(0, Math.ceil((exp - now.getTime()) / DAY_MS)) };
  }
  return { tier: "free_expired", full: false, limits: FREE_LIMITS, trialDaysLeft: 0 };
}

/** The message a gate throws. The client detects the `upgrade_required:` prefix and renders the
 *  upgrade CTA (soft) instead of a generic error. */
export function upgradeMessage(what: string, detail: string): string {
  return `upgrade_required:${what} — ${detail}`;
}
