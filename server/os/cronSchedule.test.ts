// PS-CRON-DEDUPE-01 — the daily standup + Kaan morning brief must fire ONCE.
//
// Two Vercel crons used to terminate in the SAME emitter, runJanetFullOrchestration
// (which sends BOTH the 🌅 daily-standup Telegram and the ☀️ Kaan morning-brief
// Telegram): /api/os/janet @ 0 8 (→ cronJanetCgo → orchestration + L5 cycle) and
// /api/os/v4/full @ 0 9 (→ v4Full → orchestration only). 08:00 and 09:00 UTC = the
// double-fire Kaan saw, exactly 1h apart.
//
// v4/full is a PURE SUBSET of the janet cron (bare passthrough to the same function,
// no distinct work), so the fix removes the 0 9 cron and keeps 0 8 (= Kaan's 4 AM).
// The /api/os/v4/full ENDPOINT stays for manual use — only its schedule is removed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..");
const vercel = JSON.parse(readFileSync(join(repoRoot, "vercel.json"), "utf8"));
const handler = readFileSync(join(repoRoot, "api", "handler.ts"), "utf8");

const scheduledPaths: string[] = (vercel.crons ?? []).map((c: any) => c.path);

// The two cron paths that BOTH dispatch (via api/handler.ts) into
// runJanetFullOrchestration and therefore emit the standup + brief Telegram.
const STANDUP_BRIEF_EMITTERS = ["/api/os/janet", "/api/os/v4/full"];

describe("PS-CRON-DEDUPE-01: standup + brief fires once daily", () => {
  it("exactly ONE standup+brief emitter is scheduled (was 2 → double-fire)", () => {
    const scheduledEmitters = STANDUP_BRIEF_EMITTERS.filter((p) => scheduledPaths.includes(p));
    expect(scheduledEmitters).toEqual(["/api/os/janet"]);
  });

  it("the surviving emitter is the 08:00 UTC (Kaan's 4 AM) cron", () => {
    const janet = (vercel.crons as any[]).find((c) => c.path === "/api/os/janet");
    expect(janet?.schedule).toBe("0 8 * * *");
  });

  it("the duplicate 09:00 v4/full cron is gone", () => {
    expect(scheduledPaths).not.toContain("/api/os/v4/full");
  });

  it("the /api/os/v4/full ENDPOINT still exists for manual use (only the cron was removed)", () => {
    expect(handler).toContain('"/api/os/v4/full"');
  });

  it("the surviving cron path still routes into the orchestration handler", () => {
    // /api/os/janet → cronJanetCgo (which runs runJanetFullOrchestration).
    expect(handler).toMatch(/"\/api\/os\/janet".*cronJanetCgo/s);
  });
});
