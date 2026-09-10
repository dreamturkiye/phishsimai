-- P0 agent safety containment. Additive and safe to re-run.

-- Marcus completion is not a status flip without proof of the exact merged
-- artifact and the production/canary checks performed against it.
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS merged_commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS completion_evidence JSONB;

-- Durable reply-classification leases prevent overlapping cron invocations
-- from selecting the same classification-null row.
ALTER TABLE outreach_reply_drafts
  ADD COLUMN IF NOT EXISTS classification_claim_token UUID,
  ADD COLUMN IF NOT EXISTS classification_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classification_claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS outreach_reply_drafts_claimable_idx
  ON outreach_reply_drafts (created_at ASC)
  WHERE classification IS NULL;

-- Stable per-lead/per-touch outbox keys are also sent to Resend as its
-- Idempotency-Key. If a worker dies after the provider accepts an email, a
-- retry uses the same key rather than sending a duplicate.
CREATE TABLE IF NOT EXISTS outreach_sequence_outbox (
  idempotency_key TEXT PRIMARY KEY,
  lead_id UUID NOT NULL,
  touch INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  claim_token UUID,
  claim_expires_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_sequence_outbox_retry_idx
  ON outreach_sequence_outbox (claim_expires_at)
  WHERE provider_message_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outreach_sequence_outbox_provider_id_uniq
  ON outreach_sequence_outbox (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
