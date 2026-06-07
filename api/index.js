"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc2) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc2 = __getOwnPropDesc(from, key)) || desc2.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// drizzle/schema.ts
var schema_exports = {};
__export(schema_exports, {
  campaignResults: () => campaignResults,
  campaigns: () => campaigns,
  complianceCertificates: () => complianceCertificates,
  complianceRecords: () => complianceRecords,
  departments: () => departments,
  gamificationScores: () => gamificationScores,
  invites: () => invites,
  mspActivityLog: () => mspActivityLog,
  mspCustomerOrgs: () => mspCustomerOrgs,
  mspTenants: () => mspTenants,
  orgMembers: () => orgMembers,
  organizations: () => organizations,
  targets: () => targets,
  templates: () => templates,
  trainingCompletions: () => trainingCompletions,
  trainingModules: () => trainingModules,
  users: () => users
});
var import_mysql_core, users, organizations, orgMembers, invites, departments, targets, templates, campaigns, campaignResults, trainingModules, trainingCompletions, gamificationScores, complianceRecords, complianceCertificates, mspTenants, mspCustomerOrgs, mspActivityLog;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    import_mysql_core = require("drizzle-orm/mysql-core");
    users = (0, import_mysql_core.mysqlTable)("users", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      openId: (0, import_mysql_core.varchar)("openId", { length: 64 }).notNull().unique(),
      name: (0, import_mysql_core.text)("name"),
      email: (0, import_mysql_core.varchar)("email", { length: 320 }),
      loginMethod: (0, import_mysql_core.varchar)("loginMethod", { length: 64 }),
      role: (0, import_mysql_core.mysqlEnum)("role", ["user", "admin"]).default("user").notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: (0, import_mysql_core.timestamp)("lastSignedIn").defaultNow().notNull(),
      passwordHash: (0, import_mysql_core.varchar)("passwordHash", { length: 255 })
    });
    organizations = (0, import_mysql_core.mysqlTable)("organizations", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      name: (0, import_mysql_core.varchar)("name", { length: 255 }).notNull(),
      slug: (0, import_mysql_core.varchar)("slug", { length: 100 }).notNull().unique(),
      logoUrl: (0, import_mysql_core.text)("logoUrl"),
      gamificationEnabled: (0, import_mysql_core.boolean)("gamificationEnabled").default(false).notNull(),
      trainingEnabled: (0, import_mysql_core.boolean)("trainingEnabled").default(true).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    orgMembers = (0, import_mysql_core.mysqlTable)("org_members", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      userId: (0, import_mysql_core.int)("userId").notNull(),
      role: (0, import_mysql_core.mysqlEnum)("role", ["admin", "member"]).default("member").notNull(),
      joinedAt: (0, import_mysql_core.timestamp)("joinedAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("org_members_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("org_members_userId_idx").on(t2.userId)
    ]);
    invites = (0, import_mysql_core.mysqlTable)("invites", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      email: (0, import_mysql_core.varchar)("email", { length: 320 }).notNull(),
      token: (0, import_mysql_core.varchar)("token", { length: 128 }).notNull().unique(),
      role: (0, import_mysql_core.mysqlEnum)("role", ["admin", "member"]).default("member").notNull(),
      expiresAt: (0, import_mysql_core.timestamp)("expiresAt").notNull(),
      acceptedAt: (0, import_mysql_core.timestamp)("acceptedAt"),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("invites_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("invites_token_idx").on(t2.token)
    ]);
    departments = (0, import_mysql_core.mysqlTable)("departments", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      name: (0, import_mysql_core.varchar)("name", { length: 100 }).notNull(),
      isDefault: (0, import_mysql_core.boolean)("isDefault").default(false).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("departments_orgId_idx").on(t2.orgId)
    ]);
    targets = (0, import_mysql_core.mysqlTable)("targets", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      departmentId: (0, import_mysql_core.int)("departmentId"),
      firstName: (0, import_mysql_core.varchar)("firstName", { length: 100 }).notNull(),
      lastName: (0, import_mysql_core.varchar)("lastName", { length: 100 }).notNull(),
      email: (0, import_mysql_core.varchar)("email", { length: 320 }).notNull(),
      title: (0, import_mysql_core.varchar)("title", { length: 150 }),
      isActive: (0, import_mysql_core.boolean)("isActive").default(true).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("targets_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("targets_departmentId_idx").on(t2.departmentId)
    ]);
    templates = (0, import_mysql_core.mysqlTable)("templates", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId"),
      // null = built-in/community
      createdByUserId: (0, import_mysql_core.int)("createdByUserId"),
      name: (0, import_mysql_core.varchar)("name", { length: 255 }).notNull(),
      subject: (0, import_mysql_core.varchar)("subject", { length: 500 }).notNull(),
      htmlBody: (0, import_mysql_core.text)("htmlBody").notNull(),
      language: (0, import_mysql_core.mysqlEnum)("language", ["en", "es", "tr"]).default("en").notNull(),
      attackType: (0, import_mysql_core.mysqlEnum)("attackType", [
        "credential_harvest",
        "link_click",
        "attachment",
        "vishing",
        "smishing",
        "pretexting"
      ]).default("credential_harvest").notNull(),
      industry: (0, import_mysql_core.varchar)("industry", { length: 100 }),
      difficulty: (0, import_mysql_core.mysqlEnum)("difficulty", ["easy", "medium", "hard"]).default("medium").notNull(),
      mspTenantId: (0, import_mysql_core.int)("mspTenantId"),
      // null = not MSP template; set = MSP private template
      isBuiltIn: (0, import_mysql_core.boolean)("isBuiltIn").default(false).notNull(),
      isShared: (0, import_mysql_core.boolean)("isShared").default(false).notNull(),
      // shared to community
      isMspTemplate: (0, import_mysql_core.boolean)("isMspTemplate").default(false).notNull(),
      // MSP private template
      tags: (0, import_mysql_core.json)("tags").$type().default([]),
      usageCount: (0, import_mysql_core.int)("usageCount").default(0).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("templates_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("templates_isBuiltIn_idx").on(t2.isBuiltIn),
      (0, import_mysql_core.index)("templates_isShared_idx").on(t2.isShared),
      (0, import_mysql_core.index)("templates_mspTenantId_idx").on(t2.mspTenantId)
    ]);
    campaigns = (0, import_mysql_core.mysqlTable)("campaigns", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      createdByUserId: (0, import_mysql_core.int)("createdByUserId").notNull(),
      name: (0, import_mysql_core.varchar)("name", { length: 255 }).notNull(),
      templateId: (0, import_mysql_core.int)("templateId"),
      status: (0, import_mysql_core.mysqlEnum)("status", ["draft", "scheduled", "active", "completed", "paused"]).default("draft").notNull(),
      language: (0, import_mysql_core.mysqlEnum)("language", ["en", "es", "tr"]).default("en").notNull(),
      targetDepartmentIds: (0, import_mysql_core.json)("targetDepartmentIds").$type().default([]),
      targetIds: (0, import_mysql_core.json)("targetIds").$type().default([]),
      scheduledAt: (0, import_mysql_core.timestamp)("scheduledAt"),
      completedAt: (0, import_mysql_core.timestamp)("completedAt"),
      isRecurring: (0, import_mysql_core.boolean)("isRecurring").default(false).notNull(),
      cronExpression: (0, import_mysql_core.varchar)("cronExpression", { length: 100 }),
      scheduleCronTaskUid: (0, import_mysql_core.varchar)("scheduleCronTaskUid", { length: 65 }),
      senderName: (0, import_mysql_core.varchar)("senderName", { length: 150 }),
      senderEmail: (0, import_mysql_core.varchar)("senderEmail", { length: 320 }),
      trackingDomain: (0, import_mysql_core.varchar)("trackingDomain", { length: 255 }),
      notes: (0, import_mysql_core.text)("notes"),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("campaigns_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("campaigns_status_idx").on(t2.status),
      (0, import_mysql_core.index)("campaigns_scheduleCronTaskUid_idx").on(t2.scheduleCronTaskUid)
    ]);
    campaignResults = (0, import_mysql_core.mysqlTable)("campaign_results", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      campaignId: (0, import_mysql_core.int)("campaignId").notNull(),
      targetId: (0, import_mysql_core.int)("targetId").notNull(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      trackingToken: (0, import_mysql_core.varchar)("trackingToken", { length: 128 }).notNull().unique(),
      emailSentAt: (0, import_mysql_core.timestamp)("emailSentAt"),
      emailOpenedAt: (0, import_mysql_core.timestamp)("emailOpenedAt"),
      linkClickedAt: (0, import_mysql_core.timestamp)("linkClickedAt"),
      credentialSubmittedAt: (0, import_mysql_core.timestamp)("credentialSubmittedAt"),
      reportedAt: (0, import_mysql_core.timestamp)("reportedAt"),
      // user reported as phishing
      trainingCompletedAt: (0, import_mysql_core.timestamp)("trainingCompletedAt"),
      ipAddress: (0, import_mysql_core.varchar)("ipAddress", { length: 45 }),
      userAgent: (0, import_mysql_core.text)("userAgent"),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("campaign_results_campaignId_idx").on(t2.campaignId),
      (0, import_mysql_core.index)("campaign_results_targetId_idx").on(t2.targetId),
      (0, import_mysql_core.index)("campaign_results_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("campaign_results_trackingToken_idx").on(t2.trackingToken)
    ]);
    trainingModules = (0, import_mysql_core.mysqlTable)("training_modules", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      title: (0, import_mysql_core.varchar)("title", { length: 255 }).notNull(),
      description: (0, import_mysql_core.text)("description"),
      category: (0, import_mysql_core.varchar)("category", { length: 100 }).notNull(),
      content: (0, import_mysql_core.text)("content").notNull(),
      // markdown content
      quizJson: (0, import_mysql_core.json)("quizJson").$type().default([]),
      durationMinutes: (0, import_mysql_core.int)("durationMinutes").default(5).notNull(),
      difficulty: (0, import_mysql_core.mysqlEnum)("difficulty", ["beginner", "intermediate", "advanced"]).default("beginner").notNull(),
      language: (0, import_mysql_core.mysqlEnum)("language", ["en", "es", "tr"]).default("en").notNull(),
      isBuiltIn: (0, import_mysql_core.boolean)("isBuiltIn").default(true).notNull(),
      sortOrder: (0, import_mysql_core.int)("sortOrder").default(0).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull()
    });
    trainingCompletions = (0, import_mysql_core.mysqlTable)("training_completions", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      targetId: (0, import_mysql_core.int)("targetId"),
      // employee target
      userId: (0, import_mysql_core.int)("userId"),
      // platform user
      moduleId: (0, import_mysql_core.int)("moduleId").notNull(),
      score: (0, import_mysql_core.int)("score"),
      // quiz score 0-100
      completedAt: (0, import_mysql_core.timestamp)("completedAt").defaultNow().notNull(),
      timeSpentSeconds: (0, import_mysql_core.int)("timeSpentSeconds")
    }, (t2) => [
      (0, import_mysql_core.index)("training_completions_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("training_completions_moduleId_idx").on(t2.moduleId)
    ]);
    gamificationScores = (0, import_mysql_core.mysqlTable)("gamification_scores", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      targetId: (0, import_mysql_core.int)("targetId").notNull(),
      riskScore: (0, import_mysql_core.float)("riskScore").default(50).notNull(),
      // 0=safe, 100=high risk
      clickCount: (0, import_mysql_core.int)("clickCount").default(0).notNull(),
      submitCount: (0, import_mysql_core.int)("submitCount").default(0).notNull(),
      reportCount: (0, import_mysql_core.int)("reportCount").default(0).notNull(),
      trainingCount: (0, import_mysql_core.int)("trainingCount").default(0).notNull(),
      lastUpdatedAt: (0, import_mysql_core.timestamp)("lastUpdatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("gamification_scores_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("gamification_scores_targetId_idx").on(t2.targetId)
    ]);
    complianceRecords = (0, import_mysql_core.mysqlTable)("compliance_records", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      frameworkId: (0, import_mysql_core.varchar)("frameworkId", { length: 64 }).notNull(),
      // e.g. "hipaa", "pci-dss"
      procedureId: (0, import_mysql_core.varchar)("procedureId", { length: 64 }).notNull(),
      // e.g. "hipaa-1"
      completed: (0, import_mysql_core.int)("completed").default(0).notNull(),
      // 0 or 1
      completedAt: (0, import_mysql_core.timestamp)("completedAt"),
      completedBy: (0, import_mysql_core.int)("completedBy"),
      // userId
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("compliance_records_orgId_idx").on(t2.orgId),
      (0, import_mysql_core.index)("compliance_records_framework_idx").on(t2.orgId, t2.frameworkId)
    ]);
    complianceCertificates = (0, import_mysql_core.mysqlTable)("compliance_certificates", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      frameworkId: (0, import_mysql_core.varchar)("frameworkId", { length: 64 }).notNull(),
      certId: (0, import_mysql_core.varchar)("certId", { length: 64 }).notNull().unique(),
      // e.g. PSA-HIPAA-ABC123
      completedCount: (0, import_mysql_core.int)("completedCount").notNull(),
      totalCount: (0, import_mysql_core.int)("totalCount").notNull(),
      issuedBy: (0, import_mysql_core.int)("issuedBy"),
      // userId
      issuedAt: (0, import_mysql_core.timestamp)("issuedAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("compliance_certs_orgId_idx").on(t2.orgId)
    ]);
    mspTenants = (0, import_mysql_core.mysqlTable)("msp_tenants", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      ownerUserId: (0, import_mysql_core.int)("ownerUserId").notNull(),
      companyName: (0, import_mysql_core.varchar)("companyName", { length: 255 }).notNull(),
      contactEmail: (0, import_mysql_core.varchar)("contactEmail", { length: 320 }).notNull(),
      contactPhone: (0, import_mysql_core.varchar)("contactPhone", { length: 32 }),
      website: (0, import_mysql_core.varchar)("website", { length: 255 }),
      // White-label branding
      brandName: (0, import_mysql_core.varchar)("brandName", { length: 128 }),
      brandLogoUrl: (0, import_mysql_core.text)("brandLogoUrl"),
      brandPrimaryColor: (0, import_mysql_core.varchar)("brandPrimaryColor", { length: 16 }).default("#6366f1"),
      brandSupportEmail: (0, import_mysql_core.varchar)("brandSupportEmail", { length: 320 }),
      brandCustomDomain: (0, import_mysql_core.varchar)("brandCustomDomain", { length: 255 }),
      // Status
      status: (0, import_mysql_core.mysqlEnum)("status", ["active", "suspended", "trial"]).default("trial").notNull(),
      maxCustomers: (0, import_mysql_core.int)("maxCustomers").default(10).notNull(),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("msp_tenants_ownerUserId_idx").on(t2.ownerUserId)
    ]);
    mspCustomerOrgs = (0, import_mysql_core.mysqlTable)("msp_customer_orgs", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      mspTenantId: (0, import_mysql_core.int)("mspTenantId").notNull(),
      orgId: (0, import_mysql_core.int)("orgId").notNull(),
      // FK → organizations.id
      plan: (0, import_mysql_core.mysqlEnum)("plan", ["starter", "professional", "enterprise"]).default("starter").notNull(),
      status: (0, import_mysql_core.mysqlEnum)("status", ["active", "suspended", "pending"]).default("pending").notNull(),
      adminEmail: (0, import_mysql_core.varchar)("adminEmail", { length: 320 }),
      notes: (0, import_mysql_core.text)("notes"),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull(),
      updatedAt: (0, import_mysql_core.timestamp)("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("msp_customer_orgs_mspId_idx").on(t2.mspTenantId),
      (0, import_mysql_core.index)("msp_customer_orgs_orgId_idx").on(t2.orgId)
    ]);
    mspActivityLog = (0, import_mysql_core.mysqlTable)("msp_activity_log", {
      id: (0, import_mysql_core.int)("id").autoincrement().primaryKey(),
      mspTenantId: (0, import_mysql_core.int)("mspTenantId").notNull(),
      actorUserId: (0, import_mysql_core.int)("actorUserId").notNull(),
      action: (0, import_mysql_core.varchar)("action", { length: 128 }).notNull(),
      // e.g. "provision_customer", "impersonate"
      targetOrgId: (0, import_mysql_core.int)("targetOrgId"),
      details: (0, import_mysql_core.text)("details"),
      createdAt: (0, import_mysql_core.timestamp)("createdAt").defaultNow().notNull()
    }, (t2) => [
      (0, import_mysql_core.index)("msp_activity_log_mspId_idx").on(t2.mspTenantId)
    ]);
  }
});

