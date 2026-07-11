CREATE TABLE "os_autonomy_state" (
	"company_id" text PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'manual' NOT NULL,
	"trust" numeric DEFAULT '0' NOT NULL,
	"clean_day_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "os_autonomy_state_level_ck" CHECK ("os_autonomy_state"."level" IN ('manual','l2','l3','l4','l5'))
);
--> statement-breakpoint
-- Seed exactly one row, ALWAYS at 'manual'. Tiers are earned, never granted.
INSERT INTO "os_autonomy_state" ("company_id", "level", "trust", "clean_day_streak")
VALUES ('phishsimai', 'manual', 0, 0)
ON CONFLICT ("company_id") DO NOTHING;
