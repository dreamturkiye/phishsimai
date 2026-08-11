import type { AllowlistState } from "./lib/allowlistGate";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../drizzle/schema";
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
  trainingAssignments,
  trainingModules,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Neon HTTP driver — one coherent Postgres DATABASE_URL shared with the OS layer.
      _db = drizzle(neon(process.env.DATABASE_URL), { schema });
    } catch (error) {
      console.warn("[Database] Failed to create connection:", error);
      _db = null;
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

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
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
  // PS-TRIAL-01: stamp a real 30-day trial at signup. Until now the welcome email promised a trial
  // that had no mechanism — a false claim. planExpiresAt makes it true: full access until it
  // passes, then the gated free tier (see server/lib/entitlements.ts). plan stays 'free'.
  const { TRIAL_DAYS } = await import("./lib/entitlements");
  const planExpiresAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [row] = await db.insert(organizations).values({ name: data.name, slug: data.slug, planExpiresAt }).returning({ id: organizations.id });
  const orgId = row.id;
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
  const [row] = await db.insert(departments).values({ orgId, name, isDefault: false }).returning({ id: departments.id });
  const id = row.id;
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
  const [row] = await db.insert(targets).values(data).returning({ id: targets.id });
  const id = row.id;
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
// The compliance floor trusts ONLY verified=true domains. Filtered in SQL AND defended
// in-memory by onlyVerifiedDomains, so an unverified row can never reach the guard.
export async function getVerifiedDomains(orgId: number): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const { orgVerifiedDomains } = await import("../drizzle/schema");
    const { onlyVerifiedDomains } = await import("./lib/domainVerify");
    const rows = await db.select({ domain: orgVerifiedDomains.domain, verified: orgVerifiedDomains.verified })
      .from(orgVerifiedDomains)
      .where(and(eq(orgVerifiedDomains.orgId, orgId), eq(orgVerifiedDomains.verified, true)));
    return onlyVerifiedDomains(rows);
  } catch { return []; }
}

// Read-only: all domains for an org with their verification state. verificationToken is
// the value the org must publish in DNS (a public record, not a secret), returned so the
// UI can show the TXT record for pending domains.
export async function listOrgDomains(orgId: number): Promise<
  { domain: string; verified: boolean; verifiedAt: Date | null; verificationToken: string | null }[]
> {
  const db = await getDb();
  if (!db) return [];
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  return db.select({
    domain: orgVerifiedDomains.domain,
    verified: orgVerifiedDomains.verified,
    verifiedAt: orgVerifiedDomains.verifiedAt,
    verificationToken: orgVerifiedDomains.verificationToken,
  })
    .from(orgVerifiedDomains)
    .where(eq(orgVerifiedDomains.orgId, orgId))
    .orderBy(desc(orgVerifiedDomains.createdAt));
}

// Step 1 of enrollment: insert an UNVERIFIED row with the ownership-proof token.
export async function addPendingDomain(orgId: number, domain: string, verificationToken: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  const clean = domain.toLowerCase().replace(/^@/, "").trim();
  await db.insert(orgVerifiedDomains)
    .values({ orgId, domain: clean, verified: false, verificationToken })
    .onConflictDoUpdate({
      target: [orgVerifiedDomains.orgId, orgVerifiedDomains.domain],
      set: { verified: false, verificationToken, verifiedAt: null },
    });
}

export async function getPendingDomain(orgId: number, domain: string): Promise<{ domain: string; verified: boolean; verificationToken: string | null } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  const clean = domain.toLowerCase().trim();
  const [row] = await db.select({ domain: orgVerifiedDomains.domain, verified: orgVerifiedDomains.verified, verificationToken: orgVerifiedDomains.verificationToken })
    .from(orgVerifiedDomains)
    .where(and(eq(orgVerifiedDomains.orgId, orgId), eq(orgVerifiedDomains.domain, clean)));
  return row;
}

// Step 2: mark verified after a successful DNS TXT proof.
export async function markDomainVerified(orgId: number, domain: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  const clean = domain.toLowerCase().trim();
  await db.update(orgVerifiedDomains)
    .set({ verified: true, verifiedAt: new Date() })
    .where(and(eq(orgVerifiedDomains.orgId, orgId), eq(orgVerifiedDomains.domain, clean)));
}

