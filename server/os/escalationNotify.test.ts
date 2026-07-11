// Escalation → Telegram delivery: exactly-once, RAW error carried, fail-safe.
import { describe, it, expect } from "vitest";
import { deliverPendingEscalations, formatEscalation, type EscalationRow, type NotifyDeps } from "./escalationNotify";

const NOW = 2_000_000_000_000;

function harness(rows: EscalationRow[], opts: { skipped?: boolean; fail?: boolean } = {}) {
  const notified = new Set<number>();
  const sentTexts: string[] = [];
  const deps: NotifyDeps = {
    loadPending: async () => rows.filter((r) => !notified.has(r.id)),
    markNotified: async (id) => { notified.add(id); },
    send: async (t) => {
      sentTexts.push(t);
      if (opts.skipped) return { ok: false, skipped: true };
      if (opts.fail) return { ok: false, error: "boom" };
      return { ok: true };
    },
    now: () => NOW,
  };
  return { deps, notified, sentTexts };
}

const breakerRow = (id: number, raw: string): EscalationRow => ({
  id,
  productId: "phishsimai",
  category: "breaker_trip",
  status: "pending",
  createdAtMs: NOW - 3_600_000,
  payload: { trip_reason: "consecutive_failures", fingerprint: "abcdef123456ff", last_error: raw },
});

describe("deliverPendingEscalations", () => {
  it("a pending breaker_trip → exactly one send with the RAW error; marked notified; second run sends NOTHING", async () => {
    const RAW = "TypeError: Cannot read properties of undefined (reading 'send')\n    at rot (/srv/campaignSend.ts:42:9)";
    const h = harness([breakerRow(7, RAW)]);

    const r1 = await deliverPendingEscalations(h.deps);
    expect(r1.sent).toBe(1);
    expect(h.sentTexts).toHaveLength(1);
    expect(h.sentTexts[0]).toContain("breaker_trip");
    expect(h.sentTexts[0]).toContain("Cannot read properties of undefined"); // RAW error present
    expect(h.notified.has(7)).toBe(true);

    // idempotent — nothing new to deliver
    const r2 = await deliverPendingEscalations(h.deps);
    expect(r2.total).toBe(0);
    expect(r2.sent).toBe(0);
    expect(h.sentTexts).toHaveLength(1); // still just the one send, no double-notify
  });

  it("both hard-stop AND breaker_trip categories deliver", async () => {
    const hardStop: EscalationRow = {
      id: 1, productId: "phishsimai", category: "protected_path", status: "pending",
      createdAtMs: NOW, payload: { path: "server/api/auth/login.ts" },
    };
    const h = harness([hardStop, breakerRow(2, "boom")]);
    const r = await deliverPendingEscalations(h.deps);
    expect(r.sent).toBe(2);
    expect(h.sentTexts.some((t) => t.includes("protected_path"))).toBe(true);
    expect(h.sentTexts.some((t) => t.includes("breaker_trip"))).toBe(true);
  });

  it("Telegram env unset (skipped) → no-op: NOT marked, no crash, retries next run", async () => {
    const h = harness([breakerRow(9, "boom")], { skipped: true });
    const r = await deliverPendingEscalations(h.deps);
    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(0);
    expect(h.notified.has(9)).toBe(false); // left un-notified → will retry once env is set
  });

  it("a send failure leaves the row un-notified for retry (no lost escalation)", async () => {
    const h = harness([breakerRow(3, "boom")], { fail: true });
    const r = await deliverPendingEscalations(h.deps);
    expect(r.failed).toBe(1);
    expect(h.notified.has(3)).toBe(false);
  });

  it("formatEscalation HTML-escapes the raw error", () => {
    const row = breakerRow(1, "Error: <script>alert(1)</script> & bad");
    const msg = formatEscalation(row, NOW);
    expect(msg).toContain("&lt;script&gt;");
    expect(msg).not.toContain("<script>");
  });
});
