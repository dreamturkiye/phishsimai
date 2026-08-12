-- ─────────────────────────────────────────────────────────────────────────────
--  0030 — Open Tracking for Cold Outreach Emails (PS-OPEN-TRACK-01)
--
--  ADDITIVE ONLY. Three new columns on ps_outreach_leads, each with a safe
--  default. Nothing dropped, nothing rewritten.
--
--  WHY THIS EXISTS
--    ps_outreach_leads (server/os/sequences.ts) had no visibility into whether a
--    sent touch was ever opened -- only sent_at/bounced/replied/unsubscribed. A
--    pixel-tracking route (server/os/trackOpen.ts, mounted at GET /api/os/open)
--    now decodes the same base64url(email) token used for unsubscribe and stamps
--    these columns on the matching lead.
--
--  SCOPE
--    Recorded per-lead, not per-touch, matching the existing shape of this table
--    (bounced/replied/unsubscribed are also lead-level, not touch-level).
--    touch1/touch2 are currently TEXT-ONLY (PS-COPY-PLAINTEXT-01) and carry no
--    pixel -- these columns simply stay NULL/0 until an HTML variant ships.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ps_outreach_leads
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ps_outreach_leads.first_opened_at IS
  'PS-OPEN-TRACK-01. First recorded pixel-open timestamp, set once via COALESCE and never overwritten.';
COMMENT ON COLUMN ps_outreach_leads.last_opened_at IS
  'PS-OPEN-TRACK-01. Most recent recorded pixel-open timestamp.';
COMMENT ON COLUMN ps_outreach_leads.open_count IS
  'PS-OPEN-TRACK-01. Count of recorded pixel-open hits (a mail client may prefetch, so this is an upper bound on real opens, not exact human opens).';
