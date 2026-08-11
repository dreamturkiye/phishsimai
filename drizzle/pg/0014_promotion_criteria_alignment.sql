-- PS-AUTONOMY-CRITERIA-01 — make both ladders judge by the same rigor.
--
-- Two ladders read autonomy_clean_days:
--   os_posture_state.posture   (posture.ts)  — filtered to criteria_version >= 2 AND day >= baseline
--   os_autonomy_state.level    (autonomyPromotion.ts) — filtered by NOTHING
--
-- So the promotion job counted v1 rows, including 2026-07-18 — the unearned-l4 incident day, which
-- v1's three-check version scored clean. That is how the level climbed manual→l5 off criteria the
-- posture tracker had already been rebuilt to distrust. The code fix adds the filter; this column
-- makes the resulting number self-describing.
--
-- WHY A COLUMN AND NOT A BACKFILL: os_autonomy_state.clean_day_streak currently reads 5 while the
-- posture tracker reads 0, on the same table, for the same product. Rewriting the 5 would be
-- inventing a v2 number for a value v1 produced. Stamping WHICH version produced it is the honest
-- move — the reader stops having to remember which ladder a number belongs to, and the job
-- overwrites both fields together on its next run.
--
-- This migration does NOT touch `level`. L5 is earned and audited; the alignment governs future
-- promotions only and must never re-litigate a past one.

ALTER TABLE os_autonomy_state
  ADD COLUMN IF NOT EXISTS clean_day_streak_criteria SMALLINT;
--> statement-breakpoint

-- Existing rows carry a v1-produced streak. Say so, rather than leaving it ambiguous.
UPDATE os_autonomy_state
   SET clean_day_streak_criteria = 1
 WHERE clean_day_streak_criteria IS NULL;
--> statement-breakpoint

COMMENT ON COLUMN os_autonomy_state.clean_day_streak_criteria IS
  'Which autonomy_clean_days.criteria_version produced clean_day_streak. 1 = the legacy three-check version (counted pre-baseline days); 2 = the posture-aligned version (criteria_version >= 2 AND day >= os_posture_state.baseline_from). Never compare a streak across versions.';
