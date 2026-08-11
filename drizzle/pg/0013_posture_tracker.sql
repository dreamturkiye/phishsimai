-- PS-POSTURE-01: track the KAAN_AI_OS_V7.3 maturity posture (L5.7 -> L5.8) as its own axis.
--
-- The governing spec (KAAN_AI_OS_V7.3, Section A) defines L5.7 "unattended-safe" and L5.8
-- "self-improving under absence" as properties of the SYSTEM, reached by passing measured exit
-- criteria. They are NOT rungs of os_autonomy_state.level -- the spec never mentions that column,
-- autonomy_grants, or the manual|l2|l3|l4|l5 vocabulary. Two separate axes, deliberately kept
-- separate here:
--
--   os_autonomy_state.level  -- WHAT an agent may do right now (gate, auto-promoted, l2..l5)
--   os_posture_state.posture -- WHETHER the system has PROVEN it can run unattended (declared)
--
-- The other V7.3 document says of the second axis: "Nothing counts clean days, failed actions,
-- compliance rejections or open breakers." That is the gap this closes. Counting starts at
-- baseline_from and runs every day thereafter, so progress banks without anyone watching.
--
-- GRADUATION IS DECLARED, NEVER AUTO-PROMOTED. There is deliberately no job that writes
-- os_posture_state.posture -- that is the 07-18 lesson (an unearned level nobody chose). The
-- tracker reports eligibility; a human declares.

CREATE TABLE IF NOT EXISTS os_posture_state (
  product_id    TEXT PRIMARY KEY,
  posture       TEXT NOT NULL DEFAULT 'pre_l5_7',
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  declared_by   TEXT,
  -- Counting starts HERE. Rows before this date were judged under the narrow v1 criteria (three
  -- checks) and are not inherited as credit: v1 records 2026-07-18 as 'clean', and that was the
  -- day of the unearned-l4 incident and 20 un-gated sends. Re-judging it under v2 ALSO returns
  -- clean -- the guard trigger that would have recorded the ungranted raise was not installed
  -- until 2026-07-19. Neither version can see it, so neither gets to certify it. A streak means
  -- only what the criteria in force could actually observe.
  baseline_from DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT os_posture_state_posture_check CHECK (
    posture = ANY (ARRAY['pre_l5_7','l5_7','drill_3','drill_7','drill_15','l5_8'])
  )
);
--> statement-breakpoint

-- Staged drills per spec Section: 3-day (Phase 2 exit) -> 7-day -> 15-day (L5.8 exit).
CREATE TABLE IF NOT EXISTS os_posture_drills (
  id          BIGSERIAL PRIMARY KEY,
  product_id  TEXT NOT NULL,
  kind        INT  NOT NULL,
  started_on  DATE NOT NULL,
  ends_on     DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  failures    JSONB NOT NULL DEFAULT '[]',
  declared_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT os_posture_drills_kind_check   CHECK (kind IN (3, 7, 15)),
  CONSTRAINT os_posture_drills_status_check CHECK (status IN ('running','passed','failed'))
);
--> statement-breakpoint

-- At most one drill running per product at a time.
CREATE UNIQUE INDEX IF NOT EXISTS os_posture_drills_one_running
  ON os_posture_drills (product_id) WHERE status = 'running';
--> statement-breakpoint

-- Which criteria version judged a given day, plus the raw per-class counts behind the verdict.
-- Without the version, v1's narrow 'clean' and v2's broad 'clean' are indistinguishable and a
-- streak silently mixes them.
ALTER TABLE autonomy_clean_days
  ADD COLUMN IF NOT EXISTS criteria_version INT NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE autonomy_clean_days
  ADD COLUMN IF NOT EXISTS counters JSONB NOT NULL DEFAULT '{}';
--> statement-breakpoint

-- Seed PhishSim at the floor, counting from today.
INSERT INTO os_posture_state (product_id, posture, baseline_from, notes)
VALUES ('phishsimai', 'pre_l5_7', CURRENT_DATE,
        'PS-POSTURE-01 seed. Counting starts today under criteria v2; pre-baseline v1 rows are not credited.')
ON CONFLICT (product_id) DO NOTHING;
