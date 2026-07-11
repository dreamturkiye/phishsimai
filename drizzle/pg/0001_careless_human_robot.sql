CREATE TABLE "agent_performance" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"task_id" text NOT NULL,
	"avg_score" numeric(3, 1) NOT NULL,
	"review_notes" text,
	"reviewed_by" text DEFAULT 'janet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_performance_avg_score_check" CHECK ("agent_performance"."avg_score" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circuit_breaker_state" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'closed' NOT NULL,
	"opened_at" timestamp with time zone,
	"last_error" text,
	"trip_reason" text,
	"escalation_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_breaker_state_state_check" CHECK ("circuit_breaker_state"."state" IN ('closed','open','half_open'))
);
--> statement-breakpoint
CREATE TABLE "deploy_verifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"vercel_project_id" text NOT NULL,
	"expected_domain" text NOT NULL,
	"actual_domains" jsonb NOT NULL,
	"match" boolean NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"category" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_via" text,
	CONSTRAINT "escalations_category_check" CHECK ("escalations"."category" IN ('pricing_billing','capital_spend','legal_contract','new_subsidiary','protected_path','breaker_trip')),
	CONSTRAINT "escalations_status_check" CHECK ("escalations"."status" IN ('pending','approved','rejected','deferred'))
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"mrr_cents" bigint,
	"active_subs" integer,
	"new_subs" integer,
	"churned_subs" integer,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_failed" integer DEFAULT 0 NOT NULL,
	"agent_score_avg" numeric(3, 1),
	"queue_depth" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_daily_product_id_snapshot_date_key" UNIQUE("product_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "os_memory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_key" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"binding" jsonb,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_memory_scope_scope_key_key_key" UNIQUE("scope","scope_key","key"),
	CONSTRAINT "os_memory_scope_check" CHECK ("os_memory"."scope" IN ('global','company','agent','campaign','contact','audit'))
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"usage_date" date NOT NULL,
	"tokens_used" bigint DEFAULT 0 NOT NULL,
	"exhausted_at" timestamp with time zone,
	CONSTRAINT "provider_usage_provider_usage_date_key" UNIQUE("provider","usage_date")
);
