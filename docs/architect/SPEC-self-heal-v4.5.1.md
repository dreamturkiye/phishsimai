# Architect Spec — Kaan AI OS v4.5.1 Self-Heal Parity (PhishSimAI)

**Author:** Kaan (Founder/GM/PM/Architect)  
**Implementer:** `ollama run codegeex4:9b` — **Architect does NOT write code**  
**Reference:** ScrollFuel canonical (`/Users/kaan/ugc-agency/KAAN_AI_OS_V4.5.md`)  
**Repo:** `/Users/kaan/phishsimai`  
**Date:** 2026-06-30  

---

## Probe evidence (Telegram — Jun 30 7:36 PM)

Three messages received from `SELF_HEAL_PROBE` test:

| # | Message | Status |
|---|---------|--------|
| 1 | `🚨 JANET — BUG DETECTED` Page `/test` | ✅ Works |
| 2 | `JANET → MARCUS` task queued | ✅ Works |
| 3 | `HIGH BUG` — **Diagnosis failed**, File unknown, **Confidence 0%** | ❌ Broken |

**Gap:** Intake + Telegram + queue work. **Marcus diagnosis + linked fix pipeline do not.**

Additional prod gaps found:
- 4 high bugs in DB with `status: null` (never diagnosed)
- `runArchitectAgent` fired via fire-and-forget on Vercel — often never runs
- Frontend **no** error telemetry (`ErrorBoundary` does not call `/api/os/bug-report`)
- Agent watchdog heal-fail → Telegram only, **no Marcus task**
- Janet HQ chat LLM errors → user text only, **no alert**

---

## Goal

Bring PhishSimAI to **ScrollFuel v4.5 self-heal parity**:

```
Frontend error → POST /api/os/bug-report
  → await runArchitectAgent (NOT fire-and-forget)
  → Marcus diagnosis (confidence > 0, valid JSON)
  → queueJanetArchitectTask(bug_id linked)
  → Mac watcher → architect/code → dev → QA → prod
  → architect/complete → Telegram ✅ MARCUS DONE
```

---

## Implementation tasks (codegeex4)

### P0 — Backend: fix bug-report + Marcus diagnosis

**File:** `server/os/routes.ts` — function `bugReport`

Replace:
```typescript
import('./architectAgent').then(({ runArchitectAgent }) => {
  runArchitectAgent(...).catch(console.error)
})
```

With ScrollFuel pattern (`ugc-agency/app/api/os/bug-report/route.ts`):
```typescript
const diagnosis = await runArchitectAgent(bugId).catch(e => ({ diagnosed: false, error: e.message }))
return res.json({ ok: true, bug_id: bugId, severity, diagnosis })
```

Also:
- Set `status: 'open'` on INSERT (not null)
- On duplicate within 1h: return early **without** re-diagnose (already correct)
- Telegram message 1: keep existing `🚨 JANET — BUG DETECTED`

**File:** `server/os/architectAgent.ts` — function `diagnose`

Port from ScrollFuel `lib/os/architectAgent.ts`:
- Add `buildMarcusDiagnosisPrompt()` to `server/os/marcus.ts` (copy from SF `lib/os/marcus.ts`)
- Use `llmComplete()` with `temperature: 0.1`, `max_tokens: 400`
- Parse JSON robustly: strip markdown fences, regex extract `{...}`, retry once on parse fail
- On total failure: set `confidence: 0.3`, `root_cause: 'LLM diagnosis unavailable'`, still queue task with stack trace in task body
- **Always** `UPDATE bug_reports SET status='diagnosed'` after attempt
- Use `buildMarcusTaskFromBug` including stack trace snippet when confidence low

**File:** `server/os/marcus.ts`

Add from ScrollFuel:
- `buildMarcusDiagnosisPrompt(bug)` 
- Expand `buildMarcusTaskFromBug` to include `url_path`, `stack_trace` slice

---

### P0 — Frontend: error telemetry (port ScrollFuel)

**New file:** `client/src/lib/errorTelemetry.ts`

Port from `ugc-agency/lib/os/errorTelemetry.ts`:
- Change session key to `ps_session_id`
- `reportBug(error, componentName, userAction)` → `POST /api/os/bug-report`
- `scoreSeverity()` — add PhishSim components: `Dashboard`, `Campaigns`, `Targets`, `MiaWidget`
- No Sentry required in v4.5.1 (optional if `VITE_SENTRY_DSN` set later)
- `installGlobalErrorHandlers()` for `window.error` + `unhandledrejection`

**New file:** `client/src/components/GlobalErrorHandler.tsx`

Port from ScrollFuel — calls `installGlobalErrorHandlers()` on mount.

