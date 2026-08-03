-- ─────────────────────────────────────────────────────────────────────────────
--  0017 — os_integrity_incidents (PS-REX-01)
--
--  ADDITIVE ONLY. One new table, no ALTER of an existing one, no data migration.
--
--  WHAT THIS IS
--    Rex (Revenue Operations) is the agent that polices data trust for the other seven. When he
--    catches a funnel-integrity defect — a fabricated metric, a pricing claim that matches no live
--    Stripe price, a read surface whose writer has never fired — the finding has to OUTLIVE the run
--    that found it. A defect reported into a Telegram message and nowhere else is re-discovered
--    every morning and fixed never.
--
--  WHY A SIGNATURE, AND WHY IT IS UNIQUE
--    Rex re-runs daily against the same codebase. Without dedup he would file the same incident 365
--    times a year and the count — which is one of his OUTCOME metrics ("integrity incidents caught
--    before they entered a reported metric") — would measure how many times he ran, not how many
--    defects exist. The unique index makes re-filing a no-op and makes `last_seen` the honest
--    "still broken as of" timestamp.
--
--  resolved_at IS THE PROOF-OF-FIX, NOT A DELETE
--    A resolved incident stays. Rex's self-learning rule is "every data incident becomes a permanent
--    guard", and a guard needs the incident it was written against to still be readable. Deleting
--    resolved rows would erase the evidence trail that justifies the test.
--
--  NO DEFAULT ON severity
--    Forcing the detector to state severity means a new detector cannot silently file everything at
--    whatever the default happens to be.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS os_integrity_incidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT NOT NULL,

  -- Which detector fired. One of: fabricated_writer | pricing_drift | blind_gate | stage_violation.
  detector      TEXT NOT NULL,

  -- critical = a false number is reaching a human or a prospect right now.
  -- high      = a defect that will produce a false number as soon as the surface has data.
  -- medium    = a correctness/consistency defect with no current reader.
  severity      TEXT NOT NULL,

  -- The thing at fault, in the most specific addressable form available:
  -- a file path, a table name, or a lead id.
  subject       TEXT NOT NULL,

  summary       TEXT NOT NULL,

  -- Detector-specific proof. Rex writes the values he actually read here, so a human can audit the
  -- finding without re-running him. An incident with no evidence is an assertion, which is the exact
  -- failure mode this whole agent exists to prevent.
  evidence      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Stable dedup key, e.g. 'fabricated_writer:server/os/agents/marketing.ts'.
  signature     TEXT NOT NULL,

  first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL = still open. Set when a later run no longer detects it.
  resolved_at   TIMESTAMPTZ
);

-- Dedup is per product, not global: the same detector name may legitimately fire for a different
-- product against a different file.
CREATE UNIQUE INDEX IF NOT EXISTS os_integrity_incidents_sig_idx
  ON os_integrity_incidents (product_id, signature);

-- Rex's only hot query: open incidents for this product, worst first.
CREATE INDEX IF NOT EXISTS os_integrity_incidents_open_idx
  ON os_integrity_incidents (product_id, severity, last_seen DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE os_integrity_incidents IS
  'PS-REX-01. Funnel-integrity defects found by Rex. Deduped by (product_id, signature) — resolved rows are RETAINED as the evidence trail behind the permanent guard written for them.';
