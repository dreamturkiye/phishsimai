// Janet's L5 CGO cycle at the PhishSim floor (l5). Missing os_autonomy_state
// no longer collapses to manual — getAutonomyLevel holds l5 — so issue/queue
// are not autonomy-denied. The DB layer is mocked (neon returns []).
import { describe, it, expect, beforeEach, vi } from "vitest";

const { queries } = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (strings: TemplateStringsArray | string, ..._vals: any[]) => {
    const q = Array.isArray(strings) ? (strings as TemplateStringsArray).join(" ? ") : String(strings);
    queries.push(q);
    return Promise.resolve([]); // reads return no rows → level null → manual
  },
}));

// getSql() (server/os/conn) throws without DATABASE_URL; neon is mocked above so
// the value is never actually used to connect.
vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");

import { runL5JanetCycle, buildJanetCgoSummary, type L5CycleResult } from "./l5Autonomy";

const hasInsert = (table: string) =>
  queries.some((q) => new RegExp(`INSERT\\s+INTO\\s+${table}`, "i").test(q));

beforeEach(() => {
  queries.length = 0;
  vi.restoreAllMocks();
});

describe("runL5JanetCycle at PhishSim floor l5 — no manual operating mode", () => {
  const actingDeps = {
    runJanetProactiveCycle: async (_sql: any, _c: string, _p: string, cbs: any) => {
      await cbs.issueAgentTask("nova", "ship the thing", "do it now").catch(() => {});
      await cbs.queueArchitectTask("refactor the gate", "notes");
      return { attempted: 2 };
    },
    advanceLongTermStrategies: async () => ({ ok: true }),
    runIntelFinanceProactiveCycle: async (_sql: any, _c: string, issueAgentTask: any) => {
      await issueAgentTask("finn", "reconcile trials", "analysis").catch(() => {});
      return { ok: true };
    },
  };

  it("does not autonomy-deny issue_agent_task or queue_architect_task", async () => {
    const result = await runL5JanetCycle("phishsimai", "phishsimai", actingDeps);
    expect(result.gateDeniedCount).toBe(0);
    expect(result.gateDenials.filter((d) => d.reason.includes("below_min_level"))).toHaveLength(0);
  });

  it("completes without throwing", async () => {
    let threw = false;
    const result = await runL5JanetCycle("phishsimai", "phishsimai", actingDeps).catch(() => {
      threw = true;
      return null;
    });
    expect(threw).toBe(false);
    expect(result).not.toBeNull();
  });
});

describe("buildJanetCgoSummary — the cron body returns 200, never throws", () => {
  const fullyDeniedL5: L5CycleResult = {
    proactive: {}, strategies: {}, intelFinance: {},
    gateDenials: [
      { action: "issue_agent_task", target: "nova", reason: "below_min_level:l3" },
      { action: "queue_architect_task", target: "refactor", reason: "denied_or_null" },
    ],
    gateDeniedCount: 2,
  };

  it("returns an ok summary when the L5 cycle ran and was fully gate-denied", async () => {
    const summary = await buildJanetCgoSummary("phishsimai", {
      orchestrate: async () => ({ standup: "ok" }),
      runL5: async () => fullyDeniedL5,
    });
    expect(summary.ok).toBe(true);
    expect(summary.ran).toContain("l5_janet_cycle");
    expect(summary.gateDeniedCount).toBe(2);
    expect(summary.l5.gateDenials).toHaveLength(2);
  });

  it("does NOT throw when the L5 sub-cycle errors — cron still returns a summary (200)", async () => {
    let threw = false;
    const summary = await buildJanetCgoSummary("phishsimai", {
      orchestrate: async () => ({ ok: true }),
      runL5: async () => { throw new Error("LLM timeout"); },
    }).catch(() => { threw = true; return null; });
    expect(threw).toBe(false);
    expect(summary!.l5.ran).toBe(false);
    expect(summary!.errors.some((e) => e.startsWith("l5:"))).toBe(true);
  });

  it("does NOT throw when orchestration errors either", async () => {
    let threw = false;
    const summary = await buildJanetCgoSummary("phishsimai", {
      orchestrate: async () => { throw new Error("standup boom"); },
      runL5: async () => fullyDeniedL5,
    }).catch(() => { threw = true; return null; });
    expect(threw).toBe(false);
    expect(summary!.errors.some((e) => e.startsWith("orchestration:"))).toBe(true);
    expect(summary!.ran).toContain("l5_janet_cycle"); // L5 still ran despite standup failing
  });
});
