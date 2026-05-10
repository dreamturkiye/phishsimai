import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Organizations ────────────────────────────────────────────────────────────
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logoUrl"),
  gamificationEnabled: boolean("gamificationEnabled").default(false).notNull(),
  trainingEnabled: boolean("trainingEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;

// ─── Org Members ─────────────────────────────────────────────────────────────
export const orgMembers = mysqlTable("org_members", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (t) => [
  index("org_members_orgId_idx").on(t.orgId),
  index("org_members_userId_idx").on(t.userId),
]);

export type OrgMember = typeof orgMembers.$inferSelect;

// ─── Invites ──────────────────────────────────────────────────────────────────
export const invites = mysqlTable("invites", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("invites_orgId_idx").on(t.orgId),
  index("invites_token_idx").on(t.token),
]);

export type Invite = typeof invites.$inferSelect;

// ─── Departments ──────────────────────────────────────────────────────────────
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("departments_orgId_idx").on(t.orgId),
]);

export type Department = typeof departments.$inferSelect;

// ─── Targets (Employees) ──────────────────────────────────────────────────────
export const targets = mysqlTable("targets", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  departmentId: int("departmentId"),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  title: varchar("title", { length: 150 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("targets_orgId_idx").on(t.orgId),
  index("targets_departmentId_idx").on(t.departmentId),
]);

export type Target = typeof targets.$inferSelect;

// ─── Templates ────────────────────────────────────────────────────────────────
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId"),                        // null = built-in/community
  createdByUserId: int("createdByUserId"),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  htmlBody: text("htmlBody").notNull(),
  language: mysqlEnum("language", ["en", "es", "tr"]).default("en").notNull(),
  attackType: mysqlEnum("attackType", [
    "credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"
  ]).default("credential_harvest").notNull(),
  industry: varchar("industry", { length: 100 }),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("medium").notNull(),
  isBuiltIn: boolean("isBuiltIn").default(false).notNull(),
  isShared: boolean("isShared").default(false).notNull(),   // shared to community
  tags: json("tags").$type<string[]>().default([]),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("templates_orgId_idx").on(t.orgId),
  index("templates_isBuiltIn_idx").on(t.isBuiltIn),
  index("templates_isShared_idx").on(t.isShared),
]);

export type Template = typeof templates.$inferSelect;

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  templateId: int("templateId"),
  status: mysqlEnum("status", ["draft", "scheduled", "active", "completed", "paused"]).default("draft").notNull(),
  language: mysqlEnum("language", ["en", "es", "tr"]).default("en").notNull(),
  targetDepartmentIds: json("targetDepartmentIds").$type<number[]>().default([]),
  targetIds: json("targetIds").$type<number[]>().default([]),
  scheduledAt: timestamp("scheduledAt"),
  completedAt: timestamp("completedAt"),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  cronExpression: varchar("cronExpression", { length: 100 }),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  senderName: varchar("senderName", { length: 150 }),
  senderEmail: varchar("senderEmail", { length: 320 }),
  trackingDomain: varchar("trackingDomain", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("campaigns_orgId_idx").on(t.orgId),
  index("campaigns_status_idx").on(t.status),
  index("campaigns_scheduleCronTaskUid_idx").on(t.scheduleCronTaskUid),
]);

export type Campaign = typeof campaigns.$inferSelect;

// ─── Campaign Results ─────────────────────────────────────────────────────────
export const campaignResults = mysqlTable("campaign_results", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  targetId: int("targetId").notNull(),
  orgId: int("orgId").notNull(),
  trackingToken: varchar("trackingToken", { length: 128 }).notNull().unique(),
  emailSentAt: timestamp("emailSentAt"),
  emailOpenedAt: timestamp("emailOpenedAt"),
  linkClickedAt: timestamp("linkClickedAt"),
  credentialSubmittedAt: timestamp("credentialSubmittedAt"),
  reportedAt: timestamp("reportedAt"),      // user reported as phishing
  trainingCompletedAt: timestamp("trainingCompletedAt"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("campaign_results_campaignId_idx").on(t.campaignId),
  index("campaign_results_targetId_idx").on(t.targetId),
  index("campaign_results_orgId_idx").on(t.orgId),
  index("campaign_results_trackingToken_idx").on(t.trackingToken),
]);

export type CampaignResult = typeof campaignResults.$inferSelect;

