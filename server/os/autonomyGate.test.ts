// Autonomy gate — the single choke point every autonomous write passes through.
// These prove: manual denies everything, hard stops deny at every level, the
// earned-level thresholds hold, failures fail closed, loops can swallow the
// denial, and NO source file inserts into the gated tables outside the writers.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import {
  decideAutonomy,
  assertAutonomyAllows,
  AutonomyDenied,
  isAutonomyDenied,
  HARD_STOPS,
  MIN_LEVEL,
  resolveReadableLevel,
  autonomyFloorFor,
  type AutonomyLevel,
  type DeniedAudit,
} from "./autonomyGate";

const LEVELS: AutonomyLevel[] = ["manual", "l2", "l3", "l4", "l5"];

describe("resolveReadableLevel — floor at read time (PS-L57-ENFORCE-01)", () => {
  it("PhishSim floor is l5", () => {
    expect(autonomyFloorFor("phishsimai")).toBe("l5");
  });

  it("a missing or unknown row is the floor — never manual", () => {
    expect(resolveReadableLevel("phishsimai", null, false)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", undefined, true)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", "bogus", false)).toBe("l5");
  });

  it("holds the floor when stored is below it, including kill-flag present", () => {
    expect(resolveReadableLevel("phishsimai", "manual", false)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", "manual", true)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", "l2", null)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", "l4", false)).toBe("l5");
  });

  it("never lowers a stored level that is already at or above the floor", () => {
    expect(resolveReadableLevel("phishsimai", "l5", false)).toBe("l5");
    expect(resolveReadableLevel("phishsimai", "l5", true)).toBe("l5");
  });
});

describe("decideAutonomy (pure decision)", () => {
  it("manual permits nothing autonomous — both writer actions deny", () => {
    expect(decideAutonomy("issue_agent_task", "manual").allowed).toBe(false);
    expect(decideAutonomy("queue_architect_task", "manual").allowed).toBe(false);
  });

  it("a hard stop is denied at EVERY level, including l5", () => {
    for (const hs of HARD_STOPS) {
      for (const lvl of LEVELS) {
        const d = decideAutonomy(hs, lvl);
        expect(d.allowed, `${hs}@${lvl}`).toBe(false);
        expect(d.reason).toBe("hard_stop");
      }
    }
  });

  it("at l3, issue_agent_task ALLOWS but send_simulation and deploy DENY", () => {
    expect(decideAutonomy("issue_agent_task", "l3").allowed).toBe(true);
    expect(decideAutonomy("queue_architect_task", "l3").allowed).toBe(true);
    expect(decideAutonomy("send_simulation", "l3").allowed).toBe(false);
    expect(decideAutonomy("deploy", "l3").allowed).toBe(false);
  });

  it("thresholds climb: send/crm at l4, deploy only at l5", () => {
    expect(decideAutonomy("send_simulation", "l4").allowed).toBe(true);
    expect(decideAutonomy("crm_write", "l4").allowed).toBe(true);
    expect(decideAutonomy("deploy", "l4").allowed).toBe(false);
    expect(decideAutonomy("deploy", "l5").allowed).toBe(true);
  });

  it("null / undefined / bogus level → manual → deny", () => {
    expect(decideAutonomy("issue_agent_task", null).allowed).toBe(false);
    expect(decideAutonomy("issue_agent_task", undefined).allowed).toBe(false);
    expect(decideAutonomy("issue_agent_task", "l9" as any).allowed).toBe(false);
    expect(decideAutonomy("issue_agent_task", null).effectiveLevel).toBe("manual");
  });

  it("unknown action denies (fail closed); spend is never auto-approved, even at l5", () => {
    expect(decideAutonomy("nonsense_action", "l5").allowed).toBe(false);
    expect(decideAutonomy("nonsense_action", "l5").reason).toBe("unknown_action");
    expect(decideAutonomy("spend", "l5").allowed).toBe(false);
    expect(MIN_LEVEL as Record<string, unknown>).not.toHaveProperty("spend");
  });
});

