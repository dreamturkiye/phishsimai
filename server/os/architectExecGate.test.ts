// ─────────────────────────────────────────────────────────────────────────────
//  AUTONOMY GATE ON THE EXECUTE PATH — PhishSim has no manual operating mode.
//
//  Stored 'manual' (or any sub-floor row) is floored to l5. Marcus may poll and
//  execute. The circuit breaker remains the live halt. Hard stops still deny.
//
//  Uses the REAL autonomy gate against a fake DB.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  process.env.HQ_SECRET = "test-hq";
  process.env.ARCHITECT_SECRET = "test-hq";
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
    if (/UPDATE os_architect_tasks/i.test(q) && /RETURNING/i.test(q)) {
      return Promise.resolve([
        { id: "task-1", task: "Fix the TypeError in routes.ts guard", status: "running", source: "janet", bug_id: "bug-1" },
      ]);
    }
    return Promise.resolve([]);
  },
}));

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
const req = (over: any = {}) => ({
  headers: { "x-os-secret": "test-hq" },
  query: { secret: "test-hq" },
  method: "GET",
  ...over,
  body: { secret: "test-hq", ...(over.body ?? {}) },
});

const claimQueries = () =>
  h.queries.filter((q) => /UPDATE os_architect_tasks/i.test(q) && /SET\s+status='running'/i.test(q));

beforeEach(() => {
  h.queries.length = 0;
  h.breakerCalls.length = 0;
  h.level = "manual";
  h.breakerAllows = true;
});

describe("architectPending — stored manual is floored to l5 (PS-L57-NO-MANUAL-01)", () => {
  it("hands out queued tasks; operative level is l5 not manual", async () => {
    const res = mockRes();
    await architectPending(req() as any, res);

    expect(res.body.autonomy).toBe("no_approval_required");
    expect(res.body.count).toBe(1);
    expect(res.body.tasks[0].id).toBe("task-1");
    expect(claimQueries().length).toBe(1);
  });
});

describe("architectPending at an allowed stored level ('l3')", () => {
  it("claims and hands out tasks normally (also floored to l5)", async () => {
    h.level = "l3";
    const res = mockRes();
    await architectPending(req() as any, res);

    expect(res.body.autonomy).toBe("no_approval_required");
    expect(res.body.count).toBe(1);
    expect(res.body.tasks[0].id).toBe("task-1");
    expect(claimQueries().length).toBe(1);
  });
});

describe("architectCode — stored manual is floored; breaker remains the halt", () => {
  it("passes the autonomy gate and reaches the breaker when stored is manual", async () => {
    h.breakerAllows = false;
    const res = mockRes();

    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );

    expect(h.breakerCalls.length).toBe(1);
    expect(res.statusCode).toBe(423);
    expect(res.body.autonomy).toBeUndefined();
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});

describe("architectCode at an allowed stored level ('l3')", () => {
  it("passes the autonomy gate and reaches the breaker", async () => {
    h.level = "l3";
    h.breakerAllows = false;
    const res = mockRes();

    await architectCode(
      req({ method: "POST", body: { task: "Fix the TypeError in routes.ts guard" } }) as any,
      res,
    );

    expect(h.breakerCalls.length).toBe(1);
    expect(res.statusCode).toBe(423);
    expect(res.body.autonomy).toBeUndefined();
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});

describe("execution requires the breaker even at the floor", () => {
  it("stored manual + breaker open → denied (breaker wins, not a manual collapse)", async () => {
    h.level = "manual";
    h.breakerAllows = false;
    const res = mockRes();
    await architectCode(req({ method: "POST", body: { task: "Fix the TypeError in routes" } }) as any, res);
    expect(res.statusCode).toBe(423);
    expect(res.body.error).toMatch(/circuit breaker/i);
    expect(res.body.autonomy).toBeUndefined();
  });

  it("stored l3 + breaker open → denied (breaker wins)", async () => {
    h.level = "l3";
    h.breakerAllows = false;
    const res = mockRes();
    await architectCode(req({ method: "POST", body: { task: "Fix the TypeError in routes" } }) as any, res);
    expect(res.statusCode).toBe(423);
    expect(res.body.error).toMatch(/circuit breaker/i);
  });
});
