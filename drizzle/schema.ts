import {
  boolean,
  integer,
  serial,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums (Postgres named types — one declaration per distinct value set) ─────
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const memberRole = pgEnum("member_role", ["admin", "member"]);
export const orgPlan = pgEnum("org_plan", ["free", "starter", "growth", "pro", "unlimited", "enterprise"]);
export const language = pgEnum("language", ["en", "es", "tr"]);
export const attackType = pgEnum("attack_type", [
  "credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"
]);
export const templateDifficulty = pgEnum("template_difficulty", ["easy", "medium", "hard"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "scheduled", "active", "completed", "paused"]);
export const moduleDifficulty = pgEnum("module_difficulty", ["beginner", "intermediate", "advanced"]);
export const orgStatus = pgEnum("org_status", ["active", "suspended", "trial"]);
export const subscriptionPlan = pgEnum("subscription_plan", ["starter", "professional", "enterprise"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "suspended", "pending"]);
export const feedbackCategory = pgEnum("feedback_category", ["bug", "ux", "feature", "praise", "other"]);

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Organizations ────────────────────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logoUrl"),
  gamificationEnabled: boolean("gamificationEnabled").default(false).notNull(),
  trainingEnabled: boolean("trainingEnabled").default(true).notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  stripePriceId: varchar("stripePriceId", { length: 64 }),
  plan: orgPlan("plan").default("free").notNull(),
  planActivatedAt: timestamp("planActivatedAt", { withTimezone: true }),
  planExpiresAt: timestamp("planExpiresAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Organization = typeof organizations.$inferSelect;

// ─── Org Members ─────────────────────────────────────────────────────────────
export const orgMembers = pgTable("org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  userId: integer("userId").notNull(),
  role: memberRole("role").default("member").notNull(),
  joinedAt: timestamp("joinedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("org_members_orgId_idx").on(t.orgId),
  index("org_members_userId_idx").on(t.userId),
]);

export type OrgMember = typeof orgMembers.$inferSelect;

// ─── Invites ──────────────────────────────────────────────────────────────────
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  role: memberRole("role").default("member").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("invites_orgId_idx").on(t.orgId),
  index("invites_token_idx").on(t.token),
]);

export type Invite = typeof invites.$inferSelect;

// ─── Departments ──────────────────────────────────────────────────────────────
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("departments_orgId_idx").on(t.orgId),
]);

export type Department = typeof departments.$inferSelect;

// ─── Targets (Employees) ──────────────────────────────────────────────────────
export const targets = pgTable("targets", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  departmentId: integer("departmentId"),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  title: varchar("title", { length: 150 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("targets_orgId_idx").on(t.orgId),
  index("targets_departmentId_idx").on(t.departmentId),
]);

export type Target = typeof targets.$inferSelect;

// ─── Templates ────────────────────────────────────────────────────────────────
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId"),                        // null = built-in/community
  createdByUserId: integer("createdByUserId"),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlBody: text("htmlBody").notNull(),
  language: language("language").default("en").notNull(),
  attackType: attackType("attackType").default("credential_harvest").notNull(),
  industry: varchar("industry", { length: 100 }),
  difficulty: templateDifficulty("difficulty").default("medium").notNull(),
  mspTenantId: integer("mspTenantId"),                        // null = not MSP template; set = MSP private template
  isBuiltIn: boolean("isBuiltIn").default(false).notNull(),
  isShared: boolean("isShared").default(false).notNull(),   // shared to community
  isMspTemplate: boolean("isMspTemplate").default(false).notNull(), // MSP private template
  tags: jsonb("tags").$type<string[]>().default([]),
  usageCount: integer("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("templates_orgId_idx").on(t.orgId),
  index("templates_isBuiltIn_idx").on(t.isBuiltIn),
  index("templates_isShared_idx").on(t.isShared),
  index("templates_mspTenantId_idx").on(t.mspTenantId),
]);

export type Template = typeof templates.$inferSelect;

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  templateId: integer("templateId"),
  status: campaignStatus("status").default("draft").notNull(),
  language: language("language").default("en").notNull(),
  targetDepartmentIds: jsonb("targetDepartmentIds").$type<number[]>().default([]),
  targetIds: jsonb("targetIds").$type<number[]>().default([]),
  scheduledAt: timestamp("scheduledAt", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  cronExpression: varchar("cronExpression", { length: 100 }),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  senderName: varchar("senderName", { length: 150 }),
  senderEmail: varchar("senderEmail", { length: 320 }),
  trackingDomain: varchar("trackingDomain", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("campaigns_orgId_idx").on(t.orgId),
  index("campaigns_status_idx").on(t.status),
  index("campaigns_scheduleCronTaskUid_idx").on(t.scheduleCronTaskUid),
]);

