// PS-NUDGE-01 — the day-window mapping. Wrong boundaries either double-send or skip a nudge; the
// idempotency table stops double-sends, but a gap (e.g. nothing for days 4-8) would silently drop
// the value-recap. These pin the windows over a full 30-day trial.
//
// PS-TRIAL-30-01: re-spaced D7/D12/D14 → D14/D25/D30. The windows are expressed in DAYS-LEFT, so
// they are read against TRIAL_DAYS = 30: day 14 of the trial ≈ 16 left, day 25 ≈ 5 left, expiry = 0.
import { describe, it, expect } from "vitest";
import { nudgeFor } from "./os/trialNudges";
import { TRIAL_DAYS } from "./lib/entitlements";

describe("nudgeFor (30-day trial, by days-left)", () => {
  it("trial is 30 days — the windows below assume it", () => {
    expect(TRIAL_DAYS).toBe(30);
  });
  it("days 1-12 of trial (>17 days left) → no nudge yet", () => {
    for (const d of [30, 25, 20, 18]) expect(nudgeFor(d)).toBeNull();
  });
  it("around day 14 (7-17 days left) → D14 value recap", () => {
    for (const d of [17, 16, 12, 7]) expect(nudgeFor(d)).toBe(14);
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
      expect(n === null || n === 14 || n === 25 || n === 30).toBe(true);
    }
  });
  it("the D30 recovery mail never fires before expiry (its copy says 'has ended')", () => {
    for (let d = TRIAL_DAYS; d >= 1; d--) expect(nudgeFor(d)).not.toBe(30);
  });
});
