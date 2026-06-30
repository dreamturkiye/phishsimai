# Kaan AI OS v4.5 — PhishSimAI Edition
**phishsimai.com | June 28, 2026 | Dream Türkiye**

Ported from ScrollFuel canonical v4.5 (`/Users/kaan/ugc-agency`).

## What changed in v4.5 (PhishSim)

| Component | Path | Notes |
|---|---|---|
| Self-heal stack | `server/os/selfHeal.ts`, `marcus.ts` | Neon Postgres, `company_id=phishsimai` |
| Architect API | `server/os/architectRoutes.ts` | `/api/os/architect/{pending,code,complete}` |
| HQ dashboard data | `server/os/hq.ts` | Real pipeline, leads, architect tasks, memory |
| HQ chat + ingest | `HQChatComposer.tsx`, `/api/os/hq/ingest` | Multiline chat, CSV/text/image upload → leads |
| Marcus profile | `server/os/agents/kaan_os_v4.ts` | Principal Software Architect |
| Version | `server/os/version.ts`, `janet_memory.os_version` | v4.5 |

## Architecture (PhishSim stack)

- **Frontend:** Vite + React (`client/src/`)
- **Backend:** Express + tRPC (`server/`)
- **Production:** Vercel serverless `api/handler.ts` → `api/index.js`
- **Database:** Neon PostgreSQL (`ps_outreach_leads`, `janet_memory`, `os_architect_tasks`, `bug_reports`)
- **HQ secret:** `ps-hq-2026`
- **Telegram webhook:** `https://phishsimai.com/api/os/webhook/telegram`

## Self-heal pipeline

```
Error → POST /api/os/bug-report
    → Marcus diagnosis (Groq)
    → queueJanetArchitectTask → architect_tasks
    → Mac watcher picks /api/os/architect/pending?secret=ps-hq-2026
    → /api/os/architect/code (Marcus implements)
    → dev → QA → master → prod
    → POST /api/os/architect/complete
    → Telegram MARCUS — DONE + HQ Architect tab
```

## Watcher setup

Point the HQ watcher at PhishSim by setting repo path to `/Users/kaan/phishsimai` and API base to `https://phishsimai.com/api/os/architect`.

## HQ endpoints

| Route | Purpose |
|---|---|
| `GET /api/os/hq?secret=ps-hq-2026` | Pipeline, leads, architect tasks, memory |
| `POST /api/os/hq/chat` | Janet chat |
| `POST /api/os/hq/ingest` | File upload (JSON base64) |
| `GET /api/os/v4/status` | Agent health for HQ |
| `POST /api/os/bug-report` | Client error intake |
| `GET /api/os/architect/pending` | Watcher task pickup |

## Port gate: CLEARED

ScrollFuel v4.5 E2E proven. PhishSim v4.5 code port complete — run prod smoke + self-heal probe after deploy.
