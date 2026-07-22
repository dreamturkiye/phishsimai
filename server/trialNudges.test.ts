// PS-NUDGE-01 — the day-window mapping. Wrong boundaries either double-send or skip a nudge; the
// idempotency table stops double-sends, but a gap (e.g. nothing for days 4-8) would silently drop
// the value-recap. These pin the windows over a full 14-day trial.
import { describe, it, expect } from "vitest";
import { nudgeFor } from "./os/trialNudges";

describe("nudgeFor (14-day trial, by days-left)", () => {
  it("days 9-14 of trial (>8 days left) → no nudge yet", () => {
    for (const d of [14, 12, 10, 9]) expect(nudgeFor(d)).toBeNull();
  });
  it("around day 7 (4-8 days left) → D7 value recap", () => {
    for (const d of [8, 7, 6, 4]) expect(nudgeFor(d)).toBe(7);
  });
  it("last stretch (1-3 days left) → D12 loss + CTA", () => {
    for (const d of [3, 2, 1]) expect(nudgeFor(d)).toBe(12);
  });
  it("expired (0 or past) → D14 what-changed", () => {
    for (const d of [0, -1, -5]) expect(nudgeFor(d)).toBe(14);
  });
  it("every day 1-14 maps to exactly one state (no gaps)", () => {
    for (let d = 14; d >= -1; d--) {
      const n = nudgeFor(d);
      expect(n === null || n === 7 || n === 12 || n === 14).toBe(true);
    }
  });
});
