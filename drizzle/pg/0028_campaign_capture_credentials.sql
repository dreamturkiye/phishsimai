-- ─────────────────────────────────────────────────────────────────────────────
--  0028 — campaign-level credential-capture toggle (PS-CAMPAIGN-CREDCAPTURE-01)
--
--  ADDITIVE ONLY. One nullable-safe boolean column with a default, so existing
--  rows are unaffected. Nothing dropped, nothing rewritten.
--
--  WHY THIS EXISTS
--    The Campaign Wizard gets a per-campaign toggle for whether the simulated
--    credential-harvest landing page is shown for credential_harvest templates.
--    Defaults to false so existing and newly created campaigns keep today's
--    behavior unless an admin explicitly opts in.
--
--  SCOPE
--    This does NOT change PS-CREDPAGE-01: the fake login page's password input
--    still has no `name` attribute, and /submit/:token still never reads
--    req.body. This column only gates whether the page is shown at all; it does
--    not enable storing any submitted credential value.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS "captureCredentials" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN campaigns."captureCredentials" IS
  'PS-CAMPAIGN-CREDCAPTURE-01. Per-campaign opt-in for showing the simulated credential-harvest landing page on credential_harvest templates. Never enables storing actual submitted credential values -- see PS-CREDPAGE-01.';
