// Circuit breaker (M.1) — the guardrail that must predate any Marcus re-enable.
// Safety-critical: the state machine, destructive-diff tripwire, and hard-stop
// enforcement are all exercised against an in-memory store with a controllable
// clock, so time-based transitions (6h cooldown, doubling) are deterministic.
import { describe, it, expect } from "vitest";
import {
  applyOutcome, recordTaskOutcome, getBreakerState, manualClose,
  checkDiffSafety, analyzeDiff, assertNotHardStop, HardStopError, isProtectedPath,
  primaryFingerprint, secondaryFingerprint,
  type BreakerDeps, type BreakerRow, type BreakerStore, type Escalation, type AuditRow,
} from "./circuitBreaker";

const H = 3_600_000;

function harness(startMs = 1_700_000_000_000) {
  const rows = new Map<string, BreakerRow>();
  const escalations: Escalation[] = [];
  const audits: AuditRow[] = [];
  let now = startMs;
  let nextEsc = 1;
  const store: BreakerStore = {
    async load(fp) { return rows.has(fp) ? { ...rows.get(fp)! } : null; },
    async save(row) { rows.set(row.fingerprint, { ...row }); },
    async createEscalation(e) { escalations.push(e); return nextEsc++; },
    async audit(a) { audits.push(a); },
  };
  return {
    deps: { store, now: () => now } as BreakerDeps,
    escalations, audits,
    advance(ms: number) { now += ms; },
  };
}

describe("state machine — trip at 3 consecutive failures", () => {
  it("2 failures = still closed; 3rd = OPEN, escalation raised, RAW error preserved", async () => {
    const h = harness();
    const fp = primaryFingerprint("phishsimai", "task-A");
    const RAW = "TypeError: Cannot read properties of undefined (reading 'send')\n    at rot (/srv/campaignSend.ts:42:9)";

    await applyOutcome(h.deps, fp, "phishsimai", false, RAW);
    const after2 = await applyOutcome(h.deps, fp, "phishsimai", false, RAW);
    expect(after2.state).toBe("closed");
    expect(after2.consecutiveFailures).toBe(2);
    expect(h.escalations).toHaveLength(0);

    const after3 = await applyOutcome(h.deps, fp, "phishsimai", false, RAW);
    expect(after3.state).toBe("open");
    expect(after3.tripReason).toBe("consecutive_failures");
    // RAW underlying error, NOT a generic string
    expect(after3.lastError).toBe(RAW);
    expect(after3.lastError).toContain("Cannot read properties of undefined");
    // a breaker_trip escalation carrying the raw error
    expect(h.escalations).toHaveLength(1);
    expect(h.escalations[0].category).toBe("breaker_trip");
    expect(h.escalations[0].payload.last_error).toBe(RAW);
    expect(after3.escalationId).toBe(1);
  });

  it("a different fingerprint is unaffected by another's failures", async () => {
    const h = harness();
    const a = primaryFingerprint("phishsimai", "task-A");
    const b = primaryFingerprint("phishsimai", "task-B");
    for (let i = 0; i < 3; i++) await applyOutcome(h.deps, a, "phishsimai", false, "boom");
    expect((await getBreakerState(h.deps, a)).persistedState).toBe("open");
    expect((await getBreakerState(h.deps, b)).state).toBe("closed");
    expect((await getBreakerState(h.deps, b)).canAttempt).toBe(true);
  });
});

describe("state machine — cooldown, half_open probe, doubling", () => {
  it("open blocks retries; half_open only after 6h; probe success → closed", async () => {
    const h = harness();
    const fp = primaryFingerprint("phishsimai", "t");
    for (let i = 0; i < 3; i++) await applyOutcome(h.deps, fp, "phishsimai", false, "e");

    let s = await getBreakerState(h.deps, fp);
    expect(s.state).toBe("open");
    expect(s.canAttempt).toBe(false); // retries blocked

    h.advance(6 * H - 1000);
    expect((await getBreakerState(h.deps, fp)).state).toBe("open"); // not yet
    h.advance(2000); // now past 6h
    s = await getBreakerState(h.deps, fp);
    expect(s.state).toBe("half_open");
    expect(s.canAttempt).toBe(true); // exactly the one probe

    const probe = await applyOutcome(h.deps, fp, "phishsimai", true); // probe succeeds
    expect(probe.state).toBe("closed");
    expect(probe.consecutiveFailures).toBe(0);
  });

  it("probe failure re-opens and DOUBLES the cooldown: 6h → 12h → 24h → 48h (cap)", async () => {
    const h = harness();
    const fp = primaryFingerprint("phishsimai", "t");
    for (let i = 0; i < 3; i++) await applyOutcome(h.deps, fp, "phishsimai", false, "e");

    const expected = [6, 12, 24, 48, 48].map((hrs) => hrs * H);
    for (const cd of expected) {
      const s = await getBreakerState(h.deps, fp);
      expect(s.persistedState).toBe("open");
      expect(s.cooldownMs).toBe(cd); // current cooldown for this open cycle
      h.advance(cd); // wait it out → half_open
      expect((await getBreakerState(h.deps, fp)).state).toBe("half_open");
      await applyOutcome(h.deps, fp, "phishsimai", false, "e"); // probe fails → re-open, doubles
    }
    // escalation only on the FIRST trip, not on every re-open
    expect(h.escalations).toHaveLength(1);
  });
});

