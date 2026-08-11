-- ─────────────────────────────────────────────────────────────────────────────
--  0024 — landscape / regulatory intelligence, with provenance (PS-SCOUT-LANDSCAPE-01)
--
--  ADDITIVE ONLY. One new table.
--
--  WHY THIS EXISTS
--    Scout is the highest fabrication-risk agent. A regulatory or insurance "trend" with no source
--    is a lie a knowledgeable MSP catches instantly. Every row here carries its source, its date,
--    and the verbatim quote that supports it — and `verified` is true only when that quote was found
--    on the fetched page. A row that is not verified may not enter positioning or Janet's brief as
--    fact. NOT CHECKED (a failed fetch) is recorded as a row with fetch_ok=false and a reason, never
--    as an absent or invented trend.
--
--  SAME SHAPE AS 0015 (competitor intel): a failed row carries no claim, and a claim carries its
--  provenance. Enforced by CHECK, so it cannot regress by accident.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS os_market_intel (
  id            SERIAL PRIMARY KEY,
  product_id    TEXT NOT NULL DEFAULT 'phishsimai',
  source_slug   TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  topic         TEXT NOT NULL,

  fetch_ok      BOOLEAN NOT NULL,
  http_status   INTEGER,
  fail_reason   TEXT,

  -- The proposed intel, in Scout's words. NULL on a failed/empty fetch.
  claim         TEXT,
  -- The VERBATIM supporting text from the page. NULL when nothing citable was found.
  quote         TEXT,
  -- The date the source states or was captured.
  source_date   TEXT,
  -- TRUE only when quote is non-empty AND was found verbatim on the fetched page. A false row is a
  -- PROPOSAL awaiting evidence, never quotable as fact.
  verified      BOOLEAN NOT NULL DEFAULT false,

  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A failed fetch carries no claim; a verified row must carry a quote. Structural, not prompted.
ALTER TABLE os_market_intel
  DROP CONSTRAINT IF EXISTS os_market_intel_provenance;
ALTER TABLE os_market_intel
  ADD CONSTRAINT os_market_intel_provenance CHECK (
    (fetch_ok = true OR (claim IS NULL AND quote IS NULL))
    AND (verified = false OR (quote IS NOT NULL AND length(quote) > 0))
  );

-- One row per source per UTC day: a same-day re-run does not duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS os_market_intel_one_per_day_idx
  ON os_market_intel (product_id, source_slug, ((captured_at AT TIME ZONE 'UTC')::date));

COMMENT ON COLUMN os_market_intel.verified IS
  'PS-SCOUT-LANDSCAPE-01. TRUE only when the quote was found verbatim on the fetched page. A false row is a cited proposal awaiting evidence and may NOT enter positioning or the brief as fact. Never set true without an on-page quote.';
