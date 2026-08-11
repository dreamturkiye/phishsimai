-- 1b — provider delivery tracking on campaign_results (Resend webhooks).
-- emailSentAt already means "the provider ACCEPTED the send"; these columns record what the
-- provider reported happened AFTER acceptance, so "sent" can finally be distinguished from
-- "delivered". providerMessageId is the Resend email id the webhook correlates events against.
-- Idempotent: safe to re-run.
ALTER TABLE "campaign_results" ADD COLUMN IF NOT EXISTS "providerMessageId" varchar(128);--> statement-breakpoint
ALTER TABLE "campaign_results" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_results" ADD COLUMN IF NOT EXISTS "bouncedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_results" ADD COLUMN IF NOT EXISTS "bounceType" varchar(64);--> statement-breakpoint
ALTER TABLE "campaign_results" ADD COLUMN IF NOT EXISTS "complainedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_results_providerMessageId_idx" ON "campaign_results" USING btree ("providerMessageId");
