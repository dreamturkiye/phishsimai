// Founder brief — the honesty invariant's last stand: null ⇒ 'no data', never $0.
import { describe, it, expect } from "vitest";
import { renderFounderBrief, composeFounderBrief, type BriefData, type BriefDeps, type ProductBrief } from "./founderBrief";

const base = (over: Partial<ProductBrief> = {}): ProductBrief => ({
  productId: "phishsimai",
  mrrCents: null,
  mrrDeltaCents: null,
  tasksCompleted: null,
  tasksFailed: null,
  agentScoreAvg: null,
  autonomyLevel: "manual",
  openBreakers: [],
  pendingEscalations: [],
  agentsBelowL5: [],
  ...over,
});

describe("renderFounderBrief — honesty (null ⇒ 'no data')", () => {
  it("null MRR renders 'no data', NEVER $0", () => {
    const md = renderFounderBrief({ date: "2026-07-10", products: [base({ mrrCents: null })] });
    expect(md).toContain("MRR:** no data");
    expect(md).not.toContain("$0");
  });

  it("null agent score & null tasks render 'no data', not 0", () => {
    const md = renderFounderBrief({ date: "2026-07-10", products: [base({ agentScoreAvg: null, tasksCompleted: null, tasksFailed: null })] });
    expect(md).toContain("Agent score:** no data");
    expect(md).toContain("no data shipped / no data failed");
  });

  it("a genuine zero renders 0 (distinct from null)", () => {
    const md = renderFounderBrief({ date: "2026-07-10", products: [base({ mrrCents: 0, tasksCompleted: 0, tasksFailed: 0 })] });
    expect(md).toContain("MRR:** $0"); // a real, counted zero
    expect(md).toContain("0 shipped / 0 failed");
  });

  it("real metrics render as values, with delta and breaker/escalation lines", () => {
    const md = renderFounderBrief({
      date: "2026-07-10",
      products: [base({
        mrrCents: 14900, mrrDeltaCents: 14900, tasksCompleted: 3, tasksFailed: 1, agentScoreAvg: 8.2,
        openBreakers: [{ fingerprint: "abcdef0123456789", state: "open", tripReason: "consecutive_failures" }],
        pendingEscalations: [{ id: 5, category: "breaker_trip", ageMs: 7_200_000 }],
      })],
    });
    expect(md).toContain("$149");
    expect(md).toContain("vs prior day");
    expect(md).toContain("3 shipped / 1 failed");
    expect(md).toContain("8.2");
    expect(md).toContain("Open breaker trips:** 1");
    expect(md).toContain("Pending escalations:** 1");
  });
});

describe("composeFounderBrief — store idempotently, deliver, resilient", () => {
  it("stores idempotently per date (one row) and sends each run", async () => {
    const saved = new Map<string, string>();
    const sends: string[] = [];
    const data: BriefData = { date: "2026-07-10", products: [base()] };
    const deps: BriefDeps = {
      gather: async () => data,
      saveBrief: async (d, md) => { saved.set(d, md); }, // Map ⇒ upsert semantics (one row/date)
      send: async (md) => { sends.push(md); return { ok: true }; },
    };
    const r1 = await composeFounderBrief(deps, "2026-07-10");
    const r2 = await composeFounderBrief(deps, "2026-07-10");
    expect(r1.stored).toBe(true);
    expect(r1.sent).toBe(true);
    expect(r2.stored).toBe(true);
    expect(saved.size).toBe(1); // idempotent per date — never a duplicate
    expect(sends).toHaveLength(2);
    expect(r1.contentMd).toContain("no data");
  });

  it("a saveBrief failure (e.g. table not yet migrated) does NOT block delivery", async () => {
    const deps: BriefDeps = {
      gather: async () => ({ date: "d", products: [base()] }),
      saveBrief: async () => { throw new Error("founder_briefs not migrated"); },
      send: async () => ({ ok: true }),
    };
    const r = await composeFounderBrief(deps, "d");
    expect(r.stored).toBe(false);
    expect(r.sent).toBe(true); // delivered anyway
  });

  it("Telegram env unset → skipped, no crash", async () => {
    const deps: BriefDeps = {
      gather: async () => ({ date: "d", products: [base()] }),
      saveBrief: async () => {},
      send: async () => ({ ok: false, skipped: true }),
    };
    const r = await composeFounderBrief(deps, "d");
    expect(r.sent).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.stored).toBe(true);
  });
});
