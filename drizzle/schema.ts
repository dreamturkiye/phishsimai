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
  senderName: varchar("senderName", { length: 150 }),   // PS-TEMPLATE-SENDER-01: default From display name; campaign inherits it unless overridden
  htmlBody: text("htmlBody").notNull(),
  language: language("language").default("en").notNull(),
  attackType: attackType("attackType").default("credential_harvest").notNull(),
  industry: varchar("industry", { length: 100 }),
  difficulty: templateDifficulty("difficulty").default("medium").notNull(),
  mspTenantId: integer("mspTenantId"),                        // null = not MSP template; set = MSP private template
  isBuiltIn: boolean("isBuiltIn").default(false).notNull(),
  isShared: boolean("isShared").default(false).notNull(),   // shared to community
  moderationStatus: text("moderationStatus").default("pending").notNull(), // PS-MARKETPLACE-GATE-01: pending|approved|rejected — community-visible only when approved
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
  // PS-CREDCAPTURE-TOGGLE-01: per-campaign gate on the existing (safe, non-storing) fake login
  // page — see PS-CREDPAGE-01 in server/email/tracker.ts. Default true preserves prior behavior
  // (a credential_harvest template always showed the login page); setting this false lets a
  // campaign opt out and go straight to the training landing page regardless of template.
  credentialCaptureEnabled: boolean("credentialCaptureEnabled").default(true).notNull(),
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
  // 1b — provider delivery tracking (Resend webhooks). emailSentAt means "the provider ACCEPTED
  // it"; these mean the provider told us what actually happened next. providerMessageId is the
  // Resend email id, the correlation key the webhook matches events against.
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),    // email.delivered
  bouncedAt: timestamp("bouncedAt", { withTimezone: true }),        // email.bounced
  bounceType: varchar("bounceType", { length: 64 }),                // hard | soft | suppressed | ...
  complainedAt: timestamp("complainedAt", { withTimezone: true }),  // email.complained (spam)
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("campaign_results_campaignId_idx").on(t.campaignId),
  index("campaign_results_targetId_idx").on(t.targetId),
  index("campaign_results_orgId_idx").on(t.orgId),
  index("campaign_results_trackingToken_idx").on(t.trackingToken),
  index("campaign_results_providerMessageId_idx").on(t.providerMessageId),
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

