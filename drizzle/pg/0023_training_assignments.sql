-- ─────────────────────────────────────────────────────────────────────────────
--  0023 — training assignments: the auto-remediation loop (PS-REMEDIATION-01)
--
--  ADDITIVE ONLY. One new table.
--
--  WHY THIS EXISTS
--    The audit claimed auto-remediation was BUILT. It was not. Completion RECORDING existed
--    (training_completions, the /training complete route) but it was SELF-SERVE: an employee who
--    failed a simulation was enrolled in nothing. The loop the product promises and MSPs show
--    their clients — fail -> enroll -> complete -> recorded — had no enroll step.
--
--    This table is the enroll step. A simulation failure (click, or credential submit) creates an
--    assignment for that target in the module matching the simulation's attack type. Completing
--    that module stamps completed_at, closing the loop.
--
--  NOT A FABRICATED COMPLETION
--    completed_at is NULL until the target actually completes the module. A target with an open
--    assignment reads "not completed" — never a fabricated completion, and never a default that
--    implies training happened. This is the posture-50 discipline applied to remediation.
--
--  ONE OPEN ASSIGNMENT PER (target, module)
--    A partial unique index allows re-assignment after a completion (a repeat failure earns a fresh
--    assignment) while preventing duplicate OPEN assignments piling up from repeated failures on the
--    same lure.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_assignments (
  id                 SERIAL PRIMARY KEY,
  "orgId"            INTEGER NOT NULL,
  "targetId"         INTEGER NOT NULL,
  "moduleId"         INTEGER NOT NULL,

  -- The simulation attack type that triggered this assignment (credential_harvest, link_click, ...).
  "attackType"       TEXT,
  -- 'sim_click' | 'sim_submit' — which failure created it. Provenance, never inferred.
  source             TEXT NOT NULL,
  -- The campaign_results row the failure came from, so the assignment traces to real evidence.
  "campaignResultId" INTEGER,

  "assignedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = enrolled but not yet completed. Set ONLY when the target completes this module.
  "completedAt"      TIMESTAMPTZ
);

-- The loop's hot query: who still owes training. Also the guarantee against duplicate OPEN rows.
CREATE UNIQUE INDEX IF NOT EXISTS training_assignments_open_uniq
  ON training_assignments ("targetId", "moduleId")
  WHERE "completedAt" IS NULL;

CREATE INDEX IF NOT EXISTS training_assignments_org_idx
  ON training_assignments ("orgId", "assignedAt");

COMMENT ON COLUMN training_assignments."completedAt" IS
  'PS-REMEDIATION-01. NULL means enrolled but not completed -- a target with an open assignment has NOT been trained. Set only on real completion. Never defaulted, so a missing completion can never read as done.';
