-- ─────────────────────────────────────────────────────────────────────────────
--  0028 — per-campaign credential-capture toggle (PS-CREDCAPTURE-TOGGLE-01)
--
--  ADDITIVE ONLY. One boolean column, NOT NULL DEFAULT true.
--
--  WHY THIS EXISTS
--    Whether a recipient who clicks sees the simulated fake login page (PS-CREDPAGE-01, see
--    server/email/tracker.ts) was previously decided ENTIRELY by the template's attackType
--    ("credential_harvest" -> login page shown for every campaign built from it). This column
--    lets a specific campaign opt OUT of that behavior even when built from a credential_harvest
--    template, without touching the template itself (which may be reused by other campaigns).
--
--  DEFAULT true ON PURPOSE
--    Preserves existing behavior for every campaign that predates this column and for anyone who
--    never touches the new wizard toggle: a credential_harvest template still shows the login page
--    exactly as before. This column can only make the flow MORE conservative (skip the login page
--    sooner) -- it can never cause a template that wasn't already credential_harvest to show one,
--    and it does not change what the login page captures (still nothing -- see PS-CREDPAGE-01).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS "credentialCaptureEnabled" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN campaigns."credentialCaptureEnabled" IS
  'PS-CREDCAPTURE-TOGGLE-01. Per-campaign gate on the existing non-storing fake login page (PS-CREDPAGE-01): when false, /c/:token always redirects straight to training even for a credential_harvest template. Default true preserves prior behavior. Never affects what is captured -- the login page still records only that a submission occurred, never a typed password.';