/** @deprecated pre-ownership-verification enroll. Kept for back-compat; not used by the router. */
export async function addVerifiedDomain(orgId: number, domain: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  const clean = domain.toLowerCase().replace(/^@/, "").trim();
  await db.insert(orgVerifiedDomains).values({ orgId, domain: clean });
}

export async function removeVerifiedDomain(orgId: number, domain: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { orgVerifiedDomains } = await import("../drizzle/schema");
  const clean = domain.toLowerCase().trim();
  await db.delete(orgVerifiedDomains)
    .where(and(eq(orgVerifiedDomains.orgId, orgId), eq(orgVerifiedDomains.domain, clean)));
}

export async function getTemplates(opts: { orgId?: number; isBuiltIn?: boolean; isShared?: boolean; moderationStatus?: string; language?: string; attackType?: string; difficulty?: string; industry?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts.isBuiltIn !== undefined) conditions.push(eq(templates.isBuiltIn, opts.isBuiltIn));
  if (opts.isShared !== undefined) conditions.push(eq(templates.isShared, opts.isShared));
  if (opts.moderationStatus !== undefined) conditions.push(eq(templates.moderationStatus, opts.moderationStatus));
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

export async function createTemplate(data: Omit<Template, "id" | "createdAt" | "updatedAt" | "usageCount" | "senderName" | "moderationStatus"> & { senderName?: string | null; moderationStatus?: string }): Promise<Template> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.insert(templates).values({ ...data, usageCount: 0 }).returning({ id: templates.id });
  const id = row.id;
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
  const [row] = await db.insert(campaigns).values(data).returning({ id: campaigns.id });
  const id = row.id;
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
  const [row] = await db.insert(campaignResults).values(data).returning({ id: campaignResults.id });
  const id = row.id;
  const [r] = await db.select().from(campaignResults).where(eq(campaignResults.id, id));
  return r;
}

/**
 * PS-CREDPAGE-01: which simulation is this token part of?
 *
 * The click path branches on it: a credential_harvest simulation shows the fake login page (the
 * behaviour the product measures), everything else goes straight to training as before. Returns
 * null when it cannot be resolved — the caller MUST treat null as "go to training", because a
 * lookup failure is not a reason to show a recipient a login form.
 */
export async function getLessonContextForToken(token: string): Promise<{ attackType: string | null; senderName: string | null; subject: string | null }> {
  const db = await getDb();
  if (!db) return { attackType: null, senderName: null, subject: null };
  try {
    const rows = await db
      .select({ attackType: templates.attackType, subject: templates.subject, tSender: templates.senderName, cSender: campaigns.senderName })
      .from(campaignResults)
      .innerJoin(campaigns, eq(campaigns.id, campaignResults.campaignId))
      .innerJoin(templates, eq(templates.id, campaigns.templateId))
      .where(eq(campaignResults.trackingToken, token))
      .limit(1);
    const r = rows[0];
    if (!r) return { attackType: null, senderName: null, subject: null };
    return { attackType: r.attackType ?? null, senderName: (r.cSender ?? r.tSender) ?? null, subject: r.subject ?? null };
  } catch {
    return { attackType: null, senderName: null, subject: null };
  }
}

export async function getAttackTypeForToken(token: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ attackType: templates.attackType })
    .from(campaignResults)
    .innerJoin(campaigns, eq(campaigns.id, campaignResults.campaignId))
    .innerJoin(templates, eq(templates.id, campaigns.templateId))
    .where(eq(campaignResults.trackingToken, token))
    .limit(1);
  return rows[0]?.attackType ?? null;
}

/**
 * PS-CAMPAIGN-CREDCAPTURE-01: whether THIS campaign has opted into showing the fake login page.
 * `campaigns.captureCredentials` was added to the wizard but never consulted by the click path —
 * a credential_harvest simulation showed the login page regardless of the toggle. The click
 * handler must check both this AND the attack type before rendering it.
 */
