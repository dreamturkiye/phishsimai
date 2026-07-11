// metrics_daily writer — the honesty invariant under test.
// REAL or NULL, never 0-as-unknown: a genuinely-counted zero is 0; an
// uncomputable value is null. These are asserted to be DIFFERENT.
import { describe, it, expect } from "vitest";
import { computeMetricsRow, writeMetricsSnapshot } from "./metricsSnapshot";

// A fake tagged-template SQL that answers per source, or throws to simulate an
// unqueryable source. Query text is matched to route the response.
function makeSql(opts: {
  tasks?: { completed: number; failed: number } | "throw";
  queue?: number | "throw";
  subs?: Array<{ plan: string; n: number }> | "throw";
  newSubs?: number | "throw";
  onInsert?: (q: string) => void;
}) {
  return ((strings: TemplateStringsArray, ..._vals: any[]) => {
    const q = strings.join(" ? ");
    if (/INSERT INTO\s+metrics_daily/i.test(q)) { opts.onInsert?.(q); return Promise.resolve([]); }
    if (/FROM agent_tasks/i.test(q)) {
      if (opts.tasks === "throw") return Promise.reject(new Error("agent_tasks unqueryable"));
      return Promise.resolve([{ completed: opts.tasks?.completed ?? 0, failed: opts.tasks?.failed ?? 0 }]);
    }
    if (/FROM os_architect_tasks/i.test(q)) {
      if (opts.queue === "throw") return Promise.reject(new Error("queue unqueryable"));
      return Promise.resolve([{ n: opts.queue ?? 0 }]);
    }
    if (/FROM organizations/i.test(q) && /GROUP BY plan/i.test(q)) {
      if (opts.subs === "throw") return Promise.reject(new Error("organizations unqueryable"));
      return Promise.resolve(opts.subs ?? []);
    }
    if (/planActivatedAt/i.test(q)) {
      if (opts.newSubs === "throw") return Promise.reject(new Error("newSubs unqueryable"));
      return Promise.resolve([{ n: opts.newSubs ?? 0 }]);
    }
    return Promise.resolve([]);
  }) as any;
}

const DATE = "2026-07-09";

describe("computeMetricsRow — REAL-vs-NULL discipline", () => {
  it("tasks_completed/failed are the REAL counts from agent_tasks", async () => {
    const row = await computeMetricsRow(makeSql({ tasks: { completed: 3, failed: 1 } }), "phishsimai", DATE);
    expect(row.tasks_completed).toBe(3);
    expect(row.tasks_failed).toBe(1);
  });

  it("zero subscriptions → mrr_cents 0 (a REAL zero), active_subs 0 — NOT null", async () => {
    const row = await computeMetricsRow(makeSql({ subs: [] }), "phishsimai", DATE);
    expect(row.active_subs).toBe(0);
    expect(row.mrr_cents).toBe(0);
    expect(row.mrr_cents).not.toBeNull();
  });

  it("priced active subs → REAL MRR sum (starter×2 + growth)", async () => {
    const row = await computeMetricsRow(
      makeSql({ subs: [{ plan: "starter", n: 2 }, { plan: "growth", n: 1 }] }),
      "phishsimai", DATE,
    );
    expect(row.active_subs).toBe(3);
    expect(row.mrr_cents).toBe(14900 * 2 + 29900); // 59700
  });

  it("unqueryable organizations → mrr_cents & active_subs NULL (not 0)", async () => {
    const row = await computeMetricsRow(makeSql({ subs: "throw" }), "phishsimai", DATE);
    expect(row.active_subs).toBeNull();
    expect(row.mrr_cents).toBeNull();
  });

  it("active sub on an UNPRICED plan (unlimited) → mrr NULL but active_subs REAL", async () => {
    const row = await computeMetricsRow(
      makeSql({ subs: [{ plan: "unlimited", n: 1 }, { plan: "starter", n: 1 }] }),
      "phishsimai", DATE,
    );
    expect(row.active_subs).toBe(2);   // the count is real and stands
    expect(row.mrr_cents).toBeNull();  // can't honestly total → null, never a guess
  });

  it("unqueryable agent_tasks → tasks_* NULL (not 0)", async () => {
    const row = await computeMetricsRow(makeSql({ tasks: "throw" }), "phishsimai", DATE);
    expect(row.tasks_completed).toBeNull();
    expect(row.tasks_failed).toBeNull();
  });

  it("agent_score_avg is ALWAYS null; churned_subs is null; real fields populate", async () => {
    const row = await computeMetricsRow(
      makeSql({ tasks: { completed: 5, failed: 0 }, subs: [{ plan: "pro", n: 1 }], newSubs: 2, queue: 4 }),
      "phishsimai", DATE,
    );
    expect(row.agent_score_avg).toBeNull(); // never computed / fabricated
    expect(row.churned_subs).toBeNull();    // no churn timestamp in schema
    expect(row.new_subs).toBe(2);
    expect(row.queue_depth).toBe(4);
    expect(row.mrr_cents).toBe(74900);
  });
});

describe("writeMetricsSnapshot — upsert + honesty guard", () => {
  it("upserts ON CONFLICT (product_id, snapshot_date) DO UPDATE (idempotent → one row)", async () => {
    let insertSql = "";
    const res = await writeMetricsSnapshot(
      "phishsimai", DATE,
      makeSql({ tasks: { completed: 1, failed: 0 }, subs: [], onInsert: (q) => (insertSql = q) }),
    );
    expect(res.written).toBe(true);
    expect(/INSERT INTO\s+metrics_daily/i.test(insertSql)).toBe(true);
    expect(/ON CONFLICT[\s\S]*product_id[\s\S]*snapshot_date[\s\S]*DO UPDATE/i.test(insertSql)).toBe(true);
  });

  it("re-running the same date issues an idempotent upsert each time (never a duplicate row)", async () => {
    const inserts: string[] = [];
    const sql = makeSql({ tasks: { completed: 1, failed: 0 }, subs: [], onInsert: (q) => inserts.push(q) });
    await writeMetricsSnapshot("phishsimai", DATE, sql);
    await writeMetricsSnapshot("phishsimai", DATE, sql);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((q) => /ON CONFLICT[\s\S]*DO UPDATE/i.test(q))).toBe(true);
  });

  it("REFUSES to write a fake-zero row when tasks are uncomputable (skips, no INSERT)", async () => {
    let inserted = false;
    const res = await writeMetricsSnapshot(
      "phishsimai", DATE,
      makeSql({ tasks: "throw", onInsert: () => (inserted = true) }),
    );
    expect(res.written).toBe(false);
    expect(res.reason).toBe("tasks_uncomputable");
    expect(inserted).toBe(false); // no fabricated 0 row written
  });
});