export type Campaign = typeof campaigns.$inferSelect;

// ─── Campaign Results ─────────────────────────────────────────────────────────
export const campaignResults = pgTable("campaign_results", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaignId").notNull(),
  targetId: integer("targetId").notNull(),
  orgId: integer("orgId").notNull(),
  trackingToken: varchar("trackingToken", { length: 128 }).notNull().unique(),
  emailSentAt: timestamp("emailSentAt", { withTimezone: true }),
  emailOpenedAt: timestamp("emailOpenedAt", { withTimezone: true }),
  linkClickedAt: timestamp("linkClickedAt", { withTimezone: true }),
  credentialSubmittedAt: timestamp("credentialSubmittedAt", { withTimezone: true }),
  reportedAt: timestamp("reportedAt", { withTimezone: true }),      // user reported as phishing
  trainingCompletedAt: timestamp("trainingCompletedAt", { withTimezone: true }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("campaign_results_campaignId_idx").on(t.campaignId),
  index("campaign_results_targetId_idx").on(t.targetId),
  index("campaign_results_orgId_idx").on(t.orgId),
  index("campaign_results_trackingToken_idx").on(t.trackingToken),
]);

export type CampaignResult = typeof campaignResults.$inferSelect;

// ─── Training Modules ─────────────────────────────────────────────────────────
export const trainingModules = pgTable("training_modules", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(),
  content: text("content").notNull(),       // markdown content
  quizJson: jsonb("quizJson").$type<QuizQuestion[]>().default([]),
  durationMinutes: integer("durationMinutes").default(5).notNull(),
  difficulty: moduleDifficulty("difficulty").default("beginner").notNull(),
  language: language("language").default("en").notNull(),
  isBuiltIn: boolean("isBuiltIn").default(true).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TrainingModule = typeof trainingModules.$inferSelect;

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

// ─── Training Completions ─────────────────────────────────────────────────────
export const trainingCompletions = pgTable("training_completions", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  targetId: integer("targetId"),       // employee target
  userId: integer("userId"),           // platform user
  moduleId: integer("moduleId").notNull(),
  score: integer("score"),             // quiz score 0-100
  completedAt: timestamp("completedAt", { withTimezone: true }).defaultNow().notNull(),
  timeSpentSeconds: integer("timeSpentSeconds"),
}, (t) => [
  index("training_completions_orgId_idx").on(t.orgId),
  index("training_completions_moduleId_idx").on(t.moduleId),
]);

export type TrainingCompletion = typeof trainingCompletions.$inferSelect;

// ─── Gamification Scores ──────────────────────────────────────────────────────
export const gamificationScores = pgTable("gamification_scores", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  targetId: integer("targetId").notNull(),
  riskScore: real("riskScore").default(50).notNull(),    // 0=safe, 100=high risk
  clickCount: integer("clickCount").default(0).notNull(),
  submitCount: integer("submitCount").default(0).notNull(),
  reportCount: integer("reportCount").default(0).notNull(),
  trainingCount: integer("trainingCount").default(0).notNull(),
  lastUpdatedAt: timestamp("lastUpdatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("gamification_scores_orgId_idx").on(t.orgId),
  index("gamification_scores_targetId_idx").on(t.targetId),
]);

export type GamificationScore = typeof gamificationScores.$inferSelect;

// ─── Compliance Records ───────────────────────────────────────────────────────
export const complianceRecords = pgTable("compliance_records", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  frameworkId: varchar("frameworkId", { length: 64 }).notNull(), // e.g. "hipaa", "pci-dss"
  procedureId: varchar("procedureId", { length: 64 }).notNull(), // e.g. "hipaa-1"
  completed: integer("completed").default(0).notNull(),          // 0 or 1
  completedAt: timestamp("completedAt", { withTimezone: true }),
  completedBy: integer("completedBy"),                           // userId
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("compliance_records_orgId_idx").on(t.orgId),
  index("compliance_records_framework_idx").on(t.orgId, t.frameworkId),
]);
export type ComplianceRecord = typeof complianceRecords.$inferSelect;

