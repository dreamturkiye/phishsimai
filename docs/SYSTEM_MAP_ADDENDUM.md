# PhishSimAI System Map — Addendum

**Companion to `docs/FULL_SYSTEM_MAP.md`.** That file is the base architecture map (generated 2026-08-10). This addendum adds verified corrections from a same-day session and summarizes the planned (not yet built) Kaan AI OS 7.4 governance layer. Read both together.

---

## 7. Verified corrections and fixes (2026-08-10 session)

This section documents what was independently traced and verified in a Claude session on 2026-08-10, cross-checked against the base map. Treat this as a correction/supplement, not a replacement.

### Corrected gate order in `sequences.ts` / `runFullSequence()`

The base map lists "Safety Net: `circuitBreaker.ts`, `dexBreaker.ts`, `marcusBreaker.ts`" without ordering. The actual, verified execution order inside `runFullSequence()` as of tonight:

1. Bounce breaker trip check (`dexBreaker.ts` / `getSequenceHealth()`) — absolute stop, not skippable by anything
2. `founderRamp` flag read (`janet_memory` key `outreach_ramp_enabled`) — single decision point
3. If `!founderRamp`: bounce-measurement fail-closed check, then earned-autonomy check (`autonomyGate.ts`) — both skippable when founderRamp is on
4. Daily cap (`outreachThrottle.ts`: `NEW_TOUCH_DAILY_CAP=50`, `SECOND_TOUCH_DAILY_CAP=50`, `COMBINED_DAILY_CAP=100`) — absolute, not skippable
5. Geo allowlist (`SEND_ALLOWED_COUNTRIES` = US/GB/AU, CA excluded by founder decision) — absolute, fail-closed on NULL country
6. MX validity (`hasMx()`) — absolute
7. Consent/suppression (`assertSendable()`) — absolute, checked per-address on every touch

**The one thing worth remembering:** `founderRamp` only ever bypasses steps 3a/3b. Steps 1, 4, 5, 6, 7 apply unconditionally, founder mode or not.

### Removed: `OUTBOUND_HARD_PAUSED`

This constant (and its guard clause) was removed from `sequences.ts` on 2026-08-10 (PR #153). It was a hard-pause flag from PS-INCIDENT-01 (2026-07-15, fabricated-lead incident), already closed with founder sign-off on 2026-07-16. It had been dead weight — set to `false`, checked first, adding a step to trace for an incident resolved three weeks earlier. If you see references to it in older docs or comments, it no longer exists in code.

### Fixed same session

- `HQ_SECRET` rotated + redeployed — fixed the HQ chat "Unauthorized" bug (client caches the secret in localStorage from a `?key=` URL param; the old cached value predated a rotation)
- `MYEMAILVERIFIER_API_KEY` updated — fixed the enrichment-to-verification bottleneck (was returning "balance check failed," capping verified-valid leads near zero regardless of harvest volume)

### Resolved: the "sent: 0" investigation

Repeated `sent: 0` results from `/api/os/sequence` on 2026-08-10 were not a bug. `new_today` had already hit `NEW_TOUCH_DAILY_CAP` (50/50) for the day (3 sent at 07:00 UTC via the scheduled cron, 47 sent at 15:00 UTC from same-day work), so `cap = min(dailySendCap, newTouchAllowance) = 0` and the send loop correctly never ran. Recommended fix, not yet made: log `{cap, alreadySentToday, remaining}` at the top of `runFullSequence()` so this is visible in one line instead of requiring a full gate trace.

---

## 8. Kaan AI OS 7.4 — Governance & Self-Audit layer (planned, not yet built)

**Source:** `Kaan_AI_OS_7.4_Architecture_Spec.md`, dated 2026-07-29. **Status: architecture spec only — nothing in this section is implemented in the codebase yet.** Do not assume any GSA behavior described below is live.

### What it is

7.4 = 7.3 (unchanged) + a new additive Governance & Self-Audit (GSA) layer. The problem it targets: agents optimize *within* the system but don't audit *whether the system is built correctly* — so architecturally-wrong-but-running conditions (single-touch outreach, fabricated MRR, unwired reply capture) pass silently because nothing throws an error. GSA is a scheduled engine that checks each company's live state against a standards checklist and reports deviations without depending on an agent noticing.

### Three components (all OS-level, all planned)

1. **GSA-ENGINE** — scheduled runner (weekly default, daily for critical checks). Loads a company's standards (universal + plugin), runs each against the live machine, emits `PASS` / `DEVIATION` / `UNVERIFIABLE` with evidence attached to every result. Produces one digest per company per run.
2. **STANDARDS** — universal checks (OS core, apply to every company) + per-company plugins. Universal ones seeded from real incidents: `GTM-MULTITOUCH`, `GTM-REPLY-CAPTURE`, `METRICS-EXTERNAL`, `REVENUE-REAL`, `PIPELINE-REAL`, `NO-FABRICATION`, `DEPLOY-LIVE`, `CACHE-FRESH`.
3. **MARCUS-XLEARN** — a lesson resolved at one company gets proposed as a standard for the others (universal) or stays local as reference (company-specific).

### The remediation tier system — the core safety mechanism

Every `DEVIATION` is classified by reversibility and blast radius into one of two tiers:

- **Tier A (autonomous):** reversible, bounded, non-destructive, non-financial. The engine fixes it and reports after. Examples: enabling a config flag, correcting an exclusion list, tagging metrics internal-vs-external.
- **Tier B (propose + approve, never autonomous):** irreversible, destructive, or money-touching. The engine prepares the exact fix and shows it in the digest, but executes only on explicit approval. Covers, without exception: any destructive DB write, any payment/pricing/billing change, any schema migration, any auth/security gate change, anything unclassifiable (unknown defaults to Tier B, fail-safe).

This is a cleaner, generalized version of the same reversibility/blast-radius reasoning already used tonight for the `founderRamp` decision in `sequences.ts` (section 7 above) — worth keeping the two consistent if GSA is ever built.

### Build sequence (as specified, not started)

1. GSA-ENGINE (read-only, no remediation)
2. Universal STANDARDS core
3. PhishSim plugin first — acceptance test: would GSA have caught `touchDefs=[]`, unwired reply capture, and the inflated org count, without a human prompt?
4. Replicate to ScrollFuel, VellaChat, Notya
5. MARCUS-XLEARN once 2+ companies run GSA

**Explicitly out of scope for GSA:** it does not give agents senior judgment or remove the need for Kaan to decide on Tier B items and higher judgment calls. It reduces how often Kaan needs to notice and fix routine reversible drift — it does not replace the founder's judgment on money or irreversible changes.
