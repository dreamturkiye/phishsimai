// PS-ACTIVATE-01 — unused TRUE-trial activation. Selection + idempotency.
// Billing D14/D18/D25/D30 must stay separate. Warm CTA 90–92 must not grow a 93rd touch.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACTIVATION_BATCH_CAP,
  ACTIVATION_MIN_AGE_DAYS,
  ACTIVATION_NUDGE_DAY,
  isActivationEligible,
  runTrialActivationNudges,
  selectActivationCandidates,
  type ActivationOrg,
} from "./trialActivation";
import { WARM_CTA_TOUCHES, nextWarmCtaTouch } from "./sequences";
import { trialActivationCopy } from "../email/janet";
import { isNonCustomerOrg } from "./trueTrials";

const DAY_MS = 86_400_000;
const now = new Date("2026-09-17T12:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
const later = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();

function org(partial: Partial<ActivationOrg> & Pick<ActivationOrg, "id" | "name">): ActivationOrg {
  return {
    createdAt: ago(10),
    planExpiresAt: later(7),
    admin_email: "ops@example.com",
    campaign_count: 0,
    ...partial,
  };
}

const greyBox = org({
  id: 11,
  name: "Grey Box Consulting",
  admin_email: "dcharit@gmail.com",
  createdAt: ago(23),
  planExpiresAt: later(7),
  campaign_count: 0,
});

describe("isActivationEligible — unused TRUE trials after ~3–5 days", () => {
  it("selects Grey Box: live TRUE trial, 0 campaigns, well past day 3", () => {
    expect(isNonCustomerOrg({ name: greyBox.name, adminEmail: greyBox.admin_email, orgId: greyBox.id })).toBe(false);
    expect(isActivationEligible(greyBox, now)).toBe(true);
  });

  it("requires at least 3 days since org created / trial start", () => {
    expect(ACTIVATION_MIN_AGE_DAYS).toBe(3);
    expect(isActivationEligible(org({ id: 20, name: "New MSP", createdAt: ago(2.9) }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 21, name: "Day-3 MSP", createdAt: ago(3) }), now)).toBe(true);
    expect(isActivationEligible(org({ id: 22, name: "Day-5 MSP", createdAt: ago(5) }), now)).toBe(true);
  });

  it("skips orgs that already created a campaign", () => {
    expect(isActivationEligible(org({ id: 11, name: "Grey Box Consulting", campaign_count: 1 }), now)).toBe(false);
  });

  it("skips expired or grandfathered (no expiry) trials", () => {
    expect(isActivationEligible(org({ id: 30, name: "Expired Co", planExpiresAt: ago(1) }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 31, name: "Grandfather Co", planExpiresAt: null }), now)).toBe(false);
  });

  it("respects trueTrials exclusions (canary / Adeo / walkthrough / test / founder)", () => {
    expect(isActivationEligible(org({ id: 90, name: "Signup Canary's organization", admin_email: "canary@x.com" }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 91, name: "Adeo", admin_email: "adeo@x.com" }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 92, name: "Trial Walkthrough Co", admin_email: "walk@x.com" }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 93, name: "test", admin_email: "t@x.com" }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 40, name: "Real MSP", admin_email: "kaanari@mac.com" }), now)).toBe(false);
    expect(isActivationEligible(org({ id: 6, name: "Real MSP", admin_email: "ops@real.com" }), now)).toBe(false);
  });

  it("skips missing admin email", () => {
    expect(isActivationEligible(org({ id: 50, name: "No Admin", admin_email: null }), now)).toBe(false);
  });
});

describe("selectActivationCandidates — cap ≤5, TRUE unused only", () => {
  it("drops excluded and activated orgs, then caps at 5", () => {
    expect(ACTIVATION_BATCH_CAP).toBe(5);
    expect(ACTIVATION_NUDGE_DAY).toBe(4);
    const pool: ActivationOrg[] = [
      greyBox,
      org({ id: 90, name: "Signup Canary's organization", admin_email: "c@x.com" }),
      org({ id: 12, name: "Has Campaign", campaign_count: 2 }),
      org({ id: 13, name: "MSP Two" }),
      org({ id: 14, name: "MSP Three" }),
      org({ id: 15, name: "MSP Four" }),
      org({ id: 16, name: "MSP Five" }),
      org({ id: 17, name: "MSP Six" }),
    ];
    const picked = selectActivationCandidates(pool, now, 99);
    expect(picked.map((o) => o.id)).toEqual([11, 13, 14, 15, 16]);
    expect(picked).toHaveLength(5);
  });
});

function fakeActivationSql(opts: {
  orgs: ActivationOrg[]
  claimed?: Set<string>
}) {
  const claimed = opts.claimed ?? new Set<string>();
  const deletes: string[] = [];
  const fn = (async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("?").replace(/\s+/g, " ");
    if (/CREATE TABLE/i.test(q)) return [];
    if (/FROM organizations/i.test(q)) return opts.orgs;
    if (/INSERT INTO trial_nudges_sent/i.test(q)) {
      const key = `${vals[0]}:${vals[1]}`;
      if (claimed.has(key)) return [];
      claimed.add(key);
      return [{ org_id: vals[0] }];
    }
    if (/DELETE FROM trial_nudges_sent/i.test(q)) {
      const key = `${vals[0]}:${vals[1]}`;
      claimed.delete(key);
      deletes.push(key);
      return [];
    }
    return [];
  }) as any;
  return { sql: fn, claimed, deletes };
}

