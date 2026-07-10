CREATE TYPE "public"."attack_type" AS ENUM('credential_harvest', 'link_click', 'attachment', 'vishing', 'smishing', 'pretexting');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."feedback_category" AS ENUM('bug', 'ux', 'feature', 'praise', 'other');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'es', 'tr');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."module_difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."org_plan" AS ENUM('free', 'starter', 'growth', 'pro', 'unlimited', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended', 'trial');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'suspended', 'pending');--> statement-breakpoint
CREATE TYPE "public"."template_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "campaign_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"targetId" integer NOT NULL,
	"orgId" integer NOT NULL,
	"trackingToken" varchar(128) NOT NULL,
	"emailSentAt" timestamp with time zone,
	"emailOpenedAt" timestamp with time zone,
	"linkClickedAt" timestamp with time zone,
	"credentialSubmittedAt" timestamp with time zone,
	"reportedAt" timestamp with time zone,
	"trainingCompletedAt" timestamp with time zone,
	"ipAddress" varchar(45),
	"userAgent" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_results_trackingToken_unique" UNIQUE("trackingToken")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"createdByUserId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"templateId" integer,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"targetDepartmentIds" jsonb DEFAULT '[]'::jsonb,
	"targetIds" jsonb DEFAULT '[]'::jsonb,
	"scheduledAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"isRecurring" boolean DEFAULT false NOT NULL,
	"cronExpression" varchar(100),
	"scheduleCronTaskUid" varchar(65),
	"senderName" varchar(150),
	"senderEmail" varchar(320),
	"trackingDomain" varchar(255),
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"frameworkId" varchar(64) NOT NULL,
	"certId" varchar(64) NOT NULL,
	"completedCount" integer NOT NULL,
	"totalCount" integer NOT NULL,
	"issuedBy" integer,
	"issuedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_certificates_certId_unique" UNIQUE("certId")
);
--> statement-breakpoint
CREATE TABLE "compliance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"frameworkId" varchar(64) NOT NULL,
	"procedureId" varchar(64) NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"completedAt" timestamp with time zone,
	"completedBy" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"targetId" integer NOT NULL,
	"riskScore" real DEFAULT 50 NOT NULL,
	"clickCount" integer DEFAULT 0 NOT NULL,
	"submitCount" integer DEFAULT 0 NOT NULL,
	"reportCount" integer DEFAULT 0 NOT NULL,
	"trainingCount" integer DEFAULT 0 NOT NULL,
	"lastUpdatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"token" varchar(128) NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"acceptedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mia_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"orgId" integer NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msp_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"mspTenantId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"action" varchar(128) NOT NULL,
	"targetOrgId" integer,
	"details" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msp_customer_orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mspTenantId" integer NOT NULL,
	"orgId" integer NOT NULL,
	"plan" "subscription_plan" DEFAULT 'starter' NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"adminEmail" varchar(320),
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msp_tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer NOT NULL,
	"companyName" varchar(255) NOT NULL,
	"contactEmail" varchar(320) NOT NULL,
	"contactPhone" varchar(32),
	"website" varchar(255),
	"brandName" varchar(128),
	"brandLogoUrl" text,
	"brandPrimaryColor" varchar(16) DEFAULT '#6366f1',
	"brandSupportEmail" varchar(320),
	"brandCustomDomain" varchar(255),
	"status" "org_status" DEFAULT 'trial' NOT NULL,
	"maxCustomers" integer DEFAULT 10 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"joinedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_verified_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"domain" varchar(253) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"logoUrl" text,
	"gamificationEnabled" boolean DEFAULT false NOT NULL,
	"trainingEnabled" boolean DEFAULT true NOT NULL,
	"stripeCustomerId" varchar(64),
	"stripeSubscriptionId" varchar(64),
	"stripePriceId" varchar(64),
	"plan" "org_plan" DEFAULT 'free' NOT NULL,
	"planActivatedAt" timestamp with time zone,
	"planExpiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"orgId" integer NOT NULL,
	"page" varchar(255),
	"message" text NOT NULL,
	"category" "feedback_category" DEFAULT 'other' NOT NULL,
	"rating" integer,
	"plan" varchar(32),
	"trialDay" integer,
	"source" varchar(32) DEFAULT 'mia' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"departmentId" integer,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100) NOT NULL,
	"email" varchar(320) NOT NULL,
	"title" varchar(150),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer,
	"createdByUserId" integer,
	"name" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"htmlBody" text NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"attackType" "attack_type" DEFAULT 'credential_harvest' NOT NULL,
	"industry" varchar(100),
	"difficulty" "template_difficulty" DEFAULT 'medium' NOT NULL,
	"mspTenantId" integer,
	"isBuiltIn" boolean DEFAULT false NOT NULL,
	"isShared" boolean DEFAULT false NOT NULL,
	"isMspTemplate" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"orgId" integer NOT NULL,
	"targetId" integer,
	"userId" integer,
	"moduleId" integer NOT NULL,
	"score" integer,
	"completedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"timeSpentSeconds" integer
);
--> statement-breakpoint
CREATE TABLE "training_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"quizJson" jsonb DEFAULT '[]'::jsonb,
	"durationMinutes" integer DEFAULT 5 NOT NULL,
	"difficulty" "module_difficulty" DEFAULT 'beginner' NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"isBuiltIn" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	"passwordHash" varchar(255),
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "campaign_results_campaignId_idx" ON "campaign_results" USING btree ("campaignId");--> statement-breakpoint
CREATE INDEX "campaign_results_targetId_idx" ON "campaign_results" USING btree ("targetId");--> statement-breakpoint
CREATE INDEX "campaign_results_orgId_idx" ON "campaign_results" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "campaign_results_trackingToken_idx" ON "campaign_results" USING btree ("trackingToken");--> statement-breakpoint
CREATE INDEX "campaigns_orgId_idx" ON "campaigns" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_scheduleCronTaskUid_idx" ON "campaigns" USING btree ("scheduleCronTaskUid");--> statement-breakpoint
CREATE INDEX "compliance_certs_orgId_idx" ON "compliance_certificates" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "compliance_records_orgId_idx" ON "compliance_records" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "compliance_records_framework_idx" ON "compliance_records" USING btree ("orgId","frameworkId");--> statement-breakpoint
CREATE INDEX "departments_orgId_idx" ON "departments" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "gamification_scores_orgId_idx" ON "gamification_scores" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "gamification_scores_targetId_idx" ON "gamification_scores" USING btree ("targetId");--> statement-breakpoint
CREATE INDEX "invites_orgId_idx" ON "invites" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "mia_memory_userId_idx" ON "mia_memory" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "mia_memory_user_org_uniq" ON "mia_memory" USING btree ("userId","orgId");--> statement-breakpoint
CREATE INDEX "msp_activity_log_mspId_idx" ON "msp_activity_log" USING btree ("mspTenantId");--> statement-breakpoint
CREATE INDEX "msp_customer_orgs_mspId_idx" ON "msp_customer_orgs" USING btree ("mspTenantId");--> statement-breakpoint
CREATE INDEX "msp_customer_orgs_orgId_idx" ON "msp_customer_orgs" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "msp_tenants_ownerUserId_idx" ON "msp_tenants" USING btree ("ownerUserId");--> statement-breakpoint
CREATE INDEX "org_members_orgId_idx" ON "org_members" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "org_members_userId_idx" ON "org_members" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "org_verified_domains_orgId_idx" ON "org_verified_domains" USING btree ("orgId");--> statement-breakpoint
CREATE UNIQUE INDEX "org_verified_domains_orgId_domain_uniq" ON "org_verified_domains" USING btree ("orgId","domain");--> statement-breakpoint
CREATE INDEX "product_feedback_orgId_idx" ON "product_feedback" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "product_feedback_createdAt_idx" ON "product_feedback" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "targets_orgId_idx" ON "targets" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "targets_departmentId_idx" ON "targets" USING btree ("departmentId");--> statement-breakpoint
CREATE INDEX "templates_orgId_idx" ON "templates" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "templates_isBuiltIn_idx" ON "templates" USING btree ("isBuiltIn");--> statement-breakpoint
CREATE INDEX "templates_isShared_idx" ON "templates" USING btree ("isShared");--> statement-breakpoint
CREATE INDEX "templates_mspTenantId_idx" ON "templates" USING btree ("mspTenantId");--> statement-breakpoint
CREATE INDEX "training_completions_orgId_idx" ON "training_completions" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "training_completions_moduleId_idx" ON "training_completions" USING btree ("moduleId");