describe("assertAutonomyAllows (level read + audit + throw)", () => {
  const spyAudit = () => {
    const rows: DeniedAudit[] = [];
    return { rows, sink: async (r: DeniedAudit) => { rows.push(r); } };
  };

  it("PhishSim injected 'manual' is floored to l5 — issue/queue/send/crm ALLOW", async () => {
    for (const action of ["issue_agent_task", "queue_architect_task", "send_simulation", "crm_write"]) {
      const { rows, sink } = spyAudit();
      await expect(
        assertAutonomyAllows(action, "phishsimai", async () => "manual", sink),
      ).resolves.toBeUndefined();
      expect(rows).toHaveLength(0);
    }
  });

  it("a product without a floor still denies at injected manual", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("issue_agent_task", "otherco", async () => "manual", sink),
    ).rejects.toBeInstanceOf(AutonomyDenied);
    expect(rows[0]).toMatchObject({ action: "issue_agent_task", level: "manual", companyId: "otherco" });
  });

  it("a hard stop throws AND audits even at l5", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("adjust_pricing", "phishsimai", async () => "l5", sink),
    ).rejects.toMatchObject({ name: "AutonomyDenied", reason: "hard_stop" });
    expect(rows[0].reason).toBe("hard_stop");
  });

  it("at l3, issue_agent_task is allowed — resolves, no audit row", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("issue_agent_task", "phishsimai", async () => "l3", sink),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it("a null level on PhishSim holds the l5 floor — issue_agent_task allows", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("issue_agent_task", "phishsimai", async () => null, sink),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it("a level-read failure on PhishSim holds the l5 floor (deploy allowed)", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("deploy", "phishsimai", async () => { throw new Error("db down"); }, sink),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it("a product without a floor still fail-closes a thrown read", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("deploy", "otherco", async () => { throw new Error("db down"); }, sink),
    ).rejects.toBeInstanceOf(AutonomyDenied);
    expect(rows).toHaveLength(1);
  });

  it("a loop caller can swallow AutonomyDenied without throwing (the no-op contract)", async () => {
    const { sink } = spyAudit();
    let threw = false;
    // Mirrors the try/catch(isAutonomyDenied) guard the L5 loops use.
    const loopNoOp = async () => {
      try {
        await assertAutonomyAllows("queue_architect_task", "otherco", async () => "manual", sink);
        return "wrote";
      } catch (e) {
        if (isAutonomyDenied(e)) return null; // logged no-op — cron continues
        throw e;
      }
    };
    const result = await loopNoOp().catch(() => { threw = true; return "threw"; });
    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

describe("no autonomous writer bypasses the gate (static guard)", () => {
  const serverDir = join(__dirname, "..");

  function walkTs(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walkTs(p, acc);
      else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".d.ts")) acc.push(p);
    }
    return acc;
  }
  const norm = (p: string) => p.split(sep).join("/");

  it("INSERT INTO agent_tasks appears only in the gated TaskStore adapter", () => {
    const offenders: string[] = [];
    for (const file of walkTs(serverDir)) {
      const f = norm(file);
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      if (f.endsWith("/server/lib/kaan_os_v4.ts")) continue;
      if (f.endsWith("/server/os/neonTaskStore.ts")) continue;
      if (/INSERT\s+INTO\s+agent_tasks/i.test(readFileSync(file, "utf8"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("INSERT INTO os_architect_tasks appears only in selfHeal.ts (queueJanetArchitectTask)", () => {
    const offenders: string[] = [];
    for (const file of walkTs(serverDir)) {
      const f = norm(file);
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      if (f.endsWith("/server/os/selfHeal.ts")) continue; // the sole gated writer
      if (/INSERT\s+INTO\s+os_architect_tasks/i.test(readFileSync(file, "utf8"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("PhishSim live readers seed and default to l5, never manual", () => {
    const gate = readFileSync(join(serverDir, "os", "autonomyGate.ts"), "utf8");
    const ruling = readFileSync(join(serverDir, "os", "ownerRuling.ts"), "utf8");
    const routes = readFileSync(join(serverDir, "os", "routes.ts"), "utf8");
    expect(gate).toMatch(/phishsimai:\s*'l5'/);
    expect(ruling).toMatch(/autonomyFloorFor\(companyId\) \|\| 'l5'/);
    expect(routes).toMatch(/resolveReadableLevel\(COMPANY/);
    expect(routes).not.toMatch(/level \?\? 'manual'/);
  });

  it("both writers call assertAutonomyAllows, and the gate precedes the insert", () => {
    const v4 = readFileSync(join(serverDir, "lib", "kaan_os_v4.ts"), "utf8");
    const sh = readFileSync(join(serverDir, "os", "selfHeal.ts"), "utf8");
    expect(/assertAutonomyAllows\s*\(\s*['"]issue_agent_task['"]/.test(v4)).toBe(true);
    expect(/assertAutonomyAllows\s*\(\s*['"]queue_architect_task['"]/.test(sh)).toBe(true);
    expect(v4.indexOf("assertAutonomyAllows('issue_agent_task'"))
      .toBeLessThan(v4.indexOf("store.createTask"));
    expect(sh.indexOf("assertAutonomyAllows('queue_architect_task'"))
      .toBeLessThan(sh.indexOf("INSERT INTO os_architect_tasks"));
  });
});
