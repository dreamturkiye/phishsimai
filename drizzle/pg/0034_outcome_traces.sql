CREATE TABLE IF NOT EXISTS agent_outcome_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  report_id TEXT,
  reasoning_id TEXT,
  action TEXT,
  pr_url TEXT,
  deployed_sha TEXT,
  business_outcome TEXT,
  prompt_version TEXT,
  model TEXT,
  provider TEXT,
  tokens INTEGER,
  latency_ms INTEGER,
  fallback BOOLEAN,
  schema_valid BOOLEAN,
  unsupported_claim_count INTEGER,
  liveness BOOLEAN NOT NULL,
  usefulness BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_outcome_traces_company_created_idx
  ON agent_outcome_traces (company_id, created_at DESC);
