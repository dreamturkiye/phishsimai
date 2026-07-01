# Kaan AI OS v4.5 — Platform Architecture (PhishSimAI Edition)

**phishsimai.com | June 30, 2026 | Dream Türkiye**

> **Canonical reference:** ScrollFuel master doc at `/Users/kaan/ugc-agency/KAAN_AI_OS_V4.5.md`  
> **Architect specs:** `docs/architect/SPEC-self-heal-v4.5.1.md`  
> **Implementer:** Local Ollama `codegeex4:9b` — Founder/Architect verifies only, does not code.

---

## Version history

| Version | Date | Changes |
|---------|------|---------|
| 4.5 | Jun 28 2026 | Initial PhishSim port — Janet HQ, 9 agents, Marcus scaffold |
| **4.5.1** | **Jun 30 2026** | **Self-heal parity spec** — frontend telemetry, await Marcus, diagnosis fix, system alerts |

---

## Deployments (Kaan AI OS)

| Product | URL | OS version | Self-heal E2E |
|---------|-----|------------|---------------|
| ScrollFuel | scrollfuel.io | v4.5 ✅ PROVEN | `/heal-test?arm=sf-hq-2026` |
| PhishSimAI | phishsimai.com | v4.5.1 ✅ SHIPPED | `/heal-test?arm=ps-hq-2026` |
| *(future)* | — | port from SF canonical | same probe pattern |

---

## Operating model (Founder / Architect)

1. **Architect** writes specs in `docs/architect/SPEC-*.md`
2. **codegeex4:9b** implements (`ollama run codegeex4:9b`)
3. **Architect** verifies: `pnpm build`, probe curls, dev smoke
4. **Deploy** dev → production (Vercel)
5. **Never:** Architect writes application code in Cursor

Saved in: `.cursor/rules/founder-architect-workflow.mdc`, `janet_memory.founder_workflow`

---

## Agents (per product)

| Agent | Role | Surface |
|-------|------|---------|
| Janet | CGO / orchestrator | `/hq` (founder) |
| Marcus | Principal Architect | bug-report → architect pipeline |
| Mia | Customer success | In-app widget (trials) |
| Sarah Mitchell | Outbound compliance | Email / LinkedIn |
| 8 SME agents | Sales, marketing, product… | OS v4 roster |

---

## Self-heal pipeline (target v4.5.1 — match ScrollFuel)

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (always on)                                        │
│  GlobalErrorHandler + ErrorBoundary + unhandledrejection    │
│  → POST /api/os/bug-report                                  │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (serverless-safe)                                   │
│  1. Telegram: 🚨 JANET — BUG DETECTED                       │
│  2. await runArchitectAgent(bugId)  ← NOT fire-and-forget    │
│  3. Marcus diagnosis (llmComplete + JSON parse + retry)     │
│  4. queueJanetArchitectTask(bug_id linked)                    │
│  5. Telegram: JANET → MARCUS + HIGH BUG diagnosis           │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ WATCHER (Mac launchd ~10min)                                │
│  GET /api/os/architect/pending?secret=ps-hq-2026            │
│  → POST /api/os/architect/code                              │
│  → dev → QA → master → prod                                 │
│  → POST /api/os/architect/complete                          │
│  → Telegram: ✅ MARCUS — DONE                               │
└─────────────────────────────────────────────────────────────┘
```

### Probe results (Jun 30 2026 — v4.5.1 verified)

| Step | Status |
|------|--------|
| Bug detect Telegram | ✅ |
| Marcus queue Telegram | ✅ |
| Marcus diagnosis | ✅ **95% confidence** (prod verify) |
| Frontend auto-report | ✅ GlobalErrorHandler + ErrorBoundary |
| Serverless await Marcus | ✅ |
| Agent heal-fail → Marcus | ✅ |

---

## System health alerts (v4.5.1)

| Source | Alert key | On failure | On resolve |
|--------|-----------|--------------|------------|
| bug-report | per bug_id | 🚨 BUG DETECTED | ✅ MARCUS DONE |
| Janet HQ chat LLM | `janet_hq_chat` | 🚨 SYSTEM ISSUE | ✅ RESOLVED |
| Agent watchdog heal | `agent_{id}` | 🚨 HEAL FAILED + Marcus task | ✅ HEALED |
| Cron QA smoke | `qa_smoke` | 🚨 QA failed | ✅ RESOLVED |
| Heartbeat / watchdog | outreach metrics | 🚨 WATCHDOG | ✅ RESOLVED |

Implementation: `server/os/selfHeal.ts` — `openSystemAlert` / `resolveSystemAlert` (port from ScrollFuel)

---

## PhishSim stack

| Layer | Path |
|-------|------|
| Frontend | Vite + React `client/src/` |
| Backend | Express + tRPC `server/` |
| OS layer | `server/os/` |
| Vercel entry | `api/handler.ts` → lazy Mia + OS routes |
| OS DB | Neon Postgres (`janet_memory`, `bug_reports`, `os_architect_tasks`) |
| App DB | TiDB/MySQL (orgs, campaigns) |
| HQ secret | `ps-hq-2026` |

---

## HQ endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/os/hq?secret=ps-hq-2026` | Pipeline, bugs, architect tasks |
| `POST /api/os/hq/chat` | Janet chat |
| `POST /api/os/bug-report` | Client + probe error intake |
| `GET /api/os/architect/pending?secret=ps-hq-2026` | Watcher pickup |
| `POST /api/os/architect/complete` | Watcher done |
| `GET /api/os/agent-watchdog?secret=ps-hq-2026&action=status` | Agent health |

---

## Rollout to other products (Kaan AI OS platform)

When porting v4.5.1 to a new product:

1. Copy `lib/os/` self-heal stack (or `server/os/` equivalent)
2. Copy `errorTelemetry.ts` + `GlobalErrorHandler` (adapt framework: Next vs Vite)
3. Wire `bug-report` with **await** `runArchitectAgent`
4. Set `company_id` in memory + `HQ_SECRET` + Telegram
5. Add `/heal-test?arm={secret}` probe page
6. Run E2E probe → expect 3 Telegram messages with **confidence > 0**
7. Document in product `KAAN_AI_OS_V4.5.md`

**ScrollFuel:** canonical — no port needed (already v4.5 proven)  
**PhishSimAI:** v4.5.1 spec active  
**Next products:** use this checklist

---

## Watcher setup (PhishSim)

- Repo: `/Users/kaan/phishsimai`
- API: `https://phishsimai.com/api/os/architect`
- Secret: `ps-hq-2026`
- Script: adapt `ugc-agency/scripts/qwen_watcher.py` or Groq watcher

---

## Mia (customer success — PhishSim v4.5 add-on)

In-app trial guide — separate from self-heal but feeds feedback:

- Widget: `client/src/components/MiaWidget.tsx`
- API: `/api/mia/chat`, `/api/mia/activation`
- Feedback → `product_feedback` → Telegram + Janet memory

Future: Mia chat failures should call `reportBug()` (v4.5.2).
