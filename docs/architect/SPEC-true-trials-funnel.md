# SPEC — True-trial honesty + funnel drought (PS-TRUE-TRIAL-01)

**Date:** 2026-09-14  
**Product:** PhishSimAI  
**Status:** implemented in this change  
**Facts used:** owner paste from live DB 2026-09-14. No invented funnel rates.

## Live facts (owner, 2026-09-14)

| Measure | Value |
|---|---|
| Raw ongoing free trials (`plan=free`, `planExpiresAt > now`) | 98 |
| `"Signup Canary's organization"` | ~94 |
| `"test"` | 1 |
| `"Trial Walkthrough Co"` | 1 |
| `"Adeo"` | 1 (owner: **also a test trial**) |
| `"Grey Box Consulting"` | 1 (the only remaining true customer trial unless further excluded) |
| Paying orgs | **0** |
| Morning brief “92 verified” | canary-inflated (admin-email exclusion only) |
| Owner targets | **≥20 true trials**, **4–5 paying customers** |
| Pricing / product | Owner: best in industry; product sound — drought is not a price problem |

Operating true trials ≈ **1**. Crisis detection that treated 92 as verified **never fired the trial pack**.

## Exclusion rules (canonical: `server/os/trueTrials.ts`)

A TRUE trial is a live product entitlement (`plan=free`, `planExpiresAt > now`) that is **not**:

1. Admin email in `NON_LEAD_ORG_ADMIN_EMAILS` (`kaanari@mac.com`, `asadbek.munasar@forliion.com`)
2. Admin email containing `canary` or `@phishsimai.com`
3. Org id in `INTERNAL_ORG_IDS` (6 / 7 / 8)
4. Org name exact (lower): `test`, `adeo`, `phishsim internal`, `ai worker`, `sending`, `trial walkthrough co`, `signup canary's organization`
5. Org name matching `/canary/i` or `/walkthrough/i`

**Not** a slug rule like “contains phishsim” — that would drop a real customer called “PhishSim Partners”.

Crisis gates, founder brief, standup, OS Health, Telegram LIVE FACTS, Mason funnel, funnel-health signups, CGO `live_trials` OKR, and trial nudges all read this definition. Nudges skip non-customer orgs so D14/D25/D30 cannot blast 94 canaries.

## Root cause (evidence in-repo + owner DB — no invented rates)

Owner hypothesis (non-binding): canary inflation hid the crisis; cold-email-only TOF + login-wall + idle agents caused the drought.

**Verified in this repo:**

1. **Canary inflation hid the trial crisis.** `isTrialCrisis` is `verifiedTrialCount < 20`. Founder brief / Mason live-trial SQL excluded only two founder admin emails (`founderBrief.ts` pre-patch, `mason.ts` pre-patch). ~94 Signup Canary orgs passed that filter → “92 verified” → `isTrialCrisis=false` → zero-trial pack never assigned. File: `server/os/cgoMandate.ts` `isTrialCrisis`; owner DB paste.

2. **Login wall (historical, partially closed).** `/register` + `/setup` were org-first and bounced logged-out prospects (`client/src/pages/OrgSetup.tsx` PS-FUNNEL-GUARD-01: “269 clicks, 0 signups”). CTA is now `/login?mode=register` (`TRIAL_CTA_URL` in `sequences.ts`). `startProductTrial` stamps `planExpiresAt` on register (`server/os/startProductTrial.ts`). Password is still required — auth is a five-hard-stop; magic-link **trial** start is staged, not built. Remaining friction: a prospect must create an account with a password after the click. No live conversion-rate is claimed here (not measured in this change).

3. **Warm CTA only replied/engaged.** `sendWarmTrialCtas` SQL: `(replied=true OR pipeline_stage='engaged')` (`sequences.ts`). Opened-but-not-replied wait on sequence touches 2–5. Sending “you wrote back” copy to openers would be deceptive — not done.

4. **TOF is mostly cold email.** Live non-email paths that already exist: MSP hub harvest (`/api/os/msp-harvest` → `mspHubHarvest.ts`), magic-link **checkout** (paid), trial-org nudges. Public social **publish** is structurally locked (`PUBLIC_SOCIAL_POSTING_ENABLED = false`, PS-SOCIAL-LOCKOUT-01). Drafting/queueing is allowed.

5. **Funnel health counted raw org creates.** `funnelHealth.ts` previously `count(*) FROM organizations WHERE createdAt > 7d` — 94 canaries look like signups and hide a true-customer flatline. Now `countTrueOrgCreates`.

