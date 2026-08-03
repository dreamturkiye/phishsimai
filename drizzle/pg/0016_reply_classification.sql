-- ─────────────────────────────────────────────────────────────────────────────
--  0016 — reply classification columns on outreach_reply_drafts (PS-SALES-REPLY-01)
--
--  NOT RUN. Written for founder review; applying it to ep-spring-leaf is a hard stop.
--
--  WHY A MIGRATION AND NOT ensure*() ALTER TABLE
--    The first cut of the Sales agent added these with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
--    inside an ensureClassificationColumns() called on every invocation — the pattern used by
--    ensureReplyTables and ensureHqTables. Founder directive 2026-08-03: no silent DDL on prod
--    invocation. Same discipline as 0015.
--
--    The objection is right and worth recording. Invocation-time DDL means the schema changes at
--    whatever moment a cron first fires, under whatever code version happens to be deployed, with
--    no review and no record in this directory. It also fails SILENTLY here — every one of those
--    ALTERs was wrapped in .catch(() => {}), so a rejected column would have left the agent writing
--    classifications into a column that does not exist, forever, without a single error. That is
--    the "read surface with no verified writer" pattern in its DDL form.
--
--  ALL COLUMNS NULLABLE, NO DEFAULTS
--    classification IS NULL is the queue predicate — it means "captured but not yet classified".
--    Giving it a default would silently empty the queue on the first run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE outreach_reply_drafts
  -- One of: interested | objection | unsubscribe | auto_reply | hostile. NULL = still queued.
  ADD COLUMN IF NOT EXISTS classification TEXT,

  -- 0..1. Load-bearing, not decorative: auto-suppression requires >= 0.8 because suppressing a real
  -- prospect is unrecoverable, while a wrong draft costs one human glance. The threshold lives in
  -- code (SUPPRESS_MIN_CONFIDENCE) and the value it was judged against is recorded here, so a
  -- suppression can always be audited against the confidence that authorised it.
  ADD COLUMN IF NOT EXISTS classification_confidence REAL,

  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,

  -- draft_for_kaan | auto_suppress | no_action. Recorded separately from `classification` because
  -- they can legitimately disagree: a low-confidence 'hostile' classifies as hostile but ACTS as
  -- draft_for_kaan. Collapsing the two would hide exactly the cases worth reviewing.
  ADD COLUMN IF NOT EXISTS action_taken TEXT;

-- The agent's only hot query: unclassified rows, oldest first.
CREATE INDEX IF NOT EXISTS outreach_reply_drafts_unclassified_idx
  ON outreach_reply_drafts (created_at ASC)
  WHERE classification IS NULL;

COMMENT ON COLUMN outreach_reply_drafts.classification IS
  'PS-SALES-REPLY-01. NULL = captured but not yet classified (the queue predicate). Our own addresses are excluded at SELECT time and never enter this queue.';
