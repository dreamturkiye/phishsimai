// ─────────────────────────────────────────────────────────────────────────────
//  PS-OUTREACH-THROTTLE-01 — proof the daily cap CANNOT be exceeded, by reintroduction.
//  The guard is proven the way every guard in this repo is: simulate the defect (keep asking to
//  send past the cap) and assert the cap refuses. A convention that "we only call it 50 times" is
//  not a cap; a function that returns 0 at the boundary is.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  secondTouchAllowance, newTouchAllowance,
  NEW_TOUCH_DAILY_CAP, SECOND_TOUCH_DAILY_CAP, COMBINED_DAILY_CAP, SECOND_TOUCH_PER_RUN,
} from "./outreachThrottle";

describe("second-touch daily cap", () => {
  it("allows a full per-run batch when nothing has gone out today", () => {
    expect(secondTouchAllowance({ newSentToday: 0, secondSentToday: 0 })).toBe(SECOND_TOUCH_PER_RUN);
  });

  it("returns 0 once 50 second-touch have gone out — the 51st is blocked, not sent", () => {
    expect(secondTouchAllowance({ newSentToday: 0, secondSentToday: SECOND_TOUCH_DAILY_CAP })).toBe(0);
    expect(secondTouchAllowance({ newSentToday: 0, secondSentToday: SECOND_TOUCH_DAILY_CAP - 1 })).toBe(1);
  });

  it("the COMBINED 100/day binds: with 50 new already sent, only 50 second-touch remain", () => {
    // 50 new + would-be 50 second = 100 exactly; the 101st combined is blocked.
    let sent = 0;
    const counts = { newSentToday: 50, secondSentToday: 0 };
    // Drain via reintroduction: keep asking, "send" one each time, until the cap says 0.
    while (true) {
      const allow = secondTouchAllowance(counts, 1); // per-run 1 to step precisely
      if (allow === 0) break;
      counts.secondSentToday += 1; sent += 1;
      expect(counts.newSentToday + counts.secondSentToday).toBeLessThanOrEqual(COMBINED_DAILY_CAP);
    }
    expect(sent).toBe(50);                                   // exactly 50 second-touch fit under 100 combined
    expect(counts.newSentToday + counts.secondSentToday).toBe(COMBINED_DAILY_CAP); // landed on 100, never over
    expect(secondTouchAllowance(counts, 1)).toBe(0);         // the 101st is refused
  });

  it("reintroduction: 200 attempts in one day can never exceed 50 second-touch / 100 combined", () => {
    const counts = { newSentToday: 0, secondSentToday: 0 };
    let sent = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      const allow = secondTouchAllowance(counts, 1);
      if (allow > 0) { counts.secondSentToday += 1; sent += 1; }
    }
    expect(sent).toBe(SECOND_TOUCH_DAILY_CAP);               // hard-stopped at 50 despite 200 attempts
    expect(counts.secondSentToday).toBeLessThanOrEqual(SECOND_TOUCH_DAILY_CAP);
    expect(counts.newSentToday + counts.secondSentToday).toBeLessThanOrEqual(COMBINED_DAILY_CAP);
  });

  it("overflow queues to the next day: yesterday's overflow is sendable once the counter resets", () => {
    // End of day: 50/50 sent, cap exhausted.
    expect(secondTouchAllowance({ newSentToday: 50, secondSentToday: 50 }, 1)).toBe(0);
    // Next UTC day, sentTodayCounts() reads 0/0 again → the remaining eligible leads flow.
    expect(secondTouchAllowance({ newSentToday: 0, secondSentToday: 0 })).toBe(SECOND_TOUCH_PER_RUN);
  });
});

describe("new-touch (touch-1) shares the same combined ceiling", () => {
  it("caps at 50/day and never lets new+second exceed 100", () => {
    expect(newTouchAllowance({ newSentToday: NEW_TOUCH_DAILY_CAP, secondSentToday: 0 }, 1)).toBe(0);
    // If 60 second-touch had somehow gone out, new is clamped so combined stays ≤ 100.
    expect(newTouchAllowance({ newSentToday: 0, secondSentToday: 60 }, 100)).toBe(COMBINED_DAILY_CAP - 60);
  });
});
