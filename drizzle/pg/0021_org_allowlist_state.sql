-- ─────────────────────────────────────────────────────────────────────────────
--  0021 — allowlist onboarding state (PS-DELIVER-ALLOWLIST-01)
--
--  ADDITIVE ONLY. One new table. Nothing dropped, nothing rewritten.
--
--  WHY THIS EXISTS
--    Simulated-phishing content is phishing BY DESIGN, so content and new-sender reputation put it
--    in spam even with SPF/DKIM/DMARC all passing. Authentication is NOT the problem: verified
--    2026-07-22, DKIM aligned, SPF healthy, DMARC passing, and a real send still landed in Junk.
--    The industry fix is customer-side allowlisting, and every competitor gates onboarding on it.
--
--    Without this step the product looks broken on day one: the trial sends its first simulation,
--    nobody receives it in the inbox, and the customer concludes the product does not work. That is
--    the single largest activation leak we can close without a vendor dependency.
--
--  THE STATE NAMES ARE THE POINT
--    'confirmed_by_admin' is NOT 'verified'. Neither Microsoft nor Google exposes an API that lets
--    a third party read whether a customer tenant has configured Advanced Delivery or a spam
--    bypass rule. We therefore CANNOT verify completion, and a green tick claiming we did would be
--    the same fabrication class as a posture score invented over zero data.
--
--    An admin ticking "I have done this" is real evidence of intent and nothing more. The UI says
--    exactly that: "admin confirmed - not verified by us".
--
--  SKIP IS A CHOICE, NOT A WALL
--    A customer may proceed without allowlisting. That requires an explicit acknowledgement, stored
--    verbatim in skip_ack_text, so the record shows they were told their simulations may land in
--    spam. An unacknowledged skip is not a skip: it stays not_started and the gate holds.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_allowlist_state (
  "orgId"        INTEGER PRIMARY KEY,

  -- 'not_started' | 'confirmed_by_admin' | 'skipped'. Deliberately no 'verified' value exists,
  -- because no API can produce one honestly.
  state          TEXT NOT NULL DEFAULT 'not_started',

  -- Which mail platform the admin says they configured. Informational, never a claim of success.
  platform       TEXT,

  "confirmedAt"  TIMESTAMPTZ,
  "confirmedBy"  INTEGER,

  "skippedAt"    TIMESTAMPTZ,
  -- The warning text the admin acknowledged, stored VERBATIM. If the wording changes later, the
  -- record still shows what this customer was actually told.
  skip_ack_text  TEXT,

  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The two states are mutually exclusive and each requires its own evidence. Enforced at the schema
-- level so no application path can record a confirmation with no confirmer, or a skip with no
-- acknowledgement.
ALTER TABLE org_allowlist_state
  DROP CONSTRAINT IF EXISTS org_allowlist_state_evidence_required;
ALTER TABLE org_allowlist_state
  ADD CONSTRAINT org_allowlist_state_evidence_required CHECK (
    (state = 'not_started')
    OR (state = 'confirmed_by_admin' AND "confirmedAt" IS NOT NULL AND "confirmedBy" IS NOT NULL)
    OR (state = 'skipped' AND "skippedAt" IS NOT NULL AND skip_ack_text IS NOT NULL AND length(skip_ack_text) > 0)
  );

COMMENT ON COLUMN org_allowlist_state.state IS
  'PS-DELIVER-ALLOWLIST-01. not_started blocks the first campaign launch. confirmed_by_admin means the admin stated they configured allowlisting -- we CANNOT verify it, no vendor API exposes a tenant policy read, so this is never rendered as verified. skipped means they proceeded knowingly after acknowledging the spam warning.';

COMMENT ON COLUMN org_allowlist_state.skip_ack_text IS
  'PS-DELIVER-ALLOWLIST-01. The exact warning the admin acknowledged, kept verbatim so the record survives later copy changes. An empty or absent value means the skip was never acknowledged and the gate must hold.';
