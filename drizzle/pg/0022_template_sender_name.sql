-- ─────────────────────────────────────────────────────────────────────────────
--  0022 — templates carry a default sender display name (PS-TEMPLATE-SENDER-01)
--
--  ADDITIVE ONLY. One nullable column.
--
--  WHY THIS EXISTS
--    Display-name spoofing is the single biggest realism lever: the From line shows a brand
--    ("Microsoft account team") while the actual sending address stays our own authenticated sim
--    subdomain. Most mail clients show only the display name in the list view. This is what a real
--    phishing email does and what a simulation must teach people to catch.
--
--    The mechanism already worked per campaign (campaigns.senderName). What was missing was a
--    DEFAULT: a campaign created from a template had to have the display name typed in by hand every
--    time. This column lets each template carry its suggested display name, which a new campaign
--    inherits unless the creator overrides it.
--
--  NOT A CLAIM ABOUT THE SENDING DOMAIN
--    This is a display name only. It changes nothing about SPF/DKIM/DMARC or the sending address,
--    which remains the authenticated sim domain. A recipient who inspects the address still sees the
--    truth -- which is correct for a training tool.
--
--  NULLABLE ON PURPOSE
--    NULL means the template suggests no default, and the campaign falls back to its own senderName
--    or the org default. Existing templates predate this column and stay NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS "senderName" VARCHAR(150);

COMMENT ON COLUMN templates."senderName" IS
  'PS-TEMPLATE-SENDER-01. Default From DISPLAY NAME for campaigns created from this template, inherited unless the campaign overrides it. Display name only -- the sending address stays the authenticated sim domain and authentication is unchanged. NULL means no suggested default.';
