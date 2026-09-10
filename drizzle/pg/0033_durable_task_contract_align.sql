-- Align PhishSim DurableTask rows with the shared contract_version used by
-- ScrollFuel and @kaan/os-core consumers. Additive and idempotent.
UPDATE agent_tasks
SET contract_version = 'durable-task-v1'
WHERE contract_version = '1';

CREATE INDEX IF NOT EXISTS agent_tasks_durable_claim_v1_idx
  ON agent_tasks (company_id, status, created_at)
  WHERE contract_version = 'durable-task-v1' AND status = 'queued';
