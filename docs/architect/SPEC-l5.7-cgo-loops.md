# SPEC — L5.7 owner ruling + CGO trial/revenue loops (PS-L57-ENFORCE-01)

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

## Root causes (why 9 agents + Janet did not own trials/revenue)

1. **Owner ruling was a one-shot HQ action.** Live persist required `GET /api/os/architect/autonomy?action=owner-ruling&by=kaan`. The 06:40 promotion cron restored the `l5` *floor* but never re-declared L5.7 posture. If that HQ call was never made (or a later demotion landed), the company sat at `pre_l5_7` / below-floor enforcement while the source constant claimed otherwise.

2. **Gate reads did not honour the floor.** `getAutonomyLevel` warned when stored `< l5` and then returned the stored value (`manual` included). Accidental demotion (breaker cascade + Neon 402) silently denied `issue_agent_task`, `send_simulation`, and `crm_write` until 06:40 — so Janet issued nothing and warm CTAs never left.

3. **Conversion only fires on warm leads that historically do not exist.** `sendWarmTrialCtas` requires `replied=true` or `pipeline_stage='engaged'`. Funnel history in-repo: 884–927 compliance-led sends → 1 hostile reply (2026-08-03) and 269 clicks → 0 signups (login wall, `docs` + `funnelHealth.ts`). Signup entitlement was only stamped at register on 2026-09-10 (PR #302). The 10-minute task-runner heartbeat therefore no-op'd for months.

4. **Daily agent crons reasoned but could not convert.** `reasonAndAct` only queued Marcus architect tasks. Mason/Aria/Janet wrote assessments. Trial CTAs lived on executeTask + the reply classifier — both idle without warm replies.

5. **Subject-line bandit could never learn.** `computeAdaptiveSplit('touch1_subject')` defaulted to `opened`. Touch-1/2 are plaintext (`PS-COPY-PLAINTEXT-01`), so the open pixel is never attached. Split stayed 0.5 since ship. Reply outcomes are already written by `recordConversion(..., 'replied')`.

6. **Sister repos are not this funnel.** `dreamturkiye/phishsimai-outreach` (900K pipeline) last updated 2026-06-02 and is not on this app's crons/tables. `server/outreach/*` is a second unused stack (`docs/ALTERNATIVE_CHANNELS_INVESTIGATION.md`).

Hard stops (pricing, spend, legal, protected paths) stay denied at every level. This change does not loosen Dex rails or invent cold-email copy.

## What changed

- Daily `autonomy-promote` and Janet CGO crons persist `ensureOwnerL57Autonomy` (idempotent; kill flag still wins).
- `resolveReadableLevel` holds the PhishSim `l5` floor at gate-read time unless a kill flag is active or unreadable.
- Mason / Aria / Janet `reasonAndAct` may fire `runCgoConversionShift` when they name convert/trial/warm as the next action (Dex MX + suppression + bounce breaker still bind).
- `touch1_subject` bandit optimizes on `replied`, not the dead open pixel.

## How to verify

```sh
pnpm test -- server/os/autonomyGate.test.ts server/os/ownerRuling.test.ts server/os/cgoMandate.test.ts server/os/agents/reason.test.ts server/os/conversionEngine.test.ts server/os/cronOrdering.test.ts
```

Config checklist (prod, after deploy):

1. No active row in `os_kill_flags` for `phishsimai`.
2. `os_autonomy_state.level = 'l5'` and `os_posture_state.posture = 'l5_7'` after the next 06:40 UTC cron (or HQ `?action=owner-ruling&by=kaan`).
3. `GET /api/os/architect/autonomy` (cron/HQ auth) reports posture `l5_7`.
4. `/api/os/janet` JSON includes `ownerRuling.ok` / `ownerRuling.to`.
5. `/api/os/task-runner` still returns a `conversion` object; `sent` stays 0 until a real external reply is captured — that is correct, not a regression.
6. Watcher audit / Dex breaker / CAN-SPAM / geo allowlist unchanged.