export async function getCaptureGateForToken(token: string): Promise<{ attackType: string | null; captureCredentials: boolean }> {
  const db = await getDb();
  if (!db) return { attackType: null, captureCredentials: false };
  const rows = await db
    .select({ attackType: templates.attackType, captureCredentials: campaigns.captureCredentials })
    .from(campaignResults)
    .innerJoin(campaigns, eq(campaigns.id, campaignResults.campaignId))
    .innerJoin(templates, eq(templates.id, campaigns.templateId))
    .where(eq(campaignResults.trackingToken, token))
    .limit(1);
  const r = rows[0];
  return { attackType: r?.attackType ?? null, captureCredentials: r?.captureCredentials ?? false };
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
  // PS-REMEDIATION-01: close the loop. If this completion matches an OPEN auto-assignment for the
  // same target+module, stamp it completed. No open assignment (a self-serve completion) simply
  // records the completion — it does not invent an assignment.
  if (data.targetId) {
    await db.update(trainingAssignments)
      .set({ completedAt: new Date() })
      .where(and(
        eq(trainingAssignments.targetId, data.targetId),
        eq(trainingAssignments.moduleId, data.moduleId),
        isNull(trainingAssignments.completedAt),
      ));
    await updateGamificationOnTraining(data.orgId, data.targetId);
  }
}

/**
 * PS-REMEDIATION-01 — the ENROLL step. Curated, deterministic attack-type -> module-category map.
 * Not guessed per run: a fixed table so the same failure always assigns the same kind of training.
 */
export const ATTACK_TYPE_TO_CATEGORY: Record<string, string> = {
  credential_harvest: 'Social Engineering',
  link_click: 'Threat Awareness',
  attachment: 'Threat Awareness',
  vishing: 'Social Engineering',
  smishing: 'Social Engineering',
  pretexting: 'Social Engineering',
};
/** Fallback when no module exists in the mapped category — a general module always seeded. */
export const FALLBACK_CATEGORY = 'Security Fundamentals';

/**
 * Auto-enroll the target behind a tracking token into the module matching the simulation's attack
 * type. Best-effort and idempotent: returns null (never throws) so a failure here can never break
 * the tracker's response to the recipient. One OPEN assignment per (target, module) — the 0023
 * partial unique index enforces it, and ON CONFLICT DO NOTHING makes a repeat failure inert.
 *
 * Returns the assignment id on a fresh enroll, or null when there was nothing to assign (no result
 * row, no module) or the open assignment already existed. Never fabricates: no module -> no row.
 */
