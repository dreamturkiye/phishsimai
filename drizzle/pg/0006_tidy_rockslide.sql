CREATE TABLE "agent_levels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"level" text NOT NULL,
	"window_stats" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_levels_level_ck" CHECK ("agent_levels"."level" IN ('L4','L5','below'))
);
--> statement-breakpoint
CREATE INDEX "agent_levels_agent_computed_idx" ON "agent_levels" USING btree ("agent_id","computed_at");