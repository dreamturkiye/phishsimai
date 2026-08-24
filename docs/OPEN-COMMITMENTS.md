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

Last reviewed: 2026-08-24

---

## Waiting on the founder (decisions, not work)

| Since | Item | Note |
|---|---|---|
| 2026-08-24 | **Merge PR #272** — hourly drip, separate follow-up budget, touches 3+4 live | Built and pushed; merging starts real sends within the hour |
| 2026-08-14 | **Escalation #40** — Aria's replacement email variants | Recommendation: REJECT. Live copy already leads with price, 10-min setup, set-and-forget, and its prices are Stripe-verified |
| 2026-08-24 | **Posture fairness rule** — should a day spoiled by an OPERATOR action count against the product's clean-day streak? | The 2026-08-19 breakers came from an operator test task targeting a protected path. Needs a decision before it is coded |
| 2026-08-24 | **Raise RAMP_MAX 50 → 100/day?** | `PS-RAMP-HOLD-01` requires evidence that enrichment keeps pace for ~3 consecutive days. Not measured yet |

## Operator work (no decision needed — just not done yet)

| Since | Item | Note |
|---|---|---|
| 2026-08-19 | **Escalation auto-resolve has never run** (`auto_stale = 0`) | Code is in main and correct; `routes.ts` swallows triage errors in a `.catch`, so the failure is invisible. Root cause NOT found |
| 2026-08-14 | **Marcus remote `/architect/code` returns 401 on every run** | The Grok fallback does 100% of codegen. A permanently failing primary path masks the next problem |
| 2026-08-24 | **Signup canary: confirm live + extend to org creation** | Deployed but never observed returning `{ok:true}`. Registration is covered; the org/trial step is NOT |
| 2026-08-19 | **Signup 503 honesty fix** | A DB outage returns a generic 500 "Registration failed". Must be delivered by hand: `server/_core/oauth.ts` is a protected path and Marcus is correctly refused |
| 2026-08-14 | **`server/email/mobileOptimizedTemplates.ts` — 439 lines, zero callers** | Shipped to production as dead code. Wire it or delete it |
| 2026-08-24 | **Follow-up ladder has no touch 2 in the generic loop** | Correct today (touch 2 has its own batch path), but the split is a trap for the next person. Consolidate once touch-2 batch 1 is evaluated |

---

*Sister file: `docs/OPEN-COMMITMENTS.md` in dreamturkiye/ugc-agency for ScrollFuel and the
Defne/fanagent work.*