// ─── Compliance Certificates ──────────────────────────────────────────────────
export const complianceCertificates = pgTable("compliance_certificates", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  frameworkId: varchar("frameworkId", { length: 64 }).notNull(),
  certId: varchar("certId", { length: 64 }).notNull().unique(),  // e.g. PSA-HIPAA-ABC123
  completedCount: integer("completedCount").notNull(),
  totalCount: integer("totalCount").notNull(),
  issuedBy: integer("issuedBy"),                                 // userId
  issuedAt: timestamp("issuedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("compliance_certs_orgId_idx").on(t.orgId),
]);
export type ComplianceCertificate = typeof complianceCertificates.$inferSelect;

// ─── MSP Tenants ──────────────────────────────────────────────────────────────
export const mspTenants = pgTable("msp_tenants", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }).notNull(),
  contactPhone: varchar("contactPhone", { length: 32 }),
  website: varchar("website", { length: 255 }),
  // White-label branding
  brandName: varchar("brandName", { length: 128 }),
  brandLogoUrl: text("brandLogoUrl"),
  brandPrimaryColor: varchar("brandPrimaryColor", { length: 16 }).default("#6366f1"),
  brandSupportEmail: varchar("brandSupportEmail", { length: 320 }),
  brandCustomDomain: varchar("brandCustomDomain", { length: 255 }),
  // Status
  status: orgStatus("status").default("trial").notNull(),
  maxCustomers: integer("maxCustomers").default(10).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("msp_tenants_ownerUserId_idx").on(t.ownerUserId),
]);
export type MspTenant = typeof mspTenants.$inferSelect;

// ─── MSP Customer Organizations ───────────────────────────────────────────────
export const mspCustomerOrgs = pgTable("msp_customer_orgs", {
  id: serial("id").primaryKey(),
  mspTenantId: integer("mspTenantId").notNull(),
  orgId: integer("orgId").notNull(),           // FK → organizations.id
  plan: subscriptionPlan("plan").default("starter").notNull(),
  status: subscriptionStatus("status").default("pending").notNull(),
  adminEmail: varchar("adminEmail", { length: 320 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("msp_customer_orgs_mspId_idx").on(t.mspTenantId),
  index("msp_customer_orgs_orgId_idx").on(t.orgId),
]);
export type MspCustomerOrg = typeof mspCustomerOrgs.$inferSelect;

// ─── MSP Activity Log ─────────────────────────────────────────────────────────
export const mspActivityLog = pgTable("msp_activity_log", {
  id: serial("id").primaryKey(),
  mspTenantId: integer("mspTenantId").notNull(),
  actorUserId: integer("actorUserId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),   // e.g. "provision_customer", "impersonate"
  targetOrgId: integer("targetOrgId"),
  details: text("details"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("msp_activity_log_mspId_idx").on(t.mspTenantId),
]);
export type MspActivityLog = typeof mspActivityLog.$inferSelect;

// ─── Org Verified Domains ─────────────────────────────────────────────────────
export const orgVerifiedDomains = pgTable("org_verified_domains", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  domain: varchar("domain", { length: 253 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("org_verified_domains_orgId_idx").on(t.orgId),
  uniqueIndex("org_verified_domains_orgId_domain_uniq").on(t.orgId, t.domain),
]);
export type OrgVerifiedDomain = typeof orgVerifiedDomains.$inferSelect;

// ─── Mia (in-app customer success) ───────────────────────────────────────────
export const miaMemory = pgTable("mia_memory", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  orgId: integer("orgId").notNull(),
  memory: text("memory").default("").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("mia_memory_userId_idx").on(t.userId),
  uniqueIndex("mia_memory_user_org_uniq").on(t.userId, t.orgId),
]);

export type MiaMemory = typeof miaMemory.$inferSelect;

export const productFeedback = pgTable("product_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  orgId: integer("orgId").notNull(),
  page: varchar("page", { length: 255 }),
  message: text("message").notNull(),
  category: feedbackCategory("category").default("other").notNull(),
  rating: integer("rating"),
  plan: varchar("plan", { length: 32 }),
  trialDay: integer("trialDay"),
  source: varchar("source", { length: 32 }).default("mia").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("product_feedback_orgId_idx").on(t.orgId),
  index("product_feedback_createdAt_idx").on(t.createdAt),
]);

export type ProductFeedback = typeof productFeedback.$inferSelect;
