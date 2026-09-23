# SPEC — PS-TELEGRAM-NOISE-01 (silence reclaimable Telegram flood)

## Problem
Founder Telegram flooded by reclaimable / recurring pages:
- Agent LLM / Ollama `payment-failed` (finn, vera, dex, janet, marcus every standup)
- Hourly `PHISHSIMAI ARIA SEQUENCE` digests
- `escalation-notify` */15 delivering per-agent `agent_critical`
- `founder-brief` + `daily-report` both at 21:00 UTC
- Routine `PHISHSIMAI TASK` status spam
- Grey Box paid nudge double-Telegram (specific + batch)

## Rules (owner)
- No homework Telegrams for reclaimable issues
- Founder only hard failures / money
- Briefs stay on Telegram but must not flood
- Caps unchanged; no blast; no touch 93

## Fix
1. `telegramNoisePolicy.ts` — classify LLM billing, task status, digest/day, daily-report dedupe
2. `agentHealth_v2` — coalesce billing to one `llm_provider_billing` money alert
3. `shouldPageFounderForEscalation` — suppress billing `agent_critical`
4. Sequence digest ≤1 / UTC day
5. Task Telegram only on failure statuses
6. Skip daily-report Telegram when founder brief already exists for the UTC day
7. Grey Box win Telegrams once via trial-nudges batch

## Keep
Bounce breaker, verifier empty, T1 starve, breaker_trip, coalesced LLM billing (money), founder brief once/day, real wins.