// server/db.ts
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = import_promise.default.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 5,
        ssl: { rejectUnauthorized: true }
      });
      _db = (0, import_mysql2.drizzle)(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod", "passwordHash"];
  const assignNullable = (field) => {
    const value = user[field];
    if (value === void 0) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where((0, import_drizzle_orm.eq)(users.openId, openId)).limit(1);
  return result[0];
}
async function createOrganization(data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(organizations).values({ name: data.name, slug: data.slug });
  const orgId = result.insertId;
  await db.insert(orgMembers).values({ orgId, userId: data.userId, role: "admin" });
  const defaultDepts = ["Finance", "Sales", "Management", "Operations", "Warehouse"];
  await db.insert(departments).values(defaultDepts.map((name) => ({ orgId, name, isDefault: true })));
  const [org] = await db.select().from(organizations).where((0, import_drizzle_orm.eq)(organizations.id, orgId));
  return org;
}
async function getOrgById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [org] = await db.select().from(organizations).where((0, import_drizzle_orm.eq)(organizations.id, id));
  return org;
}
async function getUserOrgs(userId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ org: organizations, role: orgMembers.role }).from(orgMembers).innerJoin(organizations, (0, import_drizzle_orm.eq)(orgMembers.orgId, organizations.id)).where((0, import_drizzle_orm.eq)(orgMembers.userId, userId));
  return rows;
}
async function updateOrganization(id, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(organizations).set(data).where((0, import_drizzle_orm.eq)(organizations.id, id));
}
async function getOrgMember(orgId, userId) {
  const db = await getDb();
  if (!db) return void 0;
  const [member] = await db.select().from(orgMembers).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(orgMembers.orgId, orgId), (0, import_drizzle_orm.eq)(orgMembers.userId, userId)));
  return member;
}
async function getOrgMembers(orgId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ member: orgMembers, user: users }).from(orgMembers).innerJoin(users, (0, import_drizzle_orm.eq)(orgMembers.userId, users.id)).where((0, import_drizzle_orm.eq)(orgMembers.orgId, orgId));
}
async function updateMemberRole(orgId, userId, role) {
  const db = await getDb();
  if (!db) return;
  await db.update(orgMembers).set({ role }).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(orgMembers.orgId, orgId), (0, import_drizzle_orm.eq)(orgMembers.userId, userId)));
}
async function removeMember(orgId, userId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(orgMembers).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(orgMembers.orgId, orgId), (0, import_drizzle_orm.eq)(orgMembers.userId, userId)));
}
async function createInvite(data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(invites).values(data);
  const [invite] = await db.select().from(invites).where((0, import_drizzle_orm.eq)(invites.token, data.token));
  return invite;
}
async function getInviteByToken(token) {
  const db = await getDb();
  if (!db) return void 0;
  const [invite] = await db.select().from(invites).where((0, import_drizzle_orm.eq)(invites.token, token));
  return invite;
}
async function acceptInvite(token, userId) {
  const db = await getDb();
  if (!db) return;
  const invite = await getInviteByToken(token);
  if (!invite || invite.acceptedAt) return;
  await db.insert(orgMembers).values({ orgId: invite.orgId, userId, role: invite.role });
  await db.update(invites).set({ acceptedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm.eq)(invites.token, token));
}
async function getOrgInvites(orgId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invites).where((0, import_drizzle_orm.eq)(invites.orgId, orgId)).orderBy((0, import_drizzle_orm.desc)(invites.createdAt));
}
async function getDepartments(orgId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(departments).where((0, import_drizzle_orm.eq)(departments.orgId, orgId));
}
async function createDepartment(orgId, name) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(departments).values({ orgId, name, isDefault: false });
  const id = result.insertId;
  const [dept] = await db.select().from(departments).where((0, import_drizzle_orm.eq)(departments.id, id));
  return dept;
}
async function deleteDepartment(id, orgId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(departments).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(departments.id, id), (0, import_drizzle_orm.eq)(departments.orgId, orgId)));
}
async function getTargets(orgId, departmentId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [(0, import_drizzle_orm.eq)(targets.orgId, orgId)];
  if (departmentId !== void 0) conditions.push((0, import_drizzle_orm.eq)(targets.departmentId, departmentId));
  return db.select().from(targets).where((0, import_drizzle_orm.and)(...conditions)).orderBy(targets.lastName);
}
async function createTarget(data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  const id = result.insertId;
  const [target] = await db.select().from(targets).where((0, import_drizzle_orm.eq)(targets.id, id));
  return target;
}
async function updateTarget(id, orgId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(targets).set(data).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(targets.id, id), (0, import_drizzle_orm.eq)(targets.orgId, orgId)));
}
async function deleteTarget(id, orgId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(targets).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(targets.id, id), (0, import_drizzle_orm.eq)(targets.orgId, orgId)));
}
async function bulkCreateTargets(rows) {
  const db = await getDb();
  if (!db) return 0;
  if (rows.length === 0) return 0;
  await db.insert(targets).values(rows);
  return rows.length;
}
async function getTemplates(opts) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts.isBuiltIn !== void 0) conditions.push((0, import_drizzle_orm.eq)(templates.isBuiltIn, opts.isBuiltIn));
  if (opts.isShared !== void 0) conditions.push((0, import_drizzle_orm.eq)(templates.isShared, opts.isShared));
  if (opts.orgId !== void 0) conditions.push((0, import_drizzle_orm.eq)(templates.orgId, opts.orgId));
  if (opts.language) conditions.push((0, import_drizzle_orm.eq)(templates.language, opts.language));
  if (opts.attackType) conditions.push((0, import_drizzle_orm.eq)(templates.attackType, opts.attackType));
  if (opts.difficulty) conditions.push((0, import_drizzle_orm.eq)(templates.difficulty, opts.difficulty));
  if (opts.industry) conditions.push((0, import_drizzle_orm.eq)(templates.industry, opts.industry));
  return db.select().from(templates).where(conditions.length ? (0, import_drizzle_orm.and)(...conditions) : void 0).orderBy((0, import_drizzle_orm.desc)(templates.usageCount));
}
async function getTemplateById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [t2] = await db.select().from(templates).where((0, import_drizzle_orm.eq)(templates.id, id));
  return t2;
}
async function createTemplate(data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(templates).values({ ...data, usageCount: 0 });
  const id = result.insertId;
  const [t2] = await db.select().from(templates).where((0, import_drizzle_orm.eq)(templates.id, id));
  return t2;
}
async function updateTemplate(id, orgId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set(data).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(templates.id, id), (0, import_drizzle_orm.eq)(templates.orgId, orgId)));
}
async function deleteTemplate(id, orgId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(templates).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(templates.id, id), (0, import_drizzle_orm.eq)(templates.orgId, orgId)));
}
async function incrementTemplateUsage(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set({ usageCount: import_drizzle_orm.sql`${templates.usageCount} + 1` }).where((0, import_drizzle_orm.eq)(templates.id, id));
}
async function getCampaigns(orgId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where((0, import_drizzle_orm.eq)(campaigns.orgId, orgId)).orderBy((0, import_drizzle_orm.desc)(campaigns.createdAt));
}
async function getCampaignById(id, orgId) {
  const db = await getDb();
  if (!db) return void 0;
  const [c] = await db.select().from(campaigns).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(campaigns.id, id), (0, import_drizzle_orm.eq)(campaigns.orgId, orgId)));
  return c;
}
async function createCampaign(data) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(campaigns).values(data);
  const id = result.insertId;
  const [c] = await db.select().from(campaigns).where((0, import_drizzle_orm.eq)(campaigns.id, id));
  return c;
}
async function updateCampaign(id, orgId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(campaigns).set(data).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(campaigns.id, id), (0, import_drizzle_orm.eq)(campaigns.orgId, orgId)));
}
async function deleteCampaign(id, orgId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(campaigns).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(campaigns.id, id), (0, import_drizzle_orm.eq)(campaigns.orgId, orgId)));
}
async function getCampaignResults(campaignId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaignResults).where((0, import_drizzle_orm.eq)(campaignResults.campaignId, campaignId));
}
async function getOrgAnalytics(orgId) {
  const db = await getDb();
  if (!db) return null;
  const allResults = await db.select().from(campaignResults).where((0, import_drizzle_orm.eq)(campaignResults.orgId, orgId));
  const total = allResults.length;
  const sent = allResults.filter((r) => r.emailSentAt).length;
  const opened = allResults.filter((r) => r.emailOpenedAt).length;
  const clicked = allResults.filter((r) => r.linkClickedAt).length;
  const submitted = allResults.filter((r) => r.credentialSubmittedAt).length;
  const reported = allResults.filter((r) => r.reportedAt).length;
  return { total, sent, opened, clicked, submitted, reported };
}
async function getTrainingModules(language) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (language) conditions.push((0, import_drizzle_orm.eq)(trainingModules.language, language));
  return db.select().from(trainingModules).where(conditions.length ? (0, import_drizzle_orm.and)(...conditions) : void 0).orderBy(trainingModules.sortOrder);
}
async function getTrainingModuleById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [m] = await db.select().from(trainingModules).where((0, import_drizzle_orm.eq)(trainingModules.id, id));
  return m;
}
async function recordTrainingCompletion(data) {
  const db = await getDb();
  if (!db) return;
  await db.insert(trainingCompletions).values({ ...data, completedAt: /* @__PURE__ */ new Date() });
  if (data.targetId) {
    await updateGamificationOnTraining(data.orgId, data.targetId);
  }
}
async function getTrainingCompletions(orgId, targetId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [(0, import_drizzle_orm.eq)(trainingCompletions.orgId, orgId)];
  if (targetId) conditions.push((0, import_drizzle_orm.eq)(trainingCompletions.targetId, targetId));
  return db.select().from(trainingCompletions).where((0, import_drizzle_orm.and)(...conditions));
}
async function getGamificationScores(orgId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gamificationScores).where((0, import_drizzle_orm.eq)(gamificationScores.orgId, orgId)).orderBy(gamificationScores.riskScore);
}
async function getOrCreateGamificationScore(orgId, targetId) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(gamificationScores).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(gamificationScores.orgId, orgId), (0, import_drizzle_orm.eq)(gamificationScores.targetId, targetId)));
  if (existing) return existing;
  await db.insert(gamificationScores).values({ orgId, targetId, riskScore: 50 });
  const [score] = await db.select().from(gamificationScores).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(gamificationScores.orgId, orgId), (0, import_drizzle_orm.eq)(gamificationScores.targetId, targetId)));
  return score;
}
async function updateGamificationOnTraining(orgId, targetId) {
  const db = await getDb();
  if (!db) return;
  const score = await getOrCreateGamificationScore(orgId, targetId);
  const newRisk = Math.max(0, score.riskScore - 8);
  await db.update(gamificationScores).set({ riskScore: newRisk, trainingCount: score.trainingCount + 1 }).where((0, import_drizzle_orm.and)((0, import_drizzle_orm.eq)(gamificationScores.orgId, orgId), (0, import_drizzle_orm.eq)(gamificationScores.targetId, targetId)));
}
async function getOrgPostureScore(orgId) {
  const db = await getDb();
  if (!db) return 50;
  const scores = await db.select().from(gamificationScores).where((0, import_drizzle_orm.eq)(gamificationScores.orgId, orgId));
  if (scores.length === 0) return 50;
  const avg = scores.reduce((sum, s) => sum + s.riskScore, 0) / scores.length;
  return Math.round(100 - avg);
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where((0, import_drizzle_orm.eq)(users.email, email)).limit(1);
  return result[0] ?? null;
}
var import_drizzle_orm, import_mysql2, import_promise, _db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    import_drizzle_orm = require("drizzle-orm");
    import_mysql2 = require("drizzle-orm/mysql2");
    import_promise = __toESM(require("mysql2/promise"), 1);
    init_schema();
    _db = null;
  }
});

