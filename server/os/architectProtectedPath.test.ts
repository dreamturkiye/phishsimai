// ─────────────────────────────────────────────────────────────────────────────
//  PROTECTED-PATH HARD STOP ON THE EXECUTE PATH
//
//  assertNotHardStop / isProtectedPath shipped with the circuit breaker and were
//  unit-tested there from day one — but they had ZERO production callers. The
//  enforcement existed as a tested function nobody invoked, so auth/, webhooks/,
//  payment*/ and billing/ were unguarded on architectCode: the one endpoint that
//  hands generated code out to be applied.
//
//  circuitBreaker.test.ts proves the FUNCTION rejects a protected path. These tests
//  prove the CALL SITE exists — that architectCode actually consults it. That is the
//  part that was missing, and a test of the function alone would still pass if the
//  call site were deleted again.
//
//  Pinned here:
//    (a) a change touching a protected path is DISCARDED even at l5 with a closed
//        breaker — the hard stop outranks the autonomy level, by design
//    (b) the refusal is recorded on the breaker, so repeated attempts halt Marcus
//    (c) SIZE is not what protects these paths — a one-file, few-line change to
//        billing/ sails through the destructive-diff tripwire and must still be refused
//    (d) an ordinary path is unaffected
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  process.env.ARCHITECT_SECRET = "test-hq";
  process.env.GROQ_API_KEY = "test-key";
  return {
    level: "l5" as string,
    generated: "" as string,
    outcomes: [] as { success: boolean; error?: unknown }[],
    telegrams: [] as string[],
  };
});

vi.mock("./conn", () => ({
  getSql: () => (strings: TemplateStringsArray) => {
    const q = strings.join(" ? ");
    if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: h.level }]);
    return Promise.resolve([]);
  },
}));

// Breaker CLOSED throughout — so anything refused here is refused by the hard stop,
// not by the breaker. guardMarcusDiff always allows, which isolates the protected-path
// check from the size tripwire: a test that passed only because the diff was large
// would prove nothing about path protection.
vi.mock("./marcusBreaker", () => ({
  guardMarcusAllowed: async () => true,
  guardMarcusDiff: async () => ({ verdict: "allow", analysis: {} }),
  recordMarcusOutcome: async (_deps: any, success: boolean, error?: unknown) => {
    h.outcomes.push({ success, error });
  },
  fileSetToDiff: () => [],
  makeMarcusBreakerDeps: () => ({}),
}));

vi.mock("./telegram", () => ({
  sendTelegram: async (text: string) => { h.telegrams.push(text); return { ok: true }; },
}));

vi.mock("./marcus", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMarcusMemoryContext: async () => "",
  buildMarcusCodePrompt: () => "prompt",
}));

import { architectCode } from "./architectCode";

function mockRes() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}

const req = () => ({
  headers: {},
  query: { secret: "test-hq" },
  method: "POST",
  body: { secret: "test-hq", task: "Fix the crash users are hitting at checkout" },
});

const fileBlock = (path: string, body: string) => `FILE: ${path}\n---\n${body}\n---END---`;

beforeEach(() => {
  h.level = "l5";
  h.outcomes.length = 0;
  h.telegrams.length = 0;
  // Stand in for the LLM provider — architectCode reaches Groq first via fetch.
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: h.generated } }] }),
    text: async () => "",
  }));
});

describe("architectCode — protected-path hard stop", () => {
  // One file, three lines: comfortably inside the >10 files / >500 lines tripwire.
  // If path protection were left to the size check, this change would be applied.
  const smallBillingEdit = fileBlock(
    "server/billing/invoice.ts",
    "export function total(n: number) {\n  return n * 1.2\n}",
  );

  it("refuses a small change to billing/ at l5 with a CLOSED breaker", async () => {
    h.generated = smallBillingEdit;
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(res.body.ok).toBe(false);
    expect(res.body.hard_stop).toBe("protected_path");
    expect(res.body.discarded).toBe(true);
    expect(res.body.path).toContain("billing/");
  });

  it("returns NO files — the generated change never reaches the caller", async () => {
    h.generated = smallBillingEdit;
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(res.body.files).toBeUndefined();
  });

  it("records the refusal on the breaker so repeated attempts halt Marcus", async () => {
    h.generated = smallBillingEdit;
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(h.outcomes).toHaveLength(1);
    expect(h.outcomes[0].success).toBe(false);
    expect(String(h.outcomes[0].error)).toContain("protected_path");
  });

  it("escalates to the founder", async () => {
    h.generated = smallBillingEdit;
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(h.telegrams.join(" ")).toMatch(/PROTECTED PATH/i);
  });

  it.each([
    ["server/api/auth/login.ts", "auth/"],
    ["server/webhooks/stripe.ts", "webhooks/"],
    ["server/payment-intents/charge.ts", "payment*/"],
  ])("refuses %s (%s)", async (path) => {
    h.generated = fileBlock(path, "export const x = 1");
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(res.body.ok).toBe(false);
    expect(res.body.hard_stop).toBe("protected_path");
  });

  it("refuses the whole change set when only ONE file is protected", async () => {
    h.generated = [
      fileBlock("server/os/routes.ts", "export const a = 1"),
      fileBlock("server/billing/invoice.ts", "export const b = 2"),
    ].join("\n");
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(res.body.ok).toBe(false);
    expect(res.body.discarded).toBe(true);
    expect(res.body.files).toBeUndefined();
  });

  it("leaves an ordinary path alone — the guard only ever DENIES", async () => {
    h.generated = fileBlock("server/os/routes.ts", "export const ok = true");
    const res = mockRes();
    await architectCode(req() as any, res as any);

    expect(res.body.ok).toBe(true);
    expect(Object.keys(res.body.files)).toEqual(["server/os/routes.ts"]);
    expect(h.outcomes).toHaveLength(0);
  });
});
