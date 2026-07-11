// Batch 1 — Janet's L5 CGO cycle is now wired to the daily cron, but stays a
// no-op at level 'manual': every write it attempts is DENIED by the autonomy
// gate and logged, and NOTHING lands in agent_tasks / os_architect_tasks.
//
// The DB layer is mocked: neon() returns a recorder that logs every query and
// returns [] for reads. With no os_autonomy_state row, getAutonomyLevel → null →
// 'manual', so the gate fails closed and denies BEFORE any insert. We assert the
// recorder never saw an insert into either gated table.
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

describe("runL5JanetCycle at level 'manual' — live but fully gate-denied", () => {
  // Fake sub-cycles that stand in for the real LLM-driven proactive cycles: they
  // simply attempt the writes Janet would attempt, through the injected callbacks.
  const denyingDeps = {
    runJanetProactiveCycle: async (_sql: any, _c: string, _p: string, cbs: any) => {
      await cbs.issueAgentTask("nova", "ship the thing", "do it now");
      await cbs.queueArchitectTask("refactor the gate", "notes");
      return { attempted: 2 };
    },
    advanceLongTermStrategies: async () => ({ ok: true }),
    runIntelFinanceProactiveCycle: async (_sql: any, _c: string, issueAgentTask: any) => {
      await issueAgentTask("finn", "raise prices", "analysis");
      return { ok: true };
    },
  };

  it("writes NOTHING to agent_tasks or os_architect_tasks", async () => {
    await runL5JanetCycle("phishsimai", "phishsimai", denyingDeps);
    expect(hasInsert("agent_tasks")).toBe(false);
    expect(hasInsert("os_architect_tasks")).toBe(false);
  });

  it("records a gate denial for every write it attempted (2 issue + 1 architect)", async () => {
    const result = await runL5JanetCycle("phishsimai", "phishsimai", denyingDeps);
    expect(result.gateDeniedCount).toBe(3);
    expect(result.gateDenials.filter((d) => d.action === "issue_agent_task")).toHaveLength(2);
    expect(result.gateDenials.filter((d) => d.action === "queue_architect_task")).toHaveLength(1);
    // issue_agent_task requires l3; at manual the gate reason is below_min_level.
    expect(result.gateDenials.find((d) => d.action === "issue_agent_task")?.reason).toContain("below_min_level");
  });

  it("audits the denials (proof the gate actually ran), but never a task insert", async () => {
    await runL5JanetCycle("phishsimai", "phishsimai", denyingDeps);
    expect(hasInsert("audit_log")).toBe(true);          // gate wrote denial audit rows
    expect(hasInsert("agent_tasks")).toBe(false);
    expect(hasInsert("os_architect_tasks")).toBe(false);
  });

  it("completes without throwing even though every write is denied", async () => {
    let threw = false;
    const result = await runL5JanetCycle("phishsimai", "phishsimai", denyingDeps).catch(() => {
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
