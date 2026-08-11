-- ─────────────────────────────────────────────────────────────────────────────
--  0027 — PSA ticketing integrations (PS-PSA-01)
--
--  ADDITIVE ONLY. Three new tables, one new enum. Nothing dropped, nothing rewritten.
--
--  WHY THIS EXISTS
--    MSP sales parity with Phin Security: Phin turns a Report-Phish click into a real PSA ticket
--    (ConnectWise Manage, Halo). PhishSim only did in-product report tracking. This routes a
--    NON-simulation report to a real ticket in the reporting org's PSA, while a SIMULATION report
--    still scores as today and never creates a ticket (no ticket spam from the training program).
--
--  TENANCY
--    Integrations are configured at the MSP/partner level (msp_tenants). A per-org company mapping
--    (psa_company_mappings) is REQUIRED before any ticket flows for that client. Every ticket
--    create is scoped to the mapped external company id — there is no cross-tenant ticket leakage.
--
--  HONESTY (same doctrine as org_allowlist_state)
--    We never render "connected" without a real test. lastTestOk is NULL until a live testConnection
--    succeeds or fails. A ticket id is stored ONLY when the PSA API returned one; a failure stores
--    the reason in psa_error and the report itself is still saved. Null/error over optimistic
--    success — a fake "ticket #12345" would be the same fabrication class as a posture score
--    invented over zero data.
--
--  CREDENTIALS
--    psa_connections.secret_enc holds AES-256-GCM ciphertext (server/psa/crypto.ts), keyed by the
--    PSA_SECRET_KEY env. Plaintext credentials are never stored and never returned to the client.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE psa_provider AS ENUM ('connectwise_manage', 'halo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One connection per (MSP tenant, provider).
CREATE TABLE IF NOT EXISTS psa_connections (
  id               SERIAL PRIMARY KEY,
  "mspTenantId"    INTEGER NOT NULL,
  provider         psa_provider NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Non-secret, provider-shaped config. CW: baseUrl, companyId, serviceBoardId, priorityId, ticketType.
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- AES-256-GCM ciphertext of the credential JSON. Never selected into any client response.
  "secretEnc"      TEXT,
  -- Last connection-test / ticket outcome. NULL "lastTestOk" means never tested.
  "lastTestOk"     BOOLEAN,
  "lastTestAt"     TIMESTAMPTZ,
  "lastError"      TEXT,
  "lastSuccessAt"  TIMESTAMPTZ,
  "ticketsCreated" INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS psa_connections_mspTenantId_idx ON psa_connections ("mspTenantId");
CREATE UNIQUE INDEX IF NOT EXISTS psa_connections_msp_provider_uniq ON psa_connections ("mspTenantId", provider);

-- PhishSim org ↔ external PSA company. Required before tickets flow for that org.
CREATE TABLE IF NOT EXISTS psa_company_mappings (
  id                    SERIAL PRIMARY KEY,
  "connectionId"        INTEGER NOT NULL,
  "mspTenantId"         INTEGER NOT NULL,
  "orgId"               INTEGER NOT NULL,
  "externalCompanyId"   VARCHAR(128) NOT NULL,
  "externalCompanyName" VARCHAR(255),
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS psa_company_mappings_orgId_idx ON psa_company_mappings ("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS psa_company_mappings_conn_org_uniq ON psa_company_mappings ("connectionId", "orgId");

-- Every add-in / API report is persisted here FIRST, always, before classification or ticket create.
CREATE TABLE IF NOT EXISTS phish_reports (
  id                SERIAL PRIMARY KEY,
  -- Nullable: an un-attributable report is still saved so it is never lost. It just cannot be
  -- ticketed until attributed to an org (verified-domain match or sim token).
  "orgId"           INTEGER,
  "mspTenantId"     INTEGER,
  "reporterEmail"   VARCHAR(320),
  "reporterName"    VARCHAR(255),
  subject           TEXT,
  "senderDisplay"   VARCHAR(320),
  "senderAddress"   VARCHAR(320),
  "receivedAt"      TIMESTAMPTZ,
  "bodyExcerpt"     TEXT,
  headers           JSONB,
  classification    VARCHAR(16) NOT NULL,
  "simToken"        VARCHAR(64),
  source            VARCHAR(32) NOT NULL DEFAULT 'api',
  "idempotencyKey"  VARCHAR(512),
  "psaProvider"     psa_provider,
  "psaTicketId"     VARCHAR(128),
  "psaTicketUrl"    TEXT,
  "psaError"        TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS phish_reports_orgId_idx ON phish_reports ("orgId");
CREATE INDEX IF NOT EXISTS phish_reports_createdAt_idx ON phish_reports ("createdAt");
-- Dedupe retries. NULL keys are distinct in Postgres, so reports without a key are never merged.
CREATE UNIQUE INDEX IF NOT EXISTS phish_reports_idempotency_uniq ON phish_reports ("idempotencyKey");

COMMENT ON COLUMN psa_connections."secretEnc" IS
  'PS-PSA-01. AES-256-GCM ciphertext of the PSA credential JSON, keyed by PSA_SECRET_KEY. Plaintext is never stored and never returned to the client. If PSA_SECRET_KEY is unset the server refuses to store credentials rather than persist them in the clear.';

COMMENT ON COLUMN psa_connections."lastTestOk" IS
  'PS-PSA-01. NULL means the connection has never been tested. TRUE/FALSE is the result of a real live testConnection call. The admin UI renders connected ONLY on TRUE -- we never claim a working connection we did not verify.';

COMMENT ON COLUMN phish_reports."psaTicketId" IS
  'PS-PSA-01. Set ONLY when the PSA API returned a real external id. A NULL id alongside a non-null psa_error means the ticket create failed and the report was still saved -- never a fabricated ticket number.';

COMMENT ON COLUMN phish_reports.classification IS
  'PS-PSA-01. sim or non_sim. sim means a campaign_results row exists for the tracking token -- scored as today, never ticketed. non_sim routes to a PSA ticket when the org has an enabled and mapped connection.';