describe("manual close", () => {
  it("closes an open breaker and writes an audit row with who/why/fix", async () => {
    const h = harness();
    const fp = primaryFingerprint("phishsimai", "t");
    for (let i = 0; i < 3; i++) await applyOutcome(h.deps, fp, "phishsimai", false, "e");
    expect((await getBreakerState(h.deps, fp)).persistedState).toBe("open");

    const closed = await manualClose(h.deps, fp, "kaan", "deployed the fix", "commit abc123");
    expect(closed.state).toBe("closed");
    expect(closed.consecutiveFailures).toBe(0);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].action).toBe("breaker_manual_close");
    expect(h.audits[0].actor).toBe("kaan");
    expect(h.audits[0].detail.fix).toBe("commit abc123");
  });
});

describe("destructive-diff tripwire", () => {
  it("11 deleted files → reject, breaker OPEN (destructive_diff), diff NOT applied, escalation raised", async () => {
    const h = harness();
    const fp = primaryFingerprint("phishsimai", "deploy-1");
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `src/f${i}.ts`, deleted: true, removed: 20, added: 0 }));

    const v = await checkDiffSafety(h.deps, fp, "phishsimai", files);
    expect(v.verdict).toBe("reject");
    expect(v.applied).toBe(false);
    expect(v.analysis.filesDeletedOutside).toBe(11);

    const s = await getBreakerState(h.deps, fp);
    expect(s.persistedState).toBe("open");
    expect(s.tripReason).toBe("destructive_diff");
    expect(h.escalations.some((e) => e.payload.trip_reason === "destructive_diff")).toBe(true);
  });

  it("5 deleted files → allow", async () => {
    const h = harness();
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `src/f${i}.ts`, deleted: true, removed: 10 }));
    const v = await checkDiffSafety(h.deps, primaryFingerprint("p", "d"), "p", files);
    expect(v.verdict).toBe("allow");
  });

  it(">500 net lines removed outside generated → unsafe; ≤500 net → safe", () => {
    expect(analyzeDiff([{ path: "src/big.ts", removed: 600, added: 50 }]).safe).toBe(false); // net 550
    expect(analyzeDiff([{ path: "src/big.ts", removed: 600, added: 200 }]).safe).toBe(true); // net 400
  });

  it("deletions inside generated/ are exempt (allow)", () => {
    const files = Array.from({ length: 20 }, (_, i) => ({ path: `generated/g${i}.ts`, deleted: true, removed: 100 }));
    const a = analyzeDiff(files);
    expect(a.filesDeletedOutside).toBe(0);
    expect(a.netLinesOutside).toBe(0);
    expect(a.safe).toBe(true);
  });

  it("parses a unified-diff string (deleted file via /dev/null)", () => {
    const diff = "diff --git a/src/x.ts b/src/x.ts\ndeleted file mode 100644\n--- a/src/x.ts\n+++ /dev/null\n-line1\n-line2\n";
    const a = analyzeDiff(diff);
    expect(a.filesDeletedOutside).toBe(1);
  });
});

describe("hard-stop + protected-path enforcement", () => {
  it("rejects hard-stop actions (from autonomyGate HARD_STOPS)", () => {
    expect(() => assertNotHardStop("adjust_pricing")).toThrow(HardStopError);
    expect(() => assertNotHardStop("capital_spend")).toThrow();
    expect(() => assertNotHardStop("legal_contract")).toThrow();
    expect(() => assertNotHardStop("new_subsidiary")).toThrow();
  });

  it("rejects a diff touching protected paths (auth / webhooks / payment* / billing)", () => {
    expect(() => assertNotHardStop("deploy", ["server/api/auth/login.ts"])).toThrow(/protected/);
    expect(() => assertNotHardStop("deploy", ["server/webhooks/stripe.ts"])).toThrow();
    expect(() => assertNotHardStop("deploy", ["server/payments/charge.ts"])).toThrow();
    expect(() => assertNotHardStop("deploy", ["server/billing/invoice.ts"])).toThrow();
    expect(isProtectedPath("a/payment-intents/x.ts")).toBe(true); // payment* glob
  });

  it("allows a normal action with normal paths", () => {
    expect(() => assertNotHardStop("deploy", ["server/os/foo.ts", "client/src/Home.tsx"])).not.toThrow();
  });
});

describe("secondary fingerprint — same rot across task IDs", () => {
  it("the same error class under 3 different task IDs accumulates on the secondary → trips", async () => {
    const h = harness();
    const mkErr = () => {
      const e = new Error("rot");
      e.stack = "Error: rot\n    at rotFn (/srv/rot.ts:10:5)";
      return e;
    };
    const secFp = secondaryFingerprint(mkErr());

    await recordTaskOutcome(h.deps, "phishsimai", "task-1", false, mkErr());
    await recordTaskOutcome(h.deps, "phishsimai", "task-2", false, mkErr());
    const r3 = await recordTaskOutcome(h.deps, "phishsimai", "task-3", false, mkErr());

    // each PRIMARY (per task) saw only one failure → still closed
    expect((await getBreakerState(h.deps, primaryFingerprint("phishsimai", "task-1"))).consecutiveFailures).toBe(1);
    // the shared SECONDARY accumulated all three → OPEN
    expect((await getBreakerState(h.deps, secFp)).persistedState).toBe("open");
    expect(r3.secondary?.state).toBe("open");
  });
});
