# SPEC — PS-TELEGRAM-GATE-01 / PS-TELEGRAM-NOISE-01

## Owner decision (2026-09-23)
Silence **almost all** Telegram status spam.
Allowlist ONLY: `hard_failure` | `founder_brief`.

## Choke point
`sendTelegram` → `gateTelegram(text, kind?)`. Status / wins / digests / task flips / nudges are skipped at the source.

## Keep
- Hard failures: bounce breaker, T1 starve, verifier empty, breaker_trip, bug-fix-failed, HQ chat down, FOUNDER DECISION PENDING, LLM/provider billing (money)
- One daily founder brief (`founder_brief` kind)

## Silenced
ARIA SEQUENCE digests, daily-report, TASK status, trial nudges, Grey Box win lines, standup/morning spam, Janet restart OK, warm CTA digests, sales-reply chatter, employee_stale homework (billing coalesced separately).

## Rails
Caps unchanged. No blast. No touch 93.