6. **Agents idle / analysis ASSIGN.** Addressed in prior commits on this PR (`2b1b4c0`: conversion shift on idle, score ceiling, one-open-task). Those loops still consumed **inflated** trial counts, so persistence ran against a fake “92 trials, convert to paid” story instead of “1 true trial, fill the funnel”.

7. **Entitlement stamp exists.** Register → `createOrganization` → `planExpiresAt`. A user without an org is not a trial. Grey Box proving the path can work for a real MSP.

**Not claimed (no instrument in this change):** click→signup %, MX bounce on the Grey Box path, reply→trial conversion rate, LinkedIn impression volume.

## Other means besides cold email (wired, not invented spam)

Inventory: `server/os/trialAcquisitionChannels.ts`. Conversion shift (`runCgoConversionShift`) now:

| Channel | Status | Rail |
|---|---|---|
| Warm reply CTA | live | Dex MX / `assertSendable` / suppression |
| D14/D25/D30 nudges | live | TRUE orgs only |
| MSP hub harvest | live (existing cron) | named MSP domains → AMF/MX refill; not new cold copy |
| Magic-link checkout | live (paid) | HMAC `/checkout` |
| LinkedIn founder-review draft | live (1/day, frozen 60¢ / $299/500 + `TRIAL_CTA_URL`) | **not published** |
| Public social publish | **locked** | PS-SOCIAL-LOCKOUT-01 |
| Magic-link trial start | staged | five hard stops / protected auth — do not build here |

CAN-SPAM / Dex / geo allowlist / five hard stops unchanged. No invented cold copy.

## Agent persistence / aggression (operational)

- Task-runner tick: **5** agents / 10 min (was 2). Hourly heartbeat still ticks all 10.
- `CONVERSION_AGENTS` = Janet, Mason, Aria, Nova, **Vera** — idle `none` still fires `convert_warm` (CTA + TRUE-org nudges + LinkedIn draft queue).
- Crisis idle rewrite: `resolveRuntimeAction` / `droughtIdleAction` so ticks never persist `none` as success while below targets.
- Scout + Dex conversion-bound tasks in the true-trial pack; Dex also in the paid pack.
- Hourly heartbeat runs `runCgoConversionShift` then ticks all 10.
- Learning loop: bandit `replied`; Dex `getSequenceHealth().tripped` → Janet skips prospect/cold assigns; 14-day reviewed scores hint assign (unmeasured omitted).
- `RUNTIME_PROMPTS` for Janet + 9: refuse idle/analysis while true trials < 20 OR paying < 4; keep pushing until ≥20 true / ≥4–5 paying; queue Marcus on a named code blocker.
- `janetCgoMandate` / `employeeExecutionMandate` / crisis packs use TRUE counts. Dual crisis (1 true + 0 paying) keeps Mason on the **20 hottest MSPs** pack (TOF), and adds Vera/Finn for paid nurture.
- OS Health + Telegram LIVE FACTS print `true_live_trials` vs raw/excluded. Canary inflation cannot read as “all agents normal”.

Hard rails stay: Dex, CAN-SPAM, geo, five hard stops, no invented cold copy, L5.7 floor / no manual gate.

## How to verify

```sh
pnpm exec vitest run \
  server/os/trueTrials.test.ts \
  server/os/cgoMandate.test.ts \
  server/os/founderBrief.test.ts \
  server/os/agents/mason.test.ts \
  server/os/agents/vera.test.ts \
  server/os/agents/reason.test.ts \
  server/os/agentRuntimeTick.test.ts \
  server/os/conversionEngine.test.ts \
  server/os/trialAcquisitionChannels.test.ts \
  server/lib/osHonesty.test.ts \
  server/lib/externalFunnel.test.ts \
  server/trialNudges.test.ts
```

After deploy (prod DB, do not invent):

1. Founder brief “canlı ürün TRUE” ≈ 1 (Grey Box) if the owner paste still holds — **not** ~92.
2. Standup CGO scorecard shows raw vs excluded; crisis pack includes Mason “20 hottest”.
3. `/api/os/task-runner` `runtime.ticked` length 5; `conversion.linkedinDraft` present.
4. Trial nudges do not enqueue Signup Canary / Adeo / test / walkthrough.
5. `PUBLIC_SOCIAL_POSTING_ENABLED` remains `false`.