export async function assignTrainingForToken(token: string, source: 'sim_click' | 'sim_submit'): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [res] = await db.select({ id: campaignResults.id, orgId: campaignResults.orgId, targetId: campaignResults.targetId })
      .from(campaignResults).where(eq(campaignResults.trackingToken, token)).limit(1);
    if (!res) return null; // no result row -> nothing to enroll
    const attackType = await getAttackTypeForToken(token);
    const category = (attackType && ATTACK_TYPE_TO_CATEGORY[attackType]) || FALLBACK_CATEGORY;
    // Pick the module: matching category first, else the fallback category, else nothing.
    let [mod] = await db.select({ id: trainingModules.id }).from(trainingModules)
      .where(eq(trainingModules.category, category)).orderBy(trainingModules.id).limit(1);
    if (!mod && category !== FALLBACK_CATEGORY) {
      [mod] = await db.select({ id: trainingModules.id }).from(trainingModules)
        .where(eq(trainingModules.category, FALLBACK_CATEGORY)).orderBy(trainingModules.id).limit(1);
    }
    if (!mod) return null; // no module exists -> assign nothing, never a phantom row
    const rows = await db.insert(trainingAssignments).values({
      orgId: res.orgId, targetId: res.targetId, moduleId: mod.id,
      attackType: attackType ?? null, source, campaignResultId: res.id,
    }).onConflictDoNothing().returning({ id: trainingAssignments.id });
    return rows[0]?.id ?? null; // null when an open assignment already existed
  } catch {
    return null; // never break the tracker
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

/**
 * PS-POSTURE-HONEST-01 — a posture score over zero data is NOT 50.
 *
 * This returned a hardcoded 50 both when the database was unreachable and when the org had no
 * scored targets at all. A brand-new trial — the exact account we most need to tell the truth to —
 * was shown "Security Score 50/100" as though something had been measured. Nothing had.
 *
 * That is the same defect class as a rate over an empty denominator (truthReport.ts:36
 * NOT_MEASURED) and as a scan verdict over zero units (scanVerdict.ts), except pointed at a
 * customer instead of at an internal brief. INV-3 exists to halt exactly this shape; it was living
 * in the analytics dashboard the whole time.
 *
 * NULL means "we have not measured this yet" and the UI must say so in words. It must never be
 * coalesced to 0 either — 0/100 reads as catastrophic security, which is a worse lie than 50.
 */
export async function getOrgPostureScore(orgId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null; // unreachable DB is not a posture of 50
  const scores = await db.select().from(gamificationScores).where(eq(gamificationScores.orgId, orgId));
  if (scores.length === 0) return null; // no scored targets: nothing has been measured
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

// ─── PS-DELIVER-ALLOWLIST-01 — allowlist onboarding state ────────────────────

/**
 * Read an org's allowlist state. Returns null when there is no row, which the gate treats as
 * not_started — the correct default, since an org that has never seen the step has not completed it.
 *
 * A read FAILURE also returns null and therefore blocks. Fail closed: an unreadable state is not
 * evidence of consent, and the cost of a wrong block (one extra click) is far below the cost of a
 * wrong pass (an invisible first campaign, which is the activation leak this exists to close).
 */
export async function getOrgAllowlistState(orgId: number): Promise<{ state: AllowlistState; skipAckText: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = (await db.execute(
      sql`SELECT state, skip_ack_text FROM org_allowlist_state WHERE "orgId" = ${orgId} LIMIT 1`,
    )) as any;
    const r = rows?.rows?.[0] ?? rows?.[0];
    if (!r) return null;
    return { state: r.state as AllowlistState, skipAckText: r.skip_ack_text ?? null };
  } catch {
    return null; // fail closed
  }
}

/** Record that the admin says they configured allowlisting. Never a claim that we verified it. */
export async function confirmOrgAllowlist(orgId: number, userId: number, platform: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  await db.execute(sql`
    INSERT INTO org_allowlist_state ("orgId", state, platform, "confirmedAt", "confirmedBy", "updatedAt")
    VALUES (${orgId}, 'confirmed_by_admin', ${platform}, NOW(), ${userId}, NOW())
    ON CONFLICT ("orgId") DO UPDATE SET
      state = 'confirmed_by_admin', platform = ${platform},
      "confirmedAt" = NOW(), "confirmedBy" = ${userId},
      "skippedAt" = NULL, skip_ack_text = NULL, "updatedAt" = NOW()
  `);
}

/**
 * Record a knowing skip. `ackText` is the warning the admin actually agreed to, stored verbatim —
 * the 0021 CHECK constraint rejects a skip without it, so an unrecorded skip cannot be written.
 */
export async function skipOrgAllowlist(orgId: number, ackText: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  await db.execute(sql`
    INSERT INTO org_allowlist_state ("orgId", state, "skippedAt", skip_ack_text, "updatedAt")
    VALUES (${orgId}, 'skipped', NOW(), ${ackText}, NOW())
    ON CONFLICT ("orgId") DO UPDATE SET
      state = 'skipped', "skippedAt" = NOW(), skip_ack_text = ${ackText},
      "confirmedAt" = NULL, "confirmedBy" = NULL, "updatedAt" = NOW()
  `);
}

/**
 * PS-LEARNING-COMPLETE-01 — mark the on-click micro-lesson complete for the target behind a token.
 *
 * "Complete" is a DELIBERATE acknowledgement, never a page-view: the caller is the landing page's
 * POST-only acknowledgement button, mirroring the report control (a GET would be prefetched by mail
 * scanners and would fabricate completions for people who never finished).
 *
 * Stamps the target's OPEN training_assignment (the one auto-created on their click by
 * PS-REMEDIATION-01) via recordTrainingCompletion. Returns false and records NOTHING when there is
 * no open assignment — no assignment means nothing was owed, and inventing a completion would be the
 * exact fabrication this loop guards against.
 */
export async function completeTrainingForToken(token: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const [res] = await db.select({ orgId: campaignResults.orgId, targetId: campaignResults.targetId })
      .from(campaignResults).where(eq(campaignResults.trackingToken, token)).limit(1);
    if (!res) return false;
    const [open] = await db.select({ moduleId: trainingAssignments.moduleId })
      .from(trainingAssignments)
      .where(and(
        eq(trainingAssignments.targetId, res.targetId),
        isNull(trainingAssignments.completedAt),
      ))
      .orderBy(trainingAssignments.assignedAt).limit(1);
    if (!open) return false; // nothing owed -> record nothing, never a phantom completion
    await recordTrainingCompletion({ orgId: res.orgId, targetId: res.targetId, moduleId: open.moduleId, userId: null, score: null, timeSpentSeconds: null } as any);
    return true;
  } catch {
    return false;
  }
}

