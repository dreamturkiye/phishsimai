# PhishSimAI Full System Map
**Living Architecture & Dependency Reference**  
**Generated:** 2026-08-10  
**Purpose:** Prevent cascading breaks when editing one area of the codebase (especially the L5 / L5.8 autonomy layer).

> This document is the standing "BlueLens-style" map for humans and AI assistants.  
> Refer to it before making changes in `server/os/`, routers, or related critical paths.

---

## 1. Top-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Client (Vite + React 19 + wouter + TanStack Query)           │
│  pages/  components/  HQ dashboard  Mia widget  etc.         │
└────────────────────────────┬─────────────────────────────────┘
                             │ tRPC / API
┌────────────────────────────▼─────────────────────────────────┐
│ Server (Express + tRPC)                                      │
│  server/_core/   server/routers.ts   server/os/routes.ts     │
└────────────────────────────┬─────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│ Product Core   │  │ Autonomy Layer  │  │ Integrations    │
│ Campaigns      │  │ (Kaan AI OS     │  │ Stripe, Resend, │
│ Templates      │  │  L5 / L5.8)     │  │ PSA, Domains,   │
│ Targets        │  │                 │  │ Allowlists,     │
│ Training       │  │                 │  │ Sentry, etc.    │
│ Compliance     │  │                 │  │                 │
└────────────────┘  └─────────────────┘  └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Database        │
                    │ (Neon + Drizzle)│
                    │ + critical      │
                    │ triggers        │
                    └─────────────────┘
```

---

## 2. Autonomy / Kaan AI OS Layer (Highest Risk Zone)

This is the area that most often causes distant breakage.

### Core Control Plane
- `autonomyGate.ts` + `autonomyPromotion.ts` + `cleanDays.ts` + `posture.ts` + `l5Autonomy.ts`
- `metricsSnapshot.ts` (feeds the daily judgment)
- `cronOrdering.test.ts` (enforces the critical daily chain)

### Critical Daily Cron Chain (do not reorder)
```
06:00  metricsSnapshot     → metrics_daily for YESTERDAY
06:30  autonomy compute    → judges YESTERDAY
06:40  autonomyPromotion   → finalizes clean day
08:00  janet standup       → reports posture
```
- Enforced by `server/os/cronOrdering.test.ts`
- Missing or late `metrics_daily` → day treated as "unmeasured" → not clean → L5.x promotion blocked

### Orchestration & Mutation Plane
- `janet.ts` / `janetHQActions.ts` / `janetOpsSnapshot.ts` / `janetTool.ts` / `janetVoice.ts`
- `architectAgent.ts` → `architectPending.ts` → `wakeMarcus.ts` → `architectCode.ts`
- `selfHeal.ts`
- `kaan-os-core/` (shared hierarchy, supervisor graph, governance, self-learning)

### Agent Fleet (`server/os/agents/`)
Janet (CEO / L5)  
├── Marcus (VP Engineering) → Quinn / Sage / Ivy  
├── Aria (VP Marketing) → Cleo / Sage-L  
├── Nova (VP Product) → Ollie / Echo  
├── Max (Chief of Staff) → Blake / River  
├── Mason (Sales), Rex (RevOps), Finn (CFO), Vera (CS), Scout (Market Intel)

### Safety Net
- `circuitBreaker.ts`, `dexBreaker.ts`, `marcusBreaker.ts`
- `invariants.ts` + `invariantsCollect.ts`
- `agentHealth.ts` / `agentHealth_v2.ts` / `agentWatchdog.ts`
- `sentryBridge.ts` + related Sentry gates

---

## 3. Highest Blast-Radius Files

| Priority  | File / Area                                      | Why it breaks other things                          |
|-----------|--------------------------------------------------|-----------------------------------------------------|
| Critical  | `autonomyGate.ts`, `autonomyPromotion.ts`, `posture.ts` | Controls L5.8 promotion & clean-day status         |
| Critical  | `metricsSnapshot.ts` + cron order                | Breaks entire daily autonomy judgment               |
| Critical  | `selfHeal.ts` + architect* files                 | Can queue real code changes & deploys               |
| High      | `janet.ts` / `janetHQActions.ts`                 | Main orchestration + honesty rules                  |
| High      | `routes.ts` (under server/os)                    | Large surface area of entry points                  |
| High      | `kaan-os-core/*`                                 | Shared across products                              |
| High      | `invariants.ts`, circuit breakers                | System-wide safety                                  |

---

## 4. Safe Change Protocol (use every time)

Before editing any file in `server/os/` or related routers:

1. Identify direct importers and callers.
2. Check impact on the daily metrics → posture → promotion chain.
3. Check impact on self-heal / architect / Marcus path.
4. Run the relevant tests (`cronOrdering`, autonomy*, posture*, architect* tests).
5. Prefer going through the existing architect / self-heal flow when possible instead of direct mutation.

---

## 5. Other Important Contexts

- **Client**: `client/src/pages/` (especially HQ, Dashboard, Campaigns, ComplianceCenter) + `components/os/`
- **Product API**: `server/routers.ts` + campaign / template / target logic
- **Database**: `drizzle/schema.ts` + the many `drizzle/pg/*.sql` migrations (especially autonomy, posture, domain, and compliance triggers)
- **External**: Stripe, Resend, PSA integrations, domain verification, allowlists

---

## 6. Related Documents in Repo

- `KAAN_AI_OS_V5.0.md`
- `KAAN_AI_OS_V4.5.md`
- `CLAUDE.md` (critical operational notes, especially cron ordering and LLM chain)
- `PHISHSIM_AUDIT.md`
- `MIGRATION_V5.md`

---

*This map should be updated whenever major structural changes occur in the autonomy layer or critical cron / agent flows.*
