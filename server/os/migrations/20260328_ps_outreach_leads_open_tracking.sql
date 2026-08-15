-- PS-OUTREACH: open tracking columns on ps_outreach_leads
ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS open_tracking BOOLEAN DEFAULT FALSE;
ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP;