// O.17 measurable agent L-levels — computation logic. Boundaries, null-when-no-data,
// window_stats population, and the DB gathering (fake sql, no live DB).
import { describe, it, expect } from "vitest";
import {
  computeAgentLevel, gatherAgentStats, computeAllAgentLevels, runAgentLevels, agentsBelowL5TwoWeeks,
  type AgentWindowStats,
} from "./agentLevels";

const base = (o: Partial<AgentWindowStats> = {}): AgentWindowStats => ({
  agentId: "nova", taskCount30: 30, avgScore30: 7.5, taskCount50: 50, avgScore50: 8.5,
  selfOriginatedCount: 12, selfOriginatedPct: 0.24, breakerFingerprints: 0, honestyViolations: 0, ...o,
});

function makeSql(opts: { tasks?: Array<{ score: number; issued_by: string }>; breakerOpen?: number }) {
  return ((strings: TemplateStringsArray, ..._v: any[]) => {
    const q = strings.join(" ? ");
    if (/FROM agent_tasks/i.test(q)) return Promise.resolve(opts.tasks ?? []);
    if (/FROM circuit_breaker_state/i.test(q)) return Promise.resolve([{ n: opts.breakerOpen ?? 0 }]);
    return Promise.resolve([]); // INSERT agent_levels, etc.
  }) as any;
}

describe("computeAgentLevel — boundaries", () => {
  it("L5 when avg50>=8, self>=20%, no honesty violation, no breaker", () => {
    expect(computeAgentLevel(base()).level).toBe("L5");
  });

  it("L4 exactly at 7.0; below at 6.9", () => {
    expect(computeAgentLevel(base({ avgScore30: 7.0, avgScore50: 7.0, selfOriginatedPct: 0 })).level).toBe("L4");
    expect(computeAgentLevel(base({ avgScore30: 6.9, avgScore50: 6.9, selfOriginatedPct: 0 })).level).toBe("below");
  });

  it("L5 exactly at avg 8.0 + 20% self; a shortfall drops to L4", () => {
    expect(computeAgentLevel(base({ avgScore50: 8.0, selfOriginatedPct: 0.20, avgScore30: 7.5 })).level).toBe("L5");
    expect(computeAgentLevel(base({ avgScore50: 8.0, selfOriginatedPct: 0.19, avgScore30: 7.5 })).level).toBe("L4"); // self too low
    expect(computeAgentLevel(base({ avgScore50: 7.9, avgScore30: 7.5 })).level).toBe("L4");                          // avg too low
  });

  it("a breaker fingerprint disqualifies BOTH L4 and L5", () => {
    expect(computeAgentLevel(base({ breakerFingerprints: 1 })).level).toBe("below");
  });

  it("a honesty violation disqualifies L5 (drops to L4 if eligible)", () => {
    expect(computeAgentLevel(base({ honestyViolations: 1, avgScore30: 7.5 })).level).toBe("L4");
  });

  it("null avg (no reviewed tasks) → below; window_stats null/0, never 0-as-unknown", () => {
    const r = computeAgentLevel(base({ avgScore30: null, avgScore50: null, taskCount30: 0, taskCount50: 0, selfOriginatedCount: 0, selfOriginatedPct: 0 }));
    expect(r.level).toBe("below");
    expect(r.window_stats.trailing30.avgScore).toBeNull();
    expect(r.window_stats.trailing30.taskCount).toBe(0);
    expect(r.window_stats.trailing50.avgScore).toBeNull();
  });

  it("window_stats records the real numbers behind the level", () => {
    const r = computeAgentLevel(base({ taskCount50: 42, avgScore50: 8.3, selfOriginatedCount: 10, selfOriginatedPct: 0.238 }));
    expect(r.window_stats.trailing50.taskCount).toBe(42);
    expect(r.window_stats.trailing50.avgScore).toBe(8.3);
    expect(r.window_stats.trailing50.selfOriginated).toBe(10);
    expect(r.window_stats.trailing50.selfOriginatedPct).toBe(0.24); // rounded to 2dp
    expect(r.window_stats.breakerFingerprints).toBe(0);
    expect(r.window_stats.honestyViolations).toBe(0);
  });
});

describe("gatherAgentStats + computeAllAgentLevels — from data", () => {
  it("computes REAL stats from reviewed tasks (12/50 self-originated = 24% → L5)", async () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({ score: 8, issued_by: i < 12 ? "nova" : "janet" }));
    const s = await gatherAgentStats(makeSql({ tasks }), "phishsimai", "nova");
    expect(s.taskCount50).toBe(50);
    expect(s.avgScore50).toBe(8);
    expect(s.avgScore30).toBe(8);
    expect(s.selfOriginatedCount).toBe(12);
    expect(s.selfOriginatedPct).toBeCloseTo(0.24, 2);
    expect(computeAgentLevel(s).level).toBe("L5");
  });

  it("zero reviewed tasks → null avgs → below (uncomputable, never 0)", async () => {
    const s = await gatherAgentStats(makeSql({ tasks: [] }), "phishsimai", "aria");
    expect(s.avgScore30).toBeNull();
    expect(s.avgScore50).toBeNull();
    expect(s.taskCount50).toBe(0);
    expect(computeAgentLevel(s).level).toBe("below");
  });

  it("Marcus with an OPEN breaker → breakerFingerprints>0 → not L4/L5", async () => {
    const tasks = Array.from({ length: 30 }, () => ({ score: 9, issued_by: "janet" }));
    const s = await gatherAgentStats(makeSql({ tasks, breakerOpen: 1 }), "phishsimai", "marcus");
    expect(s.breakerFingerprints).toBe(1);
    expect(computeAgentLevel(s).level).toBe("below");
  });

  it("computeAllAgentLevels covers all 9 agents; all 'below' with no data", async () => {
    const all = await computeAllAgentLevels(makeSql({ tasks: [] }), "phishsimai");
    expect(all.length).toBe(9);
    expect(all.every((a) => a.level === "below")).toBe(true);
  });
});

describe("runAgentLevels + founder-brief flag", () => {
  it("runAgentLevels computes for every agent and appends rows (stored)", async () => {
    const r = await runAgentLevels("phishsimai", makeSql({ tasks: [] }));
    expect(r.computed).toBe(9);
    expect(r.stored).toBe(true);
    expect(r.written).toBe(9);
    expect(r.levels).toHaveLength(9);
  });

  it("agentsBelowL5TwoWeeks flags an agent whose last 2 weekly levels are both below L5", async () => {
    const sql = ((strings: TemplateStringsArray, ...v: any[]) => {
      const q = strings.join(" ? ");
      if (/FROM agent_levels/i.test(q)) {
        const agent = v[0];
        return Promise.resolve(agent === "janet" ? [{ level: "below" }, { level: "L4" }] : [{ level: "L5" }, { level: "L5" }]);
      }
      return Promise.resolve([]);
    }) as any;
    const flagged = await agentsBelowL5TwoWeeks(sql, "phishsimai");
    expect(flagged).toContain("janet");
    expect(flagged).not.toContain("marcus");
  });
});
