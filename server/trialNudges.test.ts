// PS-NUDGE-01 — the day-window mapping. Wrong boundaries either double-send or skip a nudge; the
// idempotency table stops double-sends, but a gap (e.g. nothing for days 4-8) would silently drop
// the value-recap. These pin the windows over a full 30-day trial.
//
// PS-TRIAL-30-01: re-spaced D7/D12/D14 → D14/D25/D30. The windows are expressed in DAYS-LEFT, so
// they are read against TRIAL_DAYS = 30: day 14 of the trial ≈ 16 left, day 25 ≈ 5 left, expiry = 0.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { nudgeFor } from "./os/trialNudges";
import { GREY_BOX_CRISIS_NUDGE_DAY, GREY_BOX_CRISIS_NUDGE_HOURS, GREY_BOX_ORG_IDS, GREY_BOX_ORG_NAME, isGreyBoxOrg } from "./os/trialNudges";
import { TRIAL_DAYS } from "./lib/entitlements";

describe("nudgeFor (30-day trial, by days-left)", () => {
  it("trial is 30 days — the windows below assume it", () => {
    expect(TRIAL_DAYS).toBe(30);
  });
  it("days 1-9 of trial (>20 days left) → no nudge yet", () => {
    for (const d of [30, 25, 22, 21]) expect(nudgeFor(d)).toBeNull();
  });
  it("around day 14 (13-20 days left) → D14 value recap", () => {
    for (const d of [20, 18, 14, 13]) expect(nudgeFor(d)).toBe(14);
  });
  it("Grey Box window (7-12 days left) → D18 upgrade (existing D25 checkout copy)", () => {
    for (const d of [12, 10, 7]) expect(nudgeFor(d)).toBe(18);
  });
  it("last stretch (1-6 days left) → D25 loss + CTA", () => {
    for (const d of [6, 5, 3, 1]) expect(nudgeFor(d)).toBe(25);
  });
  it("expired (0 or past) → D30 what-changed", () => {
    for (const d of [0, -1, -5]) expect(nudgeFor(d)).toBe(30);
  });
  it("every day of a 30-day trial maps to exactly one state (no gaps)", () => {
    for (let d = TRIAL_DAYS; d >= -1; d--) {
      const n = nudgeFor(d);
      expect(n === null || n === 14 || n === 18 || n === 25 || n === 30).toBe(true);
    }
  });
  it("the D30 recovery mail never fires before expiry (its copy says 'has ended')", () => {
    for (let d = TRIAL_DAYS; d >= 1; d--) expect(nudgeFor(d)).not.toBe(30);
  });
  it("skips canary/test/walkthrough/Adeo orgs (true-trial exclusion)", () => {
    const src = readFileSync("server/os/trialNudges.ts", "utf8");
    expect(src).toContain("isNonCustomerOrg");
  });
  it("wires unused-trial activation without adding warm-CTA touch 93", () => {
    const src = readFileSync("server/os/trialNudges.ts", "utf8");
    expect(src).toContain("runTrialActivationNudges");
    expect(src).not.toMatch(/touch 93|WARM_CTA_TOUCHES.*,\s*93/);
    expect(readFileSync("server/os/sequences.ts", "utf8")).toContain("export const WARM_CTA_TOUCHES = [90, 91, 92]");
  });
  it("Grey Box paid loop reuses D25 checkout copy on a 24h crisis cadence", () => {
    expect(GREY_BOX_ORG_NAME).toBe("Grey Box Consulting");
    expect(GREY_BOX_ORG_IDS).toContain(11);
    expect(isGreyBoxOrg("Grey Box Consulting")).toBe(true);
    expect(isGreyBoxOrg("GreyBox Consulting LLC")).toBe(true);
    expect(isGreyBoxOrg("Acme MSP", 11)).toBe(true);
    expect(isGreyBoxOrg("Acme MSP", 99)).toBe(false);
    expect(GREY_BOX_CRISIS_NUDGE_HOURS).toBe(24);
    expect(GREY_BOX_CRISIS_NUDGE_DAY).toBe(181);
    const src = readFileSync("server/os/trialNudges.ts", "utf8");
    expect(src).toContain("runGreyBoxPaidNudge");
    expect(src).toContain("sendTrialDay25");
    expect(src).toMatch(/runGreyBoxPaidNudge\(sql\)/);
    expect(src).toContain("%grey%box%");
    expect(readFileSync("server/os/conversionEngine.ts", "utf8")).toContain("runGreyBoxPaidNudge");
  });
});
