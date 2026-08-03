// ─────────────────────────────────────────────────────────────────────────────
//  PS-MARCUS-SELFGUARD-01 — PROTECTED-PATH HARD STOP ON THE EXECUTE PATH
//
//  TWO SEPARATE HOLES, and the second is the one that would have survived the obvious fix.
//
//  HOLE 1 — the enforcement had no caller.
//    `assertNotHardStop` / `isProtectedPath` shipped with the circuit breaker and were unit-tested
//    from day one, with ZERO production call sites. `architectCode` — the one endpoint that hands
//    generated code out to be applied — checked autonomy level, breaker state and diff SIZE, and
//    never once asked whether a path was protected. Product at l4, `execute_architect_task` gated
//    at l3: reachable in production, not hypothetical.
//
//  HOLE 2 — the patterns matched nothing in this repo.
//    The guarded set was **/auth/**, **/webhooks/**, **/payment*/**, **/billing/**. PhishSim has
//    none of those directories. Measured: 0 of 486 tracked files. Identity lives in
//    `server/_core/oauth.ts`, money in `server/stripe/`, webhooks in `server/email/resendWebhook.ts`
//    and `server/stripe/webhook.ts`.
//
//    circuitBreaker.test.ts passed throughout — because it asserts on INVENTED paths
//    (`server/webhooks/stripe.ts`, `server/billing/invoice.ts`) that exist nowhere in the tree. A
//    guard proven against hypothetical inputs is a guard over zero units. Wiring the call site
//    without fixing the patterns would have produced a hard stop that fires on nothing and reads,
//    in every report, as protection.
//
//  So this file pins BOTH:
//    (a) the CALL SITE exists — architectCode actually consults the check
//    (b) the PATTERNS COVER REAL FILES — every category matches something that is really here
//
//  (b) is the test that fails on the original code even after (a) is fixed.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";

const h = vi.hoisted(() => {
  process.env.ARCHITECT_SECRET = "test-hq";
  process.env.GROQ_API_KEY = "test-key";
  return {
    level: "l5" as string,
    generated: "" as string,
    outcomes: [] as { success: boolean; error?: unknown }[],
    telegrams: [] as string[],
    diffChecked: false,
  };
});

vi.mock("./conn", () => ({
  getSql: () => (strings: TemplateStringsArray) => {
    const q = strings.join(" ? ");
    if (/FROM os_autonomy_state/i.test(q)) return Promise.resolve([{ level: h.level }]);
    return Promise.resolve([]);
  },
}));

// Breaker CLOSED and diff ALWAYS ALLOWED throughout. That isolation is the point: anything refused
// in these tests is refused by the protected-path stop, never by the breaker and never by the size
// tripwire. A test that passed only because the diff happened to be large would prove nothing.
vi.mock("./marcusBreaker", () => ({
  guardMarcusAllowed: async () => true,
  guardMarcusDiff: async () => { h.diffChecked = true; return { verdict: "allow", analysis: {} }; },
  recordMarcusOutcome: async (_deps: any, success: boolean, error?: unknown) => {
    h.outcomes.push({ success, error });
  },
  fileSetToDiff: () => [],
  makeMarcusBreakerDeps: () => ({}),
}));

vi.mock("./telegram", () => ({
  sendTelegram: async (t: string) => { h.telegrams.push(t); return { ok: true }; },
}));

// Marcus's "LLM" — returns whatever file set the test asks for, in the FILE-block format the
// real parser consumes. The generation is genuine as far as architectCode is concerned.
vi.mock("./marcus", () => ({
  GROQ_ARCHITECT_MODEL: "test-model",
  MARCUS_SYSTEM: "test",
  buildMarcusCodePrompt: () => "test prompt",
  getMarcusMemoryContext: async () => "",
}));

import { architectCode } from "./architectCode";
import { isProtectedPath, PROTECTED_CATEGORIES } from "./circuitBreaker";

function mockRes() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}
const req = (over: any = {}) => ({
  headers: {}, query: { secret: "test-hq" }, method: "POST",
  ...over,
  body: { secret: "test-hq", task: "Fix the failing guard in the handler", ...(over.body ?? {}) },
});

/** Drive architectCode with a generated file set, bypassing the network. */
async function generate(files: Record<string, string>) {
  const blocks = Object.entries(files)
    .map(([p, c]) => `FILE: ${p}\n---\n${c}\n---END---`).join("\n\n");
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: blocks } }] }),
  }));
  const res = mockRes();
  await architectCode(req() as any, res as any);
  return res;
}

beforeEach(() => {
  h.outcomes = []; h.telegrams = []; h.diffChecked = false; h.level = "l5";
});

