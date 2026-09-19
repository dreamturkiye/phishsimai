# SPEC — Suppress Dex-cap / reclaimable send-cron and send-zero founder pages

**Date:** 2026-09-19  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Bug:** PS-SEND-HEALTH-DEX-FALSE-POSITIVE-01  
**Facts:** #342 already self-heals watchdog send-stuck / research-stuck. Leftover: `cronOutreachFunnel` (08:30) still Telegrams `SEND FAILED` / `SEND BROKEN` and tells the founder to hit `/api/os/sequence`. Those are homework pages. They fire on a missed/stale Aria heartbeat and on `sent 0` with sendable leftover — both of which are usually a Dex daily throttle or a reclaimable hourly drip, not a broken send path. No Dex raise. No blast. No touch 93.

## Live leftover

| Shape | Old funnel action | Truth |
|---|---|---|
| send-cron | `🚨 SEND CRON DID NOT RUN` + `Check /api/os/sequence` | Sequence is hourly (`0 * * * *`). Fresh Aria = already queued. Stale Aria = invoke `runFullSequence()` (Dex-capped). |
| send-zero | `🚨 SEND BROKEN` + `Check /api/os/sequence` | `sent 0` + sendable leftover is often `combined_daily_cap` / `new_touch_daily_cap` (O.32.17). Throttle ≠ broken. |
| verifier-empty | keep | Empty MEV+QEV is a real promote-0 fault. |
| real T1 starve | keep | sanitized sendable=0 while GEO unsanitized reservoir >100. |
| bounce-breaker | keep (watchdog + this classifier) | Measured trip still pages. Do not relabel it SEND BROKEN. |
| founder 1:1 | keep (`founderOneToOne.ts`) | Exhausted 90/91/92 human replies. Not this change. |

## Rule

`server/os/agents/mspHubHarvest.ts` `cronOutreachFunnel` send-health block:

1. **Do not Telegram the founder to hit `/api/os/sequence`.** Reclaimable send-cron / send-zero is a drain job, not homework.
2. **Classify before paging:**
   - **bounce breaker tripped + sent 0:** legitimate page. Not Dex. Not cron homework.
   - **sentToday > 0:** healthy (below-cap warning stays on the digest line only).
   - **mailbox verifier empty:** legitimate page (`verifierEmptyAlertMessage`). Do not invoke sequence.
   - **real T1 starve** (sent 0, sendable leftover 0, verifiable backlog >100): legitimate page. Check refill, not sequence.
   - **Dex daily throttle** (`combined_daily_cap` / `new_touch_daily_cap`): no page, no invoke. Wait UTC reset.
   - **send-cron / send-zero reclaimable** (sent 0 and either Aria did not run today or sendable leftover >0):
     - Aria last success stale (>90m) or last run failed → invoke `runFullSequence()` once (same Dex-capped path as `/api/os/sequence`). No founder page.
     - Aria last success fresh → defer (already on the hourly drip). Do **not** stack a second slice at 08:30 (blast shape).
   - **pool empty, backlog ≤100:** expected supply. No page.
3. **Two-day under-cap "SUPPLY DRAINING"** is suppressed when the under-cap reason is a Dex daily throttle.
4. **Hard bans:** do not raise `DAILY_SEND_LIMIT` / `NEW_TOUCH_DAILY_CAP` / `SECOND_TOUCH_DAILY_CAP` / `COMBINED_DAILY_CAP`. Do not add warm touch 93. Do not add `aria` to `HEALABLE_OPS_AGENTS`. Do not invent a new send path. Do not change founder 1:1.

## Files

| File | Change |
|---|---|
| `server/os/sendHealthPage.ts` | Pure classifier + stale/fresh invoke plan |
| `server/os/sendHealthPage.test.ts` | Decision tests (no live send) |
| `server/os/agents/mspHubHarvest.ts` | Wire funnel to classifier; self-heal stale; no homework Telegram |
| `server/os/telegramNoise.test.ts` | Assert SEND FAILED / SEND BROKEN homework is gone |
| `docs/architect/SPEC-suppress-dex-cap-send-page.md` | This spec |
| `KAAN_AI_OS_V4.5.md` | Alert table + 4.5.11 |
| `docs/KAAN_AI_OS_7.10_Architecture.md` | O.32.22 |

## Tests

- sentToday > 0 → no page, no invoke
- send-cron + fresh Aria → defer, no Telegram, no `runFullSequence`
- send-cron + stale Aria → invoke sequence; no Telegram
- send-zero + `combined_daily_cap` / `new_touch_daily_cap` → no page, no invoke
- send-zero + sendable leftover, not throttle, stale → invoke, no Telegram
- verifier empty → page, message does not say `Check /api/os/sequence`
- real T1 starve → page sanitize-refill
- bounce breaker → page, not SEND BROKEN
- source: funnel no longer contains `SEND FAILED` / `SEND BROKEN` / `Check /api/os/sequence`
- founder 1:1 file still pages `FOUNDER 1:1`
- `DAILY_SEND_LIMIT` still 20; caps 50/50/100; no touch 93
