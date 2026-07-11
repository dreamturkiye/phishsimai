// ─────────────────────────────────────────────────────────────────────────────
//  AUTONOMY GATE ON THE EXECUTE PATH
//
//  The gate historically guarded only task CREATION (selfHeal.queueJanetArchitectTask).
//  Execution — the daemon poll (architectPending) and code-gen/apply (architectCode) —
//  was guarded only by the circuit breaker and a shared secret. So a task row that
//  ALREADY existed was still executable at level='manual', and "Marcus can't act"
//  rested on the daemon being switched off rather than on the gate.
//
//  These tests pin the fix:
//    (a) at 'manual', architectPending hands out an EMPTY queue even with queued rows
//    (b) at 'manual', architectCode denies execution even with a CLOSED breaker
//    (c) queued rows are NOT cancelled or mutated by a denied poll — they wait
//    (d) at an allowed level, both paths work normally
//
//  Uses the REAL autonomy gate against a fake DB.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  process.env.HQ_SECRET = "test-hq";        // read at module load by architectPending
  process.env.ARCHITECT_SECRET = "test-hq"; // read at module load by version.ts
  return {
    queries: [] as string[],
    level: "manual" as string,
    breakerAllows: true,
    breakerCalls: [] as string[],
  };
});

vi.mock("./conn", () => ({
  getSql: () => (strings: TemplateStringsArray, ...vals: any[]) => {
    const q = strings.join(" ? ");
    h.queries.push(q);
    if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: h.level }]);
    // The daemon's claim query — pretend a real queued task is sitting there.
    if (/UPDATE os_architect_tasks/i.test(q) && /RETURNING/i.test(q)) {
      return Promise.resolve([
        { id: "task-1", task: "Fix the TypeError in routes.ts guard", status: "running", source: "janet", bug_id: "bug-1" },
      ]);
    }
    return Promise.resolve([]);
  },
}));

// Breaker is mocked so we can prove ORDERING: at 'manual' the autonomy gate must
// deny BEFORE the breaker is ever consulted (breakerCalls stays empty).
vi.mock("./marcusBreaker", () => ({
  guardMarcusAllowed: async (_deps: any, action: string) => {
    h.breakerCalls.push(action);
    return h.breakerAllows;
  },
  guardMarcusDiff: async () => ({ verdict: "allow", analysis: {} }),
  recordMarcusOutcome: async () => {},
  fileSetToDiff: () => [],
  makeMarcusBreakerDeps: () => ({}),
}));

vi.mock("./marcusPipelineHealth", () => ({ recordWatcherHeartbeat: async () => {} }));
vi.mock("./telegram", () => ({ sendTelegram: async () => ({ ok: true }) }));

import { architectPending } from "./architectPending";
import { architectCode } from "./architectCode";

function mockRes() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
// architectPending authenticates via the x-os-secret header; architectCode via
// query.secret / body.secret. Supply both so each handler sees a valid caller —
// these tests are about the GATE, not about auth.
const req = (over: any = {}) => ({
  headers: { "x-os-secret": "test-hq" },
  query: { secret: "test-hq" },
  method: "GET",
  ...over,
  body: { secret: "test-hq", ...(over.body ?? {}) },
});

// The CLAIM specifically — `SET status='running'`. Matching merely on the word
// "running" would also catch the cleanup sweeps, whose WHERE clauses mention it.
const claimQueries = () =>
  h.queries.filter((q) => /UPDATE os_architect_tasks/i.test(q) && /SET\s+status='running'/i.test(q));
const mutatingQueries = () =>
  h.queries.filter((q) => /UPDATE os_architect_tasks/i.test(q));

beforeEach(() => {
  h.queries.length = 0;
  h.breakerCalls.length = 0;
  h.level = "manual";
  h.breakerAllows = true;
});

describe("architectPending (the daemon poll) at level 'manual'", () => {
  it("hands out an EMPTY queue even though a queued task exists", async () => {
    const res = mockRes();
    await architectPending(req() as any, res);

    expect(res.body.tasks).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.autonomy).toBe("denied");
    expect(res.body.level).toBe("manual");
  });

  it("does NOT claim/flip any task to 'running'", async () => {
    const res = mockRes();
    await architectPending(req() as any, res);
    expect(claimQueries()).toEqual([]);
  });

  it("does NOT cancel or otherwise mutate the queued rows — they wait for approval", async () => {
    const res = mockRes();
    await architectPending(req() as any, res);
    // No UPDATE of any kind against os_architect_tasks: not the claim, not the
    // dup-cleanup, not the malformed-task sweep. The queue is left untouched.
    expect(mutatingQueries()).toEqual([]);
  });
});

describe("architectPending at an allowed level ('l3')", () => {
  it("claims and hands out tasks normally", async () => {
    h.level = "l3";
    const res = mockRes();
    await architectPending(req() as any, res);

    expect(res.body.autonomy).toBe("no_approval_required");
    expect(res.body.count).toBe(1);
    expect(res.body.tasks[0].id).toBe("task-1");
    expect(claimQueries().length).toBe(1);
  });
});

describe("architectCode (execute) at level 'manual'", () => {
  it("DENIES execution even when the circuit breaker is CLOSED", async () => {
    h.breakerAllows = true; // breaker would happily allow — the level must still deny
    const res = mockRes();

    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );

    expect(res.statusCode).toBe(423);
    expect(res.body.parked).toBe(true);
    expect(res.body.autonomy).toBe("denied");
    expect(res.body.level).toBe("manual");
  });

  it("denies BEFORE consulting the breaker — level is checked first", async () => {
    const res = mockRes();
    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );
    expect(h.breakerCalls).toEqual([]); // breaker never reached
  });

  it("generates NO code and returns no files", async () => {
    const res = mockRes();
    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );
    expect(res.body.files).toBeUndefined();
    expect(res.body.ok).toBe(false);
  });
});

describe("architectCode at an allowed level ('l3')", () => {
  it("passes the autonomy gate and reaches the breaker", async () => {
    h.level = "l3";
    h.breakerAllows = false; // breaker OPEN → stops here, with a DIFFERENT reason
    const res = mockRes();

    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );

    // Reaching the breaker at all proves the autonomy gate let it through.
    expect(h.breakerCalls.length).toBe(1);
    expect(res.statusCode).toBe(423);
    expect(res.body.autonomy).toBeUndefined();       // NOT an autonomy denial
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});

describe("execution requires BOTH gates", () => {
  it("level denied + breaker closed → denied (level wins)", async () => {
    h.level = "manual";
    h.breakerAllows = true;
    const res = mockRes();
    await architectCode(req({ method: "POST", body: { task: "Fix the TypeError in routes" } }) as any, res);
    expect(res.body.autonomy).toBe("denied");
  });

  it("level allowed + breaker open → denied (breaker wins)", async () => {
    h.level = "l3";
    h.breakerAllows = false;
    const res = mockRes();
    await architectCode(req({ method: "POST", body: { task: "Fix the TypeError in routes" } }) as any, res);
    expect(res.statusCode).toBe(423);
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});
