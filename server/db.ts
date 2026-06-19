import { connect } from "@tidbcloud/serverless";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleTidb } from "drizzle-orm/tidb-serverless";
import mysql from "mysql2/promise";
import {
  Campaign,
  CampaignResult,
  Department,
  GamificationScore,
  InsertUser,
  Invite,
  OrgMember,
  Organization,
  Target,
  Template,
  TrainingCompletion,
  TrainingModule,
  campaignResults,
  campaigns,
  departments,
  gamificationScores,
  invites,
  orgMembers,
  organizations,
  targets,
  templates,
  trainingCompletions,
  trainingModules,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzleMysql> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;
let _tidbClient: ReturnType<typeof connect> | null = null;

function normalizeDatabaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const port = url.port ? `:${url.port}` : "";
  return `mysql://${url.username}:${url.password}@${url.hostname}${port}${url.pathname}`;
}

function formatDbError(error: unknown): string {
  if (error instanceof DrizzleQueryError && error.cause) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "object"
          ? JSON.stringify(error.cause)
          : String(error.cause);
    return `${error.message} | ${cause}`;
  }
  if (error instanceof Error && error.cause instanceof Error) {
    return `${error.message} | ${error.cause.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function buildPoolOptions(): mysql.PoolOptions {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is not set");

  const url = new URL(normalizeDatabaseUrl(rawUrl));
  const isServerless = Boolean(process.env.VERCEL);

  return {
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    waitForConnections: true,
    connectionLimit: isServerless ? 1 : 5,
    maxIdle: 0,
    idleTimeout: 10_000,
    enableKeepAlive: true,
    connectTimeout: 10_000,
    // TiDB Cloud requires TLS; explicit config avoids mysql2 URI/ssl param conflicts.
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (process.env.VERCEL) {
        // HTTP driver — works from Vercel without TiDB IP allowlist.
        _tidbClient = connect({ url: normalizeDatabaseUrl(process.env.DATABASE_URL) });
        _db = drizzleTidb({ client: _tidbClient }) as ReturnType<typeof drizzleMysql>;
      } else {
        _pool = mysql.createPool(buildPoolOptions());
        _db = drizzleMysql(_pool as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    } catch (error) {
      console.warn("[Database] Failed to create connection:", error);
      _db = null;
      _pool = null;
      _tidbClient = null;
    }
  }
  return _db;
}

export async function pingDb(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    if (!db) return { ok: false, error: "DATABASE_URL missing or pool unavailable" };
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  } catch (error) {
    const detail = formatDbError(error);
    console.warn("[Database] Ping failed:", detail);
    return { ok: false, error: detail };
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Organizations ────────────────────────────────────────────────────────────
export async function createOrganization(data: { name: string; slug: string; userId: number }): Promise<Organization> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(organizations).values({ name: data.name, slug: data.slug });
  const orgId = (result as any).insertId as number;
  await db.insert(orgMembers).values({ orgId, userId: data.userId, role: "admin" });
  // Seed default departments
  const defaultDepts = ["Finance", "Sales", "Management", "Operations", "Warehouse"];
  await db.insert(departments).values(defaultDepts.map(name => ({ orgId, name, isDefault: true })));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return org;
}

export async function getOrgById(id: number): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  return org;
}

export async function getOrgBySlug(slug: string): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  return org;
}

export async function getUserOrgs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ org: organizations, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId));
  return rows;
}

export async function updateOrganization(id: number, data: Partial<Pick<Organization, "name" | "gamificationEnabled" | "trainingEnabled" | "logoUrl">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(organizations).set(data).where(eq(organizations.id, id));
}

export async function getOrgMember(orgId: number, userId: number): Promise<OrgMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [member] = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  return member;
}

export async function getOrgMembers(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ member: orgMembers, user: users })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId));
}

export async function updateMemberRole(orgId: number, userId: number, role: "admin" | "member") {
  const db = await getDb();
  if (!db) return;
  await db.update(orgMembers).set({ role }).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}

export async function removeMember(orgId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}

// ─── Invites ──────────────────────────────────────────────────────────────────
export async function createInvite(data: { orgId: number; email: string; token: string; role: "admin" | "member"; expiresAt: Date }): Promise<Invite> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(invites).values(data);
  const [invite] = await db.select().from(invites).where(eq(invites.token, data.token));
  return invite;
}

export async function getInviteByToken(token: string): Promise<Invite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [invite] = await db.select().from(invites).where(eq(invites.token, token));
  return invite;
}

export async function acceptInvite(token: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  const invite = await getInviteByToken(token);
  if (!invite || invite.acceptedAt) return;
  await db.insert(orgMembers).values({ orgId: invite.orgId, userId, role: invite.role });
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.token, token));
}

export async function getOrgInvites(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invites).where(eq(invites.orgId, orgId)).orderBy(desc(invites.createdAt));
}

// ─── Departments ──────────────────────────────────────────────────────────────
export async function getDepartments(orgId: number): Promise<Department[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(departments).where(eq(departments.orgId, orgId));
}

export async function createDepartment(orgId: number, name: string): Promise<Department> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(departments).values({ orgId, name, isDefault: false });
  const id = (result as any).insertId as number;
  const [dept] = await db.select().from(departments).where(eq(departments.id, id));
  return dept;
}

export async function deleteDepartment(id: number, orgId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(departments).where(and(eq(departments.id, id), eq(departments.orgId, orgId)));
}

// ─── Targets ──────────────────────────────────────────────────────────────────
export async function getTargets(orgId: number, departmentId?: number): Promise<Target[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(targets.orgId, orgId)];
  if (departmentId !== undefined) conditions.push(eq(targets.departmentId, departmentId));
  return db.select().from(targets).where(and(...conditions)).orderBy(targets.lastName);
}

export async function createTarget(data: Omit<Target, "id" | "createdAt" | "updatedAt">): Promise<Target> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targets).values(data);
  const id = (result as any).insertId as number;
  const [target] = await db.select().from(targets).where(eq(targets.id, id));
  return target;
}

export async function updateTarget(id: number, orgId: number, data: Partial<Pick<Target, "firstName" | "lastName" | "email" | "title" | "departmentId" | "isActive">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(targets).set(data).where(and(eq(targets.id, id), eq(targets.orgId, orgId)));
}

export async function deleteTarget(id: number, orgId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(targets).where(and(eq(targets.id, id), eq(targets.orgId, orgId)));
}

export async function bulkCreateTargets(rows: Omit<Target, "id" | "createdAt" | "updatedAt">[]): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (rows.length === 0) return 0;
  await db.insert(targets).values(rows);
  return rows.length;
}

// ─── Templates ────────────────────────────────────────────────────────────────
export async function getTemplates(opts: { orgId?: number; isBuiltIn?: boolean; isShared?: boolean; language?: string; attackType?: string; difficulty?: string; industry?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts.isBuiltIn !== undefined) conditions.push(eq(templates.isBuiltIn, opts.isBuiltIn));
  if (opts.isShared !== undefined) conditions.push(eq(templates.isShared, opts.isShared));
  if (opts.orgId !== undefined) conditions.push(eq(templates.orgId, opts.orgId));
  if (opts.language) conditions.push(eq(templates.language, opts.language as any));
  if (opts.attackType) conditions.push(eq(templates.attackType, opts.attackType as any));
  if (opts.difficulty) conditions.push(eq(templates.difficulty, opts.difficulty as any));
  if (opts.industry) conditions.push(eq(templates.industry, opts.industry));
  return db.select().from(templates).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(templates.usageCount));
}

export async function getTemplateById(id: number, requestingOrgId?: number): Promise<Template | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [t] = await db.select().from(templates).where(eq(templates.id, id));
  if (!t) return undefined;
  // SECURITY: Enforce template access control
  // Built-in and shared/community templates are accessible to all
  if (t.isBuiltIn || t.isShared) return t;
  // Private org templates: only accessible by the owning org
  if (requestingOrgId !== undefined && t.orgId !== requestingOrgId) {
    return undefined; // Block cross-org private template access
  }
  return t;
}

export async function createTemplate(data: Omit<Template, "id" | "createdAt" | "updatedAt" | "usageCount">): Promise<Template> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(templates).values({ ...data, usageCount: 0 });
  const id = (result as any).insertId as number;
  const [t] = await db.select().from(templates).where(eq(templates.id, id));
  return t;
}

export async function updateTemplate(id: number, orgId: number, data: Partial<Pick<Template, "name" | "subject" | "htmlBody" | "language" | "attackType" | "industry" | "difficulty" | "isShared" | "tags">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set(data).where(and(eq(templates.id, id), eq(templates.orgId, orgId)));
}

export async function deleteTemplate(id: number, orgId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(templates).where(and(eq(templates.id, id), eq(templates.orgId, orgId)));
}

export async function incrementTemplateUsage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set({ usageCount: sql`${templates.usageCount} + 1` }).where(eq(templates.id, id));
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
export async function getCampaigns(orgId: number): Promise<Campaign[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number, orgId: number): Promise<Campaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
  return c;
}

export async function createCampaign(data: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<Campaign> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(campaigns).values(data);
  const id = (result as any).insertId as number;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  return c;
}

export async function updateCampaign(id: number, orgId: number, data: Partial<Campaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(campaigns).set(data).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
}

export async function deleteCampaign(id: number, orgId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.orgId, orgId)));
}

export async function getCampaignByTaskUid(taskUid: string): Promise<Campaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.scheduleCronTaskUid, taskUid));
  return c;
}

// ─── Campaign Results ─────────────────────────────────────────────────────────
export async function getCampaignResults(campaignId: number, orgId?: number): Promise<CampaignResult[]> {
  const db = await getDb();
  if (!db) return [];
  // SECURITY: Always scope by orgId when provided to enforce tenant isolation
  if (orgId !== undefined) {
    return db.select().from(campaignResults).where(
      and(eq(campaignResults.campaignId, campaignId), eq(campaignResults.orgId, orgId))
    );
  }
  return db.select().from(campaignResults).where(eq(campaignResults.campaignId, campaignId));
}

export async function createCampaignResult(data: Omit<CampaignResult, "id" | "createdAt">): Promise<CampaignResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(campaignResults).values(data);
  const id = (result as any).insertId as number;
  const [r] = await db.select().from(campaignResults).where(eq(campaignResults.id, id));
  return r;
}

export async function trackEvent(token: string, event: "open" | "click" | "submit" | "report", meta?: { ip?: string; ua?: string }) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const updateData: Partial<CampaignResult> = {};
  if (event === "open" && !updateData.emailOpenedAt) updateData.emailOpenedAt = now;
  if (event === "click") updateData.linkClickedAt = now;
  if (event === "submit") updateData.credentialSubmittedAt = now;
  if (event === "report") updateData.reportedAt = now;
  if (meta?.ip) updateData.ipAddress = meta.ip;
  if (meta?.ua) updateData.userAgent = meta.ua;
  await db.update(campaignResults).set(updateData).where(eq(campaignResults.trackingToken, token));
}

export async function getOrgAnalytics(orgId: number) {
  const db = await getDb();
  if (!db) return null;
  const allResults = await db.select().from(campaignResults).where(eq(campaignResults.orgId, orgId));
  const total = allResults.length;
  const sent = allResults.filter(r => r.emailSentAt).length;
  const opened = allResults.filter(r => r.emailOpenedAt).length;
  const clicked = allResults.filter(r => r.linkClickedAt).length;
  const submitted = allResults.filter(r => r.credentialSubmittedAt).length;
  const reported = allResults.filter(r => r.reportedAt).length;
  return { total, sent, opened, clicked, submitted, reported };
}

// ─── Training Modules ─────────────────────────────────────────────────────────
export async function getTrainingModules(language?: string): Promise<TrainingModule[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (language) conditions.push(eq(trainingModules.language, language as any));
  return db.select().from(trainingModules).where(conditions.length ? and(...conditions) : undefined).orderBy(trainingModules.sortOrder);
}

export async function getTrainingModuleById(id: number): Promise<TrainingModule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [m] = await db.select().from(trainingModules).where(eq(trainingModules.id, id));
  return m;
}

export async function recordTrainingCompletion(data: Omit<TrainingCompletion, "id" | "completedAt">): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(trainingCompletions).values({ ...data, completedAt: new Date() });
  // Update gamification if targetId provided
  if (data.targetId) {
    await updateGamificationOnTraining(data.orgId, data.targetId);
  }
}

export async function getTrainingCompletions(orgId: number, targetId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(trainingCompletions.orgId, orgId)];
  if (targetId) conditions.push(eq(trainingCompletions.targetId, targetId));
  return db.select().from(trainingCompletions).where(and(...conditions));
}

// ─── Gamification ─────────────────────────────────────────────────────────────
export async function getGamificationScores(orgId: number): Promise<GamificationScore[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gamificationScores).where(eq(gamificationScores.orgId, orgId)).orderBy(gamificationScores.riskScore);
}

export async function getOrCreateGamificationScore(orgId: number, targetId: number): Promise<GamificationScore> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(gamificationScores).where(and(eq(gamificationScores.orgId, orgId), eq(gamificationScores.targetId, targetId)));
  if (existing) return existing;
  await db.insert(gamificationScores).values({ orgId, targetId, riskScore: 50 });
  const [score] = await db.select().from(gamificationScores).where(and(eq(gamificationScores.orgId, orgId), eq(gamificationScores.targetId, targetId)));
  return score;
}

export async function updateGamificationOnEvent(orgId: number, targetId: number, event: "click" | "submit" | "report") {
  const db = await getDb();
  if (!db) return;
  const score = await getOrCreateGamificationScore(orgId, targetId);
  let newRisk = score.riskScore;
  let clickCount = score.clickCount;
  let submitCount = score.submitCount;
  let reportCount = score.reportCount;
  if (event === "click") { newRisk = Math.min(100, newRisk + 10); clickCount++; }
  if (event === "submit") { newRisk = Math.min(100, newRisk + 20); submitCount++; }
  if (event === "report") { newRisk = Math.max(0, newRisk - 15); reportCount++; }
  await db.update(gamificationScores).set({ riskScore: newRisk, clickCount, submitCount, reportCount }).where(and(eq(gamificationScores.orgId, orgId), eq(gamificationScores.targetId, targetId)));
}

export async function updateGamificationOnTraining(orgId: number, targetId: number) {
  const db = await getDb();
  if (!db) return;
  const score = await getOrCreateGamificationScore(orgId, targetId);
  const newRisk = Math.max(0, score.riskScore - 8);
  await db.update(gamificationScores).set({ riskScore: newRisk, trainingCount: score.trainingCount + 1 }).where(and(eq(gamificationScores.orgId, orgId), eq(gamificationScores.targetId, targetId)));
}

export async function getOrgPostureScore(orgId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 50;
  const scores = await db.select().from(gamificationScores).where(eq(gamificationScores.orgId, orgId));
  if (scores.length === 0) return 50;
  const avg = scores.reduce((sum, s) => sum + s.riskScore, 0) / scores.length;
  return Math.round(100 - avg); // posture = inverse of risk
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? null;
}

// ─── Stripe Billing ───────────────────────────────────────────────────────────
export async function updateOrgStripeSubscription(
  orgId: number,
  data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    plan: "free" | "starter" | "growth" | "pro" | "unlimited" | "enterprise";
    planActivatedAt?: Date;
    planExpiresAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(organizations).set(data).where(eq(organizations.id, orgId));
}
