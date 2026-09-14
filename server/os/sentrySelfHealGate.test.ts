// ─────────────────────────────────────────────────────────────────────────────
//  Sentry → self-heal at the PhishSim floor (l5). Stored 'manual' is not a live
//  deny. queueJanetArchitectTask creates the row and wakes Marcus. The breaker
//  and hard stops remain the safety.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  queries: [] as string[],
  level: "manual" as string,
  telegrams: [] as string[],
  wakes: [] as any[],
}));

vi.mock("./conn", () => ({
  getSql: () => (strings: TemplateStringsArray, ...vals: any[]) => {
    const q = strings.join(" ? ");
    h.queries.push(q);

    if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: h.level }]);
    if (/FROM circuit_breaker_state/i.test(q)) return Promise.resolve([]);
    if (/UPDATE bug_reports/i.test(q) && /RETURNING/i.test(q)) {
      return Promise.resolve([{
        id: "bug-1",
        error_message: "TypeError: cannot read properties of undefined (reading 'id')",
        url_path: "/api/os/hq",
        diagnosis: { root_cause: "org ctx missing", file_affected: "server/os/routes.ts" },
      }]);
    }
    if (/SELECT id FROM os_architect_tasks/i.test(q)) return Promise.resolve([]);
    if (/INSERT INTO os_architect_tasks/i.test(q) && /RETURNING/i.test(q)) {
      return Promise.resolve([{ id: "task-queued-1" }]);
    }
    return Promise.resolve([]);
  },
}));

vi.mock("./telegram", () => ({
  sendTelegram: async (t: string) => { h.telegrams.push(t); return { ok: true }; },
}));

vi.mock("./memory", () => ({ ensureMemoryTable: async () => {} }));

vi.mock("./wakeMarcus", () => ({
  dispatchMarcusWake: async (...args: any[]) => { h.wakes.push(args); },
}));

import { queueJanetArchitectTask } from "./selfHeal";

const insertsOfArchitectTasks = () =>
  h.queries.filter((q) => /INSERT\s+INTO\s+os_architect_tasks/i.test(q));
const parkUpdates = () =>
  h.queries.filter((q) => /UPDATE bug_reports/i.test(q) && /awaiting_approval/i.test(q));

beforeEach(() => {
  h.queries.length = 0;
  h.telegrams.length = 0;
  h.wakes.length = 0;
  h.level = "manual";
});

describe("Sentry → self-heal, stored manual is floored to l5", () => {
  it("queues the architect task — no founder-approval park", async () => {
    const id = await queueJanetArchitectTask({
      task: "Fix TypeError in server/os/routes.ts — guard org ctx before read",
      bugId: "bug-1",
      notes: "Marcus diagnosis conf=88%",
    });

    expect(id).not.toBeNull();
    expect(insertsOfArchitectTasks().length).toBe(1);
    expect(parkUpdates()).toEqual([]);
  });

  it("wakes Marcus so the fix can be applied", async () => {
    await queueJanetArchitectTask({ task: "Fix the thing that is broken", bugId: "bug-1" });
    expect(h.wakes.length).toBe(1);
  });

  it("does not escalate a founder-approval park telegram", async () => {
    await queueJanetArchitectTask({
      task: "Guard org ctx before reading .id in routes.ts",
      bugId: "bug-1",
      notes: "Marcus diagnosis conf=88%",
    });
    expect(h.telegrams.some((m) => /AWAITING YOUR APPROVAL/i.test(m))).toBe(false);
  });
});

describe("at an EARNED stored level ('l3'), the same path is permitted", () => {
  it("queues the architect task and wakes Marcus — proving the gate is a gate, not a wall", async () => {
    h.level = "l3";

    const id = await queueJanetArchitectTask({
      task: "Fix TypeError in server/os/routes.ts — guard org ctx before read",
      bugId: "bug-1",
      notify: false,
    });

    expect(id).not.toBeNull();
    expect(insertsOfArchitectTasks().length).toBe(1);
    expect(h.wakes.length).toBe(1);
    expect(parkUpdates()).toEqual([]);
  });
});