**File:** `client/src/App.tsx`

Mount `<GlobalErrorHandler />` inside providers (before Router).

**File:** `client/src/components/ErrorBoundary.tsx`

In `componentDidCatch(error, info)`:
```typescript
import { reportBug } from '@/lib/errorTelemetry'
reportBug(error, 'ErrorBoundary', info.componentStack?.slice(0, 200) || 'render')
```

Do NOT remove existing reload UI.

---

### P1 — System alerts (Janet open/resolve)

**File:** `server/os/selfHeal.ts`

Port from ScrollFuel `lib/os/selfHeal.ts`:
- `openSystemAlert(key, detail)` — uses `janet_memory` key `system_alert:{key}`, Telegram once
- `resolveSystemAlert(key, detail)` — delete key, Telegram ✅ RESOLVED
- Export `isAlertOpen` (already exists)

**File:** `server/os/janet.ts` — `janetChat` catch block

On LLM failure:
```typescript
await openSystemAlert('janet_hq_chat', err).catch(() => {})
await sendTelegram(`🚨 JANET HQ CHAT DOWN\n${err}`)
```

**File:** `server/os/agentWatchdog.ts`

When `healResult.ok === false`:
```typescript
await queueJanetArchitectTask({
  task: `Agent ${agent.name} heal failed: ${healResult.error}. Investigate LLM chain and agent health.`,
  notes: `agent_id=${targetId}`,
})
```

---

### P1 — Self-heal test probe (E2E)

**New file:** `client/src/pages/HealTest.tsx`  
**New route:** `/heal-test` in `App.tsx`

Port pattern from ScrollFuel `SelfHealTestProbe`:
- Query param `?arm=ps-hq-2026` arms one-time bug report
- Component name: `SelfHealTestProbe`
- Error message: `SELF_HEAL_TEST v4.5.1: intentional probe`
- Does not white-screen after fix

---

### P2 — HQ data fixes

**File:** `server/os/routes.ts` — `hqData`

Ensure architect tasks return `bug_id`, `status`, `notes` in SELECT.

Ensure bug_reports show `status` not null for new rows.

---

## Files to READ (ScrollFuel reference — copy patterns, adapt paths)

| ScrollFuel | PhishSim target |
|------------|-----------------|
| `lib/os/errorTelemetry.ts` | `client/src/lib/errorTelemetry.ts` |
| `components/GlobalErrorHandler.tsx` | `client/src/components/GlobalErrorHandler.tsx` |
| `app/api/os/bug-report/route.ts` | `server/os/routes.ts` `bugReport` |
| `lib/os/architectAgent.ts` | `server/os/architectAgent.ts` |
| `lib/os/marcus.ts` | `server/os/marcus.ts` |
| `lib/os/selfHeal.ts` | `server/os/selfHeal.ts` |

---

## Verification checklist (Architect runs after codegeex4)

```bash
cd /Users/kaan/phishsimai
pnpm build
pnpm test   # if tests exist for os/
pnpm dev    # local server

# 1. Probe bug-report API (local)
curl -X POST http://localhost:3000/api/os/bug-report \
  -H 'Content-Type: application/json' \
  -d '{"error_message":"SELF_HEAL_TEST local v4.5.1","component_name":"SelfHealTestProbe","url_path":"/heal-test","severity":"high","stack_trace":"test"}'

# Expect: diagnosis.confidence > 0 OR meaningful root_cause (not "Diagnosis failed")
# Expect: architect task with bug_id linked in HQ

# 2. Frontend (manual): trigger ErrorBoundary or visit /heal-test?arm=ps-hq-2026

# 3. HQ check
curl 'http://localhost:3000/api/os/hq?secret=ps-hq-2026' | jq '.bugReports[0], .archTasks[0]'

# 4. Only after local pass:
vercel deploy --prod --yes
curl -X POST https://phishsimai.com/api/os/bug-report ...
```

**Production pass criteria:**
- Telegram 3 messages with **confidence > 0** OR explicit stack-based task (not "Diagnosis failed" / "unknown")
- `bug_reports.status = 'diagnosed'`
- `os_architect_tasks.bug_id` populated
- Existing dashboard icon bugs get new tasks after deploy + manual re-report OR backfill script

---

## Do NOT

- Change unrelated Mia/Janet/HQ features
- Remove existing Telegram messages format (founder expects these 3 message types)
- Force-push main
- Architect (Cursor agent) writing code directly — **codegeex4 only**

---

## Version

Bump `server/os/version.ts`: `KAAN_OS_VERSION = '4.5.1'`  
Seed `janet_memory` key `os_version` on deploy.
