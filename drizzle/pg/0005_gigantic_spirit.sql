CREATE TABLE "founder_briefs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"brief_date" date NOT NULL,
	"content_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "founder_briefs_brief_date_unique" UNIQUE("brief_date")
);
--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "notified_at" timestamp with time zone;