// Marcus ⟷ circuit-breaker wiring. Proves the safety layer that must exist before
// any Marcus re-enable: an OPEN breaker halts Marcus, a destructive diff trips it
// and is discarded, and 3 consecutive failures open it. Uses an in-memory breaker
// store + controllable clock (no DB, no Telegram).
import { describe, it, expect } from "vitest";
import {
  guardMarcusAllowed, guardMarcusDiff, recordMarcusOutcome, fileSetToDiff, marcusFingerprint,
} from "./marcusBreaker";
import type { BreakerDeps, BreakerRow, BreakerStore, Escalation, AuditRow } from "./circuitBreaker";

const PRODUCT = "phishsimai";
const noNotify = async () => {};
const spyNotify = () => { const sent: string[] = []; return { sent, notify: async (t: string) => { sent.push(t); } }; };

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
  return { deps: { store, now: () => now } as BreakerDeps, escalations, advance(ms: number) { now += ms; } };
}

describe("Marcus breaker wiring", () => {
  it("(a) breaker OPEN → Marcus is blocked (issues/executes zero) and escalates", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) await recordMarcusOutcome(h.deps, false, "boom", PRODUCT); // → OPEN
    const s = spyNotify();
    const allowed = await guardMarcusAllowed(h.deps, "issue architect task X", PRODUCT, s.notify);
    expect(allowed).toBe(false);            // Marcus does NOT proceed
    expect(s.sent).toHaveLength(1);         // escalated once
    expect(s.sent[0]).toContain("OPEN");
  });

  it("(b) >10-file destructive diff trips the breaker + is DISCARDED, then Marcus halts", async () => {
    const h = harness();
    const files: Record<string, string> = {};
    for (let i = 0; i < 11; i++) files[`src/f${i}.ts`] = ""; // 11 emptied files = deletions
    const s = spyNotify();
    const verdict = await guardMarcusDiff(h.deps, fileSetToDiff(files), PRODUCT, s.notify);
    expect(verdict.verdict).toBe("reject");
    expect(verdict.applied).toBe(false);                    // never applied
    expect(verdict.analysis.filesDeletedOutside).toBe(11);
    expect(s.sent.some((t) => t.includes("DESTRUCTIVE"))).toBe(true);
    // the trip opened the Marcus circuit → subsequent action halted
    expect(await guardMarcusAllowed(h.deps, "issue Y", PRODUCT, noNotify)).toBe(false);
  });

  it("(c) 3 consecutive failures → OPEN → Marcus halts (2 failures still allowed)", async () => {
    const h = harness();
    await recordMarcusOutcome(h.deps, false, "e1", PRODUCT);
    await recordMarcusOutcome(h.deps, false, "e2", PRODUCT);
    expect(await guardMarcusAllowed(h.deps, "issue", PRODUCT, noNotify)).toBe(true);  // still closed after 2
    await recordMarcusOutcome(h.deps, false, "e3", PRODUCT);                          // 3rd → OPEN
    expect(await guardMarcusAllowed(h.deps, "issue", PRODUCT, noNotify)).toBe(false); // halted
  });

  it("a safe change (5 files) is allowed; deletions inside generated/ are exempt", async () => {
    const h = harness();
    const safe: Record<string, string> = {};
    for (let i = 0; i < 5; i++) safe[`src/f${i}.ts`] = "export const x = 1";
    expect((await guardMarcusDiff(h.deps, fileSetToDiff(safe), PRODUCT, noNotify)).verdict).toBe("allow");

    const gen: Record<string, string> = {};
    for (let i = 0; i < 20; i++) gen[`generated/g${i}.ts`] = ""; // 20 emptied generated files
    expect((await guardMarcusDiff(h.deps, fileSetToDiff(gen), PRODUCT, noNotify)).verdict).toBe("allow");
  });

  it("cooldown → half_open probe → success resets → Marcus resumes", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) await recordMarcusOutcome(h.deps, false, "e", PRODUCT); // OPEN
    expect(await guardMarcusAllowed(h.deps, "x", PRODUCT, noNotify)).toBe(false);
    h.advance(6 * 3_600_000);                                                            // wait out 6h
    expect(await guardMarcusAllowed(h.deps, "probe", PRODUCT, noNotify)).toBe(true);      // half_open permits the probe
    await recordMarcusOutcome(h.deps, true, undefined, PRODUCT);                          // probe success → closed
    expect(await guardMarcusAllowed(h.deps, "x", PRODUCT, noNotify)).toBe(true);          // resumed
  });

  it("guardMarcusAllowed permits a healthy (closed) breaker", async () => {
    const h = harness();
    expect(await guardMarcusAllowed(h.deps, "issue", PRODUCT, noNotify)).toBe(true);
  });
});
