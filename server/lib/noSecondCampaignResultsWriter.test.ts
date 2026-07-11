// §2.4 property (2): the compliance choke point is the ONLY writer to campaign_results.
// This test FAILS THE BUILD if any source file (outside the definition site and the
// choke point) calls createCampaignResult() or inserts into campaignResults directly —
// which would let a send bypass the floor.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

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

describe("campaign_results has a single writer (the compliance choke point)", () => {
  const serverDir = join(__dirname, "..");

  it("createCampaignResult() is called only from server/lib/campaignSend.ts", () => {
    const offenders: string[] = [];
    for (const file of walkTs(serverDir)) {
      const f = norm(file);
      if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue; // tests/mocks exempt
      if (f.endsWith("/server/db.ts")) continue;                       // definition + the sole .insert(campaignResults)
      if (f.endsWith("/server/lib/campaignSend.ts")) continue;         // the choke point
      const src = readFileSync(file, "utf8");
      if (/createCampaignResult\s*\(/.test(src)) offenders.push(f + " (calls createCampaignResult)");
      if (/\.insert\(\s*campaignResults\s*\)/.test(src)) offenders.push(f + " (raw insert campaignResults)");
    }
    expect(offenders).toEqual([]);
  });

  it("the choke point exists and calls createCampaignResult exactly once", () => {
    const src = readFileSync(join(serverDir, "lib", "campaignSend.ts"), "utf8");
    const calls = src.match(/createCampaignResult\s*\(/g) ?? [];
    expect(calls.length).toBe(1);
  });
});
