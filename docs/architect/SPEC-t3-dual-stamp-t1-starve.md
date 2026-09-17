# SPEC — T3 dual-stamp must not starve Touch-1

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live week-challenge. Do **not** raise `NEW_TOUCH_DAILY_CAP` / `SECOND_TOUCH_DAILY_CAP` / `COMBINED_DAILY_CAP` (50/50/100). No blast. No touch 93.

## Live facts (prod 2026-09-17)

| Measure | Value |
|---|---|
| `/api/os/sequence` sanitizedEligible | ≈150 |
| pauseNewTouch1 | false |
| T1 sent | 0 |
| t1StarveReason | `t1_eligible_but_not_sent` |
| `/api/os/sequence-touch2` | daily cap reached — ~134/50 second-touch, ~149/100 combined (UTC day) |
| `touch1_sent_at` UTC-day | ≈15 |
| `touch2_sent_at` UTC-day | ≈134 |
| of those T2 stamps with a real outbox `touch=2` sent row | ≈20 |
| of those T2 stamps with `touch2_sent_at == touch3_sent_at` and only a `touch=3` outbox row | ≈114 |

Headroom resets at UTC midnight (8pm ET). Combined 100 still binds. The 114 dual-stamps are the starve.

## Root cause

Skip-T2 / crisis T3 (value re-frame as the second email) dual-stamps `touch2_sent_at` **and** `touch3_sent_at` after sending **only** a T3 outbox row:

- `runFullSequence` follow-up: `def.touch === 3 && !lead.touch2_sent_at`
- `runSequenceDrainTick` same skip-T2 branch

`sentTodayCounts()` counted **every** `touch2_sent_at` on the UTC day as `secondSentToday`. Dex then computed:

```
newTouchAllowance = min(50-15, 100-(15+134), per-run) = 0
```

T1 sat healthy in the sanitized pool and was still starved. `whyT1SentZero` named `t1_eligible_but_not_sent` instead of the throttle.

`runTouch2Batch` T3-as-T2 is different: it claims outbox **touch=2** (and touch=3) then dual-stamps so the T3 loop does not re-send. Those are real second-touch sends and **must** keep consuming the T2/50 + combined/100 Dex budget.

## Rules

1. **Skip-T2 T3** (`runFullSequence` + `runSequenceDrainTick`): stamp **`touch3_sent_at` only**. Do not write `touch2_sent_at` when the outbox row is touch=3.
2. **`touch2Eligible`**: require `touch3_sent_at IS NULL` so a T3-only second email cannot later receive the T2 price pitch.
3. **Backlog T1-no-T2**: `rawUnsentTouch2Over5d` / waiting T2 must ignore leads that already have T3 (not stuck).
4. **`sentTodayCounts().secondSentToday`**: count **real T2 only** — `touch2_sent_at` today AND (`touch3_sent_at` is null OR distinct from T2 OR an `outreach_sequence_outbox` touch=2 `sent` row exists). Dual-stamps with only a T3 outbox must not increment combined.
5. **`runTouch2Batch` T3-as-T2**: keep dual-stamp + outbox touch=2 so Dex T2/50 still binds. Not a blast unlock.
6. **`whyT1SentZero`**: when the sanitized pool is healthy and pause is false, name `combined_daily_cap` if combined remaining is the blocker (else `new_touch_daily_cap` if the T1 50 is spent).
7. Caps stay 50/50/100. No warm touch 93.

## Restore T1 headroom (existing 100 combined)

Live after the count fix (do not wait for UTC reset):

- `newSentToday` ≈ 15
- `secondSentToday` ≈ 20 (real T2 outbox), not 134
- combined ≈ 35/100
- `newTouchAllowance` > 0 → hourly T1 drip resumes under the existing 50 T1 / 100 combined caps

The already-written 114 dual-stamps stay on the lead (historical); they simply stop counting as T2. Future skip-T2 T3 will not write `touch2_sent_at`.

## Tests

- Dual-stamp without T2 outbox does **not** count toward `secondSentToday`; real T2 and `runTouch2Batch` T3-as-T2 (outbox touch=2) **do**.
- Live shape: 15 T1 + 20 real T2 + 114 T3 dual-stamps → `newTouchAllowance` > 0; 15+134 naive count → 0.
- `whyT1SentZero` with sanitized=150, pause=false, combined exhausted → `combined_daily_cap`.
- Skip-T2 T3 SQL in `sequences.ts` stamps T3 only; dual-stamp remains only on `runTouch2Batch`.
- Caps unchanged; no touch 93.
