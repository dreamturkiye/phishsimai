import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { createHeartbeatJob, deleteHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  acceptInvite,
  bulkCreateTargets,
  createCampaign,
  createCampaignResult,
  createDepartment,
  createInvite,
  createOrganization,
  createTarget,
  createTemplate,
  deleteCampaign,
  deleteDepartment,
  deleteTarget,
  deleteTemplate,
  getCampaignById,
  getCampaignByTaskUid,
  getCampaignResults,
  getCampaigns,
  getDepartments,
  getGamificationScores,
  getInviteByToken,
  getOrgAnalytics,
  getOrgById,
  getOrgBySlug,
  getOrgInvites,
  getOrgMember,
  getOrgMembers,
  getOrgPostureScore,
  getTargets,
  getTemplateById,
  getTemplates,
  getTrainingCompletions,
  getTrainingModuleById,
  getTrainingModules,
  getUserOrgs,
  incrementTemplateUsage,
  recordTrainingCompletion,
  removeMember,
  trackEvent,
  updateCampaign,
  updateMemberRole,
  updateOrganization,
  updateTarget,
  updateTemplate,
} from "./db";
import { BUILT_IN_TEMPLATES, BUILT_IN_TRAINING_MODULES } from "./seed";

// ─── Helper: get org and assert membership ────────────────────────────────────
async function requireOrgMember(orgId: number, userId: number, requireAdmin = false) {
  const member = await getOrgMember(orgId, userId);
  if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
  if (requireAdmin && member.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return member;
}

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Organizations ──────────────────────────────────────────────────────────
  orgs: router({
    myOrgs: protectedProcedure.query(async ({ ctx }) => {
      return getUserOrgs(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 50) + "-" + nanoid(6);
        return createOrganization({ name: input.name, slug, userId: ctx.user.id });
      }),

    get: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getOrgById(input.orgId);
      }),

    update: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        name: z.string().min(2).max(100).optional(),
        gamificationEnabled: z.boolean().optional(),
        trainingEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const { orgId, ...data } = input;
        await updateOrganization(orgId, data);
        return { success: true };
      }),

    members: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getOrgMembers(input.orgId);
      }),

    updateMemberRole: protectedProcedure
      .input(z.object({ orgId: z.number(), userId: z.number(), role: z.enum(["admin", "member"]) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        await updateMemberRole(input.orgId, input.userId, input.role);
        return { success: true };
      }),

    removeMember: protectedProcedure
      .input(z.object({ orgId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        await removeMember(input.orgId, input.userId);
        return { success: true };
      }),

    invite: protectedProcedure
      .input(z.object({ orgId: z.number(), email: z.string().email(), role: z.enum(["admin", "member"]).default("member") }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        return createInvite({ orgId: input.orgId, email: input.email, token, role: input.role, expiresAt });
      }),

    invites: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        return getOrgInvites(input.orgId);
      }),

    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const invite = await getInviteByToken(input.token);
        if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
        if (invite.expiresAt < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite expired" });
        if (invite.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already accepted" });
        await acceptInvite(input.token, ctx.user.id);
        return { success: true, orgId: invite.orgId };
      }),
  }),

  // ─── Departments ────────────────────────────────────────────────────────────
  departments: router({
    list: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getDepartments(input.orgId);
      }),

    create: protectedProcedure
      .input(z.object({ orgId: z.number(), name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        return createDepartment(input.orgId, input.name);
      }),

    delete: protectedProcedure
      .input(z.object({ orgId: z.number(), departmentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        await deleteDepartment(input.departmentId, input.orgId);
        return { success: true };
      }),
  }),

  // ─── Targets ────────────────────────────────────────────────────────────────
  targets: router({
    list: protectedProcedure
      .input(z.object({ orgId: z.number(), departmentId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getTargets(input.orgId, input.departmentId);
      }),

    create: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        title: z.string().optional(),
        departmentId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        return createTarget({ ...input, isActive: true, title: input.title ?? null, departmentId: input.departmentId ?? null });
      }),

    update: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        targetId: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        title: z.string().optional(),
        departmentId: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const { orgId, targetId, ...data } = input;
        await updateTarget(targetId, orgId, data as any);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ orgId: z.number(), targetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        await deleteTarget(input.targetId, input.orgId);
        return { success: true };
      }),

    bulkImport: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        targets: z.array(z.object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().email(),
          title: z.string().optional(),
          departmentId: z.number().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const rows = input.targets.map(t => ({ ...t, orgId: input.orgId, isActive: true }));
        const count = await bulkCreateTargets(rows as any);
        return { count };
      }),
  }),

  // ─── Templates ──────────────────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        includeBuiltIn: z.boolean().default(true),
        includeCommunity: z.boolean().default(true),
        language: z.string().optional(),
        attackType: z.string().optional(),
        difficulty: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const results: any[] = [];
        if (input.includeBuiltIn) {
          const builtIn = await getTemplates({ isBuiltIn: true, language: input.language, attackType: input.attackType, difficulty: input.difficulty });
          results.push(...builtIn.map(t => ({ ...t, source: "built-in" })));
        }
        if (input.includeCommunity) {
          const community = await getTemplates({ isShared: true, language: input.language, attackType: input.attackType, difficulty: input.difficulty });
          results.push(...community.filter(t => !t.isBuiltIn).map(t => ({ ...t, source: "community" })));
        }
        const orgTemplates = await getTemplates({ orgId: input.orgId, language: input.language, attackType: input.attackType, difficulty: input.difficulty });
        results.push(...orgTemplates.filter(t => !t.isBuiltIn).map(t => ({ ...t, source: "org" })));
        // Deduplicate by id
        const seen = new Set<number>();
        return results.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
      }),

    get: protectedProcedure
      .input(z.object({ orgId: z.number(), templateId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getTemplateById(input.templateId);
      }),

    generate: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        industry: z.string(),
        attackType: z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]),
        language: z.enum(["en", "es", "tr"]),
        difficulty: z.enum(["easy", "medium", "hard"]),
        context: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const langNames: Record<string, string> = { en: "English", es: "Spanish", tr: "Turkish" };
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
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["name", "subject", "htmlBody", "tags"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices[0]?.message?.content;
        const content = typeof rawContent === 'string' ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI generation failed" });
        const parsed = JSON.parse(content);
        return parsed as { name: string; subject: string; htmlBody: string; tags: string[] };
      }),

    create: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        name: z.string().min(1),
        subject: z.string().min(1),
        htmlBody: z.string().min(1),
        language: z.enum(["en", "es", "tr"]).default("en"),
        attackType: z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]).default("credential_harvest"),
        industry: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        isShared: z.boolean().default(false),
        tags: z.array(z.string()).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return createTemplate({ ...input, industry: input.industry ?? null, createdByUserId: ctx.user.id, isBuiltIn: false });
      }),

    update: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        templateId: z.number(),
        name: z.string().optional(),
        subject: z.string().optional(),
        htmlBody: z.string().optional(),
        language: z.enum(["en", "es", "tr"]).optional(),
        attackType: z.enum(["credential_harvest", "link_click", "attachment", "vishing", "smishing", "pretexting"]).optional(),
        industry: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        isShared: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const { orgId, templateId, ...data } = input;
        await updateTemplate(templateId, orgId, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ orgId: z.number(), templateId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        await deleteTemplate(input.templateId, input.orgId);
        return { success: true };
      }),

    forkToOrg: protectedProcedure
      .input(z.object({ orgId: z.number(), templateId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const source = await getTemplateById(input.templateId);
        if (!source) throw new TRPCError({ code: "NOT_FOUND" });
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
          tags: source.tags,
        });
      }),
  }),

  // ─── Campaigns ──────────────────────────────────────────────────────────────
  campaigns: router({
    list: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getCampaigns(input.orgId);
      }),

    get: protectedProcedure
      .input(z.object({ orgId: z.number(), campaignId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const campaign = await getCampaignById(input.campaignId, input.orgId);
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
        const results = await getCampaignResults(input.campaignId);
        return { campaign, results };
      }),

    create: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        name: z.string().min(1),
        templateId: z.number().optional(),
        language: z.enum(["en", "es", "tr"]).default("en"),
        targetDepartmentIds: z.array(z.number()).default([]),
        targetIds: z.array(z.number()).default([]),
        scheduledAt: z.number().optional(), // unix ms
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
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
          notes: input.notes ?? null,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        campaignId: z.number(),
        name: z.string().optional(),
        status: z.enum(["draft", "scheduled", "active", "completed", "paused"]).optional(),
        templateId: z.number().optional(),
        scheduledAt: z.number().nullable().optional(),
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const { orgId, campaignId, scheduledAt, ...rest } = input;
        await updateCampaign(campaignId, orgId, {
          ...rest,
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ orgId: z.number(), campaignId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        await deleteCampaign(input.campaignId, input.orgId);
        return { success: true };
      }),

    schedule: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        campaignId: z.number(),
        cronExpression: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const campaign = await getCampaignById(input.campaignId, input.orgId);
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const job = await createHeartbeatJob({
          name: `campaign-${campaign.id}-${nanoid(6)}`,
          cron: input.cronExpression,
          path: "/api/scheduled/campaign",
          payload: { campaignId: campaign.id, orgId: input.orgId },
          description: input.description ?? `Recurring campaign: ${campaign.name}`,
        }, sessionToken);
        await updateCampaign(input.campaignId, input.orgId, {
          isRecurring: true,
          cronExpression: input.cronExpression,
          scheduleCronTaskUid: job.taskUid,
          status: "scheduled",
        });
        return { success: true, taskUid: job.taskUid };
      }),

    unschedule: protectedProcedure
      .input(z.object({ orgId: z.number(), campaignId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id, true);
        const campaign = await getCampaignById(input.campaignId, input.orgId);
        if (!campaign?.scheduleCronTaskUid) throw new TRPCError({ code: "NOT_FOUND" });
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        await deleteHeartbeatJob(campaign.scheduleCronTaskUid, sessionToken);
        await updateCampaign(input.campaignId, input.orgId, {
          isRecurring: false,
          cronExpression: null,
          scheduleCronTaskUid: null,
          status: "draft",
        });
        return { success: true };
      }),

    listScheduled: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        try {
          const jobs = await listHeartbeatJobs(sessionToken);
          return jobs;
        } catch {
          return { total: 0, actorUserId: "", jobs: [] };
        }
      }),
  }),

  // ─── Analytics ──────────────────────────────────────────────────────────────
  analytics: router({
    overview: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const stats = await getOrgAnalytics(input.orgId);
        const campaigns = await getCampaigns(input.orgId);
        const postureScore = await getOrgPostureScore(input.orgId);
        return { stats, campaignCount: campaigns.length, postureScore };
      }),

    campaignDetail: protectedProcedure
      .input(z.object({ orgId: z.number(), campaignId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const results = await getCampaignResults(input.campaignId);
        const total = results.length;
        const sent = results.filter(r => r.emailSentAt).length;
        const opened = results.filter(r => r.emailOpenedAt).length;
        const clicked = results.filter(r => r.linkClickedAt).length;
        const submitted = results.filter(r => r.credentialSubmittedAt).length;
        const reported = results.filter(r => r.reportedAt).length;
        return {
          total, sent, opened, clicked, submitted, reported,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          submitRate: sent > 0 ? Math.round((submitted / sent) * 100) : 0,
          reportRate: sent > 0 ? Math.round((reported / sent) * 100) : 0,
        };
      }),

    campaignTrend: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const allCampaigns = await getCampaigns(input.orgId);
        // Build per-campaign trend data (last 10 completed campaigns)
        const completed = allCampaigns
          .filter(c => c.status === "completed" || c.status === "active")
          .slice(-10);
        const trend = await Promise.all(
          completed.map(async (c) => {
            const results = await getCampaignResults(c.id);
            const sent = results.filter(r => r.emailSentAt).length;
            const opened = results.filter(r => r.emailOpenedAt).length;
            const clicked = results.filter(r => r.linkClickedAt).length;
            const submitted = results.filter(r => r.credentialSubmittedAt).length;
            return {
              name: c.name.length > 16 ? c.name.slice(0, 16) + "…" : c.name,
              openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
              clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
              submitRate: sent > 0 ? Math.round((submitted / sent) * 100) : 0,
              date: c.createdAt,
            };
          })
        );
        return trend;
      }),

    deptBreakdown: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const depts = await getDepartments(input.orgId);
        const breakdown = await Promise.all(
          depts.map(async (dept) => {
            const targets = await getTargets(input.orgId, dept.id);
            const targetIds = targets.map(t => t.id);
            if (targetIds.length === 0) return { dept: dept.name, clickRate: 0, openRate: 0, submitRate: 0, count: 0 };
            // Get all results for targets in this dept
            const db = await getDb();
            if (!db) return { dept: dept.name, clickRate: 0, openRate: 0, submitRate: 0, count: 0 };
            const { campaignResults: cr } = await import("../drizzle/schema");
            const { inArray } = await import("drizzle-orm");
            const results: import("../drizzle/schema").CampaignResult[] = await db.select().from(cr).where(inArray(cr.targetId, targetIds)) as any;
            const sent = results.filter((r: import("../drizzle/schema").CampaignResult) => r.emailSentAt).length;
            const opened = results.filter((r: import("../drizzle/schema").CampaignResult) => r.emailOpenedAt).length;
            const clicked = results.filter((r: import("../drizzle/schema").CampaignResult) => r.linkClickedAt).length;
            const submitted = results.filter((r: import("../drizzle/schema").CampaignResult) => r.credentialSubmittedAt).length;
            return {
              dept: dept.name,
              clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
              openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
              submitRate: sent > 0 ? Math.round((submitted / sent) * 100) : 0,
              count: targets.length,
            };
          })
        );
        return breakdown;
      }),
  }),

  // ─── Training ───────────────────────────────────────────────────────────────
  training: router({
    modules: publicProcedure
      .input(z.object({ language: z.string().optional() }))
      .query(async ({ input }) => {
        return getTrainingModules(input.language);
      }),

    module: publicProcedure
      .input(z.object({ moduleId: z.number() }))
      .query(async ({ input }) => {
        return getTrainingModuleById(input.moduleId);
      }),

    complete: protectedProcedure
      .input(z.object({
        orgId: z.number(),
        moduleId: z.number(),
        score: z.number().min(0).max(100).optional(),
        timeSpentSeconds: z.number().optional(),
        targetId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        await recordTrainingCompletion({
          orgId: input.orgId,
          moduleId: input.moduleId,
          userId: ctx.user.id,
          targetId: input.targetId ?? null,
          score: input.score ?? null,
          timeSpentSeconds: input.timeSpentSeconds ?? null,
        });
        return { success: true };
      }),

    completions: protectedProcedure
      .input(z.object({ orgId: z.number(), targetId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        return getTrainingCompletions(input.orgId, input.targetId);
      }),
  }),

  // ─── Gamification ───────────────────────────────────────────────────────────
  gamification: router({
    leaderboard: protectedProcedure
      .input(z.object({ orgId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOrgMember(input.orgId, ctx.user.id);
        const scores = await getGamificationScores(input.orgId);
        const postureScore = await getOrgPostureScore(input.orgId);
        return { scores, postureScore };
      }),
  }),

  // ─── Seed ───────────────────────────────────────────────────────────────────
  seed: router({
    seedBuiltIns: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Seed templates
      for (const t of BUILT_IN_TEMPLATES) {
        await createTemplate({ ...t, isBuiltIn: true, isShared: false, orgId: null, createdByUserId: null });
      }
      // Seed training modules
      for (const m of BUILT_IN_TRAINING_MODULES) {
        const existing = await getTrainingModules();
        if (!existing.find(e => e.title === m.title)) {
          const db = await import("./db").then(m => m.getDb());
          if (db) {
            const { trainingModules } = await import("../drizzle/schema");
            await db.insert(trainingModules).values(m);
          }
        }
      }
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
