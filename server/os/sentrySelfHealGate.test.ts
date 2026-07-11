// ─────────────────────────────────────────────────────────────────────────────
//  THE SAFETY TEST — "can a Sentry-triggered fix reach live prod at level=manual?"
//
//  This is the test that has to be right. It exercises the REAL autonomy gate and
//  the REAL queueJanetArchitectTask against a fake database — the gate logic under
//  test is the genuine article, not a mock of it. A mocked gate would prove nothing.
//
//  Asserts, at level='manual':
//    • queueJanetArchitectTask returns null
//    • ZERO `INSERT INTO os_architect_tasks` — no task row exists to be claimed
//    • ZERO Marcus wake dispatches — the daemon is never poked  (== zero deploys)
//    • the bug is PARKED at awaiting_approval, not dropped
//    • the diagnosis + proposed fix are escalated to Telegram
//
//  And at level='l3' (allowed, breaker closed) the normal path still works — so the
//  gate is proven to be a gate, not a wall.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fake DB. Records every query so we can assert on what did NOT happen. ────
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

    // The autonomy level the gate reads. This is the single input that decides everything.
    if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: h.level }]);

    // Circuit breaker: no row => closed => Marcus permitted (so that when the gate
    // DOES allow, nothing else is silently blocking and the test still means something).
    if (/FROM circuit_breaker_state/i.test(q)) return Promise.resolve([]);

    // The park UPDATE returns the bug row it parked.
    if (/UPDATE bug_reports/i.test(q) && /RETURNING/i.test(q)) {
      return Promise.resolve([{
        id: "bug-1",
        error_message: "TypeError: cannot read properties of undefined (reading 'id')",
        url_path: "/api/os/hq",
        diagnosis: { root_cause: "org ctx missing", file_affected: "server/os/routes.ts" },
      }]);
    }

    // No pre-existing architect task for this bug.
    if (/SELECT id FROM os_architect_tasks/i.test(q)) return Promise.resolve([]);

    return Promise.resolve([]);
  },
}));

vi.mock("./telegram", () => ({
  sendTelegram: async (t: string) => { h.telegrams.push(t); return { ok: true }; },
}));

vi.mock("./memory", () => ({ ensureMemoryTable: async () => {} }));

// The Marcus wake dispatch is the ONLY thing in this repo that pokes the external
// daemon that actually applies code and deploys. Zero calls here == zero deploys.
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

describe("Sentry → self-heal, at autonomy level 'manual'", () => {
  it("DENIES the architect task — no task row is created", async () => {
    const id = await queueJanetArchitectTask({
      task: "Fix TypeError in server/os/routes.ts — guard org ctx before read",
      bugId: "bug-1",
      notes: "Marcus diagnosis conf=88%",
    });

    expect(id).toBeNull();
    expect(insertsOfArchitectTasks()).toEqual([]);
  });

  it("dispatches ZERO Marcus wakes — nothing can be applied or deployed", async () => {
    await queueJanetArchitectTask({ task: "Fix the thing that is broken", bugId: "bug-1" });
    expect(h.wakes).toEqual([]); // ← the zero-deploys assertion
  });

  it("PARKS the bug at awaiting_approval instead of dropping it", async () => {
    await queueJanetArchitectTask({ task: "Fix the thing that is broken", bugId: "bug-1" });
    expect(parkUpdates().length).toBe(1);
  });

  it("escalates the diagnosis + proposed fix to Telegram for founder approval", async () => {
    await queueJanetArchitectTask({
      task: "Guard org ctx before reading .id in routes.ts",
      bugId: "bug-1",
      notes: "Marcus diagnosis conf=88%",
    });

    expect(h.telegrams.length).toBe(1);
    const msg = h.telegrams[0];
    expect(msg).toMatch(/AWAITING YOUR APPROVAL/i);
    expect(msg).toMatch(/Guard org ctx before reading/); // the proposed fix
    expect(msg).toMatch(/org ctx missing/);              // the diagnosis root cause
    expect(msg).toMatch(/NOT applied, NOT deployed/i);
  });

  it("writes an audit row for the denial", async () => {
    await queueJanetArchitectTask({ task: "Fix the thing that is broken", bugId: "bug-1" });
    expect(h.queries.some((q) => /INSERT INTO audit_log/i.test(q))).toBe(true);
  });

  it("is idempotent — a second denial for an already-parked bug does not re-notify", async () => {
    // The park UPDATE is guarded by `status IS DISTINCT FROM 'awaiting_approval'`,
    // so an already-parked bug returns no row. Simulate that.
    const conn: any = await import("./conn");
    const realGetSql = conn.getSql;
    vi.spyOn(conn, "getSql").mockImplementation(() => (strings: TemplateStringsArray, ...v: any[]) => {
      const q = strings.join(" ? ");
      h.queries.push(q);
      if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: "manual" }]);
      if (/UPDATE bug_reports/i.test(q)) return Promise.resolve([]); // already parked → no row
      return Promise.resolve([]);
    });

    await queueJanetArchitectTask({ task: "Fix the thing that is broken", bugId: "bug-1" });
    expect(h.telegrams).toEqual([]); // no duplicate founder ping
    vi.spyOn(conn, "getSql").mockImplementation(realGetSql);
  });

  it("a task with NO linked bug is still denied, and parks nothing", async () => {
    const id = await queueJanetArchitectTask({ task: "Some proactive-loop task with no bug" });
    expect(id).toBeNull();
    expect(insertsOfArchitectTasks()).toEqual([]);
    expect(parkUpdates()).toEqual([]);
    expect(h.telegrams).toEqual([]);
  });
});

describe("at an EARNED level ('l3'), the same path is permitted", () => {
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
    expect(parkUpdates()).toEqual([]); // allowed → nothing is parked
  });
});