/** PS-HUMAN-RISK-01 — org training-assignment counts for the risk composite's training dimension. */
export async function getTrainingAssignmentStats(orgId: number): Promise<{ assigned: number; completed: number }> {
  const db = await getDb();
  if (!db) return { assigned: 0, completed: 0 };
  try {
    const rows = (await db.execute(
      sql`SELECT count(*)::int AS assigned, count("completedAt")::int AS completed
          FROM training_assignments WHERE "orgId" = ${orgId}`,
    )) as any;
    const r = rows?.rows?.[0] ?? rows?.[0] ?? {};
    return { assigned: Number(r.assigned ?? 0), completed: Number(r.completed ?? 0) };
  } catch {
    return { assigned: 0, completed: 0 };
  }
}

// ─── PS-DECOMMISSION-01 — daily KPI verdict history ──────────────────────────

/** Write today's KPI verdict for an agent (one row per agent per UTC day). Best-effort. */
export async function writeAgentKpiVerdict(agentId: string, kpi: string, verdict: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      INSERT INTO os_agent_kpi_daily (product_id, agent_id, kpi, verdict)
      VALUES ('phishsimai', ${agentId}, ${kpi}, ${verdict})
      ON CONFLICT (product_id, agent_id, day) DO UPDATE SET verdict = ${verdict}, kpi = ${kpi}
    `);
  } catch { /* history write is best-effort; never break the brief */ }
}

/** Read an agent's verdict history, most-recent day FIRST, up to `days` rows. */
export async function readAgentKpiHistory(agentId: string, days: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = (await db.execute(sql`
      SELECT verdict FROM os_agent_kpi_daily
      WHERE product_id='phishsimai' AND agent_id=${agentId}
      ORDER BY day DESC LIMIT ${days}
    `)) as any;
    const list = rows?.rows ?? rows ?? [];
    return list.map((r: any) => String(r.verdict));
  } catch {
    return [];
  }
}

/** PS-MARKETPLACE-GATE-01 — admin sets a shared template's moderation state. */
export async function moderateTemplate(templateId: number, status: 'approved' | 'rejected'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set({ moderationStatus: status }).where(eq(templates.id, templateId));
}

/** Pending community submissions awaiting review. */
export async function getPendingCommunityTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(templates).where(and(eq(templates.isShared, true), eq(templates.moderationStatus, 'pending'))).orderBy(desc(templates.createdAt));
}

/** PS-REPORT-UX-01 — award the real gamification credit for a phish report and return the true
 *  running count for the celebration page. Null when the token has no resolvable target. */
export async function creditReportForToken(token: string): Promise<{ reportCount: number } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [res] = await db.select({ orgId: campaignResults.orgId, targetId: campaignResults.targetId })
      .from(campaignResults).where(eq(campaignResults.trackingToken, token)).limit(1);
    if (!res) return null;
    await updateGamificationOnEvent(res.orgId, res.targetId, "report"); // real: reportCount++, risk down
    const score = await getOrCreateGamificationScore(res.orgId, res.targetId);
    return { reportCount: score.reportCount };
  } catch {
    return null;
  }
}
