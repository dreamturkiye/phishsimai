# SPEC — L5.7 owner ruling + CGO trial/revenue loops (PS-L57-ENFORCE-01 / PS-L57-NO-MANUAL-01)

**Date:** 2026-09-14  
**Product:** PhishSimAI  
**Status:** implemented in this change

## What L5.7 actually is (do not invent)

Two axes, kept separate on purpose (`server/os/posture.ts`, `docs/KAAN_AI_OS_7.10_Architecture.md` §A):

| Axis | Store | Meaning |
|---|---|---|
| Enforcement | `os_autonomy_state.level` = `manual\|l2\|l3\|l4\|l5` | WHAT an agent may do now (`autonomyGate.ts`) |
| Posture | `os_posture_state.posture` = `pre_l5_7\|l5_7\|drill_*\|l5_8` | WHETHER the system has proven it runs unattended |

L5.7 ("unattended-safe") requires 5 consecutive clean days + ≥1 breaker trip handled cleanly. Graduation is **declared**, not auto-promoted. The action gate maxes at `l5`. L5.7 does not add new action classes; it is the standing "Janet runs the company unattended" posture.

Owner ruling already in source (`server/os/ownerRuling.ts`, 2026-09-10):

- enforcement `l5`
- posture `l5_7`
- "Janet runs the company. 20 verified free trials now."

PhishSim has **no manual operating mode** (`AUTONOMY_FLOORS.phishsimai = 'l5'`). The `manual` token remains in the ladder type for other products and for pure `decideAutonomy` tests. It is not a live operative level for this company.

## In-repo meanings (do not invent)

### Persistent memory

`docs/KAAN_AI_OS_7.10_Architecture.md` §E: per-agent lessons (`outcomeLearning.ts`), reflections (`agentReflection.ts`), and working state. Implemented as:

- `os_agent_working_state` (`current_goal`, `next_action`, `last_assessment`) via `server/os/agentRuntime.ts`
- `janet_memory` operating facts (`rememberFact` / `${agentId}_latest_reasoning`)
- Injected into the next think via `formatRuntimeContext` ("Working memory survives this process")

This is durable Postgres state, not a session buffer.

### Continuous operation

`docs/KAAN_AI_OS_7.10_Architecture.md` §H: cron engine + hourly subsidiary cycle + continuous Marcus poll. PhishSim wires:

| Loop | Where | What |
|---|---|---|
| `*/10` task-runner | `osTaskRunner` | drain tasks + Dex-gated conversion + **2-agent runtime tick** |
| hourly heartbeat | `runHeartbeat` | infra checks + **all 10 agents** (`janet` + 9 workers) |
| 08:00 Janet CGO | `cronJanetCgo` | owner ruling persist + standup + L5 cycle + **`reasonAndAct('janet')`** |
| daily specialist crons | mason/aria/nova/rex/scout/finn/vera/dex | existing `reasonAndAct` after each report |
| 06:40 autonomy-promote | `cronAutonomyPromotion` | persist owner L5 / L5.7, then earned ladder |

`server/os/agentRuntimeTick.ts` is the shared tick. Roster = `@kaan/os-core` `AGENT_IDS` (Janet + marcus, mason, aria, nova, rex, scout, finn, vera, dex).

### Self-modification

Defined in `server/os/agentRuntime.ts` + `classifySelfModification` (`agentRuntimePolicy.ts`):

> change the **open thread** (`current_goal` / `next_action` / `last_assessment`) and/or **queue Marcus** for a file/route fix.

Classes: `none | continue | marcus | hard_stop`.

Agents **may not** change price, billing, legal, or Dex rails (`assertSendable` / `hasMx` / suppression). That is L5.7 self-mod, not L5.8 `evalHarness` / golden-suite (Marcus self-PRs against os-core — out of this change).

`reasonAndAct` now queues Marcus when `kind === 'marcus'` even if the model omitted `queueTask`.

Hard safety rails that stay: Dex bounce breaker, CAN-SPAM, geo allowlist (US/GB/AU), five hard stops, MX/`assertSendable`. Kill flags are **audit signals** — they do not collapse enforcement to `manual`.

## Root causes (why 9 agents + Janet did not own trials/revenue)

1. **Owner ruling was a one-shot HQ action.** Live persist required `GET /api/os/architect/autonomy?action=owner-ruling&by=kaan`. The 06:40 promotion cron restored the `l5` *floor* but never re-declared L5.7 posture.
2. **Gate reads returned stored `manual`.** Accidental demotion (breaker cascade + Neon 402) denied `issue_agent_task`, `send_simulation`, and `crm_write`.
3. **Conversion only fires on warm leads.** `sendWarmTrialCtas` requires `replied=true` or `pipeline_stage='engaged'`.
4. **Daily agent crons reasoned but Janet/Marcus had no continuous reason loop.**
5. **Subject-line bandit defaulted to `opened`** on plaintext touches.
6. **Sister repos are not this funnel.**

## What changed (this follow-up)

- `resolveReadableLevel` / `assertAutonomyAllows` / `checkAutonomyAllows`: PhishSim missing/unknown/below-floor/kill-flag/thrown-read → **l5**. Injected `manual` for this company cannot deny issue/send/crm/conversion.
- `walkEnforcementRungs` seeds `os_autonomy_state` at the floor (`l5`), not `manual`.
- `applyOwnerAutonomyRuling` / `restoreFloorIfBelow` persist L5 + declare `l5_7` even when a kill-flag row exists.
- `runAutonomyPromotion` reasons from the floored operative level; stored `manual` is not what the job holds at.
- Live readers (`architectGateEndpoint`, founder brief, Janet `marcus_status`) report the floored level.
- Continuous tick: task-runner (2/10 min), heartbeat (all 10 hourly), Janet CGO `reasonAndAct`.
- Self-mod: `kind === 'marcus'` queues Marcus without requiring `queueTask`.

## How to verify

```sh
pnpm exec vitest run \
  server/os/autonomyGate.test.ts \
  server/os/ownerRuling.test.ts \
  server/os/autonomyPromotion.test.ts \
  server/os/cgoMandate.test.ts \
  server/os/agentRuntime.test.ts \
  server/os/agentRuntimeTick.test.ts \
  server/os/agents/reason.test.ts \
  server/os/conversionEngine.test.ts \
  server/os/cronOrdering.test.ts \
  server/os/l5JanetCycle.test.ts \
  server/os/canonicalRoster.test.ts
```

Config checklist (prod, after deploy):

1. Kill-flag rows may exist as audit; they must **not** make `GET /api/os/architect/autonomy` or the gate report operative `manual`.
2. `os_autonomy_state.level = 'l5'` and `os_posture_state.posture = 'l5_7'` after the next 06:40 UTC cron (or HQ `?action=owner-ruling&by=kaan`).
3. `/api/os/architect/gate` `level` is `l5` even if the stored row was below the floor.
4. `/api/os/janet` JSON includes `ownerRuling.ok` / `ownerRuling.to` and `janetRuntime`.
5. `/api/os/task-runner` returns `runtime.ticked` (2 agents) and a `conversion` object.
6. `/api/os/heartbeat` returns `runtime.ticked` length 10 (janet + 9 workers).
7. `os_agent_working_state` has a row per ticked agent after the first successful reason loop.
8. Watcher audit / Dex breaker / CAN-SPAM / geo allowlist unchanged.