// ─── Training Modules ─────────────────────────────────────────────────────────
export const trainingModules = mysqlTable("training_modules", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(),
  content: text("content").notNull(),       // markdown content
  quizJson: json("quizJson").$type<QuizQuestion[]>().default([]),
  durationMinutes: int("durationMinutes").default(5).notNull(),
  difficulty: mysqlEnum("difficulty", ["beginner", "intermediate", "advanced"]).default("beginner").notNull(),
  language: mysqlEnum("language", ["en", "es", "tr"]).default("en").notNull(),
  isBuiltIn: boolean("isBuiltIn").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
export const trainingCompletions = mysqlTable("training_completions", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  targetId: int("targetId"),       // employee target
  userId: int("userId"),           // platform user
  moduleId: int("moduleId").notNull(),
  score: int("score"),             // quiz score 0-100
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  timeSpentSeconds: int("timeSpentSeconds"),
}, (t) => [
  index("training_completions_orgId_idx").on(t.orgId),
  index("training_completions_moduleId_idx").on(t.moduleId),
]);

export type TrainingCompletion = typeof trainingCompletions.$inferSelect;

// ─── Gamification Scores ──────────────────────────────────────────────────────
export const gamificationScores = mysqlTable("gamification_scores", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  targetId: int("targetId").notNull(),
  riskScore: float("riskScore").default(50).notNull(),    // 0=safe, 100=high risk
  clickCount: int("clickCount").default(0).notNull(),
  submitCount: int("submitCount").default(0).notNull(),
  reportCount: int("reportCount").default(0).notNull(),
  trainingCount: int("trainingCount").default(0).notNull(),
  lastUpdatedAt: timestamp("lastUpdatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("gamification_scores_orgId_idx").on(t.orgId),
  index("gamification_scores_targetId_idx").on(t.targetId),
]);

export type GamificationScore = typeof gamificationScores.$inferSelect;

// ─── Compliance Records ───────────────────────────────────────────────────────
export const complianceRecords = mysqlTable("compliance_records", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  frameworkId: varchar("frameworkId", { length: 64 }).notNull(), // e.g. "hipaa", "pci-dss"
  procedureId: varchar("procedureId", { length: 64 }).notNull(), // e.g. "hipaa-1"
  completed: int("completed").default(0).notNull(),              // 0 or 1
  completedAt: timestamp("completedAt"),
  completedBy: int("completedBy"),                               // userId
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("compliance_records_orgId_idx").on(t.orgId),
  index("compliance_records_framework_idx").on(t.orgId, t.frameworkId),
]);
export type ComplianceRecord = typeof complianceRecords.$inferSelect;

// ─── Compliance Certificates ──────────────────────────────────────────────────
export const complianceCertificates = mysqlTable("compliance_certificates", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  frameworkId: varchar("frameworkId", { length: 64 }).notNull(),
  certId: varchar("certId", { length: 64 }).notNull().unique(),  // e.g. PSA-HIPAA-ABC123
  completedCount: int("completedCount").notNull(),
  totalCount: int("totalCount").notNull(),
  issuedBy: int("issuedBy"),                                     // userId
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
}, (t) => [
  index("compliance_certs_orgId_idx").on(t.orgId),
]);
export type ComplianceCertificate = typeof complianceCertificates.$inferSelect;

// ─── MSP Tenants ──────────────────────────────────────────────────────────────
export const mspTenants = mysqlTable("msp_tenants", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
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
  status: mysqlEnum("status", ["active", "suspended", "trial"]).default("trial").notNull(),
  maxCustomers: int("maxCustomers").default(10).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("msp_tenants_ownerUserId_idx").on(t.ownerUserId),
]);
export type MspTenant = typeof mspTenants.$inferSelect;

// ─── MSP Customer Organizations ───────────────────────────────────────────────
export const mspCustomerOrgs = mysqlTable("msp_customer_orgs", {
  id: int("id").autoincrement().primaryKey(),
  mspTenantId: int("mspTenantId").notNull(),
  orgId: int("orgId").notNull(),           // FK → organizations.id
  plan: mysqlEnum("plan", ["starter", "professional", "enterprise"]).default("starter").notNull(),
  status: mysqlEnum("status", ["active", "suspended", "pending"]).default("pending").notNull(),
  adminEmail: varchar("adminEmail", { length: 320 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("msp_customer_orgs_mspId_idx").on(t.mspTenantId),
  index("msp_customer_orgs_orgId_idx").on(t.orgId),
]);
export type MspCustomerOrg = typeof mspCustomerOrgs.$inferSelect;

// ─── MSP Activity Log ─────────────────────────────────────────────────────────
export const mspActivityLog = mysqlTable("msp_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  mspTenantId: int("mspTenantId").notNull(),
  actorUserId: int("actorUserId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),   // e.g. "provision_customer", "impersonate"
  targetOrgId: int("targetOrgId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("msp_activity_log_mspId_idx").on(t.mspTenantId),
]);
export type MspActivityLog = typeof mspActivityLog.$inferSelect;