describe("(a) the CALL SITE — architectCode actually consults the hard stop", () => {
  it("DISCARDS a change touching money, at l5 with a closed breaker", async () => {
    // l5 is the highest earned level. A hard stop outranks it — that is what makes it hard.
    const res = await generate({ "server/stripe/webhook.ts": "// rewritten by Marcus" });
    expect(res.body.ok).toBe(false);
    expect(res.body.discarded).toBe(true);
    expect(res.body.hard_stop).toBe("protected_path");
    expect(res.body.files).toBeUndefined(); // never handed out for apply
  });

  it("records the refusal on the breaker, so repeated attempts halt Marcus", async () => {
    await generate({ "server/_core/oauth.ts": "// rewritten by Marcus" });
    expect(h.outcomes).toHaveLength(1);
    expect(h.outcomes[0].success).toBe(false);
    expect(String(h.outcomes[0].error)).toContain("protected_path");
  });

  it("escalates to the founder rather than failing silently", async () => {
    await generate({ "server/email/resendWebhook.ts": "// rewritten by Marcus" });
    expect(h.telegrams.join("\n")).toContain("PROTECTED PATH");
    expect(h.telegrams.join("\n")).toContain("DISCARDED");
  });

  it("refuses a SMALL change — size is not what protects these paths", async () => {
    // The destructive-diff tripwire only fires above 10 files / 500 net lines. A three-line edit
    // to the send rails passes it cleanly and must still be refused.
    const res = await generate({ "server/lib/complianceGuard.ts": "// one\n// two\n// three" });
    expect(res.body.discarded).toBe(true);
    expect(h.diffChecked).toBe(false); // refused BEFORE the size check even ran
  });

  it("blocks Marcus editing his OWN gate — the edit that unguards every future edit", async () => {
    const res = await generate({ "server/os/autonomyGate.ts": "export const HARD_STOPS = []" });
    expect(res.body.hard_stop).toBe("protected_path");
  });

  it("blocks the TEST that pins the gate, not just the gate", async () => {
    const res = await generate({ "server/os/architectExecGate.test.ts": "it.skip('gate', () => {})" });
    expect(res.body.hard_stop).toBe("protected_path");
  });

  it("refuses the WHOLE change set when one file among many is protected", async () => {
    const res = await generate({
      "server/os/janet.ts": "// ordinary",
      "client/src/pages/Home.tsx": "// ordinary",
      "server/stripe/prices.ts": "// the one that matters",
    });
    expect(res.body.discarded).toBe(true);
    expect(res.body.path).toContain("stripe");
  });

  it("lets an ORDINARY change through — the guard is not a blanket refusal", async () => {
    const res = await generate({ "server/os/agents/nova.ts": "// a normal improvement" });
    expect(res.body.ok).toBe(true);
    expect(Object.keys(res.body.files)).toEqual(["server/os/agents/nova.ts"]);
    expect(h.diffChecked).toBe(true); // reached the size tripwire, as it should
  });
});

describe("(b) COVERAGE — the patterns match files that actually exist here", () => {
  const TRACKED = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");

  it("the guarded set is not empty against the real tree", () => {
    // The assertion that fails on the original patterns: 0 of 486.
    const covered = TRACKED.filter(isProtectedPath);
    expect(covered.length).toBeGreaterThan(0);
  });

  it.each(PROTECTED_CATEGORIES.map((c) => c.name))(
    "category '%s' protects at least one real tracked file",
    (name) => {
      const cat = PROTECTED_CATEGORIES.find((c) => c.name === name)!;
      const hits = TRACKED.filter((f) => cat.res.some((re) => re.test(f)));
      // A category matching nothing is a category that has silently stopped protecting. It must
      // fail loudly here rather than keep reporting as enforcement.
      expect(hits, `category '${name}' matches no tracked file`).not.toHaveLength(0);
    },
  );

  it("names THIS repo's real identity, money, webhook and send-rail files", () => {
    for (const f of [
      "client/src/_core/hooks/useAuth.ts",
      "server/_core/oauth.ts",
      "server/_core/cookies.ts",
      "server/email/resendWebhook.ts",
      "server/stripe/webhook.ts",
      "server/stripe/prices.ts",
      "server/lib/campaignSend.ts",
      "server/lib/complianceGuard.ts",
    ]) {
      expect(TRACKED, `${f} must still exist for this assertion to mean anything`).toContain(f);
      expect(isProtectedPath(f), `${f} is unguarded`).toBe(true);
    }
  });

  it("does not swallow the ordinary tree — Marcus must remain useful", () => {
    const covered = TRACKED.filter(isProtectedPath).length;
    expect(covered / TRACKED.length).toBeLessThan(0.35);
    for (const f of ["server/os/janet.ts", "server/os/agents/nova.ts", "client/src/pages/Dashboard.tsx"]) {
      expect(isProtectedPath(f), `${f} should be editable`).toBe(false);
    }
  });

  it("is case-insensitive — a case-insensitive filesystem makes Auth/ and auth/ one directory", () => {
    expect(isProtectedPath("server/Stripe/webhook.ts")).toBe(true);
    expect(isProtectedPath("server/_core/OAuth.ts")).toBe(true);
  });

  it("normalises the path, so a prefix or separator cannot walk around the anchor", () => {
    expect(isProtectedPath("./server/stripe/prices.ts")).toBe(true);
    expect(isProtectedPath("/Users/kaan/phishsimai/server/stripe/prices.ts")).toBe(true);
    expect(isProtectedPath("server\\stripe\\prices.ts")).toBe(true);
    expect(isProtectedPath("server//stripe//prices.ts")).toBe(true);
  });
});
