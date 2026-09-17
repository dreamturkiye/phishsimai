# SPEC — Do not pause T1 on a small quality refill

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live after #320 merge. No touch 93. Do not raise `DAILY_SEND_LIMIT`.

## Live facts

| Measure | Value |
|---|---|
| qev_valid / sanitized sendable | ~40 |
| drainableOverdue | ≈1100 |
| operatingCrisis | true |
| pauseNewTouch1 | true |
| dailyAllowance | 0 |
| T1 sent | 0 |

#320 only skipped pause when `t1Starved` (`sanitizedEligible=0`). A small mailbox-verified refill still hit the crisis drain pause and zeroed T1.

## Rule

`shouldPauseTouch1` / `loadTouch1HealthForPause` / `runFullSequence`:

1. Keep: never pause when `t1Starved` (eligible=0).
2. **New:** if sanitized untouched eligible is **>0 and ≤150**, do **not** pause T1 (return false). That is a quality refill, not mass TOF scale.
3. Hourly drip (`HOURLY_SLICE` = ceil(dailySendCap/24)) still binds when pause is false. Do not raise `DAILY_SEND_LIMIT`. Do not add warm touch 93.

Pause remains for crisis + drainable≥50 when the sanitized untouched pool is **>150**.

## Tests

- `shouldPauseTouch1(1100, true, { t1Starved: false, sanitizedEligible: 40 })` → false
- `sanitizedEligible: 150` → false; `151` → true
- `t1Starved: true` still false
- mass pool (`400`) + crisis + overdue still pauses
- `DAILY_SEND_LIMIT` unchanged; no touch 93
