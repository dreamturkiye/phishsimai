-- ─────────────────────────────────────────────────────────────────────────────
--  0025 — daily KPI verdict per agent (PS-DECOMMISSION-01)
--
--  ADDITIVE ONLY. One new table.
--
--  WHY THIS EXISTS
--    The 90-day decommission rule needs a history of each agent's daily KPI verdict. Janet's brief
--    writes one row per agent per day (DELIVERING | AWAITING_DATA | DEGRADED, from
--    PS-KPI-OWNERSHIP-01). The decommission sweep reads the trailing window and proposes retiring an
--    agent that produced NO verdict (DEGRADED) for the whole window. AWAITING_DATA is a contribution,
--    not a firing offence, so it breaks the streak — an empty funnel never decommissions an agent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS os_agent_kpi_daily (
  id          SERIAL PRIMARY KEY,
  product_id  TEXT NOT NULL DEFAULT 'phishsimai',
  agent_id    TEXT NOT NULL,
  kpi         TEXT NOT NULL,
  -- 'DELIVERING' | 'AWAITING_DATA' | 'DEGRADED'
  verdict     TEXT NOT NULL,
  day         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One verdict per agent per UTC day: a same-day re-run updates rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS os_agent_kpi_daily_one_per_day_idx
  ON os_agent_kpi_daily (product_id, agent_id, day);

CREATE INDEX IF NOT EXISTS os_agent_kpi_daily_agent_day_idx
  ON os_agent_kpi_daily (agent_id, day DESC);

COMMENT ON COLUMN os_agent_kpi_daily.verdict IS
  'PS-DECOMMISSION-01. DELIVERING/AWAITING_DATA/DEGRADED from PS-KPI-OWNERSHIP-01. Only an unbroken run of DEGRADED counts toward decommission -- AWAITING_DATA is honest contribution over an empty funnel and breaks the streak.';
