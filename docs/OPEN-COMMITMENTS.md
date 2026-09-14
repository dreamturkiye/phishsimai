# OPEN COMMITMENTS — PhishSim AI

**Why this file exists.** Things agreed in a working session and deferred to "next time" were
getting lost, and resurfacing weeks later as "why was this never done?". Chat history is not a
tracking system: it scrolls, it compacts, and the next session starts from a summary. Anything
deferred goes HERE, in the repo, with a date and an owner — or it does not count as agreed.

**Rules.**
- Add the item the moment it is deferred, not later. If it is worth saying "we'll do it next
  session", it is worth one line here.
- Every item names WHO it is waiting on: `founder` (needs Kaan's decision) or `operator`
  (engineering work, no decision needed).
- Remove an item only when it is DONE and verified, or explicitly killed — and say which.
- Age is the point. An item sitting here for weeks is either not real or is being avoided; both
  are useful signals.

Last reviewed: 2026-09-14

---

## Waiting on the founder (decisions, not work)

| Since | Item | Note |
|---|---|---|
| 2026-08-14 | **Escalation #40** — Aria's replacement email variants | Recommendation: REJECT. Live copy already leads with price, 10-min setup, set-and-forget, and its prices are Stripe-verified |
| 2026-08-24 | **Posture fairness rule** — should a day spoiled by an OPERATOR action count against the product's clean-day streak? | The 2026-08-19 breakers came from an operator test task targeting a protected path. Needs a decision before it is coded |
| 2026-08-24 | **Raise RAMP_MAX 50 → 100/day?** | `PS-RAMP-HOLD-01` requires evidence that enrichment keeps pace for ~3 consecutive days. Not measured yet |
| 2026-09-08 | **`server/outreach/*` is a second, fully-built lead-gen/outreach stack (Apollo discovery + LinkedIn-via-Telegram queue) that has never run** — wire it up or delete it | None of its three routes is in any `vercel.json` cron; its table (`outreach_leads`, created via MySQL-syntax DDL) is a different, unverifiable table from the sanctioned `ps_outreach_leads`. See `docs/ALTERNATIVE_CHANNELS_INVESTIGATION.md` Finding 1. Do **not** cron it on without a founder decision. |

## Operator work (no decision needed — just not done yet)

| Since | Item | Note |
|---|---|---|
| 2026-08-24 | **Follow-up ladder has no touch 2 in the generic loop** | Correct today: touch 2 has its own batch path (`runTouch2Batch`). Post-cutoff T1 ≥5d now get approved T3 copy on that same path (O.32.11). Do not fold T2-price copy into the generic loop. |

## Closed this review (2026-09-14)

| Since | Item | Closed how |
|---|---|---|
| 2026-08-24 | Merge PR #272 — hourly drip, separate follow-up budget, touches 3+4 live | DONE — merged. Ledger was stale. |
| 2026-09-03 | Subject-line bandit on opens that can never fire | DONE — PR #311 switches the bandit to `outcomeEvent:'replied'` (plain-text doctrine; open pixel never applied). |
| 2026-08-14 | Marcus remote `/architect/code` 401 every run | DONE — PhishSim `/code` now accepts the Mac watcher's HQ `x-os-secret` (7.10 §0 / O.20). Canonical daemon remains `/Users/kaan/HQ/marcus_watcher.py`; this repo cannot restart launchd. |
| 2026-08-19 | Daily Marcus health false alarm (stale ~4h overnight) | DONE — 7.10-aligned: GitHub Actions `marcus.yml` overnight skip is NOT Mac Marcus down. Heartbeat no longer pokes a cloud duplicate and no longer pages on stale. Pages only if 4/5 Actions runs failed (jam). Founder brief renders `watcher_heartbeat` age (O.3, 30m). |
| 2026-08-24 | Signup canary never `{ok:true}`; org/trial missing from register JSON | DONE — register returns `{ ok:true, success:true, user, trial }`. QA smoke POSTs `/api/auth/register` `{}` and expects 400 (route live). |
| 2026-08-19 | Signup/login DB outage returns generic 500 | DONE — `isDatabaseUnavailable` → HTTP 503. `oauth.ts` is Marcus-protected; delivered by this operator pass. |
| 2026-08-14 | `mobileOptimizedTemplates.ts` — 439 lines, zero callers | DONE — wired: Janet D0 welcome uses `trialStartedEmail`. Cold outreach stays plaintext. |
| 2026-08-19 | Escalation auto-resolve never visible (`cronFounderBrief` swallowed triage) | DONE — triage result or error is included in the founder-brief JSON. Failures are no longer silent. |

---

*Sister file: `docs/OPEN-COMMITMENTS.md` in dreamturkiye/ugc-agency for ScrollFuel and the
Defne/fanagent work.*
