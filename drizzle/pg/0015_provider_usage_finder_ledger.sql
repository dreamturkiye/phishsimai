-- ─────────────────────────────────────────────────────────────────────────────
--  PS-FINDER-LEDGER-01 (2026-07-24) — make finder spend a QUERY, not a deduction.
--
--  WHY: on 2026-07-24 the founder asked how 299 Icypeas credits were spent in 24h and how much
--  of it was PhishSim vs ScrollFuel. The honest answer was "that cannot be produced from what is
--  recorded" — `credit_readings` stores only a daily total BALANCE, and `provider_usage` was
--  empty because nothing has ever written to it. The spend had to be reconstructed by arithmetic
--  (89 inserted rows ≈ 89 found-email charges; the residual ~210 across 247 find-people calls
--  implying ~42 billed results per call). A reconstruction is not an audit.
--
--  WHAT CHANGES: provider_usage was defined as a per-provider DAILY TOKEN ledger for LLM
--  providers (Groq's TPD cap) and never used. It is reshaped here into a daily call ledger keyed
--  by (provider, day, product, endpoint) — which is exactly the grain the attribution question
--  needs. It is safe to reshape: verified 0 rows and 0 writers in the repo before writing this.
--
--  WHAT IS DELIBERATELY NOT STORED: a credits/cost column. Icypeas does not publish its per-call
--  or per-result rate (checked against api-doc.icypeas.com on 2026-07-24 — the pagination schema
--  is documented, the billing model is not). Recording calls + results stores the FACTS; the
--  empirical rate then falls out of (credit_readings delta) ÷ (calls, results) without anyone
--  having to guess a number and have it read as measured.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS product_id TEXT NOT NULL DEFAULT 'phishsimai';
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS endpoint   TEXT NOT NULL DEFAULT '';
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS calls      BIGINT NOT NULL DEFAULT 0;
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS results    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE provider_usage ADD COLUMN IF NOT EXISTS skipped    BIGINT NOT NULL DEFAULT 0;

-- The old key made a row unique per (provider, day), which cannot separate two products or two
-- endpoints on the same provider — the precise thing we could not answer.
ALTER TABLE provider_usage DROP CONSTRAINT IF EXISTS provider_usage_provider_usage_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS provider_usage_grain_key
  ON provider_usage (provider, usage_date, product_id, endpoint);

COMMENT ON COLUMN provider_usage.calls   IS 'Requests actually sent to the vendor.';
COMMENT ON COLUMN provider_usage.results IS 'Billable units returned (leads for find-people, 1 for a FOUND email, 0 for a miss).';
COMMENT ON COLUMN provider_usage.skipped IS 'Calls PREVENTED by PS-ICY-GUARD-01 — spend avoided, never sent.';
