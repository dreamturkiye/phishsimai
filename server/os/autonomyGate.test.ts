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
  type AutonomyLevel,
  type DeniedAudit,
} from "./autonomyGate";

const LEVELS: AutonomyLevel[] = ["manual", "l2", "l3", "l4", "l5"];

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

  it("at manual, BOTH writers throw AutonomyDenied AND write an audit row", async () => {
    for (const action of ["issue_agent_task", "queue_architect_task"]) {
      const { rows, sink } = spyAudit();
      await expect(
        assertAutonomyAllows(action, "phishsimai", async () => "manual", sink),
      ).rejects.toBeInstanceOf(AutonomyDenied);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action, level: "manual", companyId: "phishsimai" });
    }
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

  it("a null level (no row) throws — fail closed to manual", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("issue_agent_task", "phishsimai", async () => null, sink),
    ).rejects.toBeInstanceOf(AutonomyDenied);
    expect(rows[0].level).toBe("manual");
  });

  it("a level-read failure is treated as deny (fail closed)", async () => {
    const { rows, sink } = spyAudit();
    await expect(
      assertAutonomyAllows("deploy", "phishsimai", async () => { throw new Error("db down"); }, sink),
    ).rejects.toBeInstanceOf(AutonomyDenied);
    expect(rows).toHaveLength(1);
  });

  it("a loop caller can swallow AutonomyDenied without throwing (the no-op contract)", async () => {
    const { sink } = spyAudit();
    let threw = false;
    // Mirrors the try/catch(isAutonomyDenied) guard the L5 loops use.
    const loopNoOp = async () => {
      try {
        await assertAutonomyAllows("queue_architect_task", "phishsimai", async () => "manual", sink);
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

  it("INSERT INTO agent_tasks appears only in kaan_os_v4.ts (issueTask)", () => {
    const offenders: string[] = [];
    for (const file of walkTs(serverDir)) {
      const f = norm(file);
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
      if (f.endsWith("/server/lib/kaan_os_v4.ts")) continue; // the sole gated writer
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

  it("both writers call assertAutonomyAllows, and the gate precedes the insert", () => {
    const v4 = readFileSync(join(serverDir, "lib", "kaan_os_v4.ts"), "utf8");
    const sh = readFileSync(join(serverDir, "os", "selfHeal.ts"), "utf8");
    expect(/assertAutonomyAllows\s*\(\s*['"]issue_agent_task['"]/.test(v4)).toBe(true);
    expect(/assertAutonomyAllows\s*\(\s*['"]queue_architect_task['"]/.test(sh)).toBe(true);
    expect(v4.indexOf("assertAutonomyAllows('issue_agent_task'"))
      .toBeLessThan(v4.indexOf("INSERT INTO agent_tasks"));
    expect(sh.indexOf("assertAutonomyAllows('queue_architect_task'"))
      .toBeLessThan(sh.indexOf("INSERT INTO os_architect_tasks"));
  });
});
