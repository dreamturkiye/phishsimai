import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_IDS } from "@kaan/os-core";
import { RUNTIME_AGENT_IDS, RUNTIME_PROMPTS } from "./agentRuntimeTick";

describe("L5.7 continuous agent runtime — original 7.10 roster", () => {
  it("ticks Janet + every worker from AGENT_IDS (no one left off the loop)", () => {
    expect(RUNTIME_AGENT_IDS).toEqual([...AGENT_IDS]);
    expect(RUNTIME_AGENT_IDS).toContain("janet");
    expect(RUNTIME_AGENT_IDS).toHaveLength(10);
  });

  it("has a self-mod / memory prompt for every runtime agent", () => {
    for (const id of RUNTIME_AGENT_IDS) {
      const prompt = RUNTIME_PROMPTS[id];
      expect(prompt, `missing RUNTIME_PROMPTS.${id}`).toBeTruthy();
      expect(prompt.toLowerCase()).toMatch(/open thread|current_goal|next_action|lesson|self-mod|marcus/);
    }
  });

  it("task-runner (*/10) and hourly heartbeat both call tickAllAgentRuntimes", () => {
    const routes = readFileSync(resolve(import.meta.dirname, "routes.ts"), "utf8");
    const heartbeat = readFileSync(resolve(import.meta.dirname, "heartbeat.ts"), "utf8");
    expect(routes).toMatch(/tickAllAgentRuntimes\(/);
    expect(heartbeat).toMatch(/tickAllAgentRuntimes\(/);
  });

  it("Janet 08:00 CGO cron also reasonAndActs (continuous, not standup-only)", () => {
    const routes = readFileSync(resolve(import.meta.dirname, "routes.ts"), "utf8");
    expect(routes).toMatch(/reasonAndAct\(\s*["']janet["']/);
  });
});
