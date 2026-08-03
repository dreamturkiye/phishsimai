-- ─────────────────────────────────────────────────────────────────────────────
--  0015 — os_competitor_intel (KAAN AI OS 7.5 §5 #3)
--
--  NOT RUN. Written for founder review; applying it to ep-spring-leaf is a hard stop.
--
--  WHY A TABLE AND NOT A PROMPT
--    Janet must never assert a competitor's price from memory — that is the fabrication pattern
--    pointed outward, and it is worse than the internal kind because it becomes a claim we make to
--    a prospect. Competitor facts therefore live in a row that a fetch WROTE, with the URL, the
--    HTTP status and the fetch timestamp attached, or they do not exist. A brief line about a
--    competitor must trace to a row here; no row, no line.
--
--  THE NOT-CHECKED CONTRACT (OS 7.5 §8)
--    A failed fetch writes a row with fetch_ok = false and a reason. It does NOT skip, and it does
--    NOT carry forward last week's price as if it were current. `status_label` renders as
--    'NOT CHECKED' for those, so a competitor we could not reach is visibly unmeasured rather than
--    silently stale — the same distinction as "0 external sends" vs "funnel N/A, n=0".
--
--  DIFFING
--    One row per (competitor, captured_at). The weekly job compares the newest successful row per
--    competitor against the previous successful row and reports CHANGES only. Keeping history
--    rather than upserting a single row is deliberate: a price change is only visible if the prior
--    value still exists, and "what changed" is the entire product of this job.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS os_competitor_intel (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      TEXT        NOT NULL DEFAULT 'phishsimai',

  -- Stable slug, e.g. 'knowbe4'. The display name and URL can change; this must not.
  competitor      TEXT        NOT NULL,
  source_url      TEXT        NOT NULL,

  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Fetch outcome. fetch_ok = false => this is a NOT CHECKED row and every extracted_* column
  -- below MUST be NULL. Enforced by the CHECK constraint, so a failed fetch cannot leave a
  -- half-populated row that later reads as real data.
  fetch_ok        BOOLEAN     NOT NULL,
  http_status     INTEGER,
  fail_reason     TEXT,

  -- What we extracted. All nullable on purpose: a page that loads but whose price we cannot parse
  -- is a SUCCESSFUL fetch with an unknown price, which is different from an unreachable page.
  -- NULL here means "fetched, not found" and must never render as a number.
  headline_price  TEXT,       -- verbatim as printed, e.g. "$4.50/user/month" — never normalised
  pricing_model   TEXT,       -- 'per_seat' | 'flat' | 'quote_only' | NULL
  trial_terms     TEXT,       -- e.g. "14-day free trial, card required"
  msp_features    TEXT,       -- multi-tenant / white-label / MSP program signals
  positioning     TEXT,       -- the page's own headline claim

  -- Raw hash of the normalised page text. The cheap change detector: if this is unchanged we can
  -- skip LLM extraction entirely and still prove we checked.
  content_hash    TEXT,

  notes           TEXT,

  CONSTRAINT os_competitor_intel_failed_rows_are_empty CHECK (
    fetch_ok = true OR (
      headline_price IS NULL AND pricing_model IS NULL AND trial_terms IS NULL
      AND msp_features IS NULL AND positioning IS NULL
    )
  ),
  CONSTRAINT os_competitor_intel_failure_has_reason CHECK (
    fetch_ok = true OR fail_reason IS NOT NULL
  )
);

-- The job's hot path: newest row per competitor, and newest SUCCESSFUL row per competitor.
CREATE INDEX IF NOT EXISTS os_competitor_intel_latest_idx
  ON os_competitor_intel (product_id, competitor, captured_at DESC);

CREATE INDEX IF NOT EXISTS os_competitor_intel_latest_ok_idx
  ON os_competitor_intel (product_id, competitor, captured_at DESC)
  WHERE fetch_ok = true;

-- One capture per competitor per day. A retry inside the same day overwrites nothing and inserts
-- nothing extra, so a flapping fetch cannot manufacture a fake "change" between two rows hours
-- apart. The weekly job is the only intended writer.
--
-- The day bucket is pinned to UTC explicitly. `captured_at::date` alone is NOT IMMUTABLE — it
-- resolves against the session TimeZone, so Postgres rejects it in an index expression (it did:
-- "functions in index expression must be marked IMMUTABLE"). Pinning to UTC also makes the bucket
-- mean the same thing regardless of which region the cron runs in, which matters because every
-- other daily boundary in this system (metrics_snapshot, autonomy clean days) is already UTC.
CREATE UNIQUE INDEX IF NOT EXISTS os_competitor_intel_one_per_day_idx
  ON os_competitor_intel (product_id, competitor, ((captured_at AT TIME ZONE 'UTC')::date));

COMMENT ON TABLE os_competitor_intel IS
  'KAAN AI OS 7.5 §5 #3. Competitor pricing/positioning snapshots. A failed fetch writes fetch_ok=false and renders NOT CHECKED — never a remembered price. Informs Kaan; never auto-acts on our own pricing, which is frozen.';
