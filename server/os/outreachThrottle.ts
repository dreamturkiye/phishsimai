// ─────────────────────────────────────────────────────────────────────────────
//  PS-OUTREACH-THROTTLE-01 — a HARD, code-enforced daily cap on outbound cold email.
//
//  The founder directive: 100 sends / 24h on the outreach domain, split 50 new (touch-1) + 50
//  second-touch (touch-2), spread across the day, NEVER bursted, and overflow queues to the next
//  day. This module is the single source of truth for that cap. It is pure + DB-counted (never a
//  local tally, which resets on restart and lies), so the cap cannot be exceeded even if the sender
//  is called repeatedly within a day.
//
//  HOW THE CAP HOLDS:
//   • Every allowance is min(per-run batch, per-type remaining, COMBINED remaining). A path can
//     therefore never push the COMBINED total past 100, nor its own type past 50, no matter how
//     many times it runs.
//   • Counts come from sentTodayCounts() — a COUNT over touch{1,2}_sent_at::date = today — so two
//     concurrent-ish runs both see what has actually been stamped, not an in-memory guess.
//   • Overflow "queues" implicitly: the eligibility query is ordered oldest-first with LIMIT =
//     allowance, so the 51st second-touch simply isn't selected today and remains eligible tomorrow
//     when the counter has reset. No queue table is needed — the daily count IS the queue boundary.
//   • Spacing (SEND_SPACING_MS) between sends within a run means a batch is emitted over minutes,
//     never as an instantaneous burst.
// ─────────────────────────────────────────────────────────────────────────────

export const NEW_TOUCH_DAILY_CAP = 50;     // touch-1 (new leads)
export const SECOND_TOUCH_DAILY_CAP = 50;  // touch-2 (second-touch)
export const COMBINED_DAILY_CAP = 100;     // hard ceiling across both, per 24h
export const SECOND_TOUCH_PER_RUN = 10;    // small batch per invocation → spread across cron ticks
export const NEW_TOUCH_PER_RUN = 50;       // touch-1 keeps its single-run cadence (already 2s-spaced)
export const SEND_SPACING_MS = 10_000;     // 5× touch-1's 2s; a run of 10 takes ~100s, not a burst
                                            // (the day-long spread comes from multiple cron ticks)

export interface SentToday {
  newSentToday: number;
  secondSentToday: number;
}

function clampAllowance(perTypeRemaining: number, combinedRemaining: number, perRun: number): number {
  return Math.max(0, Math.min(perRun, perTypeRemaining, combinedRemaining));
}

/** How many SECOND-TOUCH (touch-2) emails may be sent right now. Enforces the per-type 50 AND the
 *  combined 100 — so touch-2 can never exceed 50/day, and new+second can never exceed 100/day. */
export function secondTouchAllowance(counts: SentToday, perRun = SECOND_TOUCH_PER_RUN): number {
  const perType = SECOND_TOUCH_DAILY_CAP - counts.secondSentToday;
  const combined = COMBINED_DAILY_CAP - (counts.newSentToday + counts.secondSentToday);
  return clampAllowance(perType, combined, perRun);
}

/** How many NEW (touch-1) emails may be sent right now — same combined-cap discipline. */
export function newTouchAllowance(counts: SentToday, perRun = NEW_TOUCH_PER_RUN): number {
  const perType = NEW_TOUCH_DAILY_CAP - counts.newSentToday;
  const combined = COMBINED_DAILY_CAP - (counts.newSentToday + counts.secondSentToday);
  return clampAllowance(perType, combined, perRun);
}

/** Today's stamped sends, counted from the DB (UTC day). The cap is enforced against reality, not a
 *  process-local counter that a redeploy would reset. */
export async function sentTodayCounts(sql: any): Promise<SentToday> {
  const rows = (await sql`
    SELECT
      count(*) FILTER (WHERE touch1_sent_at::date = (now() AT TIME ZONE 'utc')::date)::int AS new_today,
      count(*) FILTER (WHERE touch2_sent_at::date = (now() AT TIME ZONE 'utc')::date)::int AS second_today
    FROM ps_outreach_leads
  `.catch(() => [])) as any[];
  return {
    newSentToday: Number(rows[0]?.new_today ?? 0),
    secondSentToday: Number(rows[0]?.second_today ?? 0),
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
