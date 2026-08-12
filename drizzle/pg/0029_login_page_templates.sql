-- ─────────────────────────────────────────────────────────────────────────────
--  0029 — Simulated Login Page Templates (PS-LOGINPAGE-TEMPLATES-01)
--
--  ADDITIVE ONLY. One new enum, one new column with a default. Nothing dropped,
--  nothing rewritten.
--
--  WHY THIS EXISTS
--    The fake "sign in" page shown on a credential_harvest click (PS-CREDPAGE-01) was a single
--    hardcoded Microsoft-style page. Real customers run mixed environments (Google Workspace,
--    Okta SSO, plain internal portals), so a Microsoft-only skin doesn't match what many
--    employees actually see day to day, which undercuts the simulation's realism. This lets a
--    campaign pick a brand skin from a small library instead.
--
--  SCOPE
--    This does NOT touch PS-CREDPAGE-01: every brand renderer is hand-written in
--    server/email/loginPageTemplates.ts (not admin-editable arbitrary HTML), and every one keeps
--    the password <input> with no `name` attribute — /submit/:token still never reads req.body.
--    Defaults to 'microsoft365' so existing campaigns render exactly as they did before this
--    column existed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE login_page_brand AS ENUM ('microsoft365', 'google_workspace', 'okta', 'generic_it');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS "loginPageBrand" login_page_brand NOT NULL DEFAULT 'microsoft365';

COMMENT ON COLUMN campaigns."loginPageBrand" IS
  'PS-LOGINPAGE-TEMPLATES-01. Which fake login page brand skin to render on a credential_harvest click when captureCredentials is on. Defaults to microsoft365 (the pre-existing hardcoded page). Never changes the PS-CREDPAGE-01 invariant -- the password input still has no name attribute on every brand.';
