# Kaan AI OS 7.0 — Architecture

**L5.7 → L5.8 autonomy layer built on Kaan AI OS 6.0**

- Version: `7.8.0`
- Status: approved-for-build, July 4, 2026. Amended same day: v7.1 (O.1–O.9 — resilience, self-propagation, growth allocation), v7.2 (O.10–O.14 — portability and permanence), v7.3 (O.15–O.17 — divergence charter, SME agents, measurable agent L-levels). Amended Aug 12, 2026: v7.6 (O.18–O.22 — Janet agentic CGO, Marcus reliability + durability, PhishSim↔ScrollFuel Marcus parity; BUILT + proven live, not design). Amended Aug 12, 2026 (later): v7.7 (O.23–O.27 — Janet agent routing, the revenue learning loop CONNECTED + ADAPTIVE, subject A/B activated, branded warm-email signature; ScrollFuel parity). Amended Aug 12, 2026 (later still): v7.8 (O.28 — Janet OKR/Goal engine, both products). Section O supersedes conflicting details in B–N.
- Author: Claude Fable 5 (design). Implementation: Claude orchestrating local Ollama models (kimi-k2.6:cloud for codegen, deepseek-r1:7b for analysis, gemma3:9b for drafts).
- Extends: `KAAN_AI_OS_V6.md` in this repo. Read that first. This document's scope is exactly V6 Section 8 plus the autonomy model those mechanisms enable. V6 Sections 2–6 are not redesigned here.
- This is the handoff artifact between design and implementation. Every module named here gets built as named. If implementation must deviate, the deviation is recorded in Section N's changelog table, not silently absorbed.

---

## 0. Settled decisions (inherited from v6 — do not relitigate)

1. **One Marcus.** Single Mac-resident daemon (`/Users/kaan/HQ/marcus_watcher.py`, launchd `com.kaanos.architect`), polling all subsidiaries. No Super Marcus, no cloud duplicate. Re-confirmed July 4 after four production incidents.
2. **One versioned core.** `@kaan/os-core` consumed via git tag (`github:dreamturkiye/kaan-os-core#v7.x.x`). No copied folders, ever.
3. **Five hard stops, nothing more** (Section I). Pricing/billing changes; capital spend above configured threshold; legal contracts and vendor agreements; new subsidiary/product launch; protected-path changes (auth, webhooks, payment processing).
4. **Honesty invariants.** Metrics are real-or-null (`no_data` beats an invented 8.5). Deploy claims require architect-log proof. Behavior-change claims require a code-path binding (Section E kills "memory theater" structurally).

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

---

## E. Memory architecture

Six scopes. One table shape (`os_memory`, DDL in Section K), instantiated per database — physical location enforces isolation.

| Scope | Lives in | Contains | Shared? |
|---|---|---|---|
| `global` | kaanhq DB | Portfolio principles, cross-company lessons, Founder standing instructions | Read-only to subsidiaries via kaanhq API, injected into Janet prompts |
| `company` | each subsidiary DB | Product strategy, brand voice, learned operating preferences | Never leaves its DB as raw rows; may emit anonymized patterns (below) |
| `agent` | each subsidiary DB | Per-agent lessons (`outcomeLearning.ts`), reflections (`agentReflection.ts`), skill records | Scoped by `agent_id`; other agents read via Janet only |
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

**Multi-day unattended design rules:** every cron idempotent on `(product_id, snapshot_date)`-style keys; breaker quarantines are per-fingerprint so one poisoned task never blocks the queue (the v6 VellaChat failure shape); escalations never block — hard-stop work parks, adjacent work proceeds; Marcus self-health: launchd `KeepAlive` + a deduped health probe (one row per day, killing the v6 duplicate-probe noise); Mac-offline degradation: subsidiaries keep serving and queueing, Marcus drains the backlog on return — no code motion happens without Marcus, which is the safe failure mode.

10x growth mechanics live *inside* this cycle, not beside it: Scout feeds opportunities → Janet converts to experiments (Nova) and content (Aria) → outcomes graded nightly → `outcomeLearning.ts` lessons bias tomorrow's plan → winning patterns propagate portfolio-wide on the bus. The loop compounds daily without anyone watching it.

---

## I. Approval gates and guardrails

The five hard stops. Mechanics: `escalations` row → Telegram message with approve/reject deep links (kaanhq API, HQ-secret-signed) → decision recorded in `audit_log` → 72h timeout defers, never approves. `pricing_bands` is the one pre-authorization artifact: the Founder signs a band once (e.g. "ScrollFuel Pro: $29–49, trial 7–21 days"); inside it Nova experiments freely; outside it is hard stop #1. Nothing else in the system waits for a human. End of section — by design.

---

## J. Reporting and dashboard architecture

Async brief model. Nobody is assumed to be watching anything in real time.

**Daily founder brief** (21:00, Telegram + stored in `founder_briefs`): per subsidiary — MRR and delta (real, from `metrics_daily`), tasks shipped/failed, agent score avg (or `no data`), breaker trips + resolution state, pending escalations with age, active experiments + interim reads, unproven `behavior:` memory claims (Section E), anomalies (any metric ±2σ from 14-day mean). One screen, no filler.

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

Staged, real, scored: 3-day (Phase 2 exit) → 7-day → 15-day (L5.8 exit). During a drill the Founder genuinely does not respond; hard-stop escalations are expected to accumulate as `deferred` and the drill verifies the system *routed around them*. Pass = MRR drift ≥ 0, task failure rate non-increasing, all breaker trips auto-quarantined, brief generated all 15 days, ≥3 self-originated improvements shipped with commit-SHA proof, zero hard-stop violations. Fail on any violation → root-cause doc appended to this file before retry.

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
| — | — | — | — |
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
- **Authority model:** investigate freely; `dispatch_marcus` directly (safe by construction); the five hard stops (Section I / OS 7.5: pricing/billing, spend, legal, subsidiary launch, protected paths) stay enforced **upstream** and are deliberately absent from Janet's tool surface.
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