// server/seed_templates.json
var seed_templates_default;
var init_seed_templates = __esm({
  "server/seed_templates.json"() {
    seed_templates_default = [
      {
        name: "Microsoft 365 Account Suspended",
        subject: "Action Required: Your Microsoft 365 account has been suspended",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f3f2f1;padding:20px;text-align:center;border-bottom:1px solid #ddd"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png" alt="Microsoft" style="height:24px"></div><div style="padding:32px"><h2 style="color:#d83b01;font-size:20px;margin-top:0">Your account has been suspended</h2><p style="color:#323130">We detected unusual sign-in activity on your Microsoft 365 account. To protect your organization, we've temporarily suspended access.</p><div style="background:#fef0cd;border-left:4px solid #f7c948;padding:12px 16px;margin:20px 0"><strong>Action required by:</strong> Today at 11:59 PM</div><p style="text-align:center;margin:28px 0"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;font-size:14px;display:inline-block">Verify My Account</a></p><p style="font-size:12px;color:#605e5c">Microsoft will never ask for your password via email.</p></div><div style="background:#f3f2f1;padding:12px 20px;font-size:11px;color:#605e5c">Microsoft Corporation, One Microsoft Way, Redmond, WA 98052</div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Microsoft",
          "O365",
          "account"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Teams Meeting Recording",
        subject: "You missed a Teams meeting \u2014 recording available now",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#6264a7;padding:20px 24px"><span style="color:#fff;font-size:20px;font-weight:600">Microsoft Teams</span></div><div style="padding:32px"><p>You missed the following Teams meeting. A recording is available for 20 days.</p><div style="border:1px solid #edebe9;border-radius:4px;padding:20px;margin:20px 0"><p style="margin:0 0 8px;font-weight:600">Q4 Budget Review \u2014 All Hands</p><p style="margin:0;color:#605e5c;font-size:13px">Organizer: Finance Team | Duration: 47 min</p></div><p style="text-align:center;margin:28px 0"><a href="{{TRACKING_LINK}}" style="background:#6264a7;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Watch Recording</a></p></div></div>`,
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "Teams",
          "meeting"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft OneDrive Storage Full",
        subject: "Your OneDrive storage is 100% full \u2014 files at risk",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0078d4;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:600">OneDrive</span></div><div style="padding:32px"><h2 style="color:#d83b01">Storage limit reached</h2><p>Your OneDrive is full. New files cannot be saved and existing files may stop syncing.</p><div style="background:#f3f2f1;border-radius:4px;padding:16px;margin:20px 0"><div style="background:#d83b01;height:8px;border-radius:4px;width:100%"></div><p style="margin:8px 0 0;font-size:13px;color:#605e5c">5.0 GB used of 5.0 GB (100%)</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Upgrade Storage</a></p></div></div>`,
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "OneDrive",
          "storage"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Security Alert \u2014 New Sign-In",
        subject: "Security alert: New sign-in to your Microsoft account",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f3f2f1;padding:20px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png" alt="Microsoft" style="height:24px"></div><div style="padding:32px"><h2 style="margin-top:0">Security alert</h2><p>We noticed a new sign-in to your Microsoft account from an unrecognized device.</p><div style="border:1px solid #edebe9;border-radius:4px;padding:16px;margin:20px 0"><p style="margin:0"><strong>Location:</strong> Chicago, IL, United States<br><strong>Device:</strong> Windows 11, Chrome<br><strong>Time:</strong> Today, 2:34 AM</p></div><p>If this was you, you can ignore this message. If not, secure your account immediately.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#d83b01;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Secure My Account</a></p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "security",
          "sign-in"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft SharePoint File Shared",
        subject: "Sarah Johnson shared a file with you in SharePoint",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#036c70;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:600">SharePoint</span></div><div style="padding:32px"><p>Sarah Johnson has shared a file with you.</p><div style="border:1px solid #edebe9;border-radius:4px;padding:20px;margin:20px 0;display:flex;align-items:center"><div style="background:#217346;color:#fff;padding:8px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:16px">XLSX</div><div><p style="margin:0;font-weight:600">2025_Annual_Compensation_Review.xlsx</p><p style="margin:4px 0 0;font-size:13px;color:#605e5c">Shared by: Sarah Johnson (HR Director)</p></div></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Open in SharePoint</a></p></div></div>`,
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "SharePoint",
          "file sharing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Google Account Security Alert",
        subject: "Critical security alert for your Google Account",
        htmlBody: '<div style="font-family:Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="padding:20px;text-align:center;border-bottom:1px solid #e0e0e0"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/200px-Google_2015_logo.svg.png" alt="Google" style="height:24px"></div><div style="padding:32px"><h2 style="color:#d93025;font-size:20px">Critical security alert</h2><p style="color:#202124">Someone just used your password to try to sign in to your account from a non-Google app.</p><div style="background:#fce8e6;border-radius:4px;padding:16px;margin:20px 0"><p style="margin:0;color:#d93025"><strong>Location:</strong> Houston, TX, USA<br><strong>Device:</strong> Unknown Windows device<br><strong>Time:</strong> Just now</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1a73e8;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Check Activity</a></p><p style="font-size:12px;color:#5f6368">Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Google",
          "security",
          "account"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Google Workspace Admin Alert",
        subject: "Action required: Your Google Workspace subscription",
        htmlBody: '<div style="font-family:Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="padding:20px;border-bottom:1px solid #e0e0e0"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/200px-Google_2015_logo.svg.png" alt="Google" style="height:20px"></div><div style="padding:32px"><h2 style="color:#202124;font-size:20px">Your Google Workspace subscription requires attention</h2><p>Your payment method on file has been declined. Your Workspace services will be suspended in <strong>48 hours</strong> unless you update your billing information.</p><div style="background:#fef7e0;border-left:4px solid #f9ab00;padding:12px 16px;margin:20px 0"><strong>Services at risk:</strong> Gmail, Drive, Meet, Calendar</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1a73e8;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Billing</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Google",
          "Workspace",
          "admin"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Google Drive File Shared",
        subject: "Michael Chen shared a document with you",
        htmlBody: '<div style="font-family:Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="padding:20px;border-bottom:1px solid #e0e0e0"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/200px-Google_2015_logo.svg.png" alt="Google" style="height:20px"></div><div style="padding:32px"><p style="color:#202124">Michael Chen (m.chen@company.com) has shared the following item with you:</p><div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0"><div style="display:flex;align-items:center"><div style="background:#4285f4;color:#fff;padding:8px 12px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:16px">DOCS</div><div><p style="margin:0;font-weight:500;color:#202124">2025 Strategic Plan \u2014 CONFIDENTIAL</p><p style="margin:4px 0 0;font-size:13px;color:#5f6368">Google Docs</p></div></div></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1a73e8;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Open in Docs</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Google",
          "Drive",
          "file sharing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Amazon Order Confirmation Fraud",
        subject: "Your Amazon order #114-8829341-1234567 has shipped",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#232f3e;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/200px-Amazon_logo.svg.png" alt="Amazon" style="height:24px"></div><div style="padding:24px"><h2 style="color:#232f3e">Your order has shipped!</h2><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:16px 0"><p style="margin:0"><strong>Order #114-8829341-1234567</strong><br>Apple AirPods Pro (2nd Generation) \u2014 $249.00<br><strong>Estimated delivery:</strong> Tomorrow by 8 PM</p></div><p style="color:#c45500">Not your order? Someone may have used your account. Click below to review:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff9900;color:#111;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold">Review Order</a></p></div><div style="background:#f3f3f3;padding:12px 24px;font-size:11px;color:#555">Amazon.com, Inc., 410 Terry Ave N, Seattle, WA 98109</div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "Retail",
        tags: [
          "Amazon",
          "order",
          "shipping"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "AWS Account Billing Alert",
        subject: "AWS: Unusual billing activity detected on your account",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#232f3e;padding:16px 24px"><span style="color:#ff9900;font-size:20px;font-weight:bold">aws</span></div><div style="padding:32px"><h2 style="color:#d13212">Unusual billing activity detected</h2><p>We've detected a significant spike in your AWS usage that may indicate unauthorized access or a misconfigured resource.</p><div style="background:#fdf3f2;border:1px solid #d13212;border-radius:4px;padding:16px;margin:20px 0"><strong>Projected monthly charge: $4,847.23</strong><br><span style="font-size:13px;color:#555">Normal monthly average: $312.00</span></div><p>Review your usage immediately to avoid unexpected charges.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ec7211;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review Billing Console</a></p><p style="font-size:12px;color:#555">Amazon Web Services, Inc., 410 Terry Ave N, Seattle, WA 98109</p></div></div>`,
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "AWS",
          "billing",
          "cloud"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Amazon Prime Membership Renewal",
        subject: "Your Amazon Prime membership will be charged $139",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#232f3e;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/200px-Amazon_logo.svg.png" alt="Amazon" style="height:24px"></div><div style="padding:24px"><h2>Your Prime membership is renewing</h2><p>Your annual Amazon Prime membership will automatically renew in <strong>3 days</strong> for <strong>$139.00</strong>.</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0"><p style="margin:0">Payment method: Visa ending in 4821<br>Renewal date: This Friday</p></div><p>To cancel or update your payment method:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff9900;color:#111;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold">Manage Membership</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Retail",
        tags: [
          "Amazon",
          "Prime",
          "billing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Chase Bank Fraud Alert",
        subject: "Chase Fraud Alert: Suspicious transaction on your account",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#117aca;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">CHASE</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Fraud Alert: Suspicious Activity</h2><p>We've detected a transaction that may be unauthorized on your Chase account ending in 4821.</p><div style="border:1px solid #e0e0e0;border-radius:4px;padding:16px;margin:20px 0"><p style="margin:0"><strong>Merchant:</strong> International Wire Transfer<br><strong>Amount:</strong> $2,847.00<br><strong>Date:</strong> Today, 11:42 AM<br><strong>Location:</strong> Lagos, Nigeria</p></div><p>If you did not authorize this transaction, secure your account immediately.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#117aca;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Secure My Account</a></p><p style="font-size:12px;color:#555">JPMorgan Chase Bank, N.A., 270 Park Avenue, New York, NY 10017</p></div></div>`,
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Chase",
          "bank",
          "fraud alert"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Wells Fargo Account Locked",
        subject: "Important: Your Wells Fargo account has been locked",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#d71e28;padding:16px 24px"><span style="color:#ffcd11;font-size:20px;font-weight:bold">WELLS FARGO</span></div><div style="padding:32px"><h2 style="margin-top:0">Your account has been locked</h2><p>For your security, we've temporarily locked your Wells Fargo Online account due to multiple failed sign-in attempts.</p><p>To unlock your account and restore full access, please verify your identity:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#d71e28;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Unlock My Account</a></p><p style="font-size:12px;color:#555">Wells Fargo Bank, N.A., 420 Montgomery Street, San Francisco, CA 94104</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Wells Fargo",
          "bank",
          "account locked"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Bank of America Zelle Transfer Alert",
        subject: "You received a Zelle payment \u2014 verify to claim",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e31837;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Bank of America</span></div><div style="padding:32px"><h2 style="color:#004b87">You've received a Zelle payment</h2><p>Someone has sent you money via Zelle. To claim your payment, you must verify your account within <strong>24 hours</strong> or the funds will be returned.</p><div style="background:#f0f7ff;border:1px solid #004b87;border-radius:4px;padding:16px;margin:20px 0"><strong>Amount:</strong> $350.00<br><strong>From:</strong> Robert Martinez<br><strong>Memo:</strong> Rent payment</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e31837;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Claim Payment</a></p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Bank of America",
          "Zelle",
          "payment"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Citibank Credit Card Suspended",
        subject: "Your Citi card has been temporarily suspended",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003b8e;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">citi</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Your card has been suspended</h2><p>We've temporarily suspended your Citi card ending in 7734 due to suspicious activity detected on your account.</p><p>To reactivate your card and review the flagged transactions, please verify your identity:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003b8e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Reactivate Card</a></p><p style="font-size:12px;color:#555">Citibank, N.A., 388 Greenwich Street, New York, NY 10013</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Citibank",
          "credit card",
          "suspended"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "PayPal Unauthorized Transaction",
        subject: "We've limited your PayPal account",
        htmlBody: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003087;padding:16px 24px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/200px-PayPal.svg.png" alt="PayPal" style="height:28px"></div><div style="padding:32px"><h2 style="color:#003087">We've limited your account</h2><p>We've noticed some unusual activity in your PayPal account. To make sure your account hasn't been compromised, we've limited what you can do until you verify your information.</p><p>You won't be able to send or receive money until you complete verification.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0070ba;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Restore My Account</a></p><p style="font-size:12px;color:#555">PayPal, Inc., 2211 North First Street, San Jose, CA 95131</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "PayPal",
          "account",
          "limited"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "FedEx Package Delivery Failed",
        subject: "FedEx: Delivery attempt failed \u2014 action required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#4d148c;padding:16px 24px"><span style="color:#ff6200;font-size:22px;font-weight:bold">FedEx</span></div><div style="padding:32px"><h2 style="margin-top:0">Delivery Attempt Failed</h2><p>We attempted to deliver your package today but were unable to complete delivery. Your package will be held at a FedEx location for <strong>5 business days</strong>.</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:20px 0"><p style="margin:0"><strong>Tracking #:</strong> 7489 2341 8823 4421<br><strong>Status:</strong> Delivery attempted<br><strong>Hold location:</strong> FedEx Office, 1234 Main St</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff6200;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Schedule Redelivery</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "Logistics",
        tags: [
          "FedEx",
          "delivery",
          "package"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "UPS Package Customs Hold",
        subject: "UPS: Your package is being held \u2014 customs fee required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#351c15;padding:16px 24px"><span style="color:#ffb500;font-size:22px;font-weight:bold">UPS</span></div><div style="padding:32px"><h2 style="margin-top:0">Your package requires a customs fee</h2><p>Your international shipment is being held at a UPS facility pending payment of a customs and duty fee.</p><div style="background:#fff8e1;border:1px solid #ffb500;border-radius:4px;padding:16px;margin:20px 0"><strong>Tracking #:</strong> 1Z999AA10123456784<br><strong>Customs fee due:</strong> $14.99<br><strong>Payment deadline:</strong> 48 hours</div><p>Pay the fee to release your package:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#351c15;color:#ffb500;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Pay Customs Fee</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Logistics",
        tags: [
          "UPS",
          "customs",
          "package"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "USPS Delivery Exception",
        subject: "USPS: Your package could not be delivered",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#004b87;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">USPS</span><span style="color:#fff;font-size:14px;margin-left:8px">United States Postal Service</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Delivery Exception</h2><p>The United States Postal Service attempted to deliver your package but was unable to complete delivery due to an insufficient address.</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:20px 0"><p style="margin:0"><strong>Tracking:</strong> 9400111899223397889351<br><strong>Issue:</strong> Address verification required</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#004b87;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Delivery Address</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "Logistics",
        tags: [
          "USPS",
          "delivery",
          "package"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Zoom Meeting Invitation",
        subject: "You've been invited to a Zoom meeting",
        htmlBody: `<div style="font-family:Lato,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#2d8cff;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">zoom</span></div><div style="padding:32px"><h2 style="margin-top:0">You're invited to a Zoom meeting</h2><p>David Williams is inviting you to a scheduled Zoom meeting.</p><div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0"><p style="margin:0"><strong>Topic:</strong> Performance Review \u2014 Q4 2025<br><strong>Time:</strong> Today, 3:00 PM Eastern Time<br><strong>Meeting ID:</strong> 842 1234 5678<br><strong>Passcode:</strong> 847291</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2d8cff;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;display:inline-block;font-size:16px">Join Meeting</a></p></div></div>`,
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Zoom",
          "meeting",
          "video call"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Slack Workspace Invitation",
        subject: "You've been invited to join a Slack workspace",
        htmlBody: `<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#4a154b;padding:16px 24px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Slack_icon_2019.svg/50px-Slack_icon_2019.svg.png" alt="Slack" style="height:32px"></div><div style="padding:40px;text-align:center"><h2 style="color:#1d1c1d">Jennifer Adams has invited you to Slack</h2><p style="color:#616061">You've been invited to join <strong>AcmeCorp</strong> on Slack \u2014 where the team communicates.</p><p style="margin:32px 0"><a href="{{TRACKING_LINK}}" style="background:#4a154b;color:#fff;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-size:16px">Open Invitation</a></p><p style="font-size:12px;color:#616061">Slack Technologies, LLC, 500 Howard Street, San Francisco, CA 94105</p></div></div>`,
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Slack",
          "workspace",
          "invite"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "DocuSign Contract Signature Required",
        subject: "Please DocuSign: Employment Contract \u2014 Action Required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f5f5"><div style="background:#fff;border-radius:8px;overflow:hidden;margin:20px"><div style="background:#1a1a2e;padding:20px;text-align:center"><span style="color:#f5a623;font-size:22px;font-weight:bold">DocuSign</span></div><div style="padding:30px"><p>You have a document that requires your signature.</p><div style="background:#f9f9f9;border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0"><strong>Document:</strong> Amended Employment Agreement 2025<br><strong>From:</strong> Amanda Torres, HR Director<br><strong>Company:</strong> Acme Corporation<br><strong>Expires:</strong> 72 hours from now</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f5a623;color:#fff;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold;font-size:16px">Review and Sign</a></p><p style="font-size:12px;color:#888">DocuSign, Inc., 221 Main Street, Suite 1000, San Francisco, CA 94105</p></div></div></div>',
        difficulty: "medium",
        attackType: "link_click",
        language: "en",
        industry: "Legal",
        tags: [
          "DocuSign",
          "contract",
          "signature"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "IRS Tax Refund Notification",
        subject: "IRS: You have a pending tax refund of $2,847",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003366;padding:16px 24px"><span style="color:#fff;font-size:16px;font-weight:bold">Internal Revenue Service | IRS.gov</span></div><div style="padding:32px"><h2 style="color:#003366;margin-top:0">Tax Refund Notification</h2><p>Our records indicate that you are eligible for a federal tax refund of <strong>$2,847.00</strong> for the 2024 tax year.</p><p>To receive your refund, you must verify your identity and provide your banking information through our secure portal.</p><div style="background:#e8f4fd;border-left:4px solid #003366;padding:12px 16px;margin:20px 0"><strong>Refund amount:</strong> $2,847.00<br><strong>Claim deadline:</strong> 30 days</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003366;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Claim Your Refund</a></p><p style="font-size:12px;color:#555">Internal Revenue Service, 1111 Constitution Ave NW, Washington, DC 20224</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "IRS",
          "tax refund",
          "government"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Social Security Administration Alert",
        subject: "SSA: Your Social Security Number has been suspended",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#1a3a5c;padding:16px 24px"><span style="color:#fff;font-size:16px;font-weight:bold">Social Security Administration</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">IMPORTANT NOTICE: SSN Suspension</h2><p>This is an official notice from the Social Security Administration. Your Social Security Number has been temporarily suspended due to suspicious activity associated with criminal investigations.</p><p>You must verify your identity immediately to prevent permanent suspension and potential legal action.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1a3a5c;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Identity Now</a></p><p style="font-size:12px;color:#555">Social Security Administration, 6401 Security Blvd, Baltimore, MD 21235</p></div></div>',
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Government",
        tags: [
          "SSA",
          "Social Security",
          "government"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Medicare Benefit Update",
        subject: "Medicare: Your benefits card is expiring \u2014 update required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003da5;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Medicare</span></div><div style="padding:32px"><h2 style="margin-top:0">Your Medicare card is expiring</h2><p>Our records show your Medicare benefits card is scheduled to expire. To continue receiving your benefits without interruption, you must verify your information and request a replacement card.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003da5;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Medicare Information</a></p><p style="font-size:12px;color:#555">Centers for Medicare and Medicaid Services, 7500 Security Blvd, Baltimore, MD 21244</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Healthcare",
        tags: [
          "Medicare",
          "healthcare",
          "benefits"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "LinkedIn Job Application Update",
        subject: "Good news about your application at Google",
        htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0a66c2;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/LinkedIn_logo_initials.png/50px-LinkedIn_logo_initials.png" alt="LinkedIn" style="height:24px"></div><div style="padding:32px"><h2 style="color:#0a66c2;margin-top:0">Your application is moving forward!</h2><p>Great news! A recruiter at <strong>Google</strong> has reviewed your application for the <strong>Senior Software Engineer</strong> position and wants to move forward.</p><p>Sign in to LinkedIn to view the full message and next steps:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0a66c2;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Message</a></p><p style="font-size:12px;color:#555">LinkedIn Corporation, 1000 West Maude Avenue, Sunnyvale, CA 94085</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "LinkedIn",
          "job",
          "application"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "ADP Payroll Notification",
        subject: "ADP: Your pay statement is ready",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#d40000;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">ADP</span></div><div style="padding:32px"><h2 style="margin-top:0">Your pay statement is available</h2><p>Your pay statement for the period ending <strong>December 15, 2025</strong> is now available in ADP Workforce Now.</p><div style="background:#f5f5f5;border-radius:4px;padding:16px;margin:20px 0"><strong>Net Pay:</strong> $3,847.22<br><strong>Pay Date:</strong> December 20, 2025</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#d40000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Pay Statement</a></p><p style="font-size:12px;color:#555">ADP, LLC, One ADP Boulevard, Roseland, NJ 07068</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "ADP",
          "payroll",
          "pay stub"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Workday Password Reset",
        subject: "Workday: Reset your password to maintain access",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f05a28;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Workday</span></div><div style="padding:32px"><h2 style="margin-top:0">Password reset required</h2><p>Your Workday password will expire in <strong>48 hours</strong>. You must reset your password to continue accessing HR, payroll, and benefits information.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f05a28;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Reset Password</a></p><p style="font-size:12px;color:#555">Workday, Inc., 6110 Stoneridge Mall Road, Pleasanton, CA 94588</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Workday",
          "HR",
          "password"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Apple ID Locked",
        subject: "Your Apple ID has been locked for security reasons",
        htmlBody: `<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f5f5f7;padding:20px;text-align:center;border-bottom:1px solid #d2d2d7"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/50px-Apple_logo_black.svg.png" alt="Apple" style="height:24px"></div><div style="padding:40px;text-align:center"><h2 style="color:#1d1d1f;font-size:24px;font-weight:600">Your Apple ID has been locked</h2><p style="color:#6e6e73">For your security, your Apple ID has been locked because too many failed sign-in attempts were detected.</p><p style="color:#6e6e73">To unlock your account, verify your identity:</p><p style="margin:32px 0"><a href="{{TRACKING_LINK}}" style="background:#0071e3;color:#fff;padding:14px 32px;text-decoration:none;border-radius:980px;display:inline-block;font-size:15px">Unlock Apple ID</a></p><p style="font-size:12px;color:#6e6e73">Apple Inc., One Apple Park Way, Cupertino, CA 95014</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Apple",
          "Apple ID",
          "account"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Netflix Payment Failed",
        subject: "Netflix: We're having trouble with your payment",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#000"><div style="padding:20px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/200px-Netflix_2015_logo.svg.png" alt="Netflix" style="height:32px"></div><div style="background:#141414;padding:32px;color:#fff"><h2 style="color:#e50914;margin-top:0">Payment declined</h2><p style="color:#b3b3b3">We're having trouble processing your payment. Your Netflix membership will be cancelled unless you update your payment information within 48 hours.</p><p style="text-align:center;margin:32px 0"><a href="{{TRACKING_LINK}}" style="background:#e50914;color:#fff;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-size:16px">Update Payment Info</a></p><p style="font-size:12px;color:#737373">Netflix, Inc., 100 Winchester Circle, Los Gatos, CA 95032</p></div></div>`,
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Entertainment",
        tags: [
          "Netflix",
          "payment",
          "billing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Spotify Premium Cancellation Warning",
        subject: "Your Spotify Premium is about to be cancelled",
        htmlBody: `<div style="font-family:Circular,Arial,sans-serif;max-width:600px;margin:0 auto;background:#191414"><div style="padding:24px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/50px-Spotify_logo_without_text.svg.png" alt="Spotify" style="height:40px"></div><div style="background:#121212;padding:32px;color:#fff"><h2 style="color:#1db954;margin-top:0">Your Premium is expiring</h2><p style="color:#b3b3b3">We couldn't process your last payment. Your Spotify Premium will revert to the free tier in <strong>3 days</strong> unless you update your billing information.</p><p style="text-align:center;margin:32px 0"><a href="{{TRACKING_LINK}}" style="background:#1db954;color:#000;padding:14px 32px;text-decoration:none;border-radius:500px;display:inline-block;font-weight:bold">Update Billing</a></p><p style="font-size:12px;color:#535353">Spotify USA Inc., 4 World Trade Center, 150 Greenwich Street, New York, NY 10007</p></div></div>`,
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Entertainment",
        tags: [
          "Spotify",
          "subscription",
          "payment"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Salesforce Login Verification",
        subject: "Salesforce: Verify your login from a new device",
        htmlBody: `<div style="font-family:'Salesforce Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#00a1e0;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/200px-Salesforce.com_logo.svg.png" alt="Salesforce" style="height:24px"></div><div style="padding:32px"><h2 style="color:#032d60;margin-top:0">Verify your identity</h2><p>We noticed a login attempt to your Salesforce account from a new device or location.</p><div style="border:1px solid #dddbda;border-radius:4px;padding:16px;margin:20px 0"><strong>Device:</strong> Chrome on Windows<br><strong>Location:</strong> Dallas, TX<br><strong>Time:</strong> Today, 9:14 AM</div><p>If this was you, verify to continue. If not, secure your account immediately.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0070d2;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Login</a></p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Salesforce",
          "CRM",
          "login"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "ServiceNow IT Ticket Urgent",
        subject: "ServiceNow: Critical IT ticket assigned to you",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#62d84e;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">ServiceNow</span></div><div style="padding:32px"><h2 style="margin-top:0">Critical ticket assigned to you</h2><p>A P1 (Critical) incident has been assigned to you and requires immediate attention.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0;border-left:4px solid #d0021b"><strong>INC0089234</strong> \u2014 Production database down<br><span style="color:#d0021b;font-weight:bold">Priority: Critical</span><br>Assigned by: NOC Team</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#62d84e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Incident</a></p></div></div>',
        difficulty: "medium",
        attackType: "link_click",
        language: "en",
        industry: "Technology",
        tags: [
          "ServiceNow",
          "IT",
          "ticket"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Dropbox Business Storage Warning",
        subject: "Dropbox: Your team storage is 95% full",
        htmlBody: '<div style="font-family:Atlas Grotesk,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0061ff;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Dropbox</span></div><div style="padding:32px"><h2 style="margin-top:0">Your team storage is almost full</h2><p>Your Dropbox Business account is at <strong>95% capacity</strong>. Files may stop syncing when you reach the limit.</p><div style="background:#f5f5f5;border-radius:4px;padding:16px;margin:20px 0"><div style="background:#0061ff;height:8px;border-radius:4px;width:95%"></div><p style="margin:8px 0 0;font-size:13px">4.75 TB used of 5 TB</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0061ff;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Upgrade Storage</a></p><p style="font-size:12px;color:#555">Dropbox, Inc., 1800 Owens Street, San Francisco, CA 94158</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Dropbox",
          "storage",
          "cloud"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Adobe Creative Cloud License Expiring",
        subject: "Adobe: Your Creative Cloud license expires in 3 days",
        htmlBody: '<div style="font-family:Adobe Clean,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#ff0000;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Adobe_Corporate_Logo.png/200px-Adobe_Corporate_Logo.png" alt="Adobe" style="height:24px"></div><div style="padding:32px"><h2 style="margin-top:0">Your license is expiring soon</h2><p>Your Adobe Creative Cloud All Apps subscription expires in <strong>3 days</strong>. After expiration, you will lose access to Photoshop, Illustrator, Premiere Pro, and all other Creative Cloud apps.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff0000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Renew Subscription</a></p><p style="font-size:12px;color:#555">Adobe Inc., 345 Park Avenue, San Jose, CA 95110</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Creative",
        tags: [
          "Adobe",
          "Creative Cloud",
          "license"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "DocuSign NDA Signature Required",
        subject: "Please DocuSign: Non-Disclosure Agreement \u2014 Immediate Action Required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f5f5"><div style="background:#fff;border-radius:8px;overflow:hidden;margin:20px"><div style="background:#1a1a2e;padding:20px;text-align:center"><span style="color:#f5a623;font-size:22px;font-weight:bold">DocuSign</span></div><div style="padding:30px"><p>URGENT: A Non-Disclosure Agreement requires your signature before your scheduled meeting tomorrow.</p><div style="background:#fff8e1;border:1px solid #f5a623;padding:16px;border-radius:4px;margin:16px 0"><strong>Document:</strong> Mutual NDA \u2014 Acme Corp / Partner<br><strong>From:</strong> Legal Department<br><strong>Deadline:</strong> Before 9:00 AM tomorrow</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f5a623;color:#fff;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold">Sign Now</a></p></div></div></div>',
        difficulty: "hard",
        attackType: "link_click",
        language: "en",
        industry: "Legal",
        tags: [
          "DocuSign",
          "NDA",
          "legal"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "CFO Gift Card Request",
        subject: "Quick favor needed \u2014 confidential",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Hi,</p><p>I need a quick favor. I'm in back-to-back meetings and can't make calls right now. I need you to purchase some Google Play gift cards for a client appreciation gift \u2014 this is time-sensitive.</p><p>Can you get 5 x $100 Google Play cards from any nearby store? Scratch off the back and email me the codes. I'll reimburse you through expense reports.</p><p>Please don't mention this to anyone else \u2014 I want it to be a surprise. Can you handle this in the next hour?</p><p>Thanks,<br>James Richardson<br>Chief Financial Officer</p></div>`,
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "All Industries",
        tags: [
          "BEC",
          "gift card",
          "CFO fraud"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "CEO Acquisition Confidential",
        subject: "Confidential: Acquisition \u2014 do not forward",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Hi,</p><p>I'm reaching out directly because this is extremely sensitive. We're in the final stages of a confidential acquisition and our legal team needs a wire transfer processed today before the market opens tomorrow.</p><p>Please access the secure transfer portal below and process the payment. Our M&A advisor will be waiting for confirmation.</p><p><a href="{{TRACKING_LINK}}">Access Secure Payment Portal</a></p><p>Do not discuss this with anyone \u2014 including your manager. I'll brief the full team after the deal closes. Please confirm you've received this.</p><p>Best,<br>Patricia Chen<br>Chief Executive Officer</p></div>`,
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Finance",
        tags: [
          "BEC",
          "CEO fraud",
          "acquisition"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "IT Help Desk Credential Verification",
        subject: "IT Security: Mandatory credential verification required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px"><div style="background:#1565c0;padding:16px;border-radius:6px 6px 0 0;text-align:center"><h2 style="color:white;margin:0">IT Security Department</h2></div><div style="padding:24px"><p>Dear Employee,</p><p>As part of our ongoing security audit, all employees are required to verify their network credentials by <strong>end of business today</strong>. Failure to complete verification will result in temporary account suspension.</p><p>This is a mandatory compliance requirement per our IT Security Policy.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Credentials</a></p><p style="font-size:12px;color:#666">IT Security Team | Help Desk: ext. 4357</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "IT helpdesk",
          "credentials",
          "internal"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "HR Annual Compliance Training",
        subject: "Mandatory: Complete your annual compliance training by Friday",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#2e7d32;padding:16px;text-align:center;border-radius:6px 6px 0 0"><h2 style="color:white;margin:0">Human Resources</h2></div><div style="border:1px solid #ddd;padding:24px"><p>Dear Team Member,</p><p>This is your final reminder to complete your <strong>Annual Compliance and Security Awareness Training</strong>. This training is mandatory for all employees and must be completed by <strong>this Friday</strong>.</p><p>Employees who do not complete the training will be flagged in the HR system and may be subject to disciplinary action.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2e7d32;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Start Training Now</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "HR",
          "compliance",
          "training"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Epic MyChart Patient Portal",
        subject: "New message from your care team in MyChart",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#005eb8;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">MyChart</span></div><div style="padding:32px"><h2 style="margin-top:0">You have a new message</h2><p>Your care team has sent you a message through MyChart. This message may contain important health information or test results.</p><div style="background:#e8f4fd;border-radius:4px;padding:16px;margin:20px 0"><strong>From:</strong> Dr. Sarah Williams, MD<br><strong>Subject:</strong> Your recent lab results<br><strong>Received:</strong> Today</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#005eb8;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Message</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Healthcare",
        tags: [
          "Epic",
          "MyChart",
          "healthcare"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "CVS Pharmacy Prescription Ready",
        subject: "CVS Pharmacy: Your prescription is ready for pickup",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#cc0000;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">CVS Pharmacy</span></div><div style="padding:32px"><h2 style="margin-top:0">Your prescription is ready</h2><p>Your prescription is ready for pickup at your CVS Pharmacy location. Please pick up within <strong>7 days</strong> to avoid automatic return to stock.</p><div style="background:#f5f5f5;border-radius:4px;padding:16px;margin:20px 0"><strong>Prescription:</strong> Lisinopril 10mg<br><strong>Quantity:</strong> 30 tablets<br><strong>Ready at:</strong> 1234 Main Street CVS</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#cc0000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Manage Prescription</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "Healthcare",
        tags: [
          "CVS",
          "pharmacy",
          "prescription"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "UnitedHealthcare Benefits Expiring",
        subject: "UnitedHealthcare: Use your benefits before they expire",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#005695;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">UnitedHealthcare</span></div><div style="padding:32px"><h2 style="margin-top:0">Your benefits expire December 31</h2><p>You have unused health benefits that will expire at the end of the year. Review your available benefits and schedule appointments before December 31.</p><div style="background:#e8f4fd;border-radius:4px;padding:16px;margin:20px 0"><strong>Available balance:</strong> $847 FSA<br><strong>Unused dental:</strong> $1,200 annual max<br><strong>Unused vision:</strong> $200 allowance</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#005695;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View My Benefits</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Healthcare",
        tags: [
          "UnitedHealthcare",
          "insurance",
          "benefits"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "QuickBooks Invoice Payment Request",
        subject: "Invoice #INV-2847 from Acme Supplies \u2014 Payment due",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#2ca01c;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">QuickBooks</span></div><div style="padding:32px"><p>Acme Supplies LLC has sent you an invoice through QuickBooks.</p><div style="border:1px solid #ddd;border-radius:4px;padding:20px;margin:20px 0"><h3 style="margin-top:0">Invoice #INV-2847</h3><p><strong>From:</strong> Acme Supplies LLC<br><strong>Amount due:</strong> $12,450.00<br><strong>Due date:</strong> Net 30 \u2014 Due this Friday<br><strong>Services:</strong> Q4 IT Equipment Supply</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2ca01c;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review and Pay Invoice</a></p></div></div>',
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Finance",
        tags: [
          "QuickBooks",
          "invoice",
          "vendor fraud"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Vendor Banking Information Update",
        subject: "Important: Updated banking information for future payments",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Dear Accounts Payable Team,</p><p>Please be advised that our company has recently changed our banking institution. Effective immediately, all future payments should be directed to our new bank account.</p><p>Please update your records accordingly and apply this change to any pending invoices:</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0;background:#f9f9f9"><strong>Bank:</strong> First National Bank<br><strong>Routing:</strong> 021000021<br><strong>Account:</strong> 4829103847</div><p>Please confirm receipt and update your records. For verification, please access our vendor portal:</p><p><a href="{{TRACKING_LINK}}">Vendor Portal \u2014 Confirm Banking Update</a></p><p>Thank you for your prompt attention to this matter.</p><p>Best regards,<br>Robert Chen<br>Controller, Acme Supplies LLC</p></div>',
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Finance",
        tags: [
          "vendor fraud",
          "banking",
          "BEC"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Duke Energy Bill Payment Overdue",
        subject: "Duke Energy: Your account is past due \u2014 service interruption warning",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003087;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Duke Energy</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Service interruption warning</h2><p>Your Duke Energy account is <strong>47 days past due</strong>. To avoid service interruption, please pay your outstanding balance immediately.</p><div style="background:#fdf3f2;border:1px solid #d0021b;border-radius:4px;padding:16px;margin:20px 0"><strong>Account:</strong> 4829-1234-5678<br><strong>Past due amount:</strong> $347.82<br><strong>Disconnection date:</strong> In 3 business days</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003087;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Pay Now to Avoid Disconnection</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Energy",
        tags: [
          "Duke Energy",
          "utility",
          "bill"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Comcast Xfinity Account Alert",
        subject: "Xfinity: Your internet service will be suspended",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e11b22;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">XFINITY</span></div><div style="padding:32px"><h2 style="margin-top:0">Your service will be suspended</h2><p>We were unable to process your most recent Xfinity payment. Your internet, TV, and phone services will be suspended in <strong>48 hours</strong> unless payment is received.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e11b22;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Make a Payment</a></p><p style="font-size:12px;color:#555">Comcast Corporation, One Comcast Center, Philadelphia, PA 19103</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Telecommunications",
        tags: [
          "Comcast",
          "Xfinity",
          "internet"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "AT&T Wireless Account Verification",
        subject: "AT&T: Verify your account to prevent suspension",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#00a8e0;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">AT&T</span></div><div style="padding:32px"><h2 style="margin-top:0">Account verification required</h2><p>We've detected unusual activity on your AT&T account. To protect your account and prevent unauthorized changes, please verify your identity within <strong>24 hours</strong>.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#00a8e0;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify My Account</a></p><p style="font-size:12px;color:#555">AT&T Inc., 208 S. Akard Street, Dallas, TX 75202</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Telecommunications",
        tags: [
          "AT&T",
          "wireless",
          "account"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Verizon Data Breach Notification",
        subject: "Verizon: Important security notice regarding your account",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#cd040b;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Verizon</span></div><div style="padding:32px"><h2 style="margin-top:0">Security notice: Your account may be affected</h2><p>We recently identified a security incident that may have affected some Verizon customer accounts. As a precaution, we recommend you verify your account information and update your password.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#cd040b;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Secure My Account</a></p><p style="font-size:12px;color:#555">Verizon Communications Inc., 1095 Avenue of the Americas, New York, NY 10036</p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Telecommunications",
        tags: [
          "Verizon",
          "data breach",
          "security"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "T-Mobile SIM Swap Alert",
        subject: "T-Mobile: SIM card change detected on your account",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e20074;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">T-Mobile</span></div><div style="padding:32px"><h2 style="color:#e20074;margin-top:0">SIM card change detected</h2><p>A SIM card change was requested for your T-Mobile account. If you did not request this change, your account may be compromised.</p><div style="background:#fce4ec;border:1px solid #e20074;border-radius:4px;padding:16px;margin:20px 0"><strong>Change requested:</strong> Today, 3:47 PM<br><strong>Location:</strong> T-Mobile Store, Phoenix, AZ</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e20074;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Cancel SIM Change</a></p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Telecommunications",
        tags: [
          "T-Mobile",
          "SIM swap",
          "account takeover"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Delta Airlines Flight Cancellation",
        subject: "Important: Your Delta flight has been cancelled",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003366;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">DELTA</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Your flight has been cancelled</h2><p>We regret to inform you that your Delta flight has been cancelled due to operational constraints.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><strong>Flight:</strong> DL 1847 \u2014 ATL to LAX<br><strong>Original departure:</strong> Tomorrow, 7:30 AM<br><strong>Status:</strong> CANCELLED</div><p>To rebook or request a refund, please access your account:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003366;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Rebook or Get Refund</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Travel",
        tags: [
          "Delta",
          "airline",
          "flight"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Marriott Bonvoy Points Expiring",
        subject: "Marriott Bonvoy: Your points expire in 7 days",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#8b1a1a;padding:16px 24px"><span style="color:#d4af37;font-size:18px;font-weight:bold">Marriott Bonvoy</span></div><div style="padding:32px"><h2 style="margin-top:0">Your points are about to expire</h2><p>You have <strong>47,500 Marriott Bonvoy points</strong> (worth approximately $475 in free nights) that will expire in <strong>7 days</strong> due to account inactivity.</p><p>Sign in to your account to prevent expiration:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#8b1a1a;color:#d4af37;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Save My Points</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Hospitality",
        tags: [
          "Marriott",
          "hotel",
          "loyalty points"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Airbnb Reservation Confirmation Fraud",
        subject: "Airbnb: Action required for your upcoming reservation",
        htmlBody: '<div style="font-family:Circular,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#ff5a5f;padding:16px 24px;text-align:center"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Airbnb_Logo_B%C3%A9lo.svg/200px-Airbnb_Logo_B%C3%A9lo.svg.png" alt="Airbnb" style="height:28px"></div><div style="padding:32px"><h2 style="margin-top:0">Action required for your reservation</h2><p>Your host has flagged an issue with your upcoming reservation. You must verify your payment information within <strong>24 hours</strong> or your reservation will be automatically cancelled.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff5a5f;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Reservation</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Travel",
        tags: [
          "Airbnb",
          "travel",
          "reservation"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Walmart Order Fraud Alert",
        subject: "Walmart: Suspicious order placed on your account",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0071ce;padding:16px 24px"><span style="color:#ffc220;font-size:20px;font-weight:bold">Walmart</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Suspicious order detected</h2><p>A high-value order was placed on your Walmart account from an unrecognized device. If you did not place this order, please secure your account immediately.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><strong>Order total:</strong> $1,247.83<br><strong>Items:</strong> Electronics (3 items)<br><strong>Ship to:</strong> New address added today</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0071ce;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review Order</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Retail",
        tags: [
          "Walmart",
          "order",
          "fraud"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Target RedCard Security Alert",
        subject: "Target RedCard: Unusual activity on your account",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#cc0000;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Target</span></div><div style="padding:32px"><h2 style="margin-top:0">RedCard security alert</h2><p>We've detected unusual activity on your Target RedCard. For your protection, we've temporarily restricted your card until you verify your identity.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#cc0000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Identity</a></p><p style="font-size:12px;color:#555">Target Corporation, 1000 Nicollet Mall, Minneapolis, MN 55403</p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Retail",
        tags: [
          "Target",
          "RedCard",
          "retail"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "eBay Seller Account Suspended",
        subject: "eBay: Your seller account has been suspended",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e53238;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/EBay_logo.svg/200px-EBay_logo.svg.png" alt="eBay" style="height:28px"></div><div style="padding:32px"><h2 style="color:#e53238;margin-top:0">Your seller account has been suspended</h2><p>We've suspended your eBay seller account due to a policy violation. You have <strong>7 days</strong> to appeal this decision before it becomes permanent.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0064d2;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Appeal Suspension</a></p></div></div>`,
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Retail",
        tags: [
          "eBay",
          "seller",
          "account"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Costco Membership Renewal",
        subject: "Costco: Your membership expires this month",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#005daa;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Costco Wholesale</span></div><div style="padding:32px"><h2 style="margin-top:0">Your membership is expiring</h2><p>Your Costco Executive Membership expires at the end of this month. Renew now to continue enjoying member pricing and your 2% annual reward.</p><div style="background:#f5f5f5;border-radius:4px;padding:16px;margin:20px 0"><strong>Membership type:</strong> Executive<br><strong>Annual fee:</strong> $130<br><strong>Your 2% reward earned:</strong> $87.40</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#005daa;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Renew Membership</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Retail",
        tags: [
          "Costco",
          "membership",
          "renewal"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "CrowdStrike Threat Alert",
        subject: "CrowdStrike: Active threat detected on endpoint",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e2002a;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">CrowdStrike Falcon</span></div><div style="padding:32px"><h2 style="color:#e2002a;margin-top:0">Active threat detected</h2><p>CrowdStrike Falcon has detected a high-severity threat on a managed endpoint in your organization. Immediate action is required.</p><div style="background:#fdf3f2;border:1px solid #e2002a;border-radius:4px;padding:16px;margin:20px 0"><strong>Severity:</strong> Critical<br><strong>Threat:</strong> Ransomware behavior detected<br><strong>Endpoint:</strong> DESKTOP-HR-047<br><strong>User:</strong> j.smith@company.com</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e2002a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Threat Details</a></p></div></div>',
        difficulty: "hard",
        attackType: "link_click",
        language: "en",
        industry: "Technology",
        tags: [
          "CrowdStrike",
          "endpoint",
          "threat"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "GitHub Repository Access Alert",
        subject: "GitHub: A new SSH key was added to your account",
        htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#24292f;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Octicons-mark-github.svg/50px-Octicons-mark-github.svg.png" alt="GitHub" style="height:28px;filter:invert(1)"></div><div style="padding:32px"><h2 style="margin-top:0">New SSH key added</h2><p>A new SSH key was recently added to your GitHub account. If you did not add this key, your account may be compromised.</p><div style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:16px;margin:20px 0;font-family:monospace;font-size:13px">Key fingerprint: SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2da44e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block">Review SSH Keys</a></p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "GitHub",
          "SSH",
          "developer"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Okta MFA Enrollment Required",
        subject: "Okta: Multi-factor authentication enrollment required",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#007dc1;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Okta</span></div><div style="padding:32px"><h2 style="margin-top:0">MFA enrollment required</h2><p>Your organization requires all users to enroll in multi-factor authentication. You must complete enrollment by <strong>end of this week</strong> or your account will be locked.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#007dc1;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Enroll in MFA</a></p><p style="font-size:12px;color:#555">Okta, Inc., 100 First Street, Suite 600, San Francisco, CA 94105</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Okta",
          "MFA",
          "identity"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "LastPass Master Password Reset",
        subject: "LastPass: Your master password needs to be reset",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#d32d27;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">LastPass</span></div><div style="padding:32px"><h2 style="color:#d32d27;margin-top:0">Security notice: Reset required</h2><p>Following a recent security review, LastPass requires you to reset your master password. This is a mandatory security measure affecting all accounts.</p><p>You must complete this reset within <strong>48 hours</strong> to maintain access to your vault.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#d32d27;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Reset Master Password</a></p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "LastPass",
          "password manager",
          "credentials"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "VPN Certificate Expired",
        subject: "IT Alert: Your VPN certificate has expired \u2014 remote access blocked",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px"><div style="background:#1565c0;padding:16px;border-radius:6px 6px 0 0;text-align:center"><h2 style="color:white;margin:0">IT Security \u2014 VPN Notice</h2></div><div style="padding:24px"><p>Dear Employee,</p><p>Your VPN client certificate has expired. You are currently unable to connect to the corporate network remotely until you renew your certificate.</p><p>Click below to download and install the updated certificate:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Renew VPN Certificate</a></p><p style="font-size:12px;color:#666">IT Help Desk | ext. 4357 | helpdesk@company.com</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "VPN",
          "certificate",
          "remote access"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Azure Cost Alert",
        subject: "Azure: Your monthly spend has exceeded budget threshold",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0078d4;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Microsoft Azure</span></div><div style="padding:32px"><h2 style="color:#d83b01;margin-top:0">Budget alert: Threshold exceeded</h2><p>Your Azure subscription has exceeded your configured budget threshold. Unusual resource provisioning may indicate unauthorized access.</p><div style="background:#fef0cd;border-left:4px solid #f7c948;padding:12px 16px;margin:20px 0"><strong>Current spend:</strong> $8,247 (Budget: $2,000)<br><strong>Overage:</strong> 312% above budget</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Review Azure Portal</a></p></div></div>`,
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Azure",
          "cloud",
          "billing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Canvas LMS Course Deadline",
        subject: "Canvas: Assignment due in 24 hours \u2014 submit now",
        htmlBody: '<div style="font-family:Lato,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#e66000;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Canvas</span></div><div style="padding:32px"><h2 style="margin-top:0">Assignment due in 24 hours</h2><p>You have an assignment due tomorrow that has not been submitted. Late submissions will receive a 50% grade penalty.</p><div style="background:#fff8e1;border:1px solid #e66000;border-radius:4px;padding:16px;margin:20px 0"><strong>Course:</strong> MGMT 4820 \u2014 Business Ethics<br><strong>Assignment:</strong> Case Study Analysis #3<br><strong>Due:</strong> Tomorrow at 11:59 PM</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e66000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Submit Assignment</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Education",
        tags: [
          "Canvas",
          "education",
          "LMS"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Student Loan Forgiveness Program",
        subject: "Federal Student Aid: You qualify for loan forgiveness",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003366;padding:16px 24px"><span style="color:#fff;font-size:16px;font-weight:bold">Federal Student Aid | U.S. Department of Education</span></div><div style="padding:32px"><h2 style="color:#003366;margin-top:0">You may qualify for loan forgiveness</h2><p>Based on your federal student loan history, you may qualify for the Public Service Loan Forgiveness (PSLF) program. This could eliminate your remaining loan balance.</p><p>To check your eligibility and apply, access your Federal Student Aid account:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003366;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Check My Eligibility</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Education",
        tags: [
          "student loan",
          "federal",
          "forgiveness"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Zillow Home Value Alert",
        subject: "Zillow: Your home value has changed significantly",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#006aff;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Zillow_logo.svg/200px-Zillow_logo.svg.png" alt="Zillow" style="height:24px"></div><div style="padding:32px"><h2 style="margin-top:0">Your home value has changed</h2><p>Your Zillow Zestimate has changed by more than 8% in the last 30 days. This may affect your home equity and refinancing options.</p><div style="background:#e8f4fd;border-radius:4px;padding:16px;margin:20px 0"><strong>Previous estimate:</strong> $487,000<br><strong>Current estimate:</strong> $524,000 (+7.6%)</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#006aff;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Home Details</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "Real Estate",
        tags: [
          "Zillow",
          "real estate",
          "home value"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Rocket Mortgage Refinance Offer",
        subject: "Rocket Mortgage: Lock in 5.2% rate before it expires",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#cc0000;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Rocket Mortgage</span></div><div style="padding:32px"><h2 style="margin-top:0">Your rate lock expires in 48 hours</h2><p>Your pre-approved refinance rate of <strong>5.2% APR</strong> expires in 48 hours. Based on your current mortgage, refinancing could save you $347/month.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#cc0000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Lock My Rate</a></p><p style="font-size:12px;color:#555">Rocket Mortgage, LLC, 1050 Woodward Avenue, Detroit, MI 48226</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Rocket Mortgage",
          "refinance",
          "mortgage"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Wire Transfer Closing Instructions",
        subject: "URGENT: Wire instructions for your real estate closing tomorrow",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Dear Client,</p><p>Please be advised that our escrow company has updated their banking information. The wire instructions you received previously are no longer valid. Please use the following updated instructions for tomorrow's closing:</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0;background:#f9f9f9"><strong>Bank:</strong> First American Title<br><strong>Routing:</strong> 026009593<br><strong>Account:</strong> 7834920184<br><strong>Amount:</strong> Per your HUD-1 statement</div><p>Please confirm receipt and wire the funds before 2:00 PM tomorrow. If you have any questions, please access our secure client portal:</p><p><a href="{{TRACKING_LINK}}">Access Closing Portal</a></p><p>Best regards,<br>Jennifer Walsh<br>Closing Coordinator</p></div>`,
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Real Estate",
        tags: [
          "wire fraud",
          "real estate",
          "closing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "State Farm Policy Renewal",
        subject: "State Farm: Your auto policy renews in 7 days",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#cc0000;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">State Farm</span></div><div style="padding:32px"><h2 style="margin-top:0">Your policy renews in 7 days</h2><p>Your State Farm auto insurance policy is scheduled to renew in 7 days. Your premium has increased by 12% due to recent claims in your area.</p><p>Review your policy and payment options before renewal:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#cc0000;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review My Policy</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Insurance",
        tags: [
          "State Farm",
          "insurance",
          "auto"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "GEICO Claim Status Update",
        subject: "GEICO: Update required on your open claim",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#003087;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">GEICO</span></div><div style="padding:32px"><h2 style="margin-top:0">Action required on your claim</h2><p>Your GEICO claim requires additional documentation before we can process your payment. Please submit the required information within <strong>5 business days</strong> to avoid claim denial.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#003087;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Submit Documentation</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Insurance",
        tags: [
          "GEICO",
          "insurance",
          "claim"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Zoom Webinar Registration Confirmation",
        subject: "You're registered: Cybersecurity Best Practices Webinar",
        htmlBody: `<div style="font-family:Lato,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#2d8cff;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">zoom</span></div><div style="padding:32px"><h2 style="margin-top:0">You're registered!</h2><p>Thank you for registering for the upcoming webinar.</p><div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0"><strong>Webinar:</strong> 2025 Cybersecurity Threat Landscape<br><strong>Date:</strong> Thursday at 2:00 PM ET<br><strong>Host:</strong> CISA & NIST Joint Briefing</div><p>Add to your calendar and join using the link below:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2d8cff;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;display:inline-block">Join Webinar</a></p></div></div>`,
        difficulty: "medium",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Zoom",
          "webinar",
          "registration"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Authenticator App Prompt",
        subject: "Approve sign-in request in Microsoft Authenticator",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f3f2f1;padding:20px;text-align:center;border-bottom:1px solid #ddd"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png" alt="Microsoft" style="height:24px"></div><div style="padding:32px;text-align:center"><div style="font-size:48px;margin-bottom:16px">\u{1F510}</div><h2 style="color:#323130">Approve sign-in request</h2><p style="color:#605e5c">A sign-in request is waiting for your approval in the Microsoft Authenticator app. If you can't access the app, verify here:</p><div style="background:#f3f2f1;border-radius:4px;padding:16px;margin:20px 0;text-align:left"><strong>App:</strong> Microsoft 365<br><strong>Location:</strong> Seattle, WA<br><strong>Time:</strong> Just now</div><p><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Approve Sign-In</a></p></div></div>`,
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "MFA",
          "authenticator"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "IT Asset Return Request",
        subject: "IT: Please return company equipment before your last day",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px"><div style="background:#1565c0;padding:16px;border-radius:6px 6px 0 0;text-align:center"><h2 style="color:white;margin:0">IT Asset Management</h2></div><div style="padding:24px"><p>Dear Employee,</p><p>Our records indicate you have company-issued equipment that must be returned. Please complete the equipment return form and schedule a pickup or drop-off.</p><div style="border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0"><strong>Assets on record:</strong><br>\u2022 Dell Laptop (SN: DL8472918)<br>\u2022 iPhone 14 Pro (SN: IP9283741)<br>\u2022 Security badge</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Schedule Equipment Return</a></p></div></div>',
        difficulty: "medium",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "IT",
          "equipment",
          "offboarding"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Bonus Payment Notification",
        subject: "Payroll: Your Q4 bonus has been processed",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#2e7d32;padding:16px;text-align:center;border-radius:6px 6px 0 0"><h2 style="color:white;margin:0">Payroll Services</h2></div><div style="border:1px solid #ddd;padding:24px"><p>Dear Employee,</p><p>We are pleased to inform you that your Q4 performance bonus has been approved and processed. The amount will be reflected in your next paycheck.</p><div style="background:#f1f8e9;border:1px solid #2e7d32;border-radius:4px;padding:16px;margin:16px 0"><strong>Bonus amount:</strong> $4,750.00<br><strong>Pay date:</strong> Next Friday</div><p>To view your bonus breakdown and tax withholding details, log in to the employee portal:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2e7d32;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Bonus Details</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "bonus",
          "payroll",
          "HR"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Phishing Test Awareness Training",
        subject: "You clicked a phishing link \u2014 required training assigned",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px"><div style="background:#e65100;padding:16px;border-radius:6px 6px 0 0;text-align:center"><h2 style="color:white;margin:0">Information Security</h2></div><div style="padding:24px"><p>Dear Employee,</p><p>Our records show that you recently clicked a link in a simulated phishing email. As a result, you have been assigned mandatory security awareness training.</p><p>You must complete this training within <strong>5 business days</strong>.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#e65100;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Complete Required Training</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "security awareness",
          "training",
          "phishing test"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Concur Expense Report Approval",
        subject: "SAP Concur: Your expense report requires manager approval",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0070f2;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">SAP Concur</span></div><div style="padding:32px"><h2 style="margin-top:0">Expense report pending approval</h2><p>Your expense report has been submitted and is awaiting manager approval. Please log in to verify the report details before it is reviewed.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><strong>Report:</strong> Q4 Travel Expenses<br><strong>Total:</strong> $2,847.50<br><strong>Submitted:</strong> Today</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0070f2;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review Expense Report</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Concur",
          "expense",
          "SAP"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Planner Task Overdue",
        subject: "Microsoft Planner: You have 5 overdue tasks",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#31752f;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Microsoft Planner</span></div><div style="padding:32px"><h2 style="margin-top:0">You have overdue tasks</h2><p>You have <strong>5 overdue tasks</strong> in Microsoft Planner that require your attention. Your team is waiting on these items.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><p style="margin:0;color:#d83b01">\u26A0 Q4 Report Review \u2014 3 days overdue<br>\u26A0 Budget Approval \u2014 1 day overdue<br>\u26A0 Client Presentation Prep \u2014 Due today</p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#31752f;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View My Tasks</a></p></div></div>`,
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "Planner",
          "tasks"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Robinhood Account Verification",
        subject: "Robinhood: Verify your account to continue trading",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#00c805;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Robinhood</span></div><div style="padding:32px"><h2 style="margin-top:0">Account verification required</h2><p>To comply with SEC regulations, we need to verify your identity before you can continue trading. Your account has been temporarily restricted.</p><p>This verification takes less than 2 minutes:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#00c805;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify My Identity</a></p><p style="font-size:12px;color:#555">Robinhood Markets, Inc., 85 Willow Road, Menlo Park, CA 94025</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Robinhood",
          "investing",
          "trading"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Coinbase Crypto Withdrawal Alert",
        subject: "Coinbase: Large withdrawal initiated from your account",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0052ff;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24x7vc_Coinbase.png/200px-24x7vc_Coinbase.png" alt="Coinbase" style="height:24px"></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Withdrawal alert</h2><p>A withdrawal of <strong>2.4 BTC ($98,400)</strong> was initiated from your Coinbase account. If you did not authorize this transaction, cancel it immediately.</p><div style="background:#fdf3f2;border:1px solid #d0021b;border-radius:4px;padding:16px;margin:20px 0"><strong>Amount:</strong> 2.4 BTC (~$98,400)<br><strong>Destination:</strong> External wallet<br><strong>Status:</strong> Pending (30 min to cancel)</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#d0021b;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Cancel Withdrawal</a></p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "Coinbase",
          "crypto",
          "withdrawal"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Outlook Calendar Invite \u2014 Board Meeting",
        subject: "Invitation: Emergency Board Meeting \u2014 Today 4:00 PM",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0078d4;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Microsoft Outlook</span></div><div style="padding:32px"><h2 style="margin-top:0">Meeting Invitation</h2><p><strong>Patricia Chen</strong> has invited you to a meeting.</p><div style="border:1px solid #edebe9;border-radius:4px;padding:20px;margin:20px 0"><strong>Subject:</strong> Emergency Board Meeting \u2014 Q4 Results<br><strong>When:</strong> Today, 4:00 PM \u2013 5:30 PM<br><strong>Where:</strong> Microsoft Teams (link below)<br><strong>Organizer:</strong> CEO Office</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:#fff;padding:12px 28px;text-decoration:none;border-radius:2px;display:inline-block">Accept and Join Meeting</a></p></div></div>`,
        difficulty: "hard",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Outlook",
          "calendar",
          "meeting"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Stripe Payment Processing Alert",
        subject: "Stripe: Your payout has been paused",
        htmlBody: `<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#635bff;padding:16px 24px"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Stripe_Logo%2C_revised_2016.svg/200px-Stripe_Logo%2C_revised_2016.svg.png" alt="Stripe" style="height:24px;filter:brightness(0) invert(1)"></div><div style="padding:32px"><h2 style="color:#635bff;margin-top:0">Your payouts have been paused</h2><p>We've paused payouts to your bank account while we review some recent activity on your Stripe account. This may affect your cash flow.</p><div style="background:#f6f5ff;border:1px solid #635bff;border-radius:4px;padding:16px;margin:20px 0"><strong>Funds on hold:</strong> $12,847.00<br><strong>Reason:</strong> Elevated dispute rate</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#635bff;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review Account</a></p></div></div>`,
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Stripe",
          "payments",
          "payout"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Twilio Account Suspended",
        subject: "Twilio: Your account has been suspended for policy violation",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f22f46;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Twilio</span></div><div style="padding:32px"><h2 style="color:#f22f46;margin-top:0">Account suspended</h2><p>Your Twilio account has been suspended due to a potential policy violation. All API calls are currently blocked.</p><p>To restore your account, please review the flagged activity and verify your account details:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f22f46;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review and Restore Account</a></p></div></div>',
        difficulty: "hard",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Twilio",
          "API",
          "developer"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Jira Sprint Deadline Alert",
        subject: "Jira: Sprint ends tomorrow \u2014 8 tickets unresolved",
        htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0052cc;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Jira</span></div><div style="padding:32px"><h2 style="margin-top:0">Sprint ending tomorrow</h2><p>Your current sprint ends tomorrow and you have <strong>8 unresolved tickets</strong> assigned to you. Please update your ticket statuses.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><p style="margin:0;color:#d0021b">\u{1F534} PROJ-1847 \u2014 Critical bug in auth flow<br>\u{1F534} PROJ-1851 \u2014 API timeout issue<br>\u{1F7E1} PROJ-1863 \u2014 UI alignment fix<br><span style="color:#555">+ 5 more tickets</span></p></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0052cc;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View My Tickets</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Jira",
          "Atlassian",
          "sprint"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Confluence Page Review Request",
        subject: "Confluence: Your review is needed on a critical document",
        htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0052cc;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Confluence</span></div><div style="padding:32px"><h2 style="margin-top:0">Review requested</h2><p><strong>Alex Thompson</strong> has requested your review on a Confluence page before it is published to all staff.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><strong>Page:</strong> 2025 Security Incident Response Plan<br><strong>Space:</strong> IT Security<br><strong>Deadline:</strong> Today by 5:00 PM</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0052cc;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Review Page</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Confluence",
          "Atlassian",
          "documentation"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Intuit TurboTax Filing Alert",
        subject: "TurboTax: Your tax return requires additional information",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#355fa3;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">TurboTax</span></div><div style="padding:32px"><h2 style="margin-top:0">Your return needs attention</h2><p>The IRS has flagged your 2024 tax return for additional review. You must provide supplemental documentation within <strong>21 days</strong> to avoid processing delays or penalties.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#355fa3;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Respond to IRS Notice</a></p><p style="font-size:12px;color:#555">Intuit Inc., 2700 Coast Avenue, Mountain View, CA 94043</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "TurboTax",
          "tax",
          "Intuit"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Zoom Account Compromised",
        subject: "Zoom: Unauthorized access to your account detected",
        htmlBody: '<div style="font-family:Lato,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#2d8cff;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">zoom</span></div><div style="padding:32px"><h2 style="color:#d0021b;margin-top:0">Unauthorized access detected</h2><p>We detected a sign-in to your Zoom account from an unrecognized device. Your meeting recordings and contacts may have been accessed.</p><div style="background:#fdf3f2;border:1px solid #d0021b;border-radius:4px;padding:16px;margin:20px 0"><strong>Device:</strong> Unknown Android device<br><strong>Location:</strong> Toronto, Canada<br><strong>Time:</strong> Today, 1:23 AM</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2d8cff;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Secure My Account</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Zoom",
          "account",
          "security"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Glassdoor Company Review Alert",
        subject: "Glassdoor: A new review has been posted about your company",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#0caa41;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Glassdoor</span></div><div style="padding:32px"><h2 style="margin-top:0">New review posted</h2><p>A new employee review has been posted about your company on Glassdoor. The review contains content that may require your attention.</p><div style="background:#f5f5f5;border-radius:4px;padding:16px;margin:20px 0"><strong>Rating:</strong> \u2B50 1/5<br><strong>Title:</strong> "Toxic management and no work-life balance"<br><strong>Posted:</strong> Today</div><p>As an employer representative, you can respond to this review:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0caa41;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View and Respond</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Glassdoor",
          "HR",
          "employer brand"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Calendly Meeting Scheduled",
        subject: "New meeting scheduled: Interview with Google Recruiter",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#006bff;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Calendly</span></div><div style="padding:32px"><h2 style="margin-top:0">Meeting confirmed</h2><p>A meeting has been scheduled on your behalf.</p><div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0"><strong>Event:</strong> Technical Interview \u2014 Senior Engineer<br><strong>Invitee:</strong> Jessica Park, Google Recruiting<br><strong>Date:</strong> Tomorrow, 10:00 AM \u2013 11:00 AM ET<br><strong>Location:</strong> Google Meet</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#006bff;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">View Event Details</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Calendly",
          "meeting",
          "scheduling"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Notion Workspace Invitation",
        subject: "You've been invited to join a Notion workspace",
        htmlBody: `<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#000;padding:16px 24px;text-align:center"><span style="color:#fff;font-size:20px;font-weight:bold">Notion</span></div><div style="padding:40px;text-align:center"><h2 style="color:#000">You've been invited to join a workspace</h2><p style="color:#787774"><strong>Marcus Johnson</strong> has invited you to join the <strong>AcmeCorp Operations</strong> workspace on Notion.</p><p style="margin:32px 0"><a href="{{TRACKING_LINK}}" style="background:#000;color:#fff;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block">Accept Invitation</a></p><p style="font-size:12px;color:#787774">Notion Labs, Inc., 2300 Harrison Street, San Francisco, CA 94110</p></div></div>`,
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Technology",
        tags: [
          "Notion",
          "workspace",
          "productivity"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Figma Design File Shared",
        subject: "Amanda Torres shared a Figma file with you",
        htmlBody: '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f24e1e;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Figma</span></div><div style="padding:32px"><p>Amanda Torres has shared a file with you.</p><div style="border:1px solid #e5e5e5;border-radius:8px;padding:20px;margin:20px 0"><div style="background:#f24e1e;width:40px;height:40px;border-radius:8px;margin-bottom:12px"></div><strong>2025 Brand Redesign \u2014 Final</strong><br><span style="color:#888;font-size:13px">Figma file \u2022 47 frames</span></div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f24e1e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block">Open in Figma</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Creative",
        tags: [
          "Figma",
          "design",
          "file sharing"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Asana Project Deadline Missed",
        subject: "Asana: You missed a project deadline",
        htmlBody: '<div style="font-family:Graphik,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#f06a6a;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Asana</span></div><div style="padding:32px"><h2 style="margin-top:0">You missed a deadline</h2><p>A task assigned to you in Asana is now overdue. Your project manager has been notified.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0;border-left:4px solid #f06a6a"><strong>Task:</strong> Q4 Financial Reconciliation Report<br><strong>Project:</strong> Finance \u2014 Year End Close<br><strong>Was due:</strong> Yesterday at 5:00 PM</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f06a6a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Task Status</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "Asana",
          "project management",
          "deadline"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "HubSpot CRM Deal Alert",
        subject: "HubSpot: High-value deal at risk of closing lost",
        htmlBody: '<div style="font-family:Lexend,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#ff7a59;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">HubSpot</span></div><div style="padding:32px"><h2 style="margin-top:0">Deal at risk</h2><p>A high-value deal in your HubSpot CRM pipeline has not been updated in 14 days and is at risk of being marked as Closed Lost.</p><div style="border:1px solid #ddd;border-radius:4px;padding:16px;margin:20px 0"><strong>Deal:</strong> Acme Corp \u2014 Enterprise License<br><strong>Value:</strong> $84,000<br><strong>Stage:</strong> Proposal Sent<br><strong>Last activity:</strong> 14 days ago</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#ff7a59;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Deal</a></p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Sales",
        tags: [
          "HubSpot",
          "CRM",
          "sales"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Zoom Recording Shared",
        subject: "A Zoom recording has been shared with you",
        htmlBody: '<div style="font-family:Lato,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#2d8cff;padding:16px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">zoom</span></div><div style="padding:32px"><h2 style="margin-top:0">A recording has been shared with you</h2><p><strong>David Williams</strong> has shared a Zoom cloud recording with you.</p><div style="border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:20px 0"><strong>Meeting:</strong> Executive Leadership Briefing \u2014 Q4<br><strong>Duration:</strong> 1 hour 23 minutes<br><strong>Shared by:</strong> David Williams (CEO)</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2d8cff;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;display:inline-block">Watch Recording</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Zoom",
          "recording",
          "video"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Microsoft Forms Survey Link",
        subject: "Please complete: Annual Employee Satisfaction Survey",
        htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff"><div style="background:#742774;padding:16px 24px"><span style="color:#fff;font-size:18px;font-weight:bold">Microsoft Forms</span></div><div style="padding:32px"><h2 style="margin-top:0">Your feedback is needed</h2><p>HR has sent you the Annual Employee Satisfaction Survey. Your responses are anonymous and will be used to improve our workplace.</p><p>The survey takes approximately 5 minutes to complete. <strong>Deadline: This Friday.</strong></p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#742774;color:#fff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Take Survey</a></p></div></div>`,
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "Microsoft",
          "Forms",
          "survey"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "IT Password Reset \u2014 Active Directory",
        subject: "URGENT: Your corporate password will expire in 24 hours",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px"><div style="background:#0078d4;padding:16px;border-radius:6px 6px 0 0;text-align:center"><h2 style="color:white;margin:0">IT Security Notice</h2></div><div style="padding:24px"><p>Dear Employee,</p><p>Our system has detected that your corporate password is scheduled to expire in <strong>24 hours</strong>. Failure to update your password will result in account lockout and loss of access to all company systems.</p><p>Please click the link below to update your password immediately:</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Password Now</a></p><p style="color:#666;font-size:12px">If you did not request this, please contact IT Support immediately at ext. 4357.</p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "All Industries",
        tags: [
          "IT",
          "password",
          "Active Directory"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Payroll Direct Deposit Update",
        subject: "Action needed: Verify your direct deposit information",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#1565c0;padding:16px;text-align:center;border-radius:6px 6px 0 0"><h2 style="color:white;margin:0">Payroll Services</h2></div><div style="border:1px solid #ddd;padding:24px"><p>Dear Employee,</p><p>We are updating our payroll system and require all employees to verify their direct deposit information by <strong>end of business today</strong>.</p><p>Failure to verify may result in a delay in your next paycheck.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Banking Info</a></p></div></div>',
        difficulty: "easy",
        attackType: "credential_harvest",
        language: "en",
        industry: "Finance",
        tags: [
          "payroll",
          "banking",
          "direct deposit"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "HR Benefits Open Enrollment Deadline",
        subject: "Last chance: Open enrollment closes Friday",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#2e7d32;padding:16px;text-align:center;border-radius:6px 6px 0 0"><h2 style="color:white;margin:0">Human Resources</h2></div><div style="border:1px solid #ddd;padding:24px"><p>Dear Team Member,</p><p>This is your final reminder that <strong>open enrollment for 2025 benefits closes this Friday at 5:00 PM</strong>.</p><p>If you do not complete your enrollment, you will be automatically enrolled in the default plan, which may not meet your needs.</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2e7d32;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Complete Enrollment</a></p><p style="font-size:12px;color:#666">Questions? Contact HR at hr@company.com</p></div></div>',
        difficulty: "medium",
        attackType: "credential_harvest",
        language: "en",
        industry: "Healthcare",
        tags: [
          "HR",
          "benefits",
          "enrollment"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "CEO Wire Transfer Request",
        subject: "Confidential: Urgent wire transfer needed",
        htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><p>Hi,</p><p>I'm currently in a board meeting and need you to process an urgent wire transfer. This is time-sensitive and confidential \u2014 please don't discuss with anyone else until it's complete.</p><p>Amount: <strong>$47,500</strong><br>Please click below to access the secure transfer portal:</p><p><a href="{{TRACKING_LINK}}">Access Secure Transfer Portal</a></p><p>I'll explain the details after the meeting. Please confirm receipt of this email.</p><p>Best,<br>CEO</p></div>`,
        difficulty: "hard",
        attackType: "pretexting",
        language: "en",
        industry: "Finance",
        tags: [
          "BEC",
          "CEO fraud",
          "wire transfer"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "DocuSign Employment Agreement",
        subject: "You have a document to review and sign",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5"><div style="background:white;border-radius:8px;overflow:hidden"><div style="background:#1a1a2e;padding:20px;text-align:center"><h2 style="color:white;margin:0">DocuSign</h2></div><div style="padding:30px"><p>A document has been sent to you for signature.</p><div style="background:#f9f9f9;border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0"><strong>Document:</strong> Employment Agreement 2025<br><strong>From:</strong> Legal Department<br><strong>Expires:</strong> 48 hours</div><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f5a623;color:white;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold">Review Document</a></p></div></div></div>',
        difficulty: "medium",
        attackType: "link_click",
        language: "en",
        industry: "Legal",
        tags: [
          "DocuSign",
          "document",
          "signature"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      },
      {
        name: "Shared File Notification",
        subject: "John Smith shared a file with you",
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f0f2f5"><div style="background:white;border-radius:8px;padding:30px"><div style="text-align:center;margin-bottom:20px"><div style="width:48px;height:48px;background:#0061ff;border-radius:8px;margin:0 auto;display:flex;align-items:center;justify-content:center"><span style="color:white;font-size:24px">\u{1F4C1}</span></div></div><h3 style="text-align:center">John Smith shared "Q4 Financial Report.xlsx" with you</h3><p style="color:#666;text-align:center">Click below to view the document</p><p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0061ff;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block">Open File</a></p></div></div>',
        difficulty: "easy",
        attackType: "link_click",
        language: "en",
        industry: "All Industries",
        tags: [
          "file sharing",
          "Dropbox",
          "OneDrive"
        ],
        isBuiltIn: true,
        isShared: false,
        orgId: null,
        createdByUserId: null
      }
    ];
  }
});

// server/seed_modules.json
var seed_modules_default;
var init_seed_modules = __esm({
  "server/seed_modules.json"() {
    seed_modules_default = [
      {
        title: "Phishing Awareness 101",
        description: "Learn to identify phishing emails before they compromise your organization.",
        category: "Security Fundamentals",
        content: "# Phishing Awareness 101\n\nPhishing is the #1 attack vector in cybersecurity.\n\n## Key Warning Signs\n- Urgency or threats\n- Mismatched sender domains\n- Generic greetings\n- Suspicious links\n- Unexpected attachments\n\n## The Hover Test\nAlways hover over links to see the real URL before clicking.\n\n## What To Do\n1. Don't click any links\n2. Report to IT Security\n3. Delete the email",
        durationMinutes: 4,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 0
      },
      {
        title: "Password Hygiene & Management",
        description: "Best practices for creating and managing strong, unique passwords.",
        category: "Security Fundamentals",
        content: "# Password Hygiene & Management\n\nWeak passwords are the second most common cause of data breaches.\n\n## Strong Password Rules\n- Minimum 12 characters\n- Mix of uppercase, lowercase, numbers, symbols\n- Never reuse passwords\n- Use a passphrase\n\n## Password Managers\nUse a password manager to generate and store unique passwords.\n\n## Multi-Factor Authentication\nAlways enable MFA on email, banking, and work accounts.",
        durationMinutes: 5,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 1
      },
      {
        title: "Social Engineering Defense",
        description: "Recognize and resist psychological manipulation tactics used by attackers.",
        category: "Social Engineering",
        content: "# Social Engineering Defense\n\nSocial engineering exploits human psychology, not technology.\n\n## Common Tactics\n- Authority: Impersonating executives or IT\n- Urgency: Act now or lose access\n- Scarcity: Only 1 hour left\n\n## Defense Strategies\n1. Verify identity through a separate channel\n2. Never give credentials over phone or email\n3. It is OK to say I need to verify this first\n4. Report suspicious requests to your manager",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 2
      },
      {
        title: "HIPAA Security Awareness",
        description: "Understand your obligations under HIPAA to protect patient health information.",
        category: "Compliance",
        content: "# HIPAA Security Awareness\n\nHIPAA requires covered entities to protect Protected Health Information (PHI).\n\n## What is PHI?\nAny information that can identify a patient: name, DOB, SSN, medical record numbers, diagnosis, treatment.\n\n## Your Obligations\n- Only access PHI you need for your job\n- Never share PHI via unencrypted email\n- Lock your screen when away from your desk\n- Report any suspected breach immediately\n\n## Phishing and HIPAA\nPhishing is the #1 cause of healthcare data breaches. A single click can expose thousands of patient records.",
        durationMinutes: 5,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 3
      },
      {
        title: "PCI DSS Cardholder Data Protection",
        description: "Protect payment card data and meet PCI DSS v4.0 requirements.",
        category: "Compliance",
        content: "# PCI DSS Cardholder Data Protection\n\nPCI DSS v4.0 Requirement 12.6.3 mandates phishing simulation training.\n\n## What is Cardholder Data?\n- Primary Account Number (PAN)\n- Cardholder name, expiration date\n- CVV/CVC codes (never store these)\n\n## Your Responsibilities\n- Never write down or photograph card numbers\n- Never send card data via email or chat\n- Use only approved payment systems\n- Report any suspected card data exposure immediately",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 4
      },
      {
        title: "GDPR Data Privacy Fundamentals",
        description: "Understand GDPR requirements for handling personal data of EU residents.",
        category: "Compliance",
        content: "# GDPR Data Privacy Fundamentals\n\nGDPR applies to any organization handling data of EU residents.\n\n## Key Principles\n- Lawful basis: Have a legal reason to process data\n- Data minimization: Collect only what you need\n- Purpose limitation: Use data only for stated purposes\n\n## Individual Rights\nEU residents have the right to access, correct, and delete their data.\n\n## Breach Notification\nGDPR requires breach notification within 72 hours.",
        durationMinutes: 4,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 5
      },
      {
        title: "Ransomware Prevention & Response",
        description: "How ransomware works and how to prevent and respond to attacks.",
        category: "Threat Awareness",
        content: "# Ransomware Prevention & Response\n\nRansomware cost organizations $20 billion globally in 2023.\n\n## How Ransomware Spreads\n1. Phishing email with malicious attachment\n2. Compromised credentials\n3. Unpatched software\n4. Malicious USB drives\n\n## Prevention\n- Never open unexpected attachments\n- Keep software updated\n- Use MFA on all remote access\n- Back up data regularly\n\n## If You Suspect Infection\n1. Disconnect from the network immediately\n2. Do not pay the ransom\n3. Call IT Security immediately",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 6
      },
      {
        title: "Safe Web Browsing",
        description: "Identify malicious websites and practice safe browsing habits.",
        category: "Security Fundamentals",
        content: "# Safe Web Browsing\n\nMalicious websites can install malware or steal credentials.\n\n## URL Red Flags\n- Misspellings: paypa1.com, arnazon.com\n- Extra subdomains: login.microsoft.com.evil.com\n- HTTP (not HTTPS) for login pages\n\n## Safe Browsing Habits\n- Type URLs directly instead of clicking links\n- Check for the padlock icon (HTTPS)\n- Do not download software from unofficial sites\n- Keep your browser updated",
        durationMinutes: 3,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 7
      },
      {
        title: "Mobile Device Security",
        description: "Secure your smartphone and tablet against common threats.",
        category: "Security Fundamentals",
        content: "# Mobile Device Security\n\nMobile devices are increasingly targeted because they carry sensitive data.\n\n## Essential Security Steps\n- Use a strong PIN or biometric lock\n- Enable full-disk encryption\n- Keep OS and apps updated\n- Only install apps from official stores\n- Enable remote wipe capability\n\n## Mobile Phishing\nSMS phishing (smishing) is growing rapidly. The small screen makes it harder to spot fake URLs.",
        durationMinutes: 4,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 8
      },
      {
        title: "Business Email Compromise (BEC)",
        description: "Recognize and prevent costly BEC attacks including CEO fraud and wire transfer scams.",
        category: "Social Engineering",
        content: "# Business Email Compromise (BEC)\n\nBEC caused $2.9 billion in losses in 2023.\n\n## Common BEC Scenarios\n- CEO Fraud: Attacker impersonates CEO requesting urgent wire transfer\n- Vendor Impersonation: Fake invoice with changed bank details\n- Payroll Diversion: Request to change direct deposit\n\n## Red Flags\n- Urgency and secrecy\n- Request to bypass normal approval processes\n- New bank account or wire instructions\n\n## Defense\nAlways verify wire transfers via a phone call to a known number.",
        durationMinutes: 5,
        difficulty: "advanced",
        language: "en",
        isBuiltIn: true,
        sortOrder: 9
      },
      {
        title: "Insider Threat Awareness",
        description: "Understand how insider threats occur and how to report concerns safely.",
        category: "Threat Awareness",
        content: "# Insider Threat Awareness\n\nInsider threats account for 34% of all data breaches.\n\n## Types of Insider Threats\n- Malicious: Employee intentionally stealing data\n- Negligent: Employee accidentally exposing data\n- Compromised: Employee credentials stolen by an attacker\n\n## Warning Signs\n- Accessing data outside normal job scope\n- Downloading large amounts of data before resignation\n- Bypassing security controls\n\n## How to Report\nReport concerns to your manager, HR, or anonymously through the ethics hotline.",
        durationMinutes: 4,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 10
      },
      {
        title: "Physical Security & Tailgating",
        description: "Protect physical access to your workplace and prevent tailgating.",
        category: "Physical Security",
        content: "# Physical Security & Tailgating\n\nPhysical security breaches can be just as damaging as cyber attacks.\n\n## Tailgating\nNever hold doors open for people you do not recognize. Direct them to reception.\n\n## Clean Desk Policy\n- Lock your computer when away from your desk\n- Do not leave sensitive documents visible\n- Shred documents before discarding\n- Do not write passwords on sticky notes\n\n## Visitor Management\n- All visitors must sign in and wear a badge\n- Escort visitors at all times",
        durationMinutes: 3,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 11
      },
      {
        title: "Secure Remote Work Practices",
        description: "Stay secure while working from home or public locations.",
        category: "Security Fundamentals",
        content: "# Secure Remote Work Practices\n\nRemote work has expanded the attack surface significantly.\n\n## Home Network Security\n- Use your company VPN at all times\n- Change your router default password\n- Keep router firmware updated\n- Use WPA3 or WPA2 encryption\n\n## Physical Security at Home\n- Position your screen away from windows\n- Use a privacy screen filter\n- Lock your computer when stepping away\n\n## Video Calls\n- Be aware of what is visible in your background\n- Verify meeting links before joining",
        durationMinutes: 5,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 12
      },
      {
        title: "Cloud Security Basics",
        description: "Understand cloud security risks and best practices for using SaaS and cloud services.",
        category: "Cloud Security",
        content: "# Cloud Security Basics\n\nCloud services are convenient but introduce new security risks if misconfigured.\n\n## Shared Responsibility Model\n- Cloud provider: Secures the infrastructure\n- You: Secure your data, access controls, and configurations\n\n## Common Cloud Risks\n- Misconfigured public storage buckets\n- Weak or shared credentials\n- Excessive permissions\n- Shadow IT (unauthorized cloud services)\n\n## Best Practices\n- Use SSO and MFA for all cloud services\n- Review who has access to shared files regularly\n- Never store sensitive data in personal cloud accounts",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 13
      },
      {
        title: "Incident Reporting & Response",
        description: "Know when and how to report a security incident.",
        category: "Incident Response",
        content: "# Incident Reporting & Response\n\nFast reporting is critical. The average cost of a breach increases by 30% for every week it goes unreported.\n\n## What to Report\n- Clicked a phishing link\n- Opened a suspicious attachment\n- Lost or stolen device\n- Noticed unusual account activity\n\n## How to Report\n1. Do not panic\n2. Contact IT Security immediately\n3. Preserve evidence\n4. Document what happened and when\n\n## What Happens Next\nIT Security will investigate, contain the threat, and notify affected parties.",
        durationMinutes: 4,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 14
      },
      {
        title: "Vishing & Phone Scam Defense",
        description: "Recognize voice phishing and phone-based social engineering attacks.",
        category: "Social Engineering",
        content: "# Vishing & Phone Scam Defense\n\nVishing uses phone calls to steal credentials or financial information.\n\n## Common Vishing Scenarios\n- IT Support Scam: This is Microsoft support, we detected a virus\n- IRS Scam: You owe back taxes and will be arrested\n- Bank Fraud: We detected fraud, please verify your card number\n- Internal IT: This is the help desk, we need your password\n\n## Defense Rules\n- IT will NEVER ask for your password over the phone\n- Hang up and call back on a verified number\n- Report suspicious calls to IT Security",
        durationMinutes: 4,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 15
      },
      {
        title: "USB & Removable Media Security",
        description: "Understand the dangers of unknown USB devices and removable media.",
        category: "Physical Security",
        content: "# USB & Removable Media Security\n\nA USB drive found in a parking lot is one of the oldest attack vectors.\n\n## The Danger\nMalicious USB drives can automatically install malware, emulate a keyboard, or exfiltrate data silently.\n\n## The Rule\nNever plug in a USB drive you did not purchase yourself from a trusted retailer. This includes drives found in parking lots or received as gifts at conferences.\n\n## Authorized Media Only\nUse only company-approved storage devices. Use approved cloud storage for file transfers.",
        durationMinutes: 3,
        difficulty: "beginner",
        language: "en",
        isBuiltIn: true,
        sortOrder: 16
      },
      {
        title: "CMMC & DFARS Compliance Overview",
        description: "Security requirements for defense contractors under CMMC Level 2 and NIST 800-171.",
        category: "Compliance",
        content: "# CMMC & DFARS Compliance Overview\n\nDefense contractors handling Controlled Unclassified Information (CUI) must meet CMMC Level 2 requirements.\n\n## What is CMMC?\nCybersecurity Maturity Model Certification requiring contractors to implement 110 security practices from NIST SP 800-171.\n\n## Security Awareness Requirements\nNIST 800-171 Control 3.2.1 requires organizational personnel to be aware of security risks.\n\n## Phishing Simulation Requirement\nControl 3.2.2 requires training personnel to recognize and report potential indicators of insider threat.\n\n## Consequences of Non-Compliance\nLoss of DoD contracts and potential criminal charges under the False Claims Act.",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 17
      },
      {
        title: "NY DFS Part 500 Cybersecurity",
        description: "New York cybersecurity regulation requirements for financial services companies.",
        category: "Compliance",
        content: "# NY DFS Part 500 Cybersecurity Regulation\n\nNY DFS Part 500 applies to all financial services companies licensed in New York.\n\n## Training Requirements\n23 NYCRR 500.14(a) requires regular cybersecurity awareness training for all personnel.\n\n## What the Training Must Cover\n- Social engineering and phishing\n- Secure use of company systems\n- Password management\n- Incident reporting procedures\n\n## Annual Certification\nThe CISO must certify annually to the NY DFS Superintendent that the organization is in compliance.\n\n## Penalties\nNY DFS can impose fines of up to $1,000 per violation per day.",
        durationMinutes: 5,
        difficulty: "intermediate",
        language: "en",
        isBuiltIn: true,
        sortOrder: 18
      },
      {
        title: "Zero Trust Security Principles",
        description: "Understand the zero trust model and why perimeter-based security is obsolete.",
        category: "Advanced Security",
        content: "# Zero Trust Security Principles\n\nNever trust, always verify is the core principle of zero trust.\n\n## Why Zero Trust?\nTraditional perimeter security assumed everything inside the network was safe. Remote work and cloud have made this assumption dangerous.\n\n## Zero Trust Pillars\n- Identity: Verify every user with MFA, every time\n- Device: Only allow managed, compliant devices\n- Network: Micro-segment networks, assume breach\n- Application: Least-privilege access to each app\n\n## What This Means for You\n- You will be asked to authenticate more frequently\n- Access is granted based on need, not location",
        durationMinutes: 5,
        difficulty: "advanced",
        language: "en",
        isBuiltIn: true,
        sortOrder: 19
      }
    ];
  }
});

// server/seed.ts
var seed_exports = {};
__export(seed_exports, {
  seedDatabase: () => seedDatabase
});
async function seedDatabase() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(templates).limit(1);
  if (existing.length === 0) {
    console.log("[Seed] Seeding 100 phishing templates...");
    const mapped = seed_templates_default.map((t2) => ({
      orgId: null,
      createdByUserId: null,
      name: t2.name,
      subject: t2.subject,
      htmlBody: t2.htmlBody,
      language: t2.language ?? "en",
      attackType: t2.attackType ?? "credential_harvest",
      industry: t2.industry ?? null,
      difficulty: t2.difficulty ?? "medium",
      mspTenantId: null,
      isBuiltIn: true,
      isShared: false,
      isMspTemplate: false,
      tags: t2.tags ?? [],
      usageCount: 0
    }));
    for (let i = 0; i < mapped.length; i += 10) {
      const batch = mapped.slice(i, i + 10);
      await db.insert(templates).values(batch);
      console.log(`[Seed] Inserted templates ${i + 1}\u2013${Math.min(i + 10, mapped.length)}`);
    }
    console.log(`[Seed] \u2713 Inserted ${mapped.length} templates.`);
  } else {
    console.log("[Seed] Templates already seeded, skipping.");
  }
  const existingModules = await db.select().from(trainingModules).limit(1);
  if (existingModules.length === 0) {
    console.log("[Seed] Seeding training modules...");
    for (let i = 0; i < seed_modules_default.length; i += 10) {
      const batch = seed_modules_default.slice(i, i + 10);
      await db.insert(trainingModules).values(batch);
    }
    console.log(`[Seed] \u2713 Inserted ${seed_modules_default.length} training modules.`);
  } else {
    console.log("[Seed] Training modules already seeded, skipping.");
  }
}
var init_seed = __esm({
  "server/seed.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_seed_templates();
    init_seed_modules();
  }
});

// api/handler.ts
var import_express = __toESM(require("express"));
var import_express2 = require("@trpc/server/adapters/express");

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
init_db();

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
var import_cookie = require("cookie");
var import_jose = require("jose");
init_db();

// server/_core/env.ts
var ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN ?? ""
};

// server/_core/sdk.ts
var AuthService = class {
  getSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }
  async createSessionToken(openId, options = {}) {
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1e3);
    return new import_jose.SignJWT({ openId, name: options.name ?? "" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(this.getSecret());
  }
  async verifySession(cookieValue) {
    if (!cookieValue) return null;
    try {
      const { payload } = await (0, import_jose.jwtVerify)(cookieValue, this.getSecret(), {
        algorithms: ["HS256"]
      });
      const { openId, name } = payload;
      if (typeof openId !== "string" || !openId) return null;
      return { openId, name: typeof name === "string" ? name : "" };
    } catch {
      return null;
    }
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) return /* @__PURE__ */ new Map();
    const parsed = (0, import_cookie.parse)(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  async authenticateRequest(req) {
    const cookieHeader = req.headers?.cookie ?? req.headers?.Cookie;
    const cookies = this.parseCookies(cookieHeader);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) throw ForbiddenError("Invalid session");
    const user = await getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    upsertUser({ openId: user.openId, lastSignedIn: /* @__PURE__ */ new Date() }).catch(() => {
    });
    return user;
  }
};
var sdk = new AuthService();

// server/_core/oauth.ts
var import_crypto = require("crypto");
function hashPassword(password, salt) {
  return (0, import_crypto.createHash)("sha256").update(salt + password + salt).digest("hex");
}
function generateSalt() {
  return (0, import_crypto.randomBytes)(16).toString("hex");
}
function verifyPassword(password, salt, hash) {
  const computed = hashPassword(password, salt);
  try {
    return (0, import_crypto.timingSafeEqual)(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}
function getSessionCookieOptions(req) {
  const isSecure = req.protocol === "https" || req.headers?.["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
    maxAge: 365 * 24 * 60 * 60 * 1e3
    // 1 year
  };
}
function registerOAuthRoutes(app2) {
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "password must be at least 8 characters" });
      }
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      const openId = `local_${(0, import_crypto.randomBytes)(16).toString("hex")}`;
      await upsertUser({
        openId,
        name: name ?? email.split("@")[0],
        email,
        loginMethod: "email",
        passwordHash: `${salt}:${passwordHash}`,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const user = await getUserByOpenId(openId);
      if (!user) return res.status(500).json({ error: "Failed to create user" });
      const token = await sdk.createSessionToken(openId, { name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      console.error("[Auth] Register error:", err);
      return res.status(500).json({ error: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }
      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const [salt, hash] = user.passwordHash.split(":");
      if (!salt || !hash || !verifyPassword(password, salt, hash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      await upsertUser({ openId: user.openId, lastSignedIn: /* @__PURE__ */ new Date() });
      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      console.error("[Auth] Login error:", err);
      return res.status(500).json({ error: "Login failed" });
    }
  });
  app2.get("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.redirect("/");
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(_app) {
}

// server/routers.ts
var import_server2 = require("@trpc/server");
var import_cookie2 = require("cookie");
var import_nanoid2 = require("nanoid");
var import_zod2 = require("zod");

// server/_core/cookies.ts
function getSessionCookieOptions2(req) {
  const proto = req.headers?.["x-forwarded-proto"] ?? req.protocol ?? "http";
  const isSecure = proto === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
    maxAge: 365 * 24 * 60 * 60 * 1e3
    // 1 year
  };
}

// server/_core/heartbeat.ts
var import_nanoid = require("nanoid");
async function createHeartbeatJob(job, _userSession) {
  const taskUid = `local_${(0, import_nanoid.nanoid)(16)}`;
  console.log(`[Heartbeat] Created cron job stub: ${taskUid} (${job.cron}) \u2192 ${job.path}`);
  return { taskUid, nextExecutionAt: null };
}
async function deleteHeartbeatJob(taskUid, _userSession) {
  console.log(`[Heartbeat] Delete stub for: ${taskUid}`);
}
async function listHeartbeatJobs(_userSession, _pagination) {
  return { total: 0, actorUserId: "", jobs: [] };
}

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => "https://api.groq.com/openai/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "llama-3.3-70b-versatile",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 8192;
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.groqApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/_core/systemRouter.ts
var import_zod = require("zod");

// server/_core/notification.ts
async function notifyOwner(_input) {
  const msg = typeof _input === "string" ? _input : `${_input.title}: ${_input.content}`;
  console.warn("[Notification] notifyOwner stub:", msg);
  return false;
}

// server/_core/trpc.ts
var import_server = require("@trpc/server");
var import_superjson = __toESM(require("superjson"), 1);
var t = import_server.initTRPC.context().create({
  transformer: import_superjson.default
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new import_server.TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new import_server.TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    import_zod.z.object({
      timestamp: import_zod.z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    import_zod.z.object({
      title: import_zod.z.string().min(1, "title is required"),
      content: import_zod.z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_db();
init_db();
init_seed_templates();
init_seed_modules();
var BUILT_IN_TEMPLATES = seed_templates_default;
var BUILT_IN_TRAINING_MODULES = seed_modules_default;
async function requireOrgMember(orgId, userId, requireAdmin = false) {
  const member = await getOrgMember(orgId, userId);
  if (!member) throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
  if (requireAdmin && member.role !== "admin") throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return member;
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions2(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // ─── Organizations ──────────────────────────────────────────────────────────
  orgs: router({
    myOrgs: protectedProcedure.query(async ({ ctx }) => {
      return getUserOrgs(ctx.user.id);
    }),
    create: protectedProcedure.input(import_zod2.z.object({ name: import_zod2.z.string().min(2).max(100) })).mutation(async ({ ctx, input }) => {
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 50) + "-" + (0, import_nanoid2.nanoid)(6);
      return createOrganization({ name: input.name, slug, userId: ctx.user.id });
    }),
    get: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getOrgById(input.orgId);
    }),
    update: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      name: import_zod2.z.string().min(2).max(100).optional(),
      gamificationEnabled: import_zod2.z.boolean().optional(),
      trainingEnabled: import_zod2.z.boolean().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const { orgId, ...data } = input;
      await updateOrganization(orgId, data);
      return { success: true };
    }),
    members: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getOrgMembers(input.orgId);
    }),
    updateMemberRole: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), userId: import_zod2.z.number(), role: import_zod2.z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      await updateMemberRole(input.orgId, input.userId, input.role);
      return { success: true };
    }),
    removeMember: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), userId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      await removeMember(input.orgId, input.userId);
      return { success: true };
    }),
    invite: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), email: import_zod2.z.string().email(), role: import_zod2.z.enum(["admin", "member"]).default("member") })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const token = (0, import_nanoid2.nanoid)(64);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
      return createInvite({ orgId: input.orgId, email: input.email, token, role: input.role, expiresAt });
    }),
    invites: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      return getOrgInvites(input.orgId);
    }),
    acceptInvite: protectedProcedure.input(import_zod2.z.object({ token: import_zod2.z.string() })).mutation(async ({ ctx, input }) => {
      const invite = await getInviteByToken(input.token);
      if (!invite) throw new import_server2.TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      if (invite.expiresAt < /* @__PURE__ */ new Date()) throw new import_server2.TRPCError({ code: "BAD_REQUEST", message: "Invite expired" });
      if (invite.acceptedAt) throw new import_server2.TRPCError({ code: "BAD_REQUEST", message: "Invite already accepted" });
      await acceptInvite(input.token, ctx.user.id);
      return { success: true, orgId: invite.orgId };
    })
  }),
  // ─── Departments ────────────────────────────────────────────────────────────
  departments: router({
    list: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getDepartments(input.orgId);
    }),
    create: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), name: import_zod2.z.string().min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      return createDepartment(input.orgId, input.name);
    }),
    delete: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), departmentId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      await deleteDepartment(input.departmentId, input.orgId);
      return { success: true };
    })
  }),
  // ─── Targets ────────────────────────────────────────────────────────────────
  targets: router({
    list: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), departmentId: import_zod2.z.number().optional() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getTargets(input.orgId, input.departmentId);
    }),
    create: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      firstName: import_zod2.z.string().min(1),
      lastName: import_zod2.z.string().min(1),
      email: import_zod2.z.string().email(),
      title: import_zod2.z.string().optional(),
      departmentId: import_zod2.z.number().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      return createTarget({ ...input, isActive: true, title: input.title ?? null, departmentId: input.departmentId ?? null });
    }),
    update: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      targetId: import_zod2.z.number(),
      firstName: import_zod2.z.string().optional(),
      lastName: import_zod2.z.string().optional(),
      email: import_zod2.z.string().email().optional(),
      title: import_zod2.z.string().optional(),
      departmentId: import_zod2.z.number().nullable().optional(),
      isActive: import_zod2.z.boolean().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const { orgId, targetId, ...data } = input;
      await updateTarget(targetId, orgId, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), targetId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      await deleteTarget(input.targetId, input.orgId);
      return { success: true };
    }),
    bulkImport: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      targets: import_zod2.z.array(import_zod2.z.object({
        firstName: import_zod2.z.string(),
        lastName: import_zod2.z.string(),
        email: import_zod2.z.string().email(),
        title: import_zod2.z.string().optional(),
        departmentId: import_zod2.z.number().optional()
      }))
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const rows = input.targets.map((t2) => ({ ...t2, orgId: input.orgId, isActive: true }));
      const count = await bulkCreateTargets(rows);
      return { count };
    })
  }),
  // ─── Templates ──────────────────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      includeBuiltIn: import_zod2.z.boolean().default(true),
      includeCommunity: import_zod2.z.boolean().default(true),
      language: import_zod2.z.string().optional(),
      attackType: import_zod2.z.string().optional(),
      difficulty: import_zod2.z.string().optional(),
      industry: import_zod2.z.string().optional(),
      search: import_zod2.z.string().optional()
    })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const results = [];
      if (input.includeBuiltIn) {
        const builtIn = await getTemplates({ isBuiltIn: true, language: input.language, attackType: input.attackType, difficulty: input.difficulty, industry: input.industry });
        results.push(...builtIn.map((t2) => ({ ...t2, source: "built-in" })));
      }
      if (input.includeCommunity) {
        const community = await getTemplates({ isShared: true, language: input.language, attackType: input.attackType, difficulty: input.difficulty, industry: input.industry });
        results.push(...community.filter((t2) => !t2.isBuiltIn).map((t2) => ({ ...t2, source: "community" })));
      }
      const orgTemplates = await getTemplates({ orgId: input.orgId, language: input.language, attackType: input.attackType, difficulty: input.difficulty, industry: input.industry });
      results.push(...orgTemplates.filter((t2) => !t2.isBuiltIn).map((t2) => ({ ...t2, source: "org" })));
      const seen = /* @__PURE__ */ new Set();
      let deduped = results.filter((t2) => {
        if (seen.has(t2.id)) return false;
        seen.add(t2.id);
        return true;
      });
      if (input.search) {
        const q = input.search.toLowerCase();
        deduped = deduped.filter(
          (t2) => t2.name.toLowerCase().includes(q) || t2.subject.toLowerCase().includes(q) || t2.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return deduped;
    }),
    get: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), templateId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getTemplateById(input.templateId);
    }),
    generate: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      industry: import_zod2.z.string(),
      attackType: import_zod2.z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]),
      language: import_zod2.z.enum(["en", "es", "tr"]),
      difficulty: import_zod2.z.enum(["easy", "medium", "hard"]),
      context: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const langNames = { en: "English", es: "Spanish", tr: "Turkish" };
      const prompt = `You are a cybersecurity expert creating a realistic phishing simulation email for security awareness training.

Generate a phishing email template with these parameters:
- Industry: ${input.industry}
- Attack Type: ${input.attackType.replace(/_/g, " ")}
- Language: ${langNames[input.language]}
- Difficulty: ${input.difficulty}
${input.context ? `- Additional context: ${input.context}` : ""}

Return a JSON object with:
{
  "name": "Template name (descriptive, 3-6 words)",
  "subject": "Email subject line",
  "htmlBody": "Full HTML email body (realistic, professional-looking, with a phishing link placeholder {{TRACKING_LINK}})",
  "tags": ["tag1", "tag2"]
}

Make it realistic and educational. The email should look authentic but contain subtle red flags for training purposes.`;
      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "phishing_template",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                subject: { type: "string" },
                htmlBody: { type: "string" },
                tags: { type: "array", items: { type: "string" } }
              },
              required: ["name", "subject", "htmlBody", "tags"],
              additionalProperties: false
            }
          }
        }
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI generation failed" });
      const parsed = JSON.parse(content);
      return parsed;
    }),
    create: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      name: import_zod2.z.string().min(1),
      subject: import_zod2.z.string().min(1),
      htmlBody: import_zod2.z.string().min(1),
      language: import_zod2.z.enum(["en", "es", "tr"]).default("en"),
      attackType: import_zod2.z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]).default("credential_harvest"),
      industry: import_zod2.z.string().optional(),
      difficulty: import_zod2.z.enum(["easy", "medium", "hard"]).default("medium"),
      isShared: import_zod2.z.boolean().default(false),
      tags: import_zod2.z.array(import_zod2.z.string()).default([])
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return createTemplate({ ...input, industry: input.industry ?? null, createdByUserId: ctx.user.id, isBuiltIn: false, isMspTemplate: false, mspTenantId: null });
    }),
    update: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      templateId: import_zod2.z.number(),
      name: import_zod2.z.string().optional(),
      subject: import_zod2.z.string().optional(),
      htmlBody: import_zod2.z.string().optional(),
      language: import_zod2.z.enum(["en", "es", "tr"]).optional(),
      attackType: import_zod2.z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]).optional(),
      industry: import_zod2.z.string().optional(),
      difficulty: import_zod2.z.enum(["easy", "medium", "hard"]).optional(),
      isShared: import_zod2.z.boolean().optional(),
      tags: import_zod2.z.array(import_zod2.z.string()).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const { orgId, templateId, ...data } = input;
      await updateTemplate(templateId, orgId, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), templateId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      await deleteTemplate(input.templateId, input.orgId);
      return { success: true };
    }),
    forkToOrg: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), templateId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const source = await getTemplateById(input.templateId);
      if (!source) throw new import_server2.TRPCError({ code: "NOT_FOUND" });
      await incrementTemplateUsage(input.templateId);
      return createTemplate({
        orgId: input.orgId,
        createdByUserId: ctx.user.id,
        name: `${source.name} (copy)`,
        subject: source.subject,
        htmlBody: source.htmlBody,
        language: source.language,
        attackType: source.attackType,
        industry: source.industry,
        difficulty: source.difficulty,
        isBuiltIn: false,
        isShared: false,
        isMspTemplate: false,
        mspTenantId: null,
        tags: source.tags
      });
    })
  }),
  // ─── Campaigns ──────────────────────────────────────────────────────────────
  campaigns: router({
    list: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getCampaigns(input.orgId);
    }),
    get: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), campaignId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const campaign = await getCampaignById(input.campaignId, input.orgId);
      if (!campaign) throw new import_server2.TRPCError({ code: "NOT_FOUND" });
      const results = await getCampaignResults(input.campaignId);
      const template = campaign.templateId ? await getTemplateById(campaign.templateId) : null;
      const allTargets = campaign.targetIds && campaign.targetIds.length > 0 ? await getTargets(input.orgId) : [];
      const campaignTargets = allTargets.filter((t2) => (campaign.targetIds ?? []).includes(t2.id));
      return { campaign, results, template: template ?? null, targets: campaignTargets };
    }),
    create: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      name: import_zod2.z.string().min(1),
      templateId: import_zod2.z.number().optional(),
      language: import_zod2.z.enum(["en", "es", "tr"]).default("en"),
      targetDepartmentIds: import_zod2.z.array(import_zod2.z.number()).default([]),
      targetIds: import_zod2.z.array(import_zod2.z.number()).default([]),
      scheduledAt: import_zod2.z.number().optional(),
      // unix ms
      senderName: import_zod2.z.string().optional(),
      senderEmail: import_zod2.z.string().email().optional(),
      notes: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      return createCampaign({
        orgId: input.orgId,
        createdByUserId: ctx.user.id,
        name: input.name,
        templateId: input.templateId ?? null,
        status: input.scheduledAt ? "scheduled" : "draft",
        language: input.language,
        targetDepartmentIds: input.targetDepartmentIds,
        targetIds: input.targetIds,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        completedAt: null,
        isRecurring: false,
        cronExpression: null,
        scheduleCronTaskUid: null,
        senderName: input.senderName ?? null,
        senderEmail: input.senderEmail ?? null,
        trackingDomain: null,
        notes: input.notes ?? null
      });
    }),
    update: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      campaignId: import_zod2.z.number(),
      name: import_zod2.z.string().optional(),
      status: import_zod2.z.enum(["draft", "scheduled", "active", "completed", "paused"]).optional(),
      templateId: import_zod2.z.number().optional(),
      scheduledAt: import_zod2.z.number().nullable().optional(),
      senderName: import_zod2.z.string().optional(),
      senderEmail: import_zod2.z.string().email().optional(),
      notes: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const { orgId, campaignId, scheduledAt, ...rest } = input;
      await updateCampaign(campaignId, orgId, {
        ...rest,
        ...scheduledAt !== void 0 ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), campaignId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      await deleteCampaign(input.campaignId, input.orgId);
      return { success: true };
    }),
    schedule: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      campaignId: import_zod2.z.number(),
      cronExpression: import_zod2.z.string(),
      description: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const campaign = await getCampaignById(input.campaignId, input.orgId);
      if (!campaign) throw new import_server2.TRPCError({ code: "NOT_FOUND" });
      const sessionToken = (0, import_cookie2.parse)(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      const job = await createHeartbeatJob({
        name: `campaign-${campaign.id}-${(0, import_nanoid2.nanoid)(6)}`,
        cron: input.cronExpression,
        path: "/api/scheduled/campaign",
        payload: { campaignId: campaign.id, orgId: input.orgId },
        description: input.description ?? `Recurring campaign: ${campaign.name}`
      }, sessionToken);
      await updateCampaign(input.campaignId, input.orgId, {
        isRecurring: true,
        cronExpression: input.cronExpression,
        scheduleCronTaskUid: job.taskUid,
        status: "scheduled"
      });
      return { success: true, taskUid: job.taskUid };
    }),
    unschedule: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), campaignId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id, true);
      const campaign = await getCampaignById(input.campaignId, input.orgId);
      if (!campaign?.scheduleCronTaskUid) throw new import_server2.TRPCError({ code: "NOT_FOUND" });
      const sessionToken = (0, import_cookie2.parse)(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      await deleteHeartbeatJob(campaign.scheduleCronTaskUid, sessionToken);
      await updateCampaign(input.campaignId, input.orgId, {
        isRecurring: false,
        cronExpression: null,
        scheduleCronTaskUid: null,
        status: "draft"
      });
      return { success: true };
    }),
    listScheduled: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const sessionToken = (0, import_cookie2.parse)(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      try {
        const jobs = await listHeartbeatJobs(sessionToken);
        return jobs;
      } catch {
        return { total: 0, actorUserId: "", jobs: [] };
      }
    })
  }),
  // ─── Analytics ──────────────────────────────────────────────────────────────
  analytics: router({
    overview: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const stats = await getOrgAnalytics(input.orgId);
      const campaigns2 = await getCampaigns(input.orgId);
      const postureScore = await getOrgPostureScore(input.orgId);
      return { stats, campaignCount: campaigns2.length, postureScore };
    }),
    campaignDetail: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), campaignId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const results = await getCampaignResults(input.campaignId);
      const total = results.length;
      const sent = results.filter((r) => r.emailSentAt).length;
      const opened = results.filter((r) => r.emailOpenedAt).length;
      const clicked = results.filter((r) => r.linkClickedAt).length;
      const submitted = results.filter((r) => r.credentialSubmittedAt).length;
      const reported = results.filter((r) => r.reportedAt).length;
      return {
        total,
        sent,
        opened,
        clicked,
        submitted,
        reported,
        openRate: sent > 0 ? Math.round(opened / sent * 100) : 0,
        clickRate: sent > 0 ? Math.round(clicked / sent * 100) : 0,
        submitRate: sent > 0 ? Math.round(submitted / sent * 100) : 0,
        reportRate: sent > 0 ? Math.round(reported / sent * 100) : 0
      };
    }),
    campaignTrend: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const allCampaigns = await getCampaigns(input.orgId);
      const completed = allCampaigns.filter((c) => c.status === "completed" || c.status === "active").slice(-10);
      const trend = await Promise.all(
        completed.map(async (c) => {
          const results = await getCampaignResults(c.id);
          const sent = results.filter((r) => r.emailSentAt).length;
          const opened = results.filter((r) => r.emailOpenedAt).length;
          const clicked = results.filter((r) => r.linkClickedAt).length;
          const submitted = results.filter((r) => r.credentialSubmittedAt).length;
          return {
            name: c.name.length > 16 ? c.name.slice(0, 16) + "\u2026" : c.name,
            openRate: sent > 0 ? Math.round(opened / sent * 100) : 0,
            clickRate: sent > 0 ? Math.round(clicked / sent * 100) : 0,
            submitRate: sent > 0 ? Math.round(submitted / sent * 100) : 0,
            date: c.createdAt
          };
        })
      );
      return trend;
    }),
    deptBreakdown: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const depts = await getDepartments(input.orgId);
      const breakdown = await Promise.all(
        depts.map(async (dept) => {
          const targets2 = await getTargets(input.orgId, dept.id);
          const targetIds = targets2.map((t2) => t2.id);
          if (targetIds.length === 0) return { dept: dept.name, clickRate: 0, openRate: 0, submitRate: 0, count: 0 };
          const db = await getDb();
          if (!db) return { dept: dept.name, clickRate: 0, openRate: 0, submitRate: 0, count: 0 };
          const { campaignResults: cr } = await Promise.resolve().then(() => (init_schema(), schema_exports));
          const { inArray: inArray2 } = await import("drizzle-orm");
          const results = await db.select().from(cr).where(inArray2(cr.targetId, targetIds));
          const sent = results.filter((r) => r.emailSentAt).length;
          const opened = results.filter((r) => r.emailOpenedAt).length;
          const clicked = results.filter((r) => r.linkClickedAt).length;
          const submitted = results.filter((r) => r.credentialSubmittedAt).length;
          return {
            dept: dept.name,
            clickRate: sent > 0 ? Math.round(clicked / sent * 100) : 0,
            openRate: sent > 0 ? Math.round(opened / sent * 100) : 0,
            submitRate: sent > 0 ? Math.round(submitted / sent * 100) : 0,
            count: targets2.length
          };
        })
      );
      return breakdown;
    })
  }),
  // ─── Training ───────────────────────────────────────────────────────────────
  training: router({
    modules: publicProcedure.input(import_zod2.z.object({ language: import_zod2.z.string().optional() })).query(async ({ input }) => {
      return getTrainingModules(input.language);
    }),
    module: publicProcedure.input(import_zod2.z.object({ moduleId: import_zod2.z.number() })).query(async ({ input }) => {
      return getTrainingModuleById(input.moduleId);
    }),
    complete: protectedProcedure.input(import_zod2.z.object({
      orgId: import_zod2.z.number(),
      moduleId: import_zod2.z.number(),
      score: import_zod2.z.number().min(0).max(100).optional(),
      timeSpentSeconds: import_zod2.z.number().optional(),
      targetId: import_zod2.z.number().optional()
    })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      await recordTrainingCompletion({
        orgId: input.orgId,
        moduleId: input.moduleId,
        userId: ctx.user.id,
        targetId: input.targetId ?? null,
        score: input.score ?? null,
        timeSpentSeconds: input.timeSpentSeconds ?? null
      });
      return { success: true };
    }),
    completions: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), targetId: import_zod2.z.number().optional() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      return getTrainingCompletions(input.orgId, input.targetId);
    })
  }),
  // ─── Gamification ───────────────────────────────────────────────────────────
  gamification: router({
    leaderboard: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const scores = await getGamificationScores(input.orgId);
      const postureScore = await getOrgPostureScore(input.orgId);
      return { scores, postureScore };
    })
  }),
  // ─── Compliance ─────────────────────────────────────────────────────────────
  compliance: router({
    // Get all compliance records for an org+framework
    getRecords: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), frameworkId: import_zod2.z.string() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const db = await getDb();
      if (!db) return [];
      const { complianceRecords: complianceRecords2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { and: and2, eq: eq2 } = await import("drizzle-orm");
      return db.select().from(complianceRecords2).where(
        and2(eq2(complianceRecords2.orgId, input.orgId), eq2(complianceRecords2.frameworkId, input.frameworkId))
      );
    }),
    // Get all compliance records for an org (all frameworks)
    getAllRecords: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const db = await getDb();
      if (!db) return [];
      const { complianceRecords: complianceRecords2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      return db.select().from(complianceRecords2).where(eq2(complianceRecords2.orgId, input.orgId));
    }),
    // Toggle a procedure requirement on/off
    toggleProcedure: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), frameworkId: import_zod2.z.string(), procedureId: import_zod2.z.string(), completed: import_zod2.z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { complianceRecords: complianceRecords2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { and: and2, eq: eq2 } = await import("drizzle-orm");
      const existing = await db.select().from(complianceRecords2).where(
        and2(
          eq2(complianceRecords2.orgId, input.orgId),
          eq2(complianceRecords2.frameworkId, input.frameworkId),
          eq2(complianceRecords2.procedureId, input.procedureId)
        )
      ).limit(1);
      if (existing.length > 0) {
        await db.update(complianceRecords2).set({
          completed: input.completed ? 1 : 0,
          completedAt: input.completed ? /* @__PURE__ */ new Date() : null,
          completedBy: input.completed ? ctx.user.id : null
        }).where(eq2(complianceRecords2.id, existing[0].id));
      } else {
        await db.insert(complianceRecords2).values({
          orgId: input.orgId,
          frameworkId: input.frameworkId,
          procedureId: input.procedureId,
          completed: input.completed ? 1 : 0,
          completedAt: input.completed ? /* @__PURE__ */ new Date() : null,
          completedBy: input.completed ? ctx.user.id : null
        });
      }
      return { success: true };
    }),
    // Record a certificate issuance
    issueCertificate: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number(), frameworkId: import_zod2.z.string(), certId: import_zod2.z.string(), completedCount: import_zod2.z.number(), totalCount: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { complianceCertificates: complianceCertificates2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      await db.insert(complianceCertificates2).values({
        orgId: input.orgId,
        frameworkId: input.frameworkId,
        certId: input.certId,
        completedCount: input.completedCount,
        totalCount: input.totalCount,
        issuedBy: ctx.user.id
      });
      return { success: true, certId: input.certId };
    }),
    // List issued certificates for an org
    getCertificates: protectedProcedure.input(import_zod2.z.object({ orgId: import_zod2.z.number() })).query(async ({ ctx, input }) => {
      await requireOrgMember(input.orgId, ctx.user.id);
      const db = await getDb();
      if (!db) return [];
      const { complianceCertificates: complianceCertificates2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, desc: desc2 } = await import("drizzle-orm");
      return db.select().from(complianceCertificates2).where(eq2(complianceCertificates2.orgId, input.orgId)).orderBy(desc2(complianceCertificates2.issuedAt));
    })
  }),
  // ─── MSP ────────────────────────────────────────────────────────────────────
  msp: router({
    // Get current user's MSP tenant (or null)
    getMyTenant: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const { mspTenants: mspTenants2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const rows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      return rows[0] ?? null;
    }),
    // Register as an MSP
    register: protectedProcedure.input(import_zod2.z.object({
      companyName: import_zod2.z.string().min(2),
      contactEmail: import_zod2.z.string().email(),
      contactPhone: import_zod2.z.string().optional(),
      website: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const existing = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (existing[0]) throw new import_server2.TRPCError({ code: "CONFLICT", message: "Already registered as MSP" });
      await db.insert(mspTenants2).values({
        ownerUserId: ctx.user.id,
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        website: input.website ?? null,
        status: "trial",
        maxCustomers: 10
      });
      const rows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      return rows[0];
    }),
    // Update MSP branding
    updateBranding: protectedProcedure.input(import_zod2.z.object({
      brandName: import_zod2.z.string().optional(),
      brandLogoUrl: import_zod2.z.string().optional(),
      brandPrimaryColor: import_zod2.z.string().optional(),
      brandSupportEmail: import_zod2.z.string().email().optional(),
      brandCustomDomain: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const rows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!rows[0]) throw new import_server2.TRPCError({ code: "NOT_FOUND", message: "MSP tenant not found" });
      await db.update(mspTenants2).set({
        brandName: input.brandName ?? rows[0].brandName,
        brandLogoUrl: input.brandLogoUrl ?? rows[0].brandLogoUrl,
        brandPrimaryColor: input.brandPrimaryColor ?? rows[0].brandPrimaryColor,
        brandSupportEmail: input.brandSupportEmail ?? rows[0].brandSupportEmail,
        brandCustomDomain: input.brandCustomDomain ?? rows[0].brandCustomDomain
      }).where(eq2(mspTenants2.ownerUserId, ctx.user.id));
      return { success: true };
    }),
    // List all customer orgs for this MSP
    listCustomers: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2, organizations: organizations2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const tenant = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenant[0]) return [];
      const customers = await db.select({ customer: mspCustomerOrgs2, org: organizations2 }).from(mspCustomerOrgs2).leftJoin(organizations2, eq2(mspCustomerOrgs2.orgId, organizations2.id)).where(eq2(mspCustomerOrgs2.mspTenantId, tenant[0].id));
      return customers;
    }),
    // Provision a new customer org
    provisionCustomer: protectedProcedure.input(import_zod2.z.object({
      orgName: import_zod2.z.string().min(2),
      orgSlug: import_zod2.z.string().min(2).regex(/^[a-z0-9-]+$/),
      adminEmail: import_zod2.z.string().email(),
      plan: import_zod2.z.enum(["starter", "professional", "enterprise"]).default("starter"),
      notes: import_zod2.z.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2, mspActivityLog: mspActivityLog2, organizations: organizations2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "Not an MSP" });
      const tenant = tenantRows[0];
      const existing = await db.select().from(mspCustomerOrgs2).where(eq2(mspCustomerOrgs2.mspTenantId, tenant.id));
      if (existing.length >= tenant.maxCustomers) throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "Customer limit reached" });
      const slugCheck = await db.select().from(organizations2).where(eq2(organizations2.slug, input.orgSlug)).limit(1);
      if (slugCheck[0]) throw new import_server2.TRPCError({ code: "CONFLICT", message: "Organization slug already taken" });
      await db.insert(organizations2).values({
        name: input.orgName,
        slug: input.orgSlug,
        gamificationEnabled: false,
        trainingEnabled: true
      });
      const orgRows = await db.select().from(organizations2).where(eq2(organizations2.slug, input.orgSlug)).limit(1);
      const org = orgRows[0];
      if (!org) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(mspCustomerOrgs2).values({
        mspTenantId: tenant.id,
        orgId: org.id,
        plan: input.plan,
        status: "active",
        adminEmail: input.adminEmail,
        notes: input.notes ?? null
      });
      await db.insert(mspActivityLog2).values({
        mspTenantId: tenant.id,
        actorUserId: ctx.user.id,
        action: "provision_customer",
        targetOrgId: org.id,
        details: `Provisioned org '${input.orgName}' (${input.orgSlug}) for ${input.adminEmail}`
      });
      return { success: true, orgId: org.id, orgSlug: org.slug };
    }),
    // Update customer status (suspend/activate)
    updateCustomerStatus: protectedProcedure.input(import_zod2.z.object({
      customerOrgId: import_zod2.z.number(),
      status: import_zod2.z.enum(["active", "suspended", "pending"])
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2, mspActivityLog: mspActivityLog2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN" });
      await db.update(mspCustomerOrgs2).set({ status: input.status }).where(and2(eq2(mspCustomerOrgs2.id, input.customerOrgId), eq2(mspCustomerOrgs2.mspTenantId, tenantRows[0].id)));
      await db.insert(mspActivityLog2).values({
        mspTenantId: tenantRows[0].id,
        actorUserId: ctx.user.id,
        action: `set_status_${input.status}`,
        targetOrgId: input.customerOrgId,
        details: `Set customer org ${input.customerOrgId} status to ${input.status}`
      });
      return { success: true };
    }),
    // Impersonate a customer org (store orgId in session-like response)
    impersonateCustomer: protectedProcedure.input(import_zod2.z.object({ customerOrgId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2, mspActivityLog: mspActivityLog2, organizations: organizations2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "Not an MSP" });
      const customerRows = await db.select({ customer: mspCustomerOrgs2, org: organizations2 }).from(mspCustomerOrgs2).leftJoin(organizations2, eq2(mspCustomerOrgs2.orgId, organizations2.id)).where(and2(eq2(mspCustomerOrgs2.id, input.customerOrgId), eq2(mspCustomerOrgs2.mspTenantId, tenantRows[0].id))).limit(1);
      if (!customerRows[0]) throw new import_server2.TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      await db.insert(mspActivityLog2).values({
        mspTenantId: tenantRows[0].id,
        actorUserId: ctx.user.id,
        action: "impersonate_customer",
        targetOrgId: customerRows[0].customer.orgId,
        details: `MSP admin accessed customer org '${customerRows[0].org?.name ?? customerRows[0].customer.orgId}' dashboard`
      });
      return {
        success: true,
        orgId: customerRows[0].customer.orgId,
        orgName: customerRows[0].org?.name ?? "Unknown",
        orgSlug: customerRows[0].org?.slug ?? ""
      };
    }),
    // Aggregate analytics across all customer orgs
    getAggregateAnalytics: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalCustomers: 0, activeCustomers: 0, totalCampaigns: 0, avgClickRate: 0, atRiskOrgs: 0 };
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2, campaigns: campaigns2, campaignResults: campaignResults2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, count, sql: sql2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) return { totalCustomers: 0, activeCustomers: 0, totalCampaigns: 0, avgClickRate: 0, atRiskOrgs: 0 };
      const customerRows = await db.select().from(mspCustomerOrgs2).where(eq2(mspCustomerOrgs2.mspTenantId, tenantRows[0].id));
      const totalCustomers = customerRows.length;
      const activeCustomers = customerRows.filter((c) => c.status === "active").length;
      const orgIds = customerRows.map((c) => c.orgId).filter(Boolean);
      if (orgIds.length === 0) return { totalCustomers, activeCustomers, totalCampaigns: 0, avgClickRate: 0, atRiskOrgs: 0 };
      const campaignRows = await db.select({ orgId: campaigns2.orgId, id: campaigns2.id }).from(campaigns2).where(sql2`${campaigns2.orgId} IN (${sql2.join(orgIds.map((id) => sql2`${id}`), sql2`, `)})`);
      const totalCampaigns = campaignRows.length;
      const resultRows = await db.select().from(campaignResults2).where(sql2`${campaignResults2.campaignId} IN (${sql2.join(campaignRows.map((c) => sql2`${c.id}`), sql2`, `)})`);
      const sent = resultRows.length;
      const clicked = resultRows.filter((r) => r.linkClickedAt !== null).length;
      const avgClickRate = sent > 0 ? Math.round(clicked / sent * 100) : 0;
      const atRiskOrgs = orgIds.filter((orgId) => {
        const orgResults = resultRows.filter((r) => campaignRows.find((c) => c.orgId === orgId && c.id === r.campaignId));
        const orgSent = orgResults.length;
        const orgClicked = orgResults.filter((r) => r.linkClickedAt !== null).length;
        return orgSent > 0 && orgClicked / orgSent > 0.3;
      }).length;
      return { totalCustomers, activeCustomers, totalCampaigns, avgClickRate, atRiskOrgs };
    }),
    // ─── MSP Template Library ────────────────────────────────────────────────
    // List all MSP-private templates for this MSP tenant
    listMspTemplates: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { mspTenants: mspTenants2, templates: templates2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) return [];
      return db.select().from(templates2).where(eq2(templates2.mspTenantId, tenantRows[0].id));
    }),
    // Create a new MSP template
    createMspTemplate: protectedProcedure.input(import_zod2.z.object({
      name: import_zod2.z.string().min(1),
      subject: import_zod2.z.string().min(1),
      htmlBody: import_zod2.z.string().min(1),
      attackType: import_zod2.z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]).default("credential_harvest"),
      difficulty: import_zod2.z.enum(["easy", "medium", "hard"]).default("medium"),
      industry: import_zod2.z.string().optional(),
      tags: import_zod2.z.array(import_zod2.z.string()).default([])
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN", message: "MSP account required" });
      return createTemplate({
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        language: "en",
        attackType: input.attackType,
        difficulty: input.difficulty,
        industry: input.industry ?? null,
        tags: input.tags,
        orgId: null,
        createdByUserId: ctx.user.id,
        isBuiltIn: false,
        isShared: false,
        isMspTemplate: true,
        mspTenantId: tenantRows[0].id
      });
    }),
    // Delete an MSP template
    deleteMspTemplate: protectedProcedure.input(import_zod2.z.object({ templateId: import_zod2.z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2, templates: templates2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN" });
      await db.delete(templates2).where(and2(eq2(templates2.id, input.templateId), eq2(templates2.mspTenantId, tenantRows[0].id)));
      return { success: true };
    }),
    // Push an MSP template to one or all customer orgs
    pushTemplateToCustomers: protectedProcedure.input(import_zod2.z.object({
      templateId: import_zod2.z.number(),
      targetOrgIds: import_zod2.z.array(import_zod2.z.number()).optional()
      // empty = push to all customers
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new import_server2.TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { mspTenants: mspTenants2, mspCustomerOrgs: mspCustomerOrgs2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) throw new import_server2.TRPCError({ code: "FORBIDDEN" });
      const source = await getTemplateById(input.templateId);
      if (!source || source.mspTenantId !== tenantRows[0].id) throw new import_server2.TRPCError({ code: "NOT_FOUND" });
      let targetOrgIds = input.targetOrgIds ?? [];
      if (targetOrgIds.length === 0) {
        const customers = await db.select().from(mspCustomerOrgs2).where(eq2(mspCustomerOrgs2.mspTenantId, tenantRows[0].id));
        targetOrgIds = customers.map((c) => c.orgId);
      }
      let pushed = 0;
      for (const orgId of targetOrgIds) {
        await createTemplate({
          orgId,
          createdByUserId: ctx.user.id,
          name: source.name,
          subject: source.subject,
          htmlBody: source.htmlBody,
          language: source.language,
          attackType: source.attackType,
          industry: source.industry,
          difficulty: source.difficulty,
          isBuiltIn: false,
          isShared: false,
          isMspTemplate: false,
          mspTenantId: null,
          tags: source.tags
        });
        pushed++;
      }
      return { pushed };
    }),
    // Get activity log
    getActivityLog: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { mspTenants: mspTenants2, mspActivityLog: mspActivityLog2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { eq: eq2, desc: desc2 } = await import("drizzle-orm");
      const tenantRows = await db.select().from(mspTenants2).where(eq2(mspTenants2.ownerUserId, ctx.user.id)).limit(1);
      if (!tenantRows[0]) return [];
      return db.select().from(mspActivityLog2).where(eq2(mspActivityLog2.mspTenantId, tenantRows[0].id)).orderBy(desc2(mspActivityLog2.createdAt)).limit(100);
    })
  }),
  // ─── Seed ───────────────────────────────────────────────────────────────────
  seed: router({
    seedBuiltIns: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new import_server2.TRPCError({ code: "FORBIDDEN" });
      for (const t2 of BUILT_IN_TEMPLATES) {
        await createTemplate({ ...t2, isBuiltIn: true, isShared: false, orgId: null, createdByUserId: null });
      }
      const db2 = await getDb();
      if (db2) {
        const { trainingModules: trainingModules2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
        for (const m of BUILT_IN_TRAINING_MODULES) {
          const existing = await getTrainingModules();
          if (!existing.find((e) => e.title === m.title)) {
            await db2.insert(trainingModules2).values(m);
          }
        }
      }
      return { success: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/scheduledHandlers.ts
async function scheduledCampaignHandler(req, res) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    console.log(`[Scheduled Campaign] Cron triggered at ${(/* @__PURE__ */ new Date()).toISOString()}`);
    return res.json({
      success: true,
      triggeredAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: "Cron handler executed successfully"
    });
  } catch (err) {
    console.error("[Scheduled Campaign] Error:", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}

// api/handler.ts
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "phishsim-ai",
    timestamp: Date.now()
  });
});
app.post("/api/scheduled/campaign", scheduledCampaignHandler);
app.post("/api/admin/seed", async (_req, res) => {
  try {
    const { seedDatabase: seedDatabase2 } = await Promise.resolve().then(() => (init_seed(), seed_exports));
    await seedDatabase2();
    res.json({ success: true, message: "Database seeded successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});
app.use(
  "/api/trpc",
  (0, import_express2.createExpressMiddleware)({ router: appRouter, createContext })
);
module.exports = app;
