-- PS-OUTREACH-OPEN-01: track first open + open count on outreach leads
ALTER TABLE ps_outreach_leads
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INT DEFAULT 0;