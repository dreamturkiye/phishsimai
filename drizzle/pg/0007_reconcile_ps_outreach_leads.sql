-- PS-SCHEMA-RECONCILE-01 (D4) — 2026-07-18
--
-- ps_outreach_leads drifted BIDIRECTIONALLY between the two Neon databases because its columns
-- were hand-ALTERed live (through a DATABASE_URL that pointed at the wrong database) and never
-- committed to a migration or a schema file:
--
--   purple-surf (ScrollFuel's prod) had:  country, tier, trial_at, customer_at,
--                                         stripe_customer_id, subscription_id
--   spring-leaf (PhishSim's prod)   had:  bounced_at
--
-- Neither was a superset. On spring-leaf the missing `country` made the enrichment INSERT
-- (server/os/agents/leadResearcher.ts) throw "column country does not exist" — so every 30-min
-- researcher run paid AnyMailFinder for a real MSP mailbox and then discarded the lead (12 lost
-- before this landed). This migration reconciles both databases to the same shape.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it is safe to apply to either database regardless of
-- which columns it already carried. Mirrored in server/os/conn.ts ensureHqTables() so a rebuild
-- from code reproduces the schema — the root fix is that the columns now live ON DISK, not only
-- in a live database nobody can diff.

ALTER TABLE ps_outreach_leads
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS trial_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
