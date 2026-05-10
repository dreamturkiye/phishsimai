import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock all db functions using the correct exported names from db.ts
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createOrganization: vi.fn().mockResolvedValue({ id: 1, name: "Test Org", gamificationEnabled: true, trainingEnabled: true, createdAt: new Date(), updatedAt: new Date() }),
  getOrgById: vi.fn().mockResolvedValue(undefined),
  getOrgBySlug: vi.fn().mockResolvedValue(undefined),
  getUserOrgs: vi.fn().mockResolvedValue([]),
  updateOrganization: vi.fn(),
  getOrgMember: vi.fn().mockResolvedValue({ id: 1, orgId: 1, userId: 1, role: "admin", joinedAt: new Date() }),
  getOrgMembers: vi.fn().mockResolvedValue([]),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  createInvite: vi.fn().mockResolvedValue({ id: 1, token: "test-token", email: "invite@example.com", orgId: 1, role: "member", expiresAt: new Date(Date.now() + 86400000), usedAt: null, createdAt: new Date() }),
  getInviteByToken: vi.fn().mockResolvedValue(undefined),
  acceptInvite: vi.fn(),
  getOrgInvites: vi.fn().mockResolvedValue([]),
  getDepartments: vi.fn().mockResolvedValue([]),
  createDepartment: vi.fn().mockResolvedValue({ id: 1, orgId: 1, name: "Finance", isDefault: false, createdAt: new Date() }),
  deleteDepartment: vi.fn(),
  getTargets: vi.fn().mockResolvedValue([]),
  createTarget: vi.fn().mockResolvedValue({ id: 1, orgId: 1, email: "test@example.com", firstName: "Test", lastName: "User", departmentId: null, isActive: true, createdAt: new Date(), updatedAt: new Date() }),
  updateTarget: vi.fn(),
  deleteTarget: vi.fn(),
  bulkCreateTargets: vi.fn().mockResolvedValue(0),
  getTemplates: vi.fn().mockResolvedValue([]),
  getTemplateById: vi.fn().mockResolvedValue(undefined),
  createTemplate: vi.fn().mockResolvedValue({ id: 1, orgId: 1, name: "Test Template", subject: "Test", htmlBody: "<p>test</p>", language: "en", isShared: false, isBuiltIn: false, usageCount: 0, createdAt: new Date(), updatedAt: new Date() }),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  incrementTemplateUsage: vi.fn(),
  getCampaigns: vi.fn().mockResolvedValue([]),
  getCampaignById: vi.fn().mockResolvedValue(undefined),
  getCampaignByTaskUid: vi.fn().mockResolvedValue(undefined),
  createCampaign: vi.fn().mockResolvedValue({ id: 1, orgId: 1, name: "Test Campaign", status: "draft", language: "en", isRecurring: false, createdAt: new Date(), updatedAt: new Date() }),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  getCampaignResults: vi.fn().mockResolvedValue([]),
  createCampaignResult: vi.fn().mockResolvedValue({ id: 1 }),
  trackEvent: vi.fn(),
  getOrgAnalytics: vi.fn().mockResolvedValue({ total: 0, sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 }),
  getTrainingModules: vi.fn().mockResolvedValue([]),
  getTrainingModuleById: vi.fn().mockResolvedValue(undefined),
  recordTrainingCompletion: vi.fn(),
  getTrainingCompletions: vi.fn().mockResolvedValue([]),
  getGamificationScores: vi.fn().mockResolvedValue([]),
  upsertGamificationScore: vi.fn(),
  getOrgPostureScore: vi.fn().mockResolvedValue(72),
  updateGamificationOnPhish: vi.fn(),
  updateGamificationOnTraining: vi.fn(),
  createOrgMembership: vi.fn(),
}));

// MSP mock — inline dynamic imports used in msp router
vi.mock("../drizzle/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../drizzle/schema")>();
  return { ...actual };
});

vi.mock("./seed", () => ({
  BUILT_IN_TEMPLATES: [],
  BUILT_IN_TRAINING_MODULES: [],
}));

vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: vi.fn().mockResolvedValue({ uid: "test-uid" }),
  deleteHeartbeatJob: vi.fn(),
  listHeartbeatJobs: vi.fn().mockResolvedValue({ total: 0, actorUserId: "", jobs: [] }),
  updateHeartbeatJob: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ subject: "Test Subject", htmlBody: "<p>Test</p>", textBody: "Test", senderName: "IT Security", notes: "Test" }) } }],
  }),
}));