export const trainingAssignments = pgTable("training_assignments", {
  id: serial("id").primaryKey(),
  orgId: integer("orgId").notNull(),
  targetId: integer("targetId").notNull(),
  moduleId: integer("moduleId").notNull(),
  attackType: text("attackType"),
  source: text("source").notNull(),                 // 'sim_click' | 'sim_submit'
  campaignResultId: integer("campaignResultId"),
  assignedAt: timestamp("assignedAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),  // NULL = enrolled, not completed
}, (t) => [
  index("training_assignments_org_idx").on(t.orgId, t.assignedAt),
]);
export type TrainingAssignment = typeof trainingAssignments.$inferSelect;

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
  // Domain-ownership proof. Existing rows default to UNVERIFIED — "we never checked"
  // is not proof (Genesis §2.6). Only verified=true is trusted by the compliance floor.
  verified: boolean("verified").default(false).notNull(),
  verificationToken: varchar("verification_token", { length: 128 }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
  // PS-MIA-HONEST-01. The surrounding exchange, so a bug report is actionable rather than a
  // fragment. Nullable: rows written before 0019 predate it, and absence must read as "not
  // captured", never as "no context".
  conversationContext: text("conversationContext"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("product_feedback_orgId_idx").on(t.orgId),
  index("product_feedback_createdAt_idx").on(t.createdAt),
]);

export type ProductFeedback = typeof productFeedback.$inferSelect;

// ─── PSA ticketing integrations (PS-PSA-01) ──────────────────────────────────
//
//  MSP sales parity with Phin: a non-simulation phishing report routes to a real PSA ticket
//  (ConnectWise Manage, Halo) in the reporting org's PSA. A SIMULATION report never creates a
//  ticket — it scores as today. Integrations are configured at the MSP/partner level
//  (msp_tenants), and a per-org company mapping (psa_company_mappings) is REQUIRED before any
//  ticket flows for that client. Every ticket create is scoped to the mapped external company —
//  no cross-tenant leakage.

export const psaProvider = pgEnum("psa_provider", ["connectwise_manage", "halo"]);

// One connection per (MSP tenant, provider). Credentials are stored ENCRYPTED (AES-256-GCM,
// server/psa/crypto.ts) in secretEnc and are NEVER returned to the client. Non-secret config
// (base URL, board id, defaults) lives in config as JSON. lastError/lastSuccessAt make the
// honesty state visible to the MSP admin: we record what actually happened, never an optimistic
// "connected".
export const psaConnections = pgTable("psa_connections", {
  id: serial("id").primaryKey(),
  mspTenantId: integer("mspTenantId").notNull(),          // FK → msp_tenants.id (partner scope)
  provider: psaProvider("provider").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  // Non-secret provider config, provider-shaped. CW: { baseUrl, companyId, serviceBoardId, priorityId?, ticketType? }
  // Halo: { baseUrl, tenant?, ticketTypeId?, teamId? }
  config: jsonb("config").notNull().default({}),
  // AES-256-GCM ciphertext of the credential JSON. Never selected into any client response.
  secretEnc: text("secretEnc"),
  // Last connection-test / ticket outcome. Null lastTestOk = never tested. These are the ONLY
  // signals the admin UI trusts — we never claim connected without a real test.
  lastTestOk: boolean("lastTestOk"),
  lastTestAt: timestamp("lastTestAt", { withTimezone: true }),
  lastError: text("lastError"),
  lastSuccessAt: timestamp("lastSuccessAt", { withTimezone: true }),
  ticketsCreated: integer("ticketsCreated").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("psa_connections_mspTenantId_idx").on(t.mspTenantId),
  uniqueIndex("psa_connections_msp_provider_uniq").on(t.mspTenantId, t.provider),
]);
export type PsaConnection = typeof psaConnections.$inferSelect;

// PhishSim org ↔ external PSA company. Required before tickets flow for that org. Unique per
// (connection, org) so an org maps to exactly one external company per provider. The mspTenantId
// is denormalised here so every ticket-create lookup is partner-scoped in one query.
export const psaCompanyMappings = pgTable("psa_company_mappings", {
  id: serial("id").primaryKey(),
  connectionId: integer("connectionId").notNull(),        // FK → psa_connections.id
  mspTenantId: integer("mspTenantId").notNull(),          // partner scope (matches the connection's)
  orgId: integer("orgId").notNull(),                      // FK → organizations.id (PhishSim client)
  externalCompanyId: varchar("externalCompanyId", { length: 128 }).notNull(),
  externalCompanyName: varchar("externalCompanyName", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  index("psa_company_mappings_orgId_idx").on(t.orgId),
  uniqueIndex("psa_company_mappings_conn_org_uniq").on(t.connectionId, t.orgId),
]);
export type PsaCompanyMapping = typeof psaCompanyMappings.$inferSelect;

// Every report from the Outlook add-in / API is persisted here FIRST, always, before any
// classification or ticket attempt — so a PSA outage never loses the report. classification is
// 'sim' or 'non_sim'. psaTicketId is set ONLY when the PSA API returned a real id; psaError holds
// the honest failure reason otherwise. idempotencyKey (messageId+reporter+org) dedupes retries.
export const phishReports = pgTable("phish_reports", {
  id: serial("id").primaryKey(),
  // Nullable on purpose: a report we cannot attribute to an org (no verified-domain match, no sim
  // token) is STILL persisted so it is never lost — it simply cannot be ticketed until attributed.
  orgId: integer("orgId"),
  mspTenantId: integer("mspTenantId"),                    // resolved from the org's MSP, null if none
  reporterEmail: varchar("reporterEmail", { length: 320 }),
  reporterName: varchar("reporterName", { length: 255 }),
  subject: text("subject"),
  senderDisplay: varchar("senderDisplay", { length: 320 }),
  senderAddress: varchar("senderAddress", { length: 320 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }),
  bodyExcerpt: text("bodyExcerpt"),                       // truncated, size-capped upstream
  headers: jsonb("headers"),                              // key headers or full set, when supplied
  classification: varchar("classification", { length: 16 }).notNull(),  // 'sim' | 'non_sim'
  simToken: varchar("simToken", { length: 64 }),          // the tracking token when it was a sim
  source: varchar("source", { length: 32 }).default("api").notNull(),   // 'outlook-addin' | 'api'
  idempotencyKey: varchar("idempotencyKey", { length: 512 }),
  psaProvider: psaProvider("psaProvider"),
  psaTicketId: varchar("psaTicketId", { length: 128 }),
  psaTicketUrl: text("psaTicketUrl"),
  psaError: text("psaError"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("phish_reports_orgId_idx").on(t.orgId),
  index("phish_reports_createdAt_idx").on(t.createdAt),
  uniqueIndex("phish_reports_idempotency_uniq").on(t.idempotencyKey),
]);
export type PhishReport = typeof phishReports.$inferSelect;
