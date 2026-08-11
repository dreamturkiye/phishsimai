// PS-TRIAL-01 / PS-GATE-01 — the conversion mechanism's core logic. Getting the tier wrong either
// starves a paying/trialing/grandfathered user (locks them out) or gives a free-expired user full
// access (no reason to pay). These pin all four states + the fail-toward-access defaults.
import { describe, it, expect } from "vitest";
import { entitlementsFor, FREE_LIMITS } from "./lib/entitlements";

const DAY = 86_400_000;
const now = new Date("2026-07-22T00:00:00Z");

describe("entitlementsFor", () => {
  it("paid plan → full access, no trial countdown", () => {
    const e = entitlementsFor({ plan: "starter", planExpiresAt: null }, now);
    expect(e.tier).toBe("paid");
    expect(e.full).toBe(true);
    expect(e.trialDaysLeft).toBeNull();
  });

  it("free + NULL planExpiresAt → grandfathered, full access (orgs 6/7/8 never gated)", () => {
    const e = entitlementsFor({ plan: "free", planExpiresAt: null }, now);
    expect(e.tier).toBe("grandfathered");
    expect(e.full).toBe(true);
  });

  it("free + future planExpiresAt → trial, full access, with days remaining", () => {
    const e = entitlementsFor({ plan: "free", planExpiresAt: new Date(now.getTime() + 10 * DAY) }, now);
    expect(e.tier).toBe("trial");
    expect(e.full).toBe(true);
    expect(e.trialDaysLeft).toBe(10);
  });

  it("free + past planExpiresAt → free_expired, GATED to the free limits", () => {
    const e = entitlementsFor({ plan: "free", planExpiresAt: new Date(now.getTime() - DAY) }, now);
    expect(e.tier).toBe("free_expired");
    expect(e.full).toBe(false);
    expect(e.limits).toEqual(FREE_LIMITS);
    expect(e.limits.campaigns).toBe(1);
    expect(e.limits.targets).toBe(10);
    expect(e.limits.scheduling).toBe(false);
  });

  it("trial expiring today (exactly now) → treated as expired (gated)", () => {
    const e = entitlementsFor({ plan: "free", planExpiresAt: now }, now);
    expect(e.tier).toBe("free_expired");
    expect(e.full).toBe(false);
  });
});