function makeCtx(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: { cookie: "" } } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const ctx = makeCtx({
      res: { clearCookie: (name: string) => clearedCookies.push(name) } as unknown as TrpcContext["res"],
    });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
  });
});

describe("auth.me", () => {
  it("returns the current user when authenticated", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me?.email).toBe("admin@example.com");
    expect(me?.name).toBe("Admin User");
  });

  it("returns null for unauthenticated user", async () => {
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });
});

describe("orgs.create", () => {
  it("creates an organization and adds the creator as admin member", async () => {
    const db = await import("./db");
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const org = await caller.orgs.create({ name: "Acme Corp" });
    expect(db.createOrganization).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme Corp" }));
    expect(org.name).toBe("Test Org");
  });

  it("rejects empty organization name", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.orgs.create({ name: "" })).rejects.toThrow();
  });
});

describe("campaigns.create", () => {
  it("creates a campaign with draft status when no scheduledAt provided", async () => {
    const db = await import("./db");
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const campaign = await caller.campaigns.create({
      orgId: 1,
      name: "Q1 Phishing Test",
      language: "en",
    });
    expect(db.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: "Q1 Phishing Test",
      status: "draft",
      language: "en",
    }));
    expect(campaign.name).toBe("Test Campaign");
  });

  it("creates a campaign with scheduled status when scheduledAt is provided", async () => {
    const db = await import("./db");
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const futureTime = Date.now() + 86400000;
    await caller.campaigns.create({
      orgId: 1,
      name: "Scheduled Campaign",
      language: "es",
      scheduledAt: futureTime,
    });
    expect(db.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      status: "scheduled",
      language: "es",
    }));
  });
});

describe("departments.create", () => {
  it("creates a department for the org", async () => {
    const db = await import("./db");
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const dept = await caller.departments.create({ orgId: 1, name: "Engineering" });
    expect(db.createDepartment).toHaveBeenCalledWith(1, "Engineering");
    expect(dept).toBeDefined();
  });
});

describe("targets.create", () => {
  it("creates a target employee", async () => {
    const db = await import("./db");
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const target = await caller.targets.create({
      orgId: 1,
      email: "employee@company.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(db.createTarget).toHaveBeenCalledWith(expect.objectContaining({
      email: "employee@company.com",
      firstName: "Jane",
      lastName: "Doe",
    }));
    expect(target).toBeDefined();
  });
});

describe("analytics.overview", () => {
  it("returns analytics stats and posture score", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.analytics.overview({ orgId: 1 });
    expect(result).toHaveProperty("stats");
    expect(result).toHaveProperty("postureScore");
    expect(result.stats?.sent).toBe(0);
    expect(result.postureScore).toBe(72);
  });
});

describe("msp router", () => {
  it("getMyTenant returns null when getDb returns null (no DB)", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.msp.getMyTenant();
    expect(result).toBeNull();
  });

  it("listCustomers returns empty array when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.msp.listCustomers();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("getActivityLog returns empty array when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.msp.getActivityLog();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("getAggregateAnalytics returns zero-state when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.msp.getAggregateAnalytics();
    expect(result).toMatchObject({
      totalCustomers: 0,
      activeCustomers: 0,
      totalCampaigns: 0,
      avgClickRate: 0,
      atRiskOrgs: 0,
    });
  });

  it("register throws INTERNAL_SERVER_ERROR when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.msp.register({ companyName: "Test MSP", contactEmail: "msp@test.com" })
    ).rejects.toThrow();
  });

  it("updateBranding throws INTERNAL_SERVER_ERROR when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.msp.updateBranding({ brandName: "MyBrand" })
    ).rejects.toThrow();
  });

  it("impersonateCustomer throws INTERNAL_SERVER_ERROR when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.msp.impersonateCustomer({ customerOrgId: 1 })
    ).rejects.toThrow();
  });

  it("provisionCustomer throws INTERNAL_SERVER_ERROR when getDb returns null", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.msp.provisionCustomer({ orgName: "Client Co", orgSlug: "client-co", adminEmail: "admin@client.com" })
    ).rejects.toThrow();
  });
});

describe("training.modules", () => {
  it("returns training modules (public endpoint, no auth required)", async () => {
    const db = await import("./db");
    const ctx = makeCtx({ user: null });
    const caller = appRouter.createCaller(ctx);
    const modules = await caller.training.modules({});
    expect(db.getTrainingModules).toHaveBeenCalled();
    expect(Array.isArray(modules)).toBe(true);
  });
});