describe("runTrialActivationNudges — send + idempotency", () => {
  it("sends once to Grey Box and never again on the same claim", async () => {
    const sends: Array<{ to: string; name: string }> = [];
    const { sql, claimed } = fakeActivationSql({ orgs: [greyBox] });
    const send = async (to: string, name: string) => {
      sends.push({ to, name });
      return true;
    };

    const first = await runTrialActivationNudges(sql, { now, send });
    expect(first.sent).toEqual([{ orgId: 11, nudge: ACTIVATION_NUDGE_DAY }]);
    expect(sends).toEqual([{ to: "dcharit@gmail.com", name: "Grey Box Consulting" }]);
    expect(claimed.has("11:4")).toBe(true);

    const second = await runTrialActivationNudges(sql, { now, send });
    expect(second.sent).toEqual([]);
    expect(sends).toHaveLength(1);
  });

  it("does not claim canaries or orgs that already have a campaign", async () => {
    const sends: string[] = [];
    const { sql, claimed } = fakeActivationSql({
      orgs: [
        org({ id: 90, name: "Signup Canary's organization", admin_email: "c@x.com" }),
        org({ id: 91, name: "Adeo", admin_email: "a@x.com" }),
        org({ id: 12, name: "Has Campaign", campaign_count: 1 }),
      ],
    });
    const r = await runTrialActivationNudges(sql, {
      now,
      send: async (to) => { sends.push(to); return true; },
    });
    expect(r.sent).toEqual([]);
    expect(sends).toEqual([]);
    expect(claimed.size).toBe(0);
  });

  it("un-claims when the send fails so the next run can retry", async () => {
    const { sql, claimed } = fakeActivationSql({ orgs: [greyBox] });
    const fail = await runTrialActivationNudges(sql, { now, send: async () => false });
    expect(fail.sent).toEqual([]);
    expect(claimed.has("11:4")).toBe(false);

    const ok = await runTrialActivationNudges(sql, { now, send: async () => true });
    expect(ok.sent).toEqual([{ orgId: 11, nudge: ACTIVATION_NUDGE_DAY }]);
  });

  it("caps a run at 5 even when more unused TRUE trials exist", async () => {
    const orgs = Array.from({ length: 8 }, (_, i) => org({ id: 100 + i, name: `MSP ${i}` }));
    const { sql } = fakeActivationSql({ orgs });
    const r = await runTrialActivationNudges(sql, { now, send: async () => true, cap: 5 });
    expect(r.sent).toHaveLength(5);
    expect(r.sent.every((s) => s.nudge === ACTIVATION_NUDGE_DAY)).toBe(true);
  });
});

describe("activation copy + spam-safe rails", () => {
  it("is the Vera 3-click path plus a white-glove offer, not a billing beat", () => {
    const copy = trialActivationCopy("Grey Box Consulting");
    expect(copy.subject).toMatch(/3 clicks/i);
    expect(copy.subject).toMatch(/run it for you/i);
    expect(copy.bodyInner).toMatch(/Targets/);
    expect(copy.bodyInner).toMatch(/Launch/);
    expect(copy.bodyInner).toMatch(/white-glove/i);
    expect(copy.bodyInner).toMatch(/Reply to this email/i);
    expect(copy.ctaUrl).toMatch(/\/campaigns/);
    expect(copy.bodyInner).not.toMatch(/\$149/);
    expect(copy.bodyInner).not.toMatch(/trial ended/i);
  });

  it("never reopens warm CTA 90–92 and never invents touch 93", async () => {
    expect(WARM_CTA_TOUCHES).toEqual([90, 91, 92]);
    expect(WARM_CTA_TOUCHES).not.toContain(93);
    const src = readFileSync("server/os/trialActivation.ts", "utf8");
    expect(src).not.toMatch(/sendWarmTrialCtas/);
    expect(src).not.toMatch(/\b93\b/);
    expect(src).toContain("isNonCustomerOrg");
    expect(src).toContain("sendTrialActivation");
    const seq = readFileSync("server/os/sequences.ts", "utf8");
    expect(seq).toContain("touch IN (90, 91, 92)");
    expect(seq).not.toMatch(/WARM_CTA_TOUCHES = \[[^\]] *93/);
    const agoH = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const exhausted = async () => [
      { touch: 90, status: "sent", updated_at: agoH(48) },
      { touch: 91, status: "sent", updated_at: agoH(48) },
      { touch: 92, status: "sent", updated_at: agoH(48) },
    ];
    expect(await nextWarmCtaTouch(exhausted as any, "00000000-0000-4000-8000-000000000001", 6)).toBeNull();
  });

  it("is mounted like trial-nudges (cron + handler + Bearer CRON_SECRET)", () => {
    const vercel = readFileSync("vercel.json", "utf8");
    expect(vercel).toContain("/api/os/trial-activation");
    expect(vercel).toContain("/api/os/trial-nudges");
    expect(readFileSync("api/handler.ts", "utf8")).toContain("/api/os/trial-activation");
    expect(readFileSync("server/os/trialNudges.ts", "utf8")).toContain("runTrialActivationNudges");
    const cron = readFileSync("server/os/trialActivation.ts", "utf8");
    expect(cron).toContain("Bearer ${secret}");
    expect(cron).toContain("CRON_SECRET");
    expect(ACTIVATION_BATCH_CAP).toBeLessThanOrEqual(5);
  });
});
