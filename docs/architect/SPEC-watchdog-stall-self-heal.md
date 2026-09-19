# SPEC — Watchdog stall self-heal (no founder page for reclaimable stalls)

**Date:** 2026-09-19  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Bug:** PS-WATCHDOG-STALL-HEAL-01  
**Facts:** founder Telegram `PHISHSIMAI WATCHDOG: 112 leads genuinely stalled >2d — send-stuck 104 (→ /api/os/sequence), research-stuck 8 (→ /api/os/researcher)`. That is a homework page. The system already has Dex-capped `/api/os/sequence` (hourly) and `/api/os/researcher` (every 30m). No Dex raise. No blast. No touch 93.

## Live facts

| Measure | Value |
|---|---|
| Genuinely stalled >2d | 112 |
| send-stuck (sanitized, no T1, US/GB/AU, not unsub/bounce/dead/customer) | 104 |
| research-stuck (hung `researching` or `pending` attempts≥3, non-terminal) | 8 |
| Watchdog action before this spec | Telegram founder; do not invoke sequence/researcher |
| Sequence cron | `0 * * * *` `/api/os/sequence` → `runFullSequence()` (hourly drip + 50/50/100 Dex caps) |
| Researcher cron | `*/30 * * * *` `/api/os/researcher` → `runLeadResearcher(12)` |

## Rule

`server/os/watchdog.ts` stall block (`stalledN > 20`):

1. **Do not Telegram the founder on first detection.** Reclaimable send-stuck / research-stuck is a drain job, not a page.
2. **Self-heal, then maybe page:**
   - **send-stuck > 0:** if Aria/`runFullSequence` last success is stale (>90m, i.e. a missed hourly cron) or last run failed → invoke `runFullSequence()` (same path as `/api/os/sequence`). If last success is fresh → treat as already queued on the hourly Dex-capped drip. Do **not** double-fire the `:00` sequence cron (that would stack two hourly slices = a blast shape).
   - **research-stuck > 0:** mark reclaim — hung `researching` >2d → `pending`; `pending` with `attempts >= 3` → `unenrichable` (terminal, matches researcher retirement). Then invoke `runLeadResearcher(4)` so reclaimed rows are picked now.
3. **Page only on 2nd+ consecutive heal failure** (`consecutive_failures >= 2` on `agent_health.agent_name='watchdog_stall_heal'`). First failure is silent (actions_taken only). Success resets the counter.
4. **Heal success** = invocations that were required completed without throw. `runFullSequence` returning `{paused:true, sent:0}` (bounce breaker / not measured / Dex / T1 pause) is success of the existing rails, not a heal failure. Remaining stall count after a capped drip is **not** a failure.
5. **Hard bans:** do not raise `DAILY_SEND_LIMIT` / `NEW_TOUCH_DAILY_CAP` / `SECOND_TOUCH_DAILY_CAP` / `COMBINED_DAILY_CAP`. Do not add warm touch 93. Do not add `aria` to `HEALABLE_OPS_AGENTS` (stale-aria restart is still banned). Do not invent a new send path.

## Files

| File | Change |
|---|---|
| `server/os/stallReclaim.ts` | Census helpers, reclaim SQL, invoke plan, consecutive-fail page gate |
| `server/os/stallReclaim.test.ts` | Decision + heal-tick tests (no live send) |
| `server/os/watchdog.ts` | Replace founder Telegram with `healLeadStalls` |
| `server/os/telegramNoise.test.ts` | Assert old homework Telegram is gone |
| `docs/architect/SPEC-watchdog-stall-self-heal.md` | This spec |
| `KAAN_AI_OS_V4.5.md` | Alert table: stall is self-heal, page on 2nd+ fail |
| `docs/KAAN_AI_OS_7.10_Architecture.md` | O.32.21 |

## Tests

- `stalledN <= 20` → no invoke, no Telegram
- send-stuck, sequence last success fresh → no `runFullSequence`, no Telegram, action says queued on drip
- send-stuck, sequence stale → invoke sequence; success → no Telegram
- first heal throw → `consecutive_failures=1`, no Telegram
- second consecutive heal throw → Telegram contains `stall self-heal failed` and does **not** tell founder to hit `/api/os/sequence`
- research-stuck → reclaim SQL + `runLeadResearcher`
- `DAILY_SEND_LIMIT` still 20; caps 50/50/100; no touch 93; `HEALABLE_OPS_AGENTS` still `researcher`+`discover` only
