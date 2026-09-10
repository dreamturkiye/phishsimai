-- DurableTask v1 persistence. Additive, idempotent, and safe for legacy rows:
-- old rows remain untyped until the runtime explicitly fails them closed.
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS evidence_ids JSONB,
  ADD COLUMN IF NOT EXISTS dependency_reports JSONB,
  ADD COLUMN IF NOT EXISTS dependency_freshness_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permitted_capability TEXT,
  ADD COLUMN IF NOT EXISTS expected_kpi_effect JSONB,
  ADD COLUMN IF NOT EXISTS acceptance_test JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS artifact JSONB,
  ADD COLUMN IF NOT EXISTS verification JSONB,
  ADD COLUMN IF NOT EXISTS contract_version TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS agent_tasks_idempotency_key_uniq
  ON agent_tasks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_tasks_durable_claim_idx
  ON agent_tasks (company_id, status, created_at)
  WHERE contract_version = '1' AND status = 'queued';
