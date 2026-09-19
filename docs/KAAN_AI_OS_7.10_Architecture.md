# Kaan AI OS 7.10 — Architecture

**Canonical OS source of truth.** Implement from this file only. Do not use or amend `docs/KAAN_AI_OS_7.0`–`7.9`, `KAAN_AI_OS_V7*` aliases, or `KAAN_AI_OS_V7.3` as governing design. Those files are archives. If code diverges from this document, either update **this** file (Section N changelog + Section O) or fix the code — never silently run an older spec.

**L5.7 → L5.8 autonomy layer built on Kaan AI OS 6.0**

- Version: `7.10.10`
- Status: approved-for-build, July 4, 2026. Amended same day: v7.1 (O.1–O.9 — resilience, self-propagation, growth allocation), v7.2 (O.10–O.14 — portability and permanence), v7.3 (O.15–O.17 — divergence charter, SME agents, measurable agent L-levels). Amended Aug 12, 2026: v7.6 (O.18–O.22 — Janet agentic CGO, Marcus reliability + durability, PhishSim↔ScrollFuel Marcus parity; BUILT + proven live, not design). Amended Aug 12, 2026 (later): v7.7 (O.23–O.27 — Janet agent routing, the revenue learning loop CONNECTED + ADAPTIVE, subject A/B activated, branded warm-email signature; ScrollFuel parity). Amended Aug 12, 2026 (later still): v7.8 (O.28 — Janet OKR/Goal engine, both products). Amended Aug 13, 2026: v7.9 (O.29 — agent ownership + real actions under Janet supervision, both products). Amended Aug 13, 2026 (later): v7.10.0 (O.30/O.31 — daily escalation triage; agents ground self-originated work in current external best practice). Amended Sep 14, 2026: **v7.10.1 / O.32** (PR #311 metric/runtime floor + PR #313 denser ticks + drill-row heal / budgeted heartbeat follow-up). **O.32.8:** Janet does not nag about `autonomy_change` / `raise_refused` when already at L5 / L5.7 — do not demote. **O.32.9:** crisis 6h warm follow-up so one touch-90 cannot park all sendable leads. Amended Sep 14, 2026 (later): **v7.10.2 / O.32.10** — sequence backlog drain, Grey Box paid loop, LinkedIn past draft theater, warm CTA→trial instrumentation. Amended Sep 14, 2026 (later still): **v7.10.3 / O.32.11** — post-cutoff second-touch on `/api/os/sequence-touch2` (approved T3 copy), MSP harvest skip-ahead, Grey Box D25 from trial-nudges cron. Amended Sep 17, 2026: **v7.10.4 / O.32.12** — unused TRUE-trial activation nudge (3-click + white-glove), one email max, no warm-CTA touch 93. Amended Sep 17, 2026 (later): **v7.10.5 / O.32.13** — T1 starve detection→Marcus handoff (named sanitize/QEV/pause bugs; dual-crisis skip no longer blocks send-path `queue_marcus`). Amended Sep 17, 2026 (later still): **v7.10.6 / O.32.14** — exhausted warm pool: do not assign/score convert_warm when eligible=0 exhausted>0 (LinkedIn / Grey Box / /trial). Amended Sep 17, 2026 (later): **v7.10.7 / O.32.15** — `/trial` one-form start + UTM/email prefill + `markLeadTrial` attribution; exhausted 90/91/92 → founder 1:1 queue (NOT touch 93, NOT email). Amended Sep 17, 2026 (later): **v7.10.8 / O.32.16** — week-challenge free acquisition: OOO ≠ founder_1to1; `/knowbe4-alternative` → `/trial`; crisis social override (LinkedIn ≤1/day + Reddit no link-drop); kill `SOCIAL_CRISIS_PUBLISH=0`. Amended Sep 18, 2026: **v7.10.9 / O.32.17** — coded self-learn: invalidate convert_warm open threads when 90/91/92 exhausted; Dex combined/new-touch cap is a throttle (not PS-T1-STARVE, no founder page); OOO stays parked (no crisis reopen / no inbound engaged). Amended Sep 18, 2026 (later): **v7.10.10 / O.32.18** — crisis T1 pause does not fire when T2/50 is already spent and leftover combined can only go to T1 (live sanitizedEligible=151). Caps stay 50/50/100. Section O supersedes conflicting details in B–N.
- Author: Claude Fable 5 (design). Implementation: Claude orchestrating local Ollama models (kimi-k2.6:cloud for codegen, deepseek-r1:7b for analysis, gemma3:9b for drafts). Amendments: Cursor Cloud Agent (PR #311, #313, #314, #316, O.32.10, O.32.11, O.32.12, O.32.13, O.32.14, O.32.15, O.32.16, O.32.17, O.32.18).
- Extends: `KAAN_AI_OS_V6.md` in this repo as **lineage**, not as a competing spec. This document's original scope was V6 Section 8 plus the autonomy model those mechanisms enable. V6 Sections 2–6 are not redesigned here. **Runtime design is 7.10.10.**
- This is the handoff artifact between design and implementation. Every module named here gets built as named. If implementation must deviate, the deviation is recorded in Section N's changelog table, not silently absorbed.

---

## 0. Settled decisions (inherited from v6 — do not relitigate)

1. **One Marcus.** Single Mac-resident daemon (`/Users/kaan/HQ/marcus_watcher.py`, launchd `com.kaanos.architect`), polling all subsidiaries. No Super Marcus, no cloud duplicate. Re-confirmed July 4 after four production incidents.
2. **One versioned core.** `@kaan/os-core` consumed via git tag (`github:dreamturkiye/kaan-os-core#v7.x.x`). No copied folders, ever.
3. **Five hard stops, nothing more** (Section I). Pricing/billing changes; capital spend above configured threshold; legal contracts and vendor agreements; new subsidiary/product launch; protected-path changes (auth, webhooks, payment processing).
4. **Honesty invariants.** Metrics are real-or-null (`no_data` beats an invented 8.5). Deploy claims require architect-log proof. Behavior-change claims require a code-path binding (Section E kills "memory theater" structurally). Canary/test/walkthrough/Adeo orgs are not customer trials (O.32).
5. **PhishSim has no live manual operating mode (O.32).** Enforcement floor is `l5`; posture is owner-declared `l5_7`. The `manual` token remains in the ladder type for other products and for pure tests. Kill flags are audit signals — they do not collapse PhishSim to `manual`.

**Governing design assumption:** the Founder is AWAY by default. The system runs, self-improves, and grows revenue for multi-day stretches with zero human input. Every mechanism below is a safety net that makes that survivable, not a gate that slows it down.

---

## A. L5.7 vs L5.8, in practical terms

| Dimension | L5.7 — "unattended-safe" | L5.8 — "self-improving under absence" |
|---|---|---|
| Core claim | The system cannot hurt itself while running alone | The system gets measurably better while running alone |
| Failure containment | All four v6 Section 8 failure classes structurally impossible: circuit breaker live, CI gate blocking broken builds, standardized provider fallback, deploy-target verification | Same, plus breaker analytics feed back into task-generation (Janet stops issuing task classes that historically trip breakers) |
| Metrics | Every dashboard number real-or-null; `metrics_daily` populated on all subsidiaries | Trends drive decisions: hire/fire policy, experiment selection, strategy advancement read from `metrics_daily` + `agent_performance` |
| Growth actions | Executes pre-planned work autonomously (content, outreach, deploys) | Originates growth work: pricing experiments inside signed bands, sub-agent hire/fire, Marcus PRs against os-core itself (CI-gated, never protected paths) |
| Founder contact | Daily async brief; escalations queue without blocking anything | Same brief; system proved it in a real offline drill |
| Exit criterion (measurable) | 5 consecutive days on ScrollFuel: zero unhandled task failures, zero fabricated metrics, zero blind deploys, ≥1 breaker trip handled cleanly (natural or injected) | 15-day offline drill passed portfolio-wide: MRR non-negative drift, error rate non-increasing, ≥3 self-originated improvements shipped with proof, zero hard-stop violations |

L5.7 is a property of the *infrastructure*. L5.8 is a property of the *learning loop running on that infrastructure*. Build order follows from this: infrastructure first (Phases 0–2), loop second (Phase 3).

**Two axes, kept separate (do not collapse):**

| Axis | Store | Meaning |
|---|---|---|
| Enforcement | `os_autonomy_state.level` = `manual\|l2\|l3\|l4\|l5` | WHAT an agent may do now (`autonomyGate.ts`). Max action class is `l5`. |
| Posture | `os_posture_state.posture` = `pre_l5_7\|l5_7\|drill_3\|drill_7\|drill_15\|l5_8` | WHETHER the system has proven it runs unattended. Graduation is **declared**, never auto-promoted. |

L5.7 does not add new action classes; it is the standing "Janet runs the company unattended" posture. PhishSim (PR #311 / O.32): owner ruling persists `l5` + `l5_7`; floor reads cannot return operative `manual`. Next step from held L5.7 is **`drill_3`** (`maybeStartDrill3`) — not a declaration of L5.8. Declaring `drill_3` **requires** a running `os_posture_drills` row (`ensureRunningDrill`); a declared `drill_3` with no running row is healed, not skipped to L5.8. L5.8 still requires the 15-day drill (M.5).

---

## B. Core architecture

```
FOUNDER (Telegram, async only)
   ▲ daily brief / hard-stop escalations          ▼ approvals via deep-link, optional
┌──────────────────────────────────────────────────────────────────┐
│ kaanhq.com — SUPER JANET (portfolio CEO, Vercel + Supabase)      │
│  rollup cron · founder brief composer · escalation queue ·       │
│  cross-company bus · global memory                               │
└──────┬─────────────────────┬─────────────────────┬───────────────┘
       ▼                     ▼                     ▼
┌────────────┐        ┌────────────┐        ┌────────────┐
│ ScrollFuel │        │ VellaChat  │        │ PhishSimAI │   each: subsidiary JANET
│ Janet + 9  │        │ Janet + 9  │        │ Janet + 9  │   + 9 employees (Sec. C)
│ own DB     │        │ own DB     │        │ own DB     │   own Supabase, own Vercel
└─────┬──────┘        └─────┬──────┘        └─────┬──────┘   project, own env
      │  /architect/pending + /architect/code + wake:8765
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ MARCUS — single daemon, Founder's Mac (launchd)                  │
│ 3s poll · circuit breaker · CI-check-gated promote ·             │
│ deploy-verify · llmProvider chain (Groq→Gemini→OpenAI→Ollama)    │
└──────────────────────────────────────────────────────────────────┘
              all TS intelligence logic imported from @kaan/os-core#v7
```

### New v7 modules in this repo (`src/`)

| File | Purpose | Consumed by |
|---|---|---|
| `llmProvider.ts` | Single standardized provider fallback chain (Section M.3) | all `/architect/code` endpoints, all Janets |
| `circuitBreaker.ts` | Breaker state machine + fingerprinting (Section M.1) | Marcus (via thin Python client), Janets |
| `metricsSnapshot.ts` | Daily snapshot writer + rollup types (Section K) | subsidiary crons, kaanhq rollup |
| `agentPerformance.ts` | Janet-graded 1–10 task reviews, shared schema + scoring prompts | all three revenue subsidiaries |
| `deployVerify.ts` | Vercel project-link ↔ live-domain verification (Section M.4) | Marcus pre-promote, nightly cron |
| `escalations.ts` | Hard-stop + breaker-trip escalation queue, Telegram payload builder | kaanhq |
| `founderBrief.ts` | Daily brief composer (Section J) | kaanhq |
| `pricingBands.ts` | Signed pre-approved experiment bands, band-check function | Janets (Phase 3) |
| `hireFirePolicy.ts` | Score-threshold policy for sub-agent lifecycle (Phase 3) | Janets |
| `memoryContract.ts` | Memory write contract with behavior bindings (Section E) | everything that writes memory |

Repo-level additions: `ci/ci.yml.template` + `ci/check-imports.mjs` (Section M.2), `drills/OFFLINE_DRILL.md` (Section M.5), `marcus/breaker_client.py` (thin Python wrapper Marcus imports — os-core stays TS-first, Marcus consumes breaker state via each subsidiary's DB-backed endpoint, not by executing TS).

---

## C. Agent hierarchy, responsibilities, escalation

Hierarchy per subsidiary (unchanged shape from v6, responsibilities tightened):

**Janet (subsidiary CEO)** — owns the daily cycle (Section H), issues tasks with task-specific `dueInHours`/`priority` (the v6 memory-theater fix stays load-bearing), grades completed tasks into `agent_performance`, runs experiments, escalates only hard stops.

**The 9 employees:**

| Agent | Role | Allowed (autonomous) | Notes |
|---|---|---|---|
| Marcus | VP Engineering | All code, deploys, rollbacks, retries, infra fixes via dev→QA→prod pipeline | Exclusive owner of git and Vercel mutations. Department heads cannot override (v6 §9) |
| Aria | Marketing | Create + publish content, SEO, social scheduling | Publishing is autonomous — content is not a hard stop |
| Nova | Product growth | A/B experiments (`abExperiment.ts`), funnel changes, onboarding copy | Pricing experiments only inside `pricing_bands` |
| Max | Chief of staff | Task routing, calendar/ops, cleanup jobs, health probes (deduped) | Owns the stale-noise-task cleanup from v6 §6 |
| Scout | Research/intel | Market scans, competitor tracking, opportunity queueing | Proactive scans hourly (`intelligenceFinance.ts`) |
| Finn | Finance | Spend tracking, unit economics, forecast; spend **below** capital threshold | Above threshold = hard stop #2 |
| Mason | Infra/build | Env audits, dependency bumps, CI maintenance | Bumps ship through the same CI gate as everything |
| Rex | CRM/outreach | Sequences, replies, list management — per-company keys only | Contact data never crosses companies (Section G) |
| Vera | Customer success | Support replies, churn saves, refunds inside billing rules | A refund inside existing billing rules is not a "billing change" |

**Forbidden actions — exactly the five hard stops, for every agent including Janet and Marcus:**
1. Pricing or billing changes (outside signed `pricing_bands`)
2. Capital spend above `escalation_config.capital_threshold_usd`
3. Legal contracts / vendor agreements
4. New subsidiary or product launch
5. Protected-path changes: any diff touching paths matching `protected_paths` config (`**/auth/**`, `**/webhooks/**`, `**/payment*/**`, `**/billing/**`) — Marcus refuses at diff-application time, before commit

**Escalation rules — the complete list:**
- Hard-stop hit → `escalations` row, category = the stop, Telegram to Founder, work continues elsewhere. Timeout (72h default) → status `deferred`, never auto-approved.
- Circuit breaker OPEN → `escalations` row, category `breaker_trip`. This is a *notification with an auto-safe-state*, not an approval request: the tripped fingerprint is quarantined, everything else keeps running.
- Nothing else escalates. Everything else is an `audit_log` row.

---

## D. Autonomy model

**Default: fully autonomous.** The enumerated list below is exhaustive on the gated side; the autonomous side is "everything else," including but not limited to:

- Routine deploys through the Marcus pipeline (dev → CI checks → preview QA → prod → prod QA → auto-rollback)
- Content creation and publishing, outreach sends, sequence management
- Pricing **experiments** inside `pricing_bands` (bands are signed once by the Founder as a config artifact; operating inside them requires no further contact — see Section I)
- A/B experiment creation/evaluation, strategy advancement, cross-company pattern propagation
- Hiring/firing of AI sub-agents per `hireFirePolicy.ts` thresholds
- Infra operations and spend below the capital threshold
- Task retry, requeue, cleanup (`retry=<ids>` + cleanup actions ported to all subsidiaries, per v6 §6)
- Memory writes at every scope, Marcus PRs against os-core itself in Phase 3 (CI-gated, protected paths excluded)

**Approval-gated: the five hard stops. Zero additions.** Per the brief, each gated item must be justified; each maps to a realized incident class: #1/#5 to the payment/compliance hold, #2/#3 to irreversible external commitments, #4 to portfolio focus. The breaker (Section M.1) is deliberately *not* an approval gate — it is an automatic quarantine that would have stopped the 33-asset deletion loop at attempt 3 with no human in the loop.

**PhishSim floor (O.32, supersedes a stored `manual` row):** `AUTONOMY_FLOORS.phishsimai = 'l5'`. `resolveReadableLevel` / `assertAutonomyAllows` / `checkAutonomyAllows` treat missing, unknown, below-floor, kill-flag, or thrown reads as **l5** for this company. Injected `manual` cannot deny `issue_agent_task`, `send_simulation`, or `crm_write`. Other subsidiaries keep their own floors.

---

## E. Memory architecture

Six scopes. One table shape (`os_memory`, DDL in Section K), instantiated per database — physical location enforces isolation.

| Scope | Lives in | Contains | Shared? |
|---|---|---|---|
| `global` | kaanhq DB | Portfolio principles, cross-company lessons, Founder standing instructions | Read-only to subsidiaries via kaanhq API, injected into Janet prompts |
| `company` | each subsidiary DB | Product strategy, brand voice, learned operating preferences | Never leaves its DB as raw rows; may emit anonymized patterns (below) |
| `agent` | each subsidiary DB | Per-agent lessons (`outcomeLearning.ts`), reflections (`agentReflection.ts`), skill records, **working state** (`os_agent_working_state`: `current_goal`, `next_action`, `last_assessment`) | Scoped by `agent_id`; other agents read via Janet only. Working state is durable Postgres, not a session buffer (O.32). |
| `campaign` | each subsidiary DB | Campaign state, experiment context, content calendars | Company-internal |
| `contact` | each subsidiary DB | Leads, subscribers, conversation history | **Never crosses a company boundary. No exceptions, no anonymized derivative** |
| `audit` | each subsidiary DB + kaanhq | Append-only action log (Section K `audit_log`) | kaanhq receives rollup counts, not row contents |

**Sharing rule:** the only cross-company channel is the existing `crossCompany.ts` bus. A propagated pattern is a new `cross_company_events` row carrying an abstracted lesson (e.g. "subject lines under 40 chars lifted open rate 12% on ScrollFuel") with `source_product`, never raw contact or revenue rows. Receiving Janet decides adoption; adoption is an `audit_log` entry.

**Anti-memory-theater contract (`memoryContract.ts`)** — the structural fix for v6 incident #2:

```ts
interface MemoryWrite {
  scope: MemoryScope; scopeKey: string; key: string; value: Json;
  source: 'founder' | 'janet' | AgentId;
  binding?: { kind: 'config_key' | 'code_path'; ref: string };
  // binding REQUIRED when the write claims to change future behavior
}
```

Rule: any memory write whose `key` is prefixed `behavior:` MUST carry a `binding` naming the config key or code path that actually produces the behavior, and the writer auto-queues a verification task ("issue one task; confirm `due_in_hours` ≠ 48") due within 24h. Unverified `behavior:` writes older than 24h surface in the daily brief under "unproven claims." A Janet can no longer say "noted, fixed" without the system checking the code path.

**L5.7 self-modification (PhishSim, O.32) — not L5.8 evalHarness.** `classifySelfModification` classes: `none | continue | marcus | hard_stop`. Agents may change the open thread (`current_goal` / `next_action` / `last_assessment`) and/or queue Marcus for a named file/route fix. They may **not** change price, billing, legal, or Dex rails (`assertSendable` / `hasMx` / suppression). `reasonAndAct` queues Marcus when `kind === 'marcus'` even if the model omitted `queueTask`. L5.8 `evalHarness` / golden-suite / Marcus self-PRs against os-core remain Phase 3 (O.2) — out of the L5.7 floor.

Retention: `contact` and `audit` indefinite; `agent`/`campaign` pruned by relevance score after 180 days; `global`/`company` curated, no auto-prune.

---

## F. Tool architecture and access rules

**One principle: capability lives in os-core, credentials live in each subsidiary's env.** os-core ships tool *clients* that read env var names from `productRegistry.ts`; it never contains a secret value.

| Tool class | Module | Allowed agents | Enforcement |
|---|---|---|---|
| LLM calls | `llmProvider.ts` — the only legal path; direct `groq-sdk`/`openai` imports outside it fail CI (`check-imports.mjs` denylist) | all | CI + code review by Marcus |
| git + Vercel mutations | Marcus daemon only | Marcus | Subsidiaries have no git credentials; only the Mac does |
| Vercel read API (deploy-verify) | `deployVerify.ts` | Marcus, Mason | `VERCEL_TOKEN` read-scoped |
| CRM/outreach APIs | Rex client modules | Rex | Per-company keys in that company's env only |
| Content/social APIs | Aria client modules | Aria | Same pattern |
| Telegram | `escalations.ts`, `founderBrief.ts` | kaanhq only | Single bot token in kaanhq env; subsidiaries request sends via kaanhq API (prevents the v6 telegram-isolation drift `telegramWiring.ts` audits for) |
| DB | `SqlLike` injection (v6 `selfLearning.ts` pattern) | all, own DB only | No cross-DB connection strings exist in any env |
| Ollama local (`localhost:11434`) | Marcus daemon only (same machine) | Marcus | Final fallback + bulk codegen; models: kimi-k2.6:cloud (code), deepseek-r1:7b (analysis), gemma3:9b (drafts). Check `ollama list` at daemon start |

Routing enforcement: `supervisorGraph.ts` gains an `allowedTools: ToolClass[]` field per `HierarchyNode`; task dispatch rejects a task whose required tool class isn't in the assignee's allowlist — logged, re-routed to the right agent, not escalated.

---

## G. Data separation between companies

- One Supabase project per subsidiary (existing), one Vercel project per subsidiary (verified against `productRegistry.ts` — v6 §5 table is canonical, `vela` gotcha noted).
- No shared connection strings anywhere. kaanhq's DB holds only: aggregates (`metrics_daily` rollups), `escalations`, `founder_briefs`, `cross_company_events`, `global` memory, `provider_usage` rollup. Never contact rows, never per-customer revenue rows.
- Secrets: each Vercel project's env is the single source for that company's keys. os-core references env var *names* only. HQ secrets (`sf-hq-2026` etc., v6 §5) authenticate kaanhq→subsidiary API calls via `x-hq-secret` header, rotated by Mason quarterly (autonomous — key rotation is not a protected-path change unless it touches auth code).
- Out of OS scope entirely: Smaart Power / Monday.com and Dream Türkiye's HubSpot. This OS governs the four software subsidiaries only.

---

## H. Workflow engine and daily execution cycles

Engine = cron (Vercel cron per subsidiary + launchd on the Mac) + Marcus's 3s poll + wake endpoint (port 8765). No new queue infrastructure — idempotent crons over Postgres state are sufficient at current scale and cost $0.

**Daily cycle (all times America/Los_Angeles):**

| Time | Where | Job |
|---|---|---|
| 05:45 | Mac (Marcus) | `deployVerify` all four projects; mismatch → breaker OPEN on that product's deploy fingerprint |
| 06:00 | each subsidiary cron | `metricsSnapshot.write()` → `metrics_daily` (yesterday close) |
| 06:15 | kaanhq cron | Rollup all subsidiaries; compute real `mrrGrowthPct` + sparkline from history (closes v6 §7.1 open item) |
| 06:30 | each Janet | Planning cycle: read yesterday's snapshot, agent lessons, active strategies, breaker analytics → issue day's tasks (task-specific due/priority) |
| hourly | each Janet | Scout + Finn proactive scans (`intelligenceFinance.ts`); Nova experiment checks |
| continuous | Mac | Marcus poll → breaker check → fix pipeline → CI-gated promote |
| 20:00 | each Janet | Reflection (`agentReflection.ts`) + grade day's tasks into `agent_performance` |
| 20:30 | each Janet | Phase 3: `hireFirePolicy` evaluation |
| 21:00 | kaanhq | `founderBrief.compose()` → Telegram send + store |

**PhishSim denser ticks (O.32, UTC; `vercel.json` + `server/os/cronOrdering.test.ts`):** the portfolio table above is the shared skeleton. PhishSim additionally runs:

| Loop | Where | What |
|---|---|---|
| 06:00 UTC | `/api/os/metrics-snapshot` | `metrics_daily` for yesterday |
| 06:30 UTC | `/api/os/architect/autonomy?compute` | judge yesterday (needs that snapshot) |
| 06:40 UTC | `/api/os/autonomy-promote` | persist owner L5 / L5.7 floor, then earned ladder |
| 08:00 UTC | `/api/os/janet` | CGO standup + crisis pack + `reasonAndAct('janet')` |
| `*/10` | `/api/os/task-runner` | drain tasks + Dex-gated conversion shift + **5-agent** runtime tick |
| hourly | `/api/os/heartbeat` | infra checks + **budgeted** Dex-gated conversion (cap 3, 12s race) + **3 ticks** (25s budget). Roster coverage = `*/10` 5-agent ticks + hourly 3. Cursor advances only for agents actually ticked. |

`server/os/agentRuntimeTick.ts` is the shared tick. Roster = `@kaan/os-core` `AGENT_IDS`. Dual crisis (TRUE trials < 20 **or** paying < 4) issues conversion-bound work first; idle conversion agents fire `convert_warm` **only when warm eligible>0**; if eligible=0 exhausted 90/91/92, `droughtIdleAction` / `operatingCrisisTasks` assign Grey Box nurture, LinkedIn founder-review, MSP harvest, /trial funnel, Stripe truth, T1/sanitize health — not another convert_warm. Every runtime agent **refuses idle `none`**. Analysis-only titles are refused in crisis. Honest structural-blocker diagnosis + correct next owner scores ≥5 (idle theater / wrong convert_warm hammer ≤3). Dex breaker **tripped** → Janet does not assign prospect/cold sends (`breakerAwareAssignRule`). Reviewed-task scores bias assign (unmeasured omitted). Same-day follow-up is the job until targets are met (≥20 TRUE trials, ≥4–5 paying).

**Multi-day unattended design rules:** every cron idempotent on `(product_id, snapshot_date)`-style keys; breaker quarantines are per-fingerprint so one poisoned task never blocks the queue (the v6 VellaChat failure shape); escalations never block — hard-stop work parks, adjacent work proceeds; Marcus self-health: launchd `KeepAlive` + a deduped health probe (one row per day, killing the v6 duplicate-probe noise); Mac-offline degradation: subsidiaries keep serving and queueing, Marcus drains the backlog on return — no code motion happens without Marcus, which is the safe failure mode.

10x growth mechanics live *inside* this cycle, not beside it: Scout feeds opportunities → Janet converts to experiments (Nova) and content (Aria) → outcomes graded nightly → `outcomeLearning.ts` lessons bias tomorrow's plan → winning patterns propagate portfolio-wide on the bus. The loop compounds daily without anyone watching it.

---

## I. Approval gates and guardrails

The five hard stops. Mechanics: `escalations` row → Telegram message with approve/reject deep links (kaanhq API, HQ-secret-signed) → decision recorded in `audit_log` → 72h timeout defers, never approves. `pricing_bands` is the one pre-authorization artifact: the Founder signs a band once (e.g. "ScrollFuel Pro: $29–49, trial 7–21 days"); inside it Nova experiments freely; outside it is hard stop #1. Nothing else in the system waits for a human. End of section — by design.

---

## J. Reporting and dashboard architecture

Async brief model. Nobody is assumed to be watching anything in real time.

**Daily founder brief** (21:00, Telegram + stored in `founder_briefs`): per subsidiary — MRR and delta (real, from `metrics_daily`), tasks shipped/failed, agent score avg (or `no data`), breaker trips + resolution state, pending escalations with age, active experiments + interim reads, unproven `behavior:` memory claims (Section E), anomalies (any metric ±2σ from 14-day mean). One screen, no filler.

**PhishSim honesty (O.32):** the brief and CGO scorecard print **TRUE** live trials (canary/test/walkthrough/Adeo excluded) plus raw vs excluded so inflation cannot hide. OS Health (`osHealthHonesty`) is **not** "all agents normal" on zero completions with open work, an issuance gap, a TRUE-trial drought, or **REVENUE FAILURE** ($0 MRR / 1 TRUE trial). LIVE FACTS include `true_live_trials` / `paying_customers`. Analysis-only task reviews cannot score above 6 (4 in crisis) without conversion evidence. Honest diagnosis of a structural blocker (eligible=0 exhausted, pauseNewTouch1, sanitize starved, CTA path bug) plus the correct next owner (queue_marcus / LinkedIn / Grey Box) floors at 5 — not a ≤2 fail. Idle theater / wrong convert_warm hammer still caps at 3.

**On-demand:** `GET /hq/brief?date=YYYY-MM-DD` (kaanhq, Founder-token auth) regenerates any day's brief from stored tables.

**Dashboard rules:** kaanhq dashboard reads only real tables. `types.ts` gains `type RealMetric<T> = { value: T; provenance: string } | { value: null; reason: 'no_data' }` — dashboard components accept only `RealMetric`, making the v6 fake-8.5 pattern a type error, not a code-review catch. `agentScore` stays `null` for VellaChat/PhishSimAI until their `agent_performance` tables have ≥20 graded rows.

---

## K. Data model (key tables)

Postgres DDL. Location key: [S] = each subsidiary DB, [HQ] = kaanhq DB.

```sql
-- [S] daily close snapshot; the historical-metrics gap, closed
CREATE TABLE metrics_daily (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  mrr_cents BIGINT,               -- null = honestly unknown, never 0-as-unknown
  active_subs INT, new_subs INT, churned_subs INT,
  tasks_completed INT NOT NULL DEFAULT 0,
  tasks_failed INT NOT NULL DEFAULT 0,
  agent_score_avg NUMERIC(3,1),   -- null until agent_performance is real
  queue_depth INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, snapshot_date)
);

-- [S] Janet-graded task reviews; exists on ScrollFuel, port as-is
CREATE TABLE agent_performance (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  avg_score NUMERIC(3,1) NOT NULL CHECK (avg_score BETWEEN 1 AND 10),
  review_notes TEXT,
  reviewed_by TEXT NOT NULL DEFAULT 'janet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [S] breaker state; Marcus reads/writes via subsidiary endpoint
CREATE TABLE circuit_breaker_state (
  fingerprint TEXT PRIMARY KEY,        -- sha256(product_id + task_id | normalized_error_sig)
  product_id TEXT NOT NULL,
  consecutive_failures INT NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  opened_at TIMESTAMPTZ,
  last_error TEXT,                     -- RAW stderr/body, never a generic string (v6 incident #5)
  trip_reason TEXT,                    -- 'consecutive_failures' | 'destructive_diff' | 'deploy_mismatch'
  escalation_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [HQ] the only approval surface in the system
CREATE TABLE escalations (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('pricing_billing','capital_spend','legal_contract','new_subsidiary','protected_path','breaker_trip')),
  payload JSONB NOT NULL,              -- what/why/diff/amount, enough to decide from a phone
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ, resolved_via TEXT
);

-- [HQ] CREATE TABLE founder_briefs (id BIGSERIAL PRIMARY KEY, brief_date DATE UNIQUE NOT NULL,
--        content_md TEXT NOT NULL, delivered_via TEXT, created_at TIMESTAMPTZ DEFAULT now());

-- [HQ] deploy-target verification history
CREATE TABLE deploy_verifications (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  vercel_project_id TEXT NOT NULL,     -- from that repo's .vercel/project.json
  expected_domain TEXT NOT NULL,       -- from productRegistry
  actual_domains JSONB NOT NULL,       -- Vercel API response
  match BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [S each + HQ for global scope] one shape, physical isolation by DB
CREATE TABLE os_memory (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global','company','agent','campaign','contact','audit')),
  scope_key TEXT NOT NULL,             -- agent_id / campaign_id / contact_id / product_id
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT NOT NULL,
  binding JSONB,                       -- required when key LIKE 'behavior:%' (memoryContract)
  verified_at TIMESTAMPTZ,             -- set by the auto-queued verification task
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_key, key)
);

-- [HQ] signed pre-approval artifact for pricing experiments (Phase 3)
CREATE TABLE pricing_bands (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL, plan TEXT NOT NULL,
  min_cents BIGINT NOT NULL, max_cents BIGINT NOT NULL,
  trial_days_min INT, trial_days_max INT,
  signed_by TEXT NOT NULL DEFAULT 'founder',
  signed_at TIMESTAMPTZ NOT NULL, active BOOLEAN NOT NULL DEFAULT true
);

-- [S] per-provider daily token ledger (Groq 100k TPD reality, v6 §6)
CREATE TABLE provider_usage (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL, usage_date DATE NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  exhausted_at TIMESTAMPTZ,
  UNIQUE (provider, usage_date)
);

-- [S + HQ] append-only; every autonomous action lands here
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT,
  detail JSONB,                        -- includes proof refs: commit SHA, deploy URL, message id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [HQ] cross-company pattern bus persistence
CREATE TABLE cross_company_events (
  id BIGSERIAL PRIMARY KEY,
  source_product TEXT NOT NULL, target_product TEXT,   -- null = broadcast
  pattern JSONB NOT NULL,              -- abstracted lesson only; PII structurally absent
  adopted_by JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## L. Tech stack (keep it boring, keep it paid-for)

No new infrastructure. Next.js 14 + Vercel (existing), Supabase Postgres per subsidiary (existing), Marcus in Python under launchd (existing), os-core as raw-TS git-tagged package (v6 decision), GitHub Actions free tier for CI, Telegram bot for the async channel, Ollama on the Mac for local inference. Explicitly rejected: message queues, k8s, a second Marcus, cloud schedulers — each adds a failure surface this OS exists to eliminate, at current scale none pays for itself.

---

## M. Security, governance, failure recovery — the four v6 failure modes, closed

### M.1 Circuit breaker (`circuitBreaker.ts` + `marcus/breaker_client.py`)

Fingerprint: `sha256(product_id + ':' + task_id)`; secondary fingerprint on normalized error signature (first stack frame + error class) so the same rot under different task IDs also accumulates.

State machine:
- `closed` → failure increments `consecutive_failures` (success resets to 0)
- at **3** consecutive failures → `open`: Marcus stops all retries on the fingerprint, reverts any uncommitted working-tree mutation, writes `last_error` with RAW underlying error, creates a `breaker_trip` escalation. Other fingerprints unaffected.
- `open` → after 6h cooldown → `half_open`: exactly one probe attempt. Success → `closed`; failure → `open`, cooldown doubles (cap 48h).
- Manual close: Founder deep-link or Janet with a `binding`-verified fix claim.

**Destructive-diff tripwire** (the 33-photo incident, generalized): before `apply_on_dev()`, Marcus inspects the diff; if it deletes >10 files or >500 net lines outside `generated/`+`node_modules`, the fingerprint goes straight to `open`, diff discarded, escalation raised. Not an approval gate — an automatic refusal to self-harm.

Wire-in: replaces `POISON_TASK_PREFIXES` entirely. Marcus checks breaker state before touching any task (one GET to the subsidiary's `/architect/breaker?fp=` endpoint, DB-backed) and reports outcomes after (POST same endpoint).

### M.2 CI gate

`ci/ci.yml.template`, instantiated per subsidiary:
```yaml
on: { pull_request: {}, push: { branches: [dev, develop, master, main] } }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: node ci/check-imports.mjs   # resolves every relative+aliased import; fails on stub/missing paths; denylists direct LLM SDK imports outside llmProvider
      - run: pnpm tsc --noEmit
      - run: pnpm build
```
Branch protection on each prod branch (v6 §5 table: master for ScrollFuel, main for the rest) requiring `verify`. `promote_dev_to_prod()` changes from blind push to: push dev → poll `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` until conclusion → merge only on success → on failure, surface the check run's raw output into the task record (never a generic string). This makes v6 incidents #3 and #5 structurally impossible: bad imports die on PR; a failed push is reported with git's actual stderr.

### M.3 LLM provider standardization (`llmProvider.ts`)

```ts
interface ProviderChainOpts { purpose: 'codegen'|'reasoning'|'drafting'; maxTokens: number; }
async function complete(prompt: string, opts: ProviderChainOpts, sql: SqlLike): Promise<{
  text: string; provider: string; tokens: number;
}>
```
Behavior: introspect env at call time — chain = [Groq, Gemini, OpenAI] filtered to providers whose key env var is present; consult `provider_usage` and skip any provider marked `exhausted_at` today; on 429/5xx/timeout record raw error, demote, try next; Groq exhaustion (100k TPD) sets `exhausted_at` until 00:00 UTC. Marcus-side calls append Ollama (`localhost:11434`, kimi-k2.6:cloud for codegen) as terminal fallback. All four subsidiaries' `/architect/code` endpoints delete their local implementations and import this. Errors thrown carry the raw provider response body.

### M.4 Deploy-target verification (`deployVerify.ts`)

`verify(productId)`: read that repo's `.vercel/project.json` → `GET https://api.vercel.com/v9/projects/{projectId}` + `/v9/projects/{projectId}/domains` → compare against `productRegistry` domain → write `deploy_verifications` row. Run pre-promote (blocking: mismatch aborts promotion and opens the deploy fingerprint) and nightly 05:45 (all four projects). This turns the silent VellaChat `vela` orphan-project failure into a same-day breaker trip.

### M.5 The 15-day offline drill (`drills/OFFLINE_DRILL.md`)

Staged, real, scored: 3-day (Phase 2 / held-L5.7 exit) → 7-day → 15-day (L5.8 exit). During a drill the Founder genuinely does not respond; hard-stop escalations are expected to accumulate as `deferred` and the drill verifies the system *routed around them*. Pass = MRR drift ≥ 0, task failure rate non-increasing, all breaker trips auto-quarantined, brief generated all 15 days, ≥3 self-originated improvements shipped with commit-SHA proof, zero hard-stop violations. Fail on any violation → root-cause doc appended to this file before retry.

**PhishSim (O.32):** when L5.7 is held, Janet's CGO cron (and `GET /api/os/architect/autonomy` status) may start **`drill_3` only** (`maybeStartDrill3`). Declaring `drill_3` must open a running `os_posture_drills` row **before** writing `os_posture_state`; a swallowed INSERT is how production showed `posture=drill_3` with blocker "no drill row is running". `maybeStartDrill3` heals that missing row. It must not skip to L5.8. Declaring L5.8 still requires the 15-day drill pass above.

**Recovery paths:** auto-rollback stays (v6 pipeline); breaker quarantine (above); Mac loss = subsidiaries serve traffic and queue work indefinitely (Marcus is the only writer of code — safe stall, not outage); secret leak = Mason rotates HQ secrets + provider keys, audit_log identifies exposure window.

---

## N. Phased build plan and rollout

**Build order is dependency order. Rollout order is evidence order: ScrollFuel first because it is the only subsidiary with real per-agent performance data today — it is the only place v7 can be validated as *behaving* correctly rather than merely deploying.**

| Phase | Days | Build (in order) | Rollout / gate |
|---|---|---|---|
| 0 — MVP hardening | 1–3 | `llmProvider.ts` → `circuitBreaker.ts` + `breaker_client.py` + breaker endpoint → `deployVerify.ts` → CI template + `check-imports.mjs` + branch protection | Tag `v7.0.0-rc1`. Wire into **ScrollFuel only**. Marcus promote switches to check-runs polling for ScrollFuel |
| 1 — L5.7 core | 4–10 | `metricsSnapshot.ts` + `metrics_daily` + crons → `agentPerformance.ts` (extract ScrollFuel's mechanism into core) → `escalations.ts` + Telegram deep links → `founderBrief.ts` → `memoryContract.ts` | **Gate: 5 consecutive clean days on ScrollFuel** per Section A L5.7 criteria, including one injected breaker test. No Phase 2 until passed |
| 2 — Rollout | 11–17 | Port retry/cleanup pending-endpoint actions (v6 §6) to remaining subsidiaries; instantiate CI + tables per subsidiary | **PhishSimAI** (retry/cleanup already live there), then **VellaChat** (re-verify `vela` project link first — deployVerify must pass before its first v7 promote). Tag `v7.0.0`. 3-day drill |
| 3 — L5.8 | 18–38 | `pricingBands.ts` + Founder signs initial bands (one-time) → `hireFirePolicy.ts` → breaker analytics into Janet planning → Marcus self-PR capability against os-core (CI-gated, protected paths refused at diff time) → kaanhq dashboard `RealMetric` swap + real `mrrGrowthPct` | **kaanhq/Super Janet last.** 7-day drill, then 15-day drill. Pass = L5.8 declared |

Not simultaneous, ever: each subsidiary's cutover is one tag bump + one deploy, rolled back the same way.

**Implementation notes for the Ollama pipeline:** every module above ≤300 lines, pure functions, `SqlLike` injection (v6 `selfLearning.ts` pattern), zero framework coupling — sized so kimi-k2.6:cloud generates each from this document's contracts in one dispatch (`/Users/kaan/HQ/qwen_*.txt` prompt convention, outputs to `/Users/kaan/grok_files/`). Claude reserves itself for wiring, review, and MCP actions. Deviations from this document during implementation are recorded here:

| Date | Section | Deviation | Why |
|---|---|---|---|
| 2026-09-14 | 0, A, D | PhishSim live floor is `l5` / posture `l5_7`; stored `manual` is not operative | Owner ruling. Accidental demotion (breaker cascade + Neon 402) had denied issue/send/crm. O.32. |
| 2026-09-14 | E | Working state + L5.7 self-mod (open thread / queue Marcus), not O.2 evalHarness | Persistent memory already named in E; PhishSim wired `os_agent_working_state` + `classifySelfModification`. L5.8 harness still Phase 3. |
| 2026-09-14 | H | PhishSim `*/10` 5-agent tick + hourly all-10 heartbeat + conversion shift on both + 08:00 CGO | Portfolio daily cycle is LA-time skeleton; PhishSim UTC crons are denser. Dual crisis + idle rewrite + breaker-aware assign. |
| 2026-09-14 | J | TRUE-trial counts + OS Health drought/idle lines | 2026-09-14 live DB: 98 raw free trials were ~94 Signup Canary + test + walkthrough + Adeo; Grey Box ≈ 1 true trial; paying = 0. Admin-email-only exclusion printed "92 verified". |
| 2026-09-14 | C / O.15 | PhishSim Mason = pipeline conversion; Rex = data truth; Dex = deliverability (not the ScrollFuel-shaped C table) | O.15 divergence charter. Roster remains Janet + 9 from `@kaan/os-core` `AGENT_IDS`. |
| 2026-09-14 | M.5 | Start `drill_3` from held L5.7; do not declare L5.8 | Owner: 3-day drill, not 15-day skip. |
| 2026-09-14 | — | Acquisition besides cold email is Dex-gated warm CTA + TRUE-org nudges + MSP harvest + founder-review LinkedIn drafts; public social publish stays locked | PS-SOCIAL-LOCKOUT-01. No invented cold copy. Magic-link **trial** start staged (hard stop #5 / protected auth). |
| 2026-09-14 | H / O.32.5 | Breaker + reviewed scores feed Janet assign; idle `none` rewritten to lane mandate; Scout/Dex in drought pack; heartbeat fires conversion | Completes O.32 after PR #311 merge (PR #313). Bandit remains `replied`. Not a declaration of L5.8. |
| 2026-09-14 | M.5 / H / O.32.1 | `ensureRunningDrill` before posture write; `maybeStartDrill3` heals missing running row; heartbeat = 3 ticks (25s) + conversion cap 3 (12s race), parallel | Live verify on #313/`920bfeb`: posture=`drill_3` but autonomy said "start one"; heartbeat timed out on sequential all-10. Marcus remains Mac launchd, not GitHub Actions. |
| 2026-09-14 | J / O.32.6–7 | Warm CTA COALESCE + follow-up 91/92; auto_reply reopen; D18 Grey Box upgrade; diagnoseRevenueFailure; crisis score cap 4 | Live: 15 replied / 14 engaged / 14 auto_reply drafts / sent=0. $0 MRR + 1 TRUE trial is L5.7 failure. |
| 2026-09-14 | O.30 / O.32.8 | `already_at_l5_floor` auto-defer; no founder nag loop for raise_refused while live L5 / posture drill_3+; trigger INSERT seed | #202 approved false raise_refused→manual. Owner: stop nagging. Do not demote. Breaker/hard-stop/spend/protected_path stay loud. |
| 2026-09-14 | O.32.9 | Crisis 6h 91/92 follow-up when eligible=0 and cooldown=sendable; reopenFalseAutoReplies crisis-clears false auto_reply on convert_warm | Live `bad6786` 19:24Z: cooldown=14 eligible=0 autoReplyPending=12 sent=0. Dex/CAN-SPAM/geo unchanged. |
| 2026-09-14 | O.32.10 | Sequence drain (crisis T2 unlock + price-era skip-T2→T3 + stale suppress + pause T1); Grey Box 24h D25 paid loop; LinkedIn preview+6h escalate; warm CTA→TRUE trial rate; convert_warm queued when eligible>0 | Live: ~1565 T1-no-T2>5d (T2 hold + T3 required T2); LinkedIn `already queued today` dead end; 1 TRUE trial / $0 MRR. No invented cold copy. Do not demote L5/drill_3. |
| 2026-09-14 | O.32.11 | Harvest: MyMSPHub now sets LocalBusiness.url to the directory page; take first `s2/favicons?domain=` host. Empty-scan cap 1200 so noDomain≠batch. LinkedIn Telegram uses clickable `<a href>`. Publish stays locked. | Live after #317: harvest domainsQueued=0 noDomain=400 cursor 3500→3900. Founder skipped unlock widget. |
| 2026-09-17 | O.32.12 | Unused TRUE-trial activation (nudge_day=4): 3-click path + white-glove, one email max, cap ≤5. Sibling cron `/api/os/trial-activation`. Warm CTA stays 90/91/92 — no touch 93. | Live 2026-09-16: Grey Box org 11, 0 campaigns, D14+D18+181 already sent, warm CTA→trial 0/17, pool exhausted. |
| 2026-09-17 | O.32.13 | T1 starve → Marcus: named bugs PS-T1-STARVE / QEV empty / pause lock; watchdog+refill auto-queue; crisis Marcus task; escalate CHECK-legal; 24h architect title dedupe; no convert_warm when T1 dead | Live miss: last T1 2026-09-12, sanitized=0, pauseNewTouch1, QEV empty. Telegram-only. Dual-crisis skip forbade the fix. |
| 2026-09-17 | O.32.14 | Exhausted warm pool (eligible=0 exhausted>0): crisis pack / droughtIdleAction must not assign convert_warm; diagnose nextActions → LinkedIn / Grey Box / /trial; honest blocker diagnosis scores ≥5, idle/wrong hammer ≤3 | Live 2026-09-14→17: convert_warm sent=0 every tick, agent_tasks scored ~2/10. No touch 93. No DAILY_SEND_LIMIT raise. No REFILL_ALLOW_MX_ONLY. |
| 2026-09-17 | O.32.15 | `/trial` one-form start (aliases `/signup` `/register`); UTM + email prefill; `planActivatedAt` at signup; `markLeadTrial` attribution. Exhausted 90/91/92 → founder 1:1 queue (Telegram + HQ). No touch 93. No cap raise. | Live 2026-09-17: TRUE=1, paying=0, warm CTA 0/17, 90/91/92 exhausted. `/signup` 404'd. CTA was login-looking `/login?mode=register`. |
| 2026-09-17 | O.32.3 | TRUE counts exclude `@phishsim-e2e.test` / `*.phishsim-e2e.test` admin or member emails. Count exclusion only — do not delete leftover `/trial` E2E orgs. | Leftover orgs 178–180 inflated `true_trials` to 4; only Grey Box (org 11) is a real operating trial. |
| 2026-09-17 | O.32.16 | Week-challenge free acquisition: OOO ≠ founder_1to1; `/knowbe4-alternative` → `/trial`; crisis social override auto-publishes LinkedIn ≤1/day + Reddit (no link-drop) when credentials exist. Kill `SOCIAL_CRISIS_PUBLISH=0`. No touch 93. | Owner: handle all free multi-channel acquisition without founder draft gates. Target ≥5 TRUE trials by 2026-09-25. |
| 2026-09-18 | O.32.17 | Coded self-learn: `invalidateOpenThread` + `resolveRuntimeAction` rewrite convert_warm hammer; Dex `combined_daily_cap` / `new_touch_daily_cap` ≠ PS-T1-STARVE (no Marcus, no founder page); OOO never reopens / never marks inbound engaged. Lessons persist the rewritten next action. | Draft #328 left convert_warm in working memory; #331 fixed T3 dual-stamp counts but silence still queued starve / paged founder. Owner: no babysitting. |
| 2026-09-18 | O.32.18 | Crisis `pauseNewTouch1` skips when T2 day-cap is exhausted and leftover combined/T1 rem > 0. Small-refill band stays ≤150; crisis+overdue still pauses while T2 has headroom. Caps 50/50/100. | Live: sanitizedEligible=151, drainable≈775, T2=50/50, combined rem≈14, `/api/os/sequence` pause=true sent=0. Historical-outbox Dex count was a false diagnosis (`t2_outbox_today=50`). |
| 2026-09-18 | O.32.19 | Organic/SEO trial conversion: `/signup` `/register` rewrite to prerendered `/trial`; KnowBe4 CTA is crawlable `<a href="/trial">`; blog chrome + posts CTA to `/trial` (not homepage/`/pricing`/`/signup`); `/trial` required fields first. Meta + FAQ JSON-LD + internal links for KnowBe4 alternative / phishing training. No touch 93. No Dex raise. | Live 2026-09-18: TRUE=1 / $0. `/signup` was empty SPA shell. Allowlist blog linked `/signup`. KnowBe4 CTA was JS `onClick`. |
| 2026-09-19 | O.32.20 | KnowBe4 / MSP / seat-tax cluster: six unique prerendered landings + hub; Organization/SoftwareApplication/FAQPage JSON-LD; 301 soft-404 aliases onto the cluster; `/blog` rewrite. Preserves O.32.19 trial CTAs/meta. No touch 93. No Dex raise. | #337 merged; #338/#339 conflicted. Consolidated as #340. |
---

## O. v7.1 amendments — resilience, self-propagation, growth allocation

Four gaps in v7.0 that break "runs and improves for days with the Founder absent." Each amendment below is build-scoped like everything else in this document. Where O conflicts with B–N, O wins.

### O.1 Autonomous version propagation (`versionPropagation.ts` + Marcus job)

v7.0 left the last mile human: bump four version strings after each os-core tag. Removed.

Flow: os-core tag lands (from a merged, CI-green, golden-suite-passing PR) → Marcus auto-bumps **ScrollFuel only** (`@kaan/os-core` version string commit through the normal dev→CI→prod pipeline) → **24h canary soak**: compare `metrics_daily` deltas and breaker-trip count against the prior 7-day baseline → soak clean → Marcus auto-bumps PhishSimAI, VellaChat, kaanhq in sequence, each through its own CI gate → soak dirty → revert ScrollFuel's bump commit, breaker OPEN on fingerprint `core-rollout:<tag>`, escalation `breaker_trip`.

```sql
-- [HQ]
CREATE TABLE core_rollouts (
  id BIGSERIAL PRIMARY KEY,
  tag TEXT NOT NULL,
  product_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('canary','propagated','reverted')),
  soak_metrics JSONB,           -- baseline vs canary deltas, breaker counts
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','passed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### O.2 Eval harness for self-modification (`evalHarness.ts` + `ci/golden-suite/`)

Self-PRs without an objective yardstick are guesses. Each subsidiary contributes 20 golden tasks (recorded real inputs + assertion on the known-good outcome: expected diff shape, expected routing decision, expected task metadata). `evalHarness.ts` replays the suite in CI on every os-core PR. Merge rule for Marcus self-PRs: golden pass-rate ≥ current baseline AND CI green. Results persist to `golden_results` ([HQ]: pr_ref, suite_version, pass_rate, failures JSONB, created_at). Human PRs see the same score but aren't blocked by it.

### O.3 Mac resilience: watchdog, heartbeat, degraded self-service

Settled decision intact — one Marcus, no cloud codegen, ever. What changes: the Mac stops being a silent single point of failure.

- **Watchdog**: second launchd job `com.kaanos.watchdog` (60s interval) restarts Marcus if the process or its poll loop is wedged (poll-loop liveness = mtime of `/Users/kaan/HQ/marcus_heartbeat.local` < 5 min). `pmset autorestart on` + auto-login enabled so power loss self-recovers to a running daemon.
- **Heartbeat**: Marcus POSTs to kaanhq every 5 min → `marcus_heartbeat` ([HQ]: ts, queue_depth, last_task_id, host_uptime). kaanhq cron: staleness > 30 min → Telegram alert (async, informational) + sets portfolio flag `degraded_mode = true`.
- **Degraded self-service** (`selfService.ts`, runs in each subsidiary while `degraded_mode`): the *only* three actions permitted, all reversions, none generative — (1) Vercel instant rollback to previous production deployment via kaanhq-held deploy-scoped token; (2) feature-flag kill switches; (3) provider demotion in `llmProvider`. No code generation, no git, no new behavior off-Mac. Marcus returning clears the flag and drains the queue.

This turns "Mac dies on day 2 of 10" from *all self-healing stops* into *system reverts-to-known-good autonomously and keeps serving revenue*.

### O.4 Portfolio growth allocator (`growthAllocator.ts`, [HQ])

The 10x mechanism v7.0 lacked: daily reallocation of effort toward observed marginal return, portfolio-wide. Thompson sampling over arms = (subsidiary × growth channel), channels per subsidiary declared in `productRegistry` (e.g. ScrollFuel: seo_content, cold_outreach, referral; VellaChat: seo_content, paid_social_organic_repost, retention_winback). Reward = channel-attributed conversions from `metrics_daily` + campaign outcomes. Output: daily `effort_weights` row consumed by every Janet's 06:30 planning cycle — Janets bias task volume, Aria's content quota, and Rex's send volume by weight. Cold-start: uniform priors, minimum 10% floor per active arm so no channel starves before it has data.

```sql
-- [HQ]
CREATE TABLE growth_arms (
  arm TEXT PRIMARY KEY,          -- 'scrollfuel:seo_content'
  alpha NUMERIC NOT NULL DEFAULT 1, beta NUMERIC NOT NULL DEFAULT 1,
  last_reward NUMERIC, effort_weight NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### O.5 Closing the self-widening loophole

Marcus self-PR capability (Phase 3) could otherwise touch the very files that constrain it. Amended protected-path list (hard stop #5) now additionally includes: `.github/workflows/**`, `ci/**`, `src/pricingBands.ts`, `src/hireFirePolicy.ts`, `src/escalations.ts`, and this document's Sections I/O. Marcus refuses these diffs at application time exactly like auth/payment paths. `pricing_bands` and `standing_authorizations` rows are writable only through a kaanhq admin endpoint gated by `FOUNDER_TOKEN` — an env var that exists solely in kaanhq and is never injected into any agent context, so no agent can widen its own bands even via SQL access.

### O.6 Grading integrity (amends Section C/E learning loop)

Janet grading her own team drifts toward inflation with nobody watching. Two cheap controls: (1) every `agent_performance` row must carry an `outcome_ref` in `review_notes` — commit SHA, deploy URL, metric delta, or reply-rate figure; ungrounded grades fail insert validation. (2) Weekly cross-Janet audit: a different subsidiary's Janet re-grades a random 10% sample via the same `llmProvider`; mean disagreement > 2.0 points queues a calibration task and flags it in the founder brief.

### O.7 Cost guard (amends M.3)

`llmProvider` gains a per-subsidiary daily USD cap (`escalation_config.llm_daily_cap_usd`, default $25). On breach: Marcus paths demote to local Ollama only, Janets defer non-critical calls to next day, audit row written, brief line item. Runaway spend during absence is a self-inflicted incident class; this caps it without a human.

### O.8 Standing authorizations (Founder signature required once — recommended, inert until signed)

Generalizes `pricing_bands` into `standing_authorizations` ([HQ]: category, scope JSONB, limits JSONB, signed_by, signed_at, active). Recommended initial set: (a) renewal of an **existing** vendor agreement at ≤ current price and ≤ 12-month term auto-executes (a renewal inside signed limits is not hard stop #3; a new vendor or a price increase still is); (b) per-vendor monthly infra spend caps beneath the capital threshold. Unsigned = current behavior, everything queues. This is the difference between "away 10 days" costing zero expired renewals versus a lapsed transactional-email vendor taking revenue down with it.

### O.9 Amended build order

Phase 0 adds: watchdog + heartbeat + `pmset` config (day 1 — resilience before anything else). Phase 1 adds: golden-suite recording on ScrollFuel (it has the real task history), `evalHarness.ts`, cost guard, grading integrity checks. Phase 2 adds: `versionPropagation.ts` — its canary logic is exercised by the v7.0.0 tag rollout itself. Phase 3 adds: `growthAllocator.ts` (needs ≥14 days of `metrics_daily` history to leave uniform priors), `standing_authorizations` endpoint + Founder one-time signing, `selfService.ts` degraded mode. Drill schedule unchanged; the 7-day drill must include one forced Marcus kill to verify watchdog + degraded mode end-to-end.

### O.10 Distilled playbooks — the rollable intelligence asset (v7.2)

Operational learning currently lives in DB rows (`os_memory` agent lessons, `cross_company_events`, experiment outcomes) — working memory tied to running companies, not a portable asset. Amendment: a monthly distillation job (kaanhq, 1st of month) where Janet-HQ compresses the prior month's evidence into versioned markdown in **this repo**: `playbooks/SALES.md`, `playbooks/CONTENT.md`, `playbooks/GROWTH.md`, `playbooks/OPS.md`.

Rules: every playbook entry carries provenance (source product, metric evidence, date). Newer evidence-backed entries supersede older ones; superseded entries move to `playbooks/ARCHIVE.md`, never deleted. Marcus lands the update as a docs-only PR (CI green auto-merges; golden suite exempt for docs-only diffs). Janet prompts inject playbook *sections by reference* instead of raw lesson dumps — this also caps the prompt-bloat failure mode of accumulating thousands of raw lessons over years. The repo becomes the brain: versioned, diffable, and inherited by any future company at clone time. The DB remains working memory only.

### O.11 Subsidiary bootstrap and seed pack (v7.2)

Rolling the OS to a future company must be a one-day operation, not an archaeology project. `bootstrap/NEW_SUBSIDIARY.md` (runbook) + `scripts/bootstrap-subsidiary.mjs` (scaffolder). Inputs: name, domain, vertical, nearest-sibling subsidiary. Outputs, generated in one run:

- `productRegistry.ts` entry PR (URLs, secret name, route paths, compliance profile stub)
- SQL migration bundle: every [S] table from Section K, ready for the new Supabase project
- CI file from `ci/ci.yml.template`, env-var **name** manifest (values entered once in Vercel by whoever provisions), Telegram wiring check
- `growth_arms` seeded with **portfolio-average priors** from existing arms of the same channel type — never uniform cold-start
- Golden suite cloned from the nearest sibling, flagged for re-recording against real tasks within 14 days
- Day-zero seed pack: the 9 employee persona prompts adapted to the vertical, an offer-ladder template, a 30-day content calendar pre-generated by Aria, 3 outreach sequences for Rex, current `playbooks/*` inherited automatically by being in the repo

Gate unchanged: hard stop #4 approves the launch itself. After that approval, zero further human steps to reach L5.7 posture — target ≤ 1 day from approval to a serving company running the full OS.

### O.12 Compliance profiles (`complianceGuard.ts`) (v7.2)

Portfolio autonomy across heterogeneous verticals is unsafe with one content standard. `productRegistry` gains `complianceProfile`: `{ contentRestrictions: string[]; dataHandling: 'standard'|'sensitive'; platformToS: string[]; jurisdictionNotes?: string }`. All Aria publishes, Rex sends, and Vera replies pass `complianceGuard.check()` (one `llmProvider` reasoning call against the profile) before execution. Violation → task rejected + `audit_log` row + re-draft queued; not an escalation, not a sixth hard stop — a per-company definition of what "content" means in the already-autonomous lane.

Initial profiles: ScrollFuel standard; VellaChat strictest (adult-adjacent platform ToS constraints on promotion channels); PhishSimAI — simulated-phishing material may only ever be sent to enrolled client organizations, outbound *marketing* must never resemble a phish to a non-consenting recipient. Future companies get a profile at bootstrap or the guard blocks all publishing until one exists.

### O.13 Anti-rot: doc-truth audit and model registry (v7.2)

v5→v6 already proved this class of document rots against deployed reality. Two mechanisms: (1) `scripts/doc-truth-audit.mjs`, quarterly kaanhq cron — parses this document's module tables and `CREATE TABLE` names, verifies each file exists in `src/` and each table exists per subsidiary (information_schema via each subsidiary's `SqlLike` endpoint); mismatches produce a brief line item and a stub PR against this doc's deviation table. (2) `modelRegistry.ts` — the single mapping of purpose → current model (codegen/reasoning/drafting → Ollama or cloud choice). Model churn over the coming years is a one-file edit; a quarterly Scout task re-benchmarks the local lineup against the golden suite and proposes registry updates through the normal self-PR path.

**Canonical file:** `docs/KAAN_AI_OS_7.10_Architecture.md` (this document, currently 7.10.1). Older `docs/KAAN_AI_OS_7.*` / `KAAN_AI_OS_V7*` copies are archives. A quarterly audit that "passes" against 7.3 while 7.10.1 disagrees is a failed audit.

### O.14 Amended build order (v7.2)

`complianceGuard.ts` + initial three profiles land in **Phase 1** — before any subsidiary with a non-standard profile is cut over, and specifically before VellaChat's Phase 2 rollout. Distillation (O.10) lands in **Phase 3** (needs a month of graded data to distill). Bootstrap (O.11), doc-truth audit, and `modelRegistry.ts` land in **Phase 3** after v7 is validated on all four — bootstrapping a fifth company from an unvalidated OS would export bugs at birth.

### O.15 Divergence charter — companies evolve independently (v7.3)

Principle made explicit: **HQ (Super Janet) allocates capital and effort across companies and enforces the invariants — hard stops, honesty rules, compliance guard, breaker. It never dictates tactics.** Marketing approach, customer capture and retention mechanics, channel mix, pricing-within-bands, and persona style are company property and are *expected* to diverge over time. Two corrections to keep earlier sections honest to this:

- **Playbook overlays.** `playbooks/<FUNCTION>.md` is the portfolio baseline; `playbooks/<product>/<FUNCTION>.md` is that company's overlay, and **overlay wins on conflict**. The monthly distillation job writes overlays from each company's own evidence; an entry is promoted to the portfolio baseline only after replicating in ≥ 2 companies (adopted via the bus AND metric-confirmed). This prevents ScrollFuel tactics being silently imposed on VellaChat through a shared document.
- **Allocator scope clarified (amends O.4).** The growth allocator reallocates effort *between* companies and their declared channels. It never adds, removes, or rewrites a company's channel list — that is the subsidiary Janet's call, audit-logged. HQ moves money and attention; companies choose methods.

### O.16 Subject-matter-expert agents (v7.3)

The 9 employees stop being role-generic. Per company, each agent has a **domain charter** at `agents/<product>/<agent>.md` in this repo: expertise scope (the specific market, customer, and craft this agent must master — Aria@VellaChat is an expert in companion-app growth under adult-adjacent platform ToS; Aria@PhishSimAI in B2B security content; same role, different expert), tone, constraints (references the compliance profile), and a distilled domain-knowledge section maintained by the same monthly distillation job from that agent's own graded outcomes. Prompts inject charter + relevant playbook sections by reference. Bootstrap clones the nearest sibling's charters as a starting point; the same file holding different content per company within a quarter is the success condition, not drift.

### O.17 Measurable agent L-levels (v7.3)

"L5 or better" per agent, defined so a query can check it rather than a vibe:

- **L4** — reliable executor: trailing-30 graded tasks avg_score ≥ 7.0; zero breaker fingerprints attributable to its output.
- **L5** — plans and self-corrects: trailing-50 avg_score ≥ 8.0; ≥ 20% of completed tasks self-originated (proactive scan → shipped outcome); zero honesty violations (ungrounded grades, unproven `behavior:` claims).

Computed weekly per subsidiary into `agent_levels` ([S]: agent_id, level, window_stats JSONB, computed_at). The founder brief flags any agent below L5 for 2 consecutive weeks. `hireFirePolicy` (O.9/Phase 3) becomes a ladder: 2 weeks below L5 → Janet revises the charter/persona with evidence (development); 4 weeks → replacement. Development before replacement — a charter rewrite is cheaper than discarding an agent's accumulated lessons.

**Build order:** O.16 charters land in Phase 1 for ScrollFuel (the only real performance data trains the first honest charters); overlays and `agent_levels` in Phase 2; the development/replacement ladder in Phase 3 with `hireFirePolicy` as planned.


---

## O.18–O.22 — v7.6 amendments: Janet becomes an agentic CGO; Marcus made durably reliable (BUILT — Aug 12, 2026)

Everything in this block is **built and proven live this session**, not design. Where it touches earlier sections it supersedes them. Author of this revision: Claude Opus 4.8, orchestrating directly (no coder middleman) + Grok 4.5 via the Marcus pipeline.

### O.18 Janet agentic loop — investigate → reason → act → converse (`server/os/janetAgent.ts`, PhishSimAI)
Through v7.3, Janet's HQ chat was a single-shot completion over a pre-computed ops snapshot — she could not decide to investigate. v7.6 gives her a ReAct-style tool loop (`runJanetAgent`), model-portable via a plain JSON tool protocol (`llmComplete` has no native function-calling and Janet routes across Gemini/Groq/Ollama). `janetChat()` calls the loop first and **falls back to the legacy one-shot on ANY error** — additive, never a regression.
- Read/investigate tools: `marcus_status` (architect-task outcomes + autonomy level), `ops_snapshot`, `search_memory`.
- Proven live: "is Marcus working end-to-end?" now triggers a real audit and a grounded answer, not a canned "I am online and operational."

### O.19 Janet act-tools — she executes, not just observes (`janetAgent.ts`)
- `dispatch_marcus(task)` — queues a Marcus fix via `queueJanetArchitectTask`, inheriting the **autonomy gate AND the Marcus circuit breaker**; Marcus's own gates (destructive-diff → CI → dev+prod QA → auto-revert) protect prod. This is the "founder tells Janet → she queues Marcus → it ships" loop.
- `create_decision(title, detail, recommendation)` — writes a `founder_decision` escalation for HQ sign-off.
- **Authority model:** investigate freely; `dispatch_marcus` directly (safe by construction); the five hard stops (Section I: pricing/billing, spend, legal, subsidiary launch, protected paths) stay enforced **upstream** and are deliberately absent from Janet's tool surface.
- **Honesty invariant extended.** A live test caught Janet *hallucinating* a completion and a fake task id instead of calling the tool. The agent protocol now mandates the act-tool for any action and forbids inventing a completion or id — reinforcing Section 0's "deploy claims require architect-log proof."

### O.20 Marcus reliability hardening (`/Users/kaan/HQ/marcus_watcher.py`, ARCH-04..08)
Five fixes, each root-caused from a live failure and unit- or end-to-end-proven:
- **ARCH-04** — a brand-new file is pure addition, not destructive churn (greenfield builds no longer trip the >500-line destructive-diff refusal).
- **ARCH-05** — codegen scope discipline: emit a FILE block only for the target file; reference files are read-only.
- **ARCH-06** — strip build-artifact/gitignored paths (`.next/`, `node_modules`, `dist`) from model output before measuring the diff (model was hallucinating `.next/types/*.ts` stubs and tripping the tripwire).
- **ARCH-07/08** — the local typecheck gate fails ONLY on errors in files the model actually touched; pre-existing errors in untouched files (a stale local `node_modules` missing a dep like `marked`) no longer burn every task's retry budget. CI `verify` remains canonical.

### O.21 Marcus DURABILITY — fixes must be committed (this was the silent reliability killer)
Root cause found this session: daemon fixes were made in the HQ **working tree and never committed**, so ordinary `git checkout` branch-hops reverted them off disk — surviving only in the running process's memory until the next restart. This is almost certainly why PhishSim Marcus's fixes "never stuck" historically. **New invariant: every `marcus_watcher.py` change is committed to `dreamturkiye/HQ` (and pushed) as part of the change — never left in the working tree.**

### O.22 PhishSim ↔ ScrollFuel Marcus parity (BUILT + proven end-to-end)
PhishSim Marcus was stuck at "promote dev→main." Root causes fixed:
- **(a)** `dev` and `main` had diverged 252 commits (an abandoned in-repo GitHub-Actions "CI-Marcus" experiment lived on `dev`). Resolved by realigning `dev` to the clean `main` baseline — single laptop daemon upheld (Section 0, decision 1).
- **(b)** a branch-protection misconfig — `dev` required the `marcus-path-guard` check, which only runs on **main-targeted** PRs, so no PR could ever merge into `dev`. Fixed: `dev` requires `verify`; `marcus-path-guard` still enforces at the `dev→main` promote where hard-stop paths matter.
- Both products now land autonomously end-to-end: ScrollFuel `dev→master @ ...`, PhishSim `dev→main @ 5817a80` — each proven live this session.

### Revenue-loop instrumentation — true current state (corrects stale "unwired" notes)
Verified wired + working: Resend ESP webhook (bounced/delivered/complained, Svix-verified) → `campaign_results`; opens via open-pixel; clicks via link-wrapping (269 historically recorded = proof); reply handler mounted. **Genuine remaining gap:** PhishSim has no inbound-reply (`email.received`) webhook at Resend — needs an MX / inbound-domain DNS change (**founder action**), then a ~5-minute wire.

### Pending (spec'd, NOT yet built — must not be claimed as done)
- **Learning loop (item 2 / realizes O.4 growthAllocator + O.10 distillation):** bandit variant testing on pre-revenue motions (first/second-touch copy, SEO, competitor watch) wired to `director_learning`. Touches the live send path — build with staged rollout.
- **ScrollFuel Janet agentic port (item 4):** replicate `janetAgent.ts` onto ScrollFuel's Janet (table names differ: `architect_tasks`, not `os_architect_tasks`).
- **PhishSim inbound reply capture (item 3 remainder):** DNS/MX + Resend inbound domain, then wire `email.received`.


---

## O.23–O.27 — v7.7 amendments: Janet routing + the revenue learning loop, connected and adaptive (BUILT — Aug 12, 2026)

Built and proven this session. Prompted by a live Janet exchange (a founder copy directive was mis-routed to Marcus) and a Grok 4.5 audit. Where this touches earlier sections it supersedes them.

### O.23 Agent routing — brief_agent + a code-only guard on dispatch_marcus
Root cause of a real mis-route: agentic Janet had `dispatch_marcus` and `create_decision` but NO tool to reach a specialist, so a "lead with price in the cold email" directive got funneled into the code pipeline (Marcus pre-injected unrelated backend files trying to "edit Aria's copy"). Fix: `brief_agent(agent, directive)` → `talkToAgent` (aria = copy/marketing/email, mason = sales, nova/rex/scout/finn/vera). `dispatch_marcus` now refuses copy/marketing/strategy tasks and points them to `brief_agent`; the agent protocol ROUTES BY TYPE. Copy → Aria; only code → Marcus.

### O.24 Revenue learning loop — CONNECTED (was present-but-disconnected)
The A/B spine already existed (`AB_EXPERIMENTS`, `getVariant`, `recordImpression`/`recordConversion` → `ab_impressions`, Aria's daily evaluation, `evaluateExperimentAutonomy`) but was NOT wired end-to-end: sends recorded `sent` per variant, but OPENS were never attributed back — "a counter, not an experiment." Fix: the open pixel (`trackOpen`) now attributes each open to the lead's variant via `recordConversion`, made idempotent per `(lead, experiment, event)` so repeat opens don't inflate the rate. Loop closed: send → open attributed → evaluated → winner surfaced.

### O.25 Revenue learning loop — ADAPTIVE (epsilon-greedy bandit) [audit #1]
`getVariant` was a static 50/50 hash. Added `computeAdaptiveSplit` (epsilon-greedy on OPEN rate) + `splitByWeight`: once ≥ `minSamples` (200) sends, allocation weights toward the higher open-rate arm (winner `1 - floor`, loser keeps a 0.2 exploration floor); 50/50 below the gate, on a TIE (incl. no outcomes yet), or on ANY error (fail-safe). Computed once per batch. Only the SPLIT moves — the winning COPY is never auto-promoted (promotion stays human-gated) and both arms are founder-approved. This realises the audit's #1 "bandit on the live send path," done safely. (This is the concrete, signal-appropriate slice of the spec'd-but-unbuilt O.4 growthAllocator — a per-experiment open-rate bandit, not yet the portfolio channel allocator.)

### O.26 Subject A/B activated (founder-directed)
`AB_EXPERIMENTS.touch1_subject`: control (`500 users, $299/mo — live in 10 minutes`) vs test (`500 users. $299/mo.`), SAME approved body/CTA/CAN-SPAM, `active:true`. Subject-only (the safe variable); body untouched. This is the approved variant that makes the loop non-dormant. Note: this is NOT the historically-banned "loser slot for invented copy" — the body is the one approved email; only a founder-approved subject varies.

### O.27 Branded email signature (warm/transactional only)
Logo footer (`phishsim-logo-on-white`) injected at the two warm/transactional send chokepoints — `sendLifecycle` (welcome / trial nudges / insurance pack) and `replyParser.sendEmail` (replies + checkout). Cold first-touch stays plain-text/no-logo ON PURPOSE (`abTest.ts` PS-COPY-PRICE-01: plain text lands in the primary inbox; a logo block reads as bulk). DRY — future warm/transactional emails inherit it.

### ScrollFuel parity (v7.7)
- Janet act-tools (`dispatch_marcus`, `marcus_status`) ported to SF's voice/ConvAI handler (`handleJanetToolCall`) AND registered on the ElevenLabs ConvAI agent (`agent_0101kwf2ngswe3rs8mz6bs8fzfb9`) so they actually fire on a call. `create_decision` deferred pending SF's `escalations` schema.
- The adaptive bandit (`computeAdaptiveSplit` + `splitByWeight`) carried to SF's `lib/sf/abTest.ts` / `sequences.ts` with the tie-guard. SF does not attribute opens to variants yet, so a tie → 0.5 keeps SF at 50/50 until opens are wired into SF's Resend `email.opened` webhook (the SF analog of O.24 — the one remaining SF wiring step).

### Audit reconciliation (Grok 4.5, Aug 12)
Confirmed ALREADY BUILT (audit under-counted): agent L-levels (`agentLevels.ts` — trailing-50 score + self-originated %), inbound reply capture (Gmail Apps Script `gmail-reply-capture.gs`), proactive cycle (`janetProactive.ts`), and the learning loop (now connected + adaptive). Genuinely PENDING and deliberately deferred as premature at MRR≈0 / dead funnel: OKR/Goal engine (no `CgoGoal`), portfolio growth allocator over channels, revenue-hypothesis on every proactive action, more revenue act-tools. Honest read: these are multipliers on traffic that does not yet exist — the real lever remains deliverability / list quality / offer, not more Janet machinery.


---

## O.28 — v7.8 amendment: Janet's OKR / Goal engine (BUILT — Aug 12, 2026) [audit #3]

The last of the two "genuinely missing" audit items (the other, the adaptive bandit, is O.25). Complements `janetStrategy.ts` (long-term strategies, which the audit rightly called a static skeleton) with MEASURABLE objectives Janet OWNS.

- **Storage:** `cgo_goals` (objective + `key_results` jsonb, each with `target` / `current` / `unit` / optional `metric`; plus `period`, `status`, `owner='janet'`).
- **Measured, not asserted:** `getGoalsWithProgress` computes each key result's CURRENT value from REAL data ON READ, and a progress %. No stale cron — every read is fresh. Auto-metrics: PhishSim `leads_touched_7d` / `opens_7d` / `open_rate_7d` / `customers` (from `ps_outreach_leads`); ScrollFuel `sends_total` / `opens_total` (from `ab_impressions`). Any other key result keeps a manually-set `current` — revenue metrics (MRR) stay manual until the billing schema is wired into `computeMetric`.
- **Janet owns it:** `set_goal(objective, key_results, period)` + `list_goals` tools. PhishSim: in the text agent loop (`janetAgent.ts`). ScrollFuel: in the ConvAI handler (`handleJanetToolCall`) AND registered on Janet's ElevenLabs agent (`agent_0101kwf2ngswe3rs8mz6bs8fzfb9`) so they fire by voice.
- **Safe:** nothing here touches a live customer surface, so no hard-stop applies; goals are Janet's planning contract and grading is from real metrics, never self-reported.

**Both products.** O.25 (adaptive bandit) + O.28 (OKR engine) close out the two items the audit flagged as genuinely missing. The remaining audit items — portfolio growth allocator over channels, a revenue hypothesis on every proactive action, expanded revenue act-tools — stay deliberately DEFERRED as premature at MRR≈0: they multiply traffic that does not yet exist. The real lever remains deliverability / list quality / offer.


---

## O.29 — v7.9 amendment: agent ownership + real actions under Janet's supervision (BUILT — Aug 13, 2026)

Prompted by a founder audit of the standup + brief: agents were reporting but not delivering — reactive (waiting for Janet's 1–3 daily assignments) and text-only (they recommended, never acted).

### O.29.1 Root cause — no ownership path
`issueTask` hardcoded `issued_by='janet'`, so EVERY task was Janet-assigned. Self-originated % (the L5 bar, ≥20%) was therefore structurally 0 and unreachable, and with Janet issuing only 1–3 tasks for 8 agents most sat idle at 0 confidence, completed nothing, and produced no scores (the brief's "Agent score: no data").

### O.29.2 Fix — self-origination + domain-default ownership (PS/SF-OWNERSHIP-01/02)
`issueTask` gains `issuedBy` (default `'janet'`). After Janet's standup round, any specialist (not Marcus/Janet) left with no open task SELF-ORIGINATES: its `PROPOSAL:` from the report if present, else a DOMAIN-ANCHORED task built from `AGENTS` title+domain. Every SME owns its lane — Janet is not an SME on everything. Bounded (one per idle agent), deduped, autonomy-gated.

### O.29.3 Real actions — scoped, gated, supervised (PS/SF-AGENT-ACT-01)
Each agent may take ONE real action per task, via two SAFE gated surfaces — none touches prod, real recipients, or money directly:
- **queue_marcus:** routes a concrete code/infra change into the VERIFIED architect pipeline (autonomy gate + circuit breaker + CI verify + deploy). The agent never edits prod itself.
- **escalate:** anything sensitive (pricing, spend, legal, contacting customers, cross-team) becomes a `founder_decision` (PhishSim `escalations`) / system alert (ScrollFuel `openSystemAlert`) for a human. This is the no-drift guarantee.
Parsed from the agent's output (`ACTION: <verb>: <args>`), one per task. Every action logged to `agent_actions` and appended to the task result for Janet's review. This closes the "reports, then nothing happens" gap: a recommendation now BECOMES a queued verified change or a human decision.

### O.29.4 Churn fix (PhishSim)
Janet's standup prompt no longer tells her to reflexively "Pause X and pivot to Y" — she lets agents finish valid in-progress work and reserves supersede for genuinely obsolete tasks, so work survives to completion. (ScrollFuel's prompt has no pivot-supersede verb; no change needed there.)

### Audit reconciliation — what already existed (confirmed, not rebuilt)
- **Company data access:** `getCompanyContext` feeds every agent real company data; a prior silent-query-failure bug (a wall of zeros) was already fixed.
- **Self-learning:** `os_agent_reflections` records each agent's outcomes (pass and fail) and feeds its own past lessons into its next prompt.
- **Execution loop:** per-agent daily crons (5:45–7:00) + `runJanetFullOrchestration` execute overdue tasks. The gap was ownership + actions — now closed. NOTE: `executeTask` is otherwise text-only by design; agents ACT only through the two gated surfaces above.

### Resolved (Aug 13, later same day)
- **Health status FIXED, BOTH products (PS-HEALTH-01/02 + SF-HEALTH-01/02):** `getAllAgentHealth` no longer relies on the never-written heartbeat table. It overlays real `agent_tasks` activity (completed work → healthy, with a real uptime = done/issued) plus recent standup participation (ran in the last 48h → active), falling back to stored only when there is genuinely no signal. Live result: 7/10 agents read truthful `healthy` with real uptimes, versus 9/10 "unknown / 0%" before. Janet (orchestrator) and the two agents with no recent completed work stay `unknown` — now accurate, not misleading.
- **SF bandit open-attribution wired (SF-BANDIT-02):** the ScrollFuel Resend `email.opened` webhook now attributes each open to the lead's variant via `recordConversion` (made idempotent). SF's `touch1_subject` was already active with both arms, so the SF subject bandit is now fully functional — it measures real opens per variant and shifts toward the winner, exactly like PhishSim, instead of holding 50/50. The two products are now at full parity.
- **Stale escalations cleared:** the 3 `marcus_dispatch` escalations (#34/#35/#37) were resolved as `rejected` (the `escalations_status_check` constraint allows `pending`/`approved`/`rejected`/`deferred`); 0 pending remain. The earlier "constraint failures" were stale CI logs, not a real rejection.

### Deferred (deliberate next layer, not a gap)
- Richer domain-native action tools (e.g. Scout triggering discovery batches, Aria staging content) — each needs its own safe wiring rather than a bulk grant. The universal `queue_marcus` + `escalate` already let every agent act.


---

## O.30 — v7.10 amendment: daily escalation triage closes the report-and-nothing-happens loop (BUILT — Aug 13, 2026)

Founder-directed: agents (and Janet) were reporting and escalating, and nothing was ever REQUIRED to act on it. Measured: 3 PhishSim `marcus_dispatch` escalations sat pending 12–23h; both products' existing notify mechanisms ping Telegram once (or, in SF's case, every 4h at flat urgency) and then the item just sits.

### PS-TRIAGE-01 (PhishSim)
Wired into the existing daily founder-brief cron (which already reads pending `escalations`). Before composing the brief, Janet triages every pending row via LLM: RESOLVE it herself — genuinely in her authority, optionally queuing a real Marcus task — or mark `founder_required`. A `founder_required` item re-alerts Telegram with **growing urgency by day count** ("N DAYS UNRESOLVED") every day until a human closes it. **Exception (O.32.8):** PhishSim `autonomy_change` that is already at the L5 floor / L5.7+ posture (including `raise_refused` INSERT artifacts like #202) is auto-deferred as `already_at_l5_floor` — never `founder_required`, never louder. Breaker trips, hard stops, spend, and protected-path stay loud. Verified live: founder-brief now reports "Pending escalations: none."

### SF-TRIAGE-01 (ScrollFuel)
Same mechanism against `system_alerts` (`janet_memory`-backed), as its own standalone daily cron (15:00 UTC) — deliberately kept separate from `janet-cgo`'s tightly time-budgeted cycle rather than risk pushing it over its deadline. Verified live: triggered directly, reviewed 6 open alerts, correctly escalated all 6 to the founder (Janet defaulting to caution over auto-resolving items she wasn't confident on — the intended behavior).

An escalation or alert can no longer just sit silently on either product.

## O.31 — v7.10 amendment: agents ground self-originated work in CURRENT external best practice (BUILT — Aug 13, 2026)

Closes the "SME awareness" gap from the founder's four-part directive (smart/SME agents; self-learning + current on best practices; full autonomy; act, don't just report). Audited FIRST to avoid rebuilding existing infrastructure:
- **Internal self-learning from own outcomes already existed and is NOT touched**: `PS-REFLECT-01` / `os_agent_lessons`, a shared library with real statistical rigor (n≥30 before any lesson is trusted, tactical-vs-constitutional dimension split), already wired into multiple agents on both products via the shared `kaan-os-core` package.
- **External web search already existed in ScrollFuel** (`SF-AGENTS-01`, Tavily, day-budget-capped) but was scoped to Scout only, for market observation — not general "stay current in your own craft" for every agent. PhishSim had none.

### PS-SME-01 / SF-SME-01
Extends the existing domain-default self-origination task (O.29 / PS-OWNERSHIP-02, SF-OWNERSHIP-01): before falling back to generic wording, an idle agent now checks *current* external best practice in its domain via Tavily, synthesizes one concrete, actionable finding, and grounds its self-originated task in that finding with cited sources. ScrollFuel's implementation **reuses the existing `tavilySearch`** rather than duplicating the Tavily client. Findings compound into the **existing** `os_agent_lessons` store (not a new parallel system).

**Fails open, not closed**: if search is unconfigured, over budget, or genuinely finds nothing actionable, the agent falls back to today's existing generic domain-default text — zero regression on either product.

**Honest status, verified by direct inspection, not assumed**: neither product has a *working* search key today. PhishSim's Vercel prod env has no `TAVILY_API_KEY` at all. ScrollFuel's `TAVILY_API_KEY` exists as a variable but its value is an empty placeholder. Both are confirmed by directly listing/pulling the Vercel env, not by log inference. This capability therefore ships **safely inert** on both products and activates automatically the moment a real key is provisioned — that is a founder action (creating a Tavily account/key is outside what Claude can do itself).

### A caught mistake, documented for the record
The first attempt widened `outcomeLearning.ts`'s source-type union to add `'web_research'` — but that file is a **pinned copy** of the canonical `kaan-os-core` package in both repos and must never be edited directly (PhishSim's CI `check-core-drift` correctly failed the PR on this; ScrollFuel has the identical script but pushes straight to master with no gate, so it was caught by hand before pushing, via a local `node ci/check-core-drift.mjs` run — 0 violations confirmed on both before shipping). Fixed by using the existing `'agent_task'` source value, distinguished by the lesson-text prefix and signature instead of a new enum value. No canonical-package edit was needed or made.

---

## O.32 — v7.10.1 amendment: PhishSim L5.7 floor, TRUE trials, dual crisis, multi-channel acquisition (BUILT — Sep 14, 2026)

Owner mandate (PR #311 and follow-up): PhishSim is a **fully autonomous revenue company** under **this document only**. Live truth that morning: 98 raw free entitlements, ~94 Signup Canary + test + walkthrough + **Adeo (test)**, **Grey Box Consulting ≈ 1 true trial**, **0 paying**. Morning brief “92 verified” was canary inflation. Targets (operating, not slogans): **≥20 TRUE customer trials**, **≥4–5 paying**. Pricing is frozen and best-in-industry; product is sound. Drought is a funnel/honesty/idle-agent problem.

Where this amendment conflicts with B–N, **O.32 wins for PhishSim**. ScrollFuel / VellaChat floors are unchanged.

### O.32.1 L5.7 floor / no live manual gate

- Enforcement floor: `AUTONOMY_FLOORS.phishsimai = 'l5'` (`autonomyGate.ts`).
- Posture: owner ruling persists `l5_7` (`ownerRuling.ts`, 06:40 `runAutonomyPromotion`).
- Missing / unknown / below-floor / kill-flag / thrown gate reads → **l5**. Kill flags are **audit**, not a collapse to `manual`.
- `manual` remains in the ladder type for other products and for pure `decideAutonomy` tests. It is not a live PhishSim operating mode.
- Next posture step: **`drill_3`** (`maybeStartDrill3` from the 08:00 Janet CGO cron **and** `GET /api/os/architect/autonomy` status). Declaring `drill_3` **requires** a running `os_posture_drills` row (`ensureRunningDrill` before the posture write). A declared `drill_3` with no running row is **healed**, not left as the "start one" blocker. **Do not declare L5.8.**

### O.32.2 Persistent memory, continuous ticks, L5.7 self-mod

Meanings are Section E / H, wired in PhishSim as:

| Mechanism | Module |
|---|---|
| Working state | `os_agent_working_state` via `agentRuntime.ts` |
| Lessons / reflections | `outcomeLearning.ts` / `agentReflection.ts` |
| Shared tick | `agentRuntimeTick.ts` — roster = `@kaan/os-core` `AGENT_IDS` (Janet + 9) |
| `*/10` task-runner | drain + Dex-gated conversion shift + **5-agent** tick |
| Hourly heartbeat | infra checks + **budgeted** conversion (cap 3, 12s race) + **3 ticks** (25s budget), in parallel. Roster coverage = `*/10` × 5 + hourly × 3 |
| 08:00 CGO | owner ruling + standup + crisis pack + `reasonAndAct('janet')` |

Self-mod = change the open thread and/or queue Marcus (`classifySelfModification`). Not O.2 evalHarness.

### O.32.3 TRUE-trial honesty + dual crisis

Canonical exclusion: `server/os/trueTrials.ts`. A TRUE trial is `plan=free` + future `planExpiresAt`, minus:

1. Founder/test admin emails (`kaanari@mac.com`, `asadbek.munasar@forliion.com`)
2. Admin email containing `canary` or `@phishsimai.com`
3. Admin or member email domain `phishsim-e2e.test` or `*.phishsim-e2e.test` (leftover `/trial` E2E; count exclusion only — do not delete prod rows)
4. Org ids 6/7/8
5. Exact names (lower): test, adeo, phishsim internal, ai worker, sending, trial walkthrough co, signup canary's organization
6. Name matches `/canary\|walkthrough/`

Never a slug rule “contains phishsim”. Crisis: `isTrialCrisis` if TRUE count < 20; `isPaidConversionCrisis` if paying (measured) < 4. Dual crisis keeps Mason on TOF (“20 hottest”) and adds Vera/Finn for paid nurture. Founder brief, Mason, funnel-health signups, CGO `live_trials`, OS Health, Telegram LIVE FACTS, trial nudges all use this definition. D14/D25/D30 must not blast canaries.

### O.32.4 Multi-channel acquisition (not invented cold copy)

Inventory `trialAcquisitionChannels.ts`, fired from `runCgoConversionShift`:

| Channel | Status | Rail |
|---|---|---|
| Warm reply CTA | live | Dex MX / `assertSendable` / suppression; replied/engaged only |
| TRUE-org D14/D18/D25/D30 nudges | live | canary/test excluded; D18 = existing D25 checkout copy for ~10 days left |
| MSP hub harvest | live | `/api/os/msp-harvest` → AMF/MX refill |
| Magic-link checkout | live | paid HMAC `/checkout` |
| LinkedIn trial draft | live, auto-publish in crisis | frozen 60¢ / $299/500 + `TRIAL_CTA_URL`; ≤1 post/day; quality + de-dupe. **No founder approval gate.** |
| Public social publish | **crisis override** | Structural `PUBLIC_SOCIAL_POSTING_ENABLED=false`. Override when credentials exist through 2026-09-25 (or `SOCIAL_CRISIS_PUBLISH=1`). **Kill: `SOCIAL_CRISIS_PUBLISH=0`.** Reddit: allowed subs, no comment link-drop, 3 comments + 1 post/day. |
| KnowBe4 alternative SEO | live | `/knowbe4-alternative` hub + `/knowbe4-vs` `/knowbe4-pricing` `/knowbe4-for-msps` `/phishing-simulation-software` `/security-awareness-training` `/phishing-training-for-msps` → `/trial` |
| Magic-link **trial** start | **staged** | hard stop #5 / protected auth — do not build |

Bandit: `computeAdaptiveSplit(..., 'replied')` — not opens. No new cold copy. CAN-SPAM / geo allowlist / five hard stops unchanged.

### O.32.5 Aggressive persistence + learning loop

- Conversion agents (Janet, Mason, Aria, Nova, Vera) fire `convert_warm` even on LLM `none` **and** on analysis-only actions while below targets (O.32.10) **when warm eligible>0**. If eligible=0 exhausted 90/91/92, the lane mandate is Grey Box / LinkedIn / MSP harvest / /trial / Stripe — not convert_warm (O.32.14).
- Every runtime agent **refuses idle `none`** during operating crisis (`resolveRuntimeAction` / `droughtIdleAction`): next action is rewritten to the lane mandate; analysis-only titles skipped; score ceiling 6 without conversion evidence, **4 in operating crisis**, except honest structural-blocker diagnosis + correct next owner floors at **5** and idle theater / wrong convert_warm hammer caps at **3**.
- Dual-crisis pack includes Scout (“Drive trial starts from measured MSP segment”) and Dex (“Keep sending healthy so trial CTAs land”) so those lanes cannot sit idle.
- Dex breaker **tripped** → Janet must not assign prospect/cold sends (`breakerAwareAssignRule` + `assignmentSkipReason`). Warm CTA already stands down on a measured trip. Do not send around Dex.
- Reviewed-task scores (14-day, real-or-omit) bias assign via `scoreAwareAssignHint`. Unmeasured is not zero and is not a skip. This is L5.7-safe task selection, **not** L5.8 breaker-analytics / hire-fire.
- Bandit: `computeAdaptiveSplit(..., 'replied')` on the live send path (O.25 / O.32.4).
- Self-heal: `kind === 'marcus'` queues `os_architect_tasks` even without `queueTask`. If `convert_warm` is denied by the autonomy gate, Mason queues a **named-file** Marcus task once per day (`autonomyGate.ts` / `ownerRuling.ts`) — not Dex, not price.
- `executeTask` fires the conversion shift for every `CONVERSION_AGENTS` member (including Nova). Working-state `success` is true only on conversion evidence or a Marcus queue — empty sends are not a successful rest.
- Hourly heartbeat runs a **capped** Dex-gated conversion shift (cap 3, 12s `Promise.race` — does not abort in-flight LLM) **in parallel with 3 ticks** (25s budget). Task-runner still converts every 10 minutes and ticks 5. Do not require all 10 agents in one heartbeat.
- Keep pushing until ≥20 TRUE trials **and** ≥4–5 paying.

### O.32.6 Honest OS Health / founder brief

`osHealthHonesty`: WORKFORCE IDLE, ISSUANCE GAP, TRUE-TRIAL DROUGHT, or **REVENUE FAILURE** ($0 MRR / 1 TRUE trial) are not “all agents normal.” Brief prints raw vs excluded. Unmeasured paying is not zero and is not a crisis trigger. Janet must name the bottleneck every cycle (`diagnoseRevenueFailure`).

### O.32.7 Warm CTA pool + Grey Box upgrade (2026-09-14 live)

Owner DB: 9583 leads, **15 replied**, **14 engaged**, trial_at=0, customers=0. Conversion returned **sent:0 skipped:0 blocked:0** “No warm sendable leads.” 14 `outreach_reply_drafts` pending_review classified **auto_reply**, 1 interested sent. Grey Box Consulting (org 11) is the only TRUE trial (~10 days left), $0 paid.

Fixes (do not invent cold copy; Dex/CAN-SPAM/geo/hard stops stay):

- `sendWarmTrialCtas` treats NULL bounce/unsub as false; one prior CTA at touch 90 does **not** hide the pool forever. Follow-ups 91/92 after 4 days. `warmCtaPoolCensus` names why a run is empty.
- `AUTO_RE` no longer matches human “I will return…”. False `auto_reply` drafts are reopened (`reopenFalseAutoReplies`). Low-confidence auto_reply drafts for Kaan instead of no_action.
- TRUE-trial upgrade: D18 (7–12 days left) uses existing D25 checkout copy (`/settings?tab=billing`) so Grey Box is not left in the D14-already-sent / wait-for-D25 gap.
- Crisis pack names Grey Box. Failures persist as `revenue_diagnosis` and feed the next `reasonAndAct`.

### O.32.8 Already-at-L5 autonomy_change is not a founder nag (2026-09-14)

Owner: PhishSim has been at L5 / L5.7 for some time. Live: `level=l5`, posture=`drill_3` with a running drill row. Escalation **#202** was a false `raise_refused`→`manual` on `INSERT` into `os_autonomy_state` while live/operative level stayed `l5`. It was founder_chat **approved**. **Do not demote.** Janet must **stop nagging** about this class going forward.

- **Do not raise** founder Telegram / growing-urgency `autonomy_change` when: attempted/target is at or below the PhishSim L5 floor and live/stored is already `l5`; **or** outcome is `raise_refused` but `resolveReadableLevel` / floor would still be `l5` (INSERT artifact); **or** posture is already `l5_7` / `drill_3` / higher (raise/insert only).
- **Triage:** pending `autonomy_change` in that class auto-resolves `deferred` with `resolved_via=already_at_l5_floor`. Never `janetTriage=founder_required`. Never re-alert louder.
- **Notify:** `deliverPendingEscalations` stamps `notified_at` without sending; already-resolved rows cannot grow louder.
- **Trigger:** `drizzle/pg/0035_autonomy_floor_no_nag.sql` treats PhishSim INSERT of a valid ladder level as a seed (`insert`), not a raise from implicit `manual`.
- Real pages stay loud: `breaker_trip`, hard stops, spend, `protected_path`. `drop` / `row_deleted` remain visible.

Do not declare L5.8.

### O.32.9 Crisis follow-up — do not park 14 sendable leads on one touch-90 (2026-09-14 19:24Z)

Production `bad6786` LIVE: gate `l5`, drill_3 running, Grey Box nudge sent=1, conversion lesson **REVENUE BLOCKER**. Census: replied=15 engaged=14 sendable=14 suppressed=0 **cooldown=14 exhausted=0 eligible=0 autoReplyPending=12**. Warm CTAs sent=0.

- `reopenFalseAutoReplies` runs on `runCgoConversionShift` (task-runner + heartbeat) **and** the 15-min sales-replies sweep, with `crisis:true`. Neon `{rows}` vs array is normalized. Bounce/unsub/hostile/left-company stay closed; false auto_reply (incl. OOO-shaped model guesses) are cleared so `autoReplyPending` shrinks.
- Dual crisis (`TRUE<20` or `paying<4`) + `eligible=0` + `cooldown≥sendable`: follow-up 91/92 after **6 hours**, not 4 days. Same frozen copy. Dex / MX / `assertSendable` / suppression / CAN-SPAM / geo unchanged. Max three warm touches. No new cold copy.
- Default (not crisis, or some leads still eligible) stays 4 days.

Do not declare L5.8. Do not claim revenue is fixed until Production serves `sent>0` or rapidly shrinking `autoReplyPending`/`cooldown` with CTAs out.

### O.32.10 Close the book — sequence drain, Grey Box paid, LinkedIn past theater (2026-09-14 evening)

Owner: ~2 months near-zero TRUE trials, $0 paying. Live: TRUE trials ≈ 1 (Grey Box), paying = 0, 7d funnel ~136→2→1→0, heartbeat `sequence_engine` unhealthy with **~1565 leads unsent >5d**, LinkedIn stuck at `already queued a founder-review trial draft today`. Autonomy stays `l5` / `drill_3`. **Do not demote.**

**Root causes (verified in code, not guessed):**

1. Heartbeat counted T1-without-T2 after 5 days as `sequence_engine` fail. Touch-2 held after 150 sends (Aug 3 founder batch) and `touch2Eligible` only selected pre-`TOUCH2_COPY_ERA_CUTOFF` (compliance-era) T1. Price-led T1 after that cutoff could not get T2 (same pitch — correct) **and could not enter T3** because T3 required `touch2_sent_at`. Hourly T3 slice was 3 and found zero rows. That is the 1565 stall.
2. LinkedIn used `queueSocialItem` (no preview token, Reddit processor only) and returned `queued:false` after the first daily draft — draft theater, not an acquisition path.
3. `reasonAndAct` set `queued` only for Marcus `taskId`, so convert_warm with `eligible>0` looked diagnose-only. Conversion agents who said "analyze" skipped the shift.
4. Grey Box D18 is one-shot; after that claim the only TRUE trial sat until D25.

**Fixes (no invented cold copy; Dex / CAN-SPAM / geo / hard stops unchanged):**

- `runSequenceDrainTick` + crisis unlock of remaining approved T2 (still ≤10/run, ≤50 T2/day, ≤100 combined). Price-era T1 skips T2 and receives approved T3 after 5 days. T4 after T3+6d. Silent 45d no-open unreplied leads marked `dead`. Dual crisis + drainable overdue ≥50 **pauses new T1** so Dex budget drains stuck ICP first. Heartbeat `sequence_engine` is healthy when drainable <10 **or this tick actually drained** (honest plan, not a green lie over 1565).
- `advanceLinkedInAcquisition`: `savePreviewForReview` so the founder gets a Safari preview URL; escalate every 6h while pending; funnel queued→pending_review→approved→posted. Public publish stays locked. Conversion shift runs this **every crisis tick**.
- Conversion agents **always** fire `convert_warm` during operating crisis (even on "analyze"). `queued`/`executed` true when eligible>0 or a send/nudge/LinkedIn escalate happened.
- Grey Box: `runGreyBoxPaidNudge` re-sends existing D25 checkout copy every 24h while paying < 4.
- `measureWarmCtaToTrial` (14d, TRUE-trial exclusions) on heartbeat/conversion/founder brief. Brief prints REVENUE BLOCKER + warm census + sequence drainable + LinkedIn funnel.

Do not declare L5.8. Do not scale T1 until the overdue drainable pool is small.

### O.32.11 Live evidence — sequence-touch2 empty eligible, harvest noDomain:50, Grey Box sent:0 (2026-09-14 night)

Production cron (pre-#317 merge, still true of `touch2Eligible` on that branch):

- Confirmed SQL on prod ep-spring-leaf (2026-09-14 night): stalled_heartbeat **1568**; stalled_pre_cutoff **0**; stalled_post_cutoff **1601**; touch2_eligible **0**; touch2_batch_sent since epoch **796**; `touch2_scale_approved='1'` (NOT the blocker).

**Safety rationale for the second-touch unstick (no invented cold copy):**

1. Pre-cutoff T1 still receives founder-approved `TOUCH2_VARIANT` (PS-TOUCH2-PRICE-01). That cohort is spent (796/797).
2. Post-cutoff T1 already got the price-led pitch. They are **not** eligible for that same T2 body. After **≥5 days**, `/api/os/sequence-touch2` / `runTouch2Batch` sends the **existing approved SEQUENCE touch-3** (value re-frame: flat MSP math, 10-minute setup, trial link — not a same-day double price-pitch).
3. A successful post-cutoff second send stamps **both** `touch2_sent_at` and `touch3_sent_at` so heartbeat T1-no-T2 falls and the T3 loop cannot re-send the same copy. T4 remains the breakup after +6d.
4. **New epoch / measured batch:** `TOUCH2_POST_ERA_EPOCH=2026-09-14T22:00:00Z`, `TOUCH2_POST_ERA_BATCH1_LIMIT=150`. Counts only post-cutoff T1 that received T2 since that instant — the 796 old T2s do not fill this batch. `touch2_scale_approved='1'` does **not** unlock this list. After 150: HOLD unless dual crisis, which continues at Dex caps (≤10/run, ≤50/day, combined 100) — drain toward heartbeat healthy, never a 1600-in-one-day blast. Founder key for faster scale: `touch2_post_cutoff_scale_approved='1'`.
5. Dex still binds on every send: bounce breaker, `assertSendable`, MX, suppression, geo US/GB/AU, `SEND_SPACING_MS=10s`. Heartbeat takes at most 2 T2s (spacing). Silent 45d no-open unreplied leads stay excluded. New T1 stays paused while drainable overdue ≥50.

**Harvest:** MyMSPHub (2026-09-14 live) now sets `LocalBusiness.url` to the **directory page**. Treat that as no domain. The company host is the first `google.com/s2/favicons?domain=` (later favicons are related MSPs). Do not stop at 400 empty scans (`noDomain:400` / cursor 3500→3900). Walk until `domainsQueued` hits the target, or `HARVEST_EMPTY_SCAN_CAP` / time budget. ON CONFLICT de-dup unchanged.

**Grey Box:** `runTrialNudges` still fires existing D25 checkout (`nudge_day=181`, 24h).

**LinkedIn:** PS-SOCIAL-LOCKOUT-01 stays (founder skipped unlock). Escalate with a clickable `<a href>` Safari preview. Do not auto-publish.

Do not declare L5.8. Do not demote L5 / drill_3.

### O.32.12 Unused TRUE-trial activation — Grey Box never launched (2026-09-17)

Owner: PhishSimAi must become paid revenue, spam-safe. Live 2026-09-16: TRUE trials = 1 (Grey Box Consulting, org 11, `dcharit@gmail.com`, ~7 days left), **0** `campaigns` rows, `campaign_results` sent=0. Warm CTA→TRUE trial 0/17 in 14d. Warm pool exhausted (15/16 already received 90+91+92). Do **not** add touch 93. Do **not** reopen 90–92 for exhausted leads.

Vera already documents `no_campaign_14d`: "Send the 3-click first-campaign path; offer to run the first one for them." Billing nudges (D14/D18/D25/D30 + crisis 181) had already fired. Missing beat: **activation**.

- `runTrialActivationNudges` (`server/os/trialActivation.ts`): live TRUE free trial, 0 campaigns, age ≥ 3 days from `planActivatedAt`/`createdAt`, `isNonCustomerOrg` excluded. One email max (`nudge_day=4`). Cap ≤ 5/run. Janet `sendTrialActivation` — not `sendWarmTrialCtas`.
- Wired from `runTrialNudges` (09:00 + conversion ticks) and sibling cron `/api/os/trial-activation` (09:15, Bearer `CRON_SECRET`). Idempotent claim so both cannot double-send.
- Copy: 3-click Targets → template → Launch, plus white-glove "reply and I'll run the first one."
- `WARM_CTA_TOUCHES` stays `[90, 91, 92]`. No new cold copy. No LinkedIn publish. No daily cap raise.

Do not declare L5.8. Do not claim revenue is fixed until Grey Box has a campaign or a paid conversion.

### O.32.13 Detection → Marcus handoff — cold T1 death was Telegram-only (2026-09-17)

Owner question: why did Janet / Nova / Dex not catch last T1 ~2026-09-12 (sanitized pool 0, `pauseNewTouch1`, missing QEV, warm CTA→TRUE=0) and queue Marcus?

**Miss (code, not vibes):** `operatingCrisisTasks` never includes Marcus. Dual-crisis assign (`cgoStandupDirective` / `breakerAwareAssignRule` / `assignmentSkipReason`) forbade TOF / touch-1 / analysis. `diagnoseRevenueFailure` named the warm-pool trap only — not `daysSinceLastT1`, `sanitizedEligible`, `pauseNewTouch1`, verifier empty, or warm CTA→TRUE=0. `queue_marcus` fired only if an LLM wrote `ACTION: queue_marcus` (optional). Watchdog T1 health Telegrams the founder; it did not `queueJanetArchitectTask`. Nova/Dex crisis copy said "queue Marcus for a named bug" but skip rules could treat "touch 1" as cold volume. `shouldPauseTouch1` also locked T1 when the quality pool was small but >0 (e.g. 40) while drainable overdue was high.

**Fix:** `diagnoseRevenueFailure` names those fields. `t1MarcusTicket` / `maybeQueueT1Marcus` auto-creates a high-priority architect task with a **named** bug (`PS-T1-STARVE` / `PS-T1-QEV-EMPTY` / `PS-T1-PAUSE-LOCK`) when `starvation.alert` OR verifier empty OR sendable untouched=0 for ≥6h. Watchdog + sanitize-refill + conversion tick (deduped per UTC day+bug). Crisis pack includes Marcus. Nova/Dex `ACTION: queue_marcus` immediately — `isSendPathFixTitle` is never skipped as TOF. Pause drip while `0 < sanitizedEligible≤150` is **#323** (`T1_QUALITY_REFILL_MAX` / `isSmallQualityT1Refill`) — this handoff does not fork that logic. Escalate uses the prod 0010 CHECK set (never `founder_decision`); send-path/ops escalate is `marcus_dispatch` and is routed to `queue_marcus`. Architect queue also dedupes normalized title+source within 24h. Queuing a PS-T1-* task one-shot `UPDATE … cancelled` every open "Fix Lead Eligibility Checker" clone (no 200-row sample). Warm eligible=0 + T1 dead → queue_marcus / refill / QEV, not another convert_warm. Do **not** raise `DAILY_SEND_LIMIT`, add touch 93, or set `REFILL_ALLOW_MX_ONLY=1`.

Do not declare L5.8.

### O.32.14 Exhausted warm pool — do not score honest blockers as convert_warm failures (2026-09-17)

Live 2026-09-14→17: dual crisis still assigned `convert_warm` while warm **eligible=0 exhausted>0** (90/91/92 already sent). `convert_warm sent=0` every tick. Agents named the blocker (queue_marcus / LinkedIn / Grey Box) then `applyConversionScoreCeiling` + the review prompt punished analysis/no-send → avg ~2/10, confidence dead.

**Fix (no fake inflation of old rows; no touch 93; no `DAILY_SEND_LIMIT` raise; no `REFILL_ALLOW_MX_ONLY`):**

- `isWarmPoolExhausted` → `droughtIdleAction` / `operatingCrisisTasks` / `zeroTrialCrisisTasks` / `paidConversionCrisisTasks` do **not** assign convert_warm as the primary task. Prefer Grey Box activation/nurture, LinkedIn founder-review, MSP harvest, T1/sanitize health, /trial funnel (Nova), Stripe truth (Finn/Rex). Keep Dex rails.
- `diagnoseRevenueFailure` + `conversionLesson` when eligible=0 and T1 is not starved: next action is LinkedIn / Grey Box / /trial — never "fire convert_warm". Cooldown-parked sendable still names 91/92.
- Scoring: `isHonestStructuralBlockerDiagnosis` (eligible=0 exhausted / pauseNewTouch1 / sanitize starved / CTA path bug **and** queue_marcus / LinkedIn / Grey Box) floors at **5**. Idle theater / wrong convert_warm hammer caps at **3**. Review prompt matches.

Do not declare L5.8.

### O.32.15 Fast trial-start path + exhausted-warm founder 1:1 (2026-09-17)

Owner: MANY more TRUE PhishSimAi trials. Live 2026-09-17: TRUE=1 (Grey Box), paying=0, warm CTA→TRUE trial **0/17** in 14d, touches 90/91/92 exhausted, ~7076 never-touched leads already feeding T2/T3 under `touch2_scale_approved`. Signup canaries hourly. CTA was `https://phishsimai.com/login?mode=register`. **Do not add touch 93. Do not re-blast warm. Do not raise `DAILY_SEND_LIMIT`.**

Register already stamped `planExpiresAt` (`startProductTrial`). Remaining holes, verified in-repo:

1. `/login?mode=register` looked like a login card (light gray "Create your account"), not a trial start.
2. `/signup` (blog CTAs) **404'd**. `/register` still rendered OrgSetup (the 269-click login wall).
3. UTM/source were not passed into register / `markLeadTrial`.
4. Exhausted warm leads had no non-email convert path.

Fixes:

- Canonical destination `/trial` (aliases `/signup`, `/register`). One form, no card, no captcha, no email-verify. Password ≥8 remains (hard stop #5). `/login?mode=register` redirects here so old emails still convert. Warm CTA URL includes `utm_source=warm_cta` and `email=` prefill.
- `createOrganization` stamps `plan=free` + `planActivatedAt` + `planExpiresAt`. Register body UTM → `markLeadTrial(email, attribution)` + `janet_memory` `signup_attr:<email>`.
- Exhausted 90/91/92 replied/engaged leads → `queueFounderOneToOneReviews` (`outreach_reply_drafts.classification=founder_1to1`). Telegram + HQ Pipeline. Cap 5/run, escalate 2h. **Does not call `sendEmail`. Does not insert outbox touch 93.**
- `WARM_CTA_TOUCHES = [90, 91, 92]`. `DAILY_SEND_LIMIT = 20`. Bounce breaker / Dex / CAN-SPAM / geo unchanged. Magic-link trial start stays staged. Public LinkedIn publish stays locked.

Spec: `docs/architect/SPEC-true-trial-start-path.md`.

Do not declare L5.8. Do not invent trials.

### O.32.16 Week-challenge free multi-channel acquisition (2026-09-17)

Owner (binding): handle ALL free multi-channel acquisition without founder draft-review gates. Week challenge: ≥5 TRUE trials by 2026-09-25. Still HARD ban: no cold email blast, no touch 93, LinkedIn ≤1/day if quality and not duplicate, Reddit helpful-only in allowed subs (never link-drop spam).

- **OOO ≠ warm close.** `queueFounderOneToOneReviews` skips `classifyByRules` `auto_reply` snippets and leads with an `auto_reply` draft. Exhausted 90/91/92 human replies can still get a 1:1 brief. Auto-replies cannot.
- **Live offer on public CTAs.** `/trial` and homepage trust row state 60¢/user · $299/500 · 30-day no-card. Blog KnowBe4 post CTAs to `/trial` (not the old `/signup` 404).
- **SEO comparison.** Prerendered `/knowbe4-alternative` (alias `/knowbe4`) CTAs to `/trial?utm_campaign=knowbe4_alternative`. Competitor names stay off `/pricing` (PS-PRICE-05).
- **Crisis social publish.** `PUBLIC_SOCIAL_POSTING_ENABLED` stays **false**. `assertPublicPostingDisabled` returns when `canPublishPublicSocial(channel)` — crisis window + channel credentials. **Kill switch: Vercel `SOCIAL_CRISIS_PUBLISH=0`.** Unset env = on through 2026-09-25; `=1` continues after. LinkedIn: `advanceLinkedInAcquisition` queues the frozen offer and `tryCrisisPublishLinkedIn` auto-publishes via PostForMe (≤1/day, quality, 14d de-dupe). Reddit cron `/api/os/sarah-social` drafts + publishes without founder approval; `redditDraftIsPublishable` holds link-drops as `held_quality`.
- **Grey Box / 0-campaign activation.** Existing one-email activation (nudge_day=4) stays. Dashboard + Campaigns empty states now show the 3-click first-campaign path so unused TRUE trials that log in convert without a second email.

Do not declare L5.8. Do not invent trials. Do not raise `DAILY_SEND_LIMIT`.

### O.32.17 Coded self-learn — convert_warm hammer + Dex throttle ≠ starve (2026-09-18)

Owner (binding): agents must change next behavior without a founder pulse. Prompt-only lessons are theater if `os_agent_working_state.next_action` stays `convert_warm: hottest` after 90/91/92 are spent, or if T1 silence from Dex caps opens PS-T1-STARVE.

- **Invalidate the open thread in code.** `invalidateOpenThread` + `resolveRuntimeAction` rewrite `convert_warm` (not just idle `none`) when `eligible=0 exhausted>0`. The rewritten action is persisted as `next_action` and as the lesson (`persistRuntimeLesson`). Next tick resumes Grey Box / LinkedIn ≤1/day / MSP harvest / `/trial`.
- **Dex daily cap is a throttle.** `whyT1SentZero` `combined_daily_cap` / `new_touch_daily_cap` must not set `touch1Starvation.alert`, must not queue `PS-T1-STARVE`, must not page the founder. Wait UTC midnight. Caps stay 50/50/100. No touch 93.
- **Real T1 starve still self-heals.** `marcus_dispatch` whose payload is PS-T1-STARVE / QEV / sanitize / pauseNewTouch1 auto-resolves (`resolved_via=crisis_auto_marcus`), calls `maybeQueueT1Marcus`, and does not page. Combined-cap tickets auto-defer as `dex_daily_throttle`.
- **OOO ≠ warm.** `shouldReopenAutoReply` never unparks strict OOO (even in crisis). Inbound capture does not set `replied`/`engaged`. Leftover `founder_1to1` OOO drafts are dismissed. Human "I will return with pricing" still reopens.
- **Prompts stay aligned.** Janet / Aria / Marcus / Dex / Sarah: convert_warm only if eligible>0; LinkedIn ≤1/day already shipped; combined-cap ≠ starve.

Draft #328 (L5.7 autonomy) is the predecessor for the convert_warm rewrite + crisis-auto-Marcus pieces. This amendment is the focused successor on current `main` (after #329 OOO skip, #331 dual-stamp count). Do not rebase the whole draft.

Do not declare L5.8. Do not invent trials. Do not raise Dex caps.

### O.32.18 Crisis T1 pause yields leftover Dex to T1 when T2/50 is spent (2026-09-18)

Owner (binding): week challenge ≥5 TRUE trials. Cold T1 is the remaining TOF path (warm eligible=0 exhausted=16, no touch 93). Do not raise Dex caps.

**Live (verified in code + prod JSON, same UTC day):** `shouldPauseTouch1` returned true because `sanitizedEligible=151` is one above `T1_QUALITY_REFILL_MAX=150`, `operatingCrisis=true`, `drainableOverdue≈775`. Dex T2=50/50 rem0, T1=36/50 rem14, combined 86/100 rem14. `runFullSequence` set `dailyAllowance = pauseNewTouch1 ? 0`. Remaining combined can only be used by T1. A historical-outbox `sentTodayCounts` bug was ruled out (`t2_outbox_today=50`).

**Rule:** keep crisis pause while T2 still has headroom (drain follow-ups first). If `secondRem<=0` and `newRem>0` and `combinedRem>0`, do **not** pause — hourly T1 drip uses leftover combined under 50/50/100. Skip-T2 / drain T3 still stamps `touch3_sent_at` only; `runTouch2Batch` T3-as-T2 still dual-stamps and consumes T2/50.

Do not declare L5.8. Do not invent trials. Do not raise Dex caps. Do not add touch 93.

### O.32.19 Organic/SEO pages start a trial (2026-09-18)

Owner (binding): week challenge ≥5 TRUE trials by 2026-09-25. Homepage CTAs already crawl to `/trial` (#332–#334). Remaining leak is SEO: `/signup` served empty `app.html`; KnowBe4 CTA was JS-only; blog chrome was Pricing-only; several posts linked homepage or `/pricing`.

- **`/signup` and `/register` rewrite to `/trial/index.html`.** Canonical stays `/trial`. Not added to the sitemap.
- **KnowBe4 comparison CTA is `<a href="/trial?utm_campaign=knowbe4_alternative">`.** Header Start free trial too.
- **Blog chrome** (header + end-of-article) is a crawlable `/trial` anchor on every post. Markdown CTAs that pointed at `/signup`, `/pricing`, or the homepage now point at `/trial` with `utm_source=blog`.
- **`/trial` form:** work email + password first; optional name/company behind a disclosure. Same register payload. No card, no captcha, no magic-link.
- **SEO-first conversion (owner pivot):** homepage / KnowBe4 / blog titles name "KnowBe4 alternative" and "phishing training". KnowBe4 landing gets FAQ + FAQPage JSON-LD + related guide links. Homepage nav and every blog post internally link `/knowbe4-alternative` and `/blog`. No new keyword routes (separate SEO agent).

No invented testimonials. No Dex cap raise. No touch 93.

Spec: `docs/architect/SPEC-seo-organic-trial-cta.md`.

### Evidence (do not invent rates)

Owner DB paste 2026-09-14 + in-repo paths cited in `docs/architect/SPEC-true-trials-funnel.md`. Click→signup % is not claimed here. Live verify the same day on merged #313 / `920bfeb`: gate `level=l5` PASS; task-runner 5 ticks + conversion PASS; founder brief TRUE 1 / raw 100 / excluded 99 PASS; heartbeat timed out once (sequential all-10); posture=`drill_3` with autonomy blocker "no drill row is running". Marcus is Mac launchd, not GitHub Actions.

