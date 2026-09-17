# SPEC — Restore cold touch-1 (sanitized pool + QEV) + signup→TRUE trial

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live owner paste 2026-09-17 (two rounds). No invented funnel rates. No fake trials.

## Live facts

| Measure | Value |
|---|---|
| Last T1 | 2026-09-12 07:00Z (dead 5 days) |
| T2/T3 | still ~7–8/hr |
| TRUE trials | 1 |
| Bounce 7d | 28 T1, 0 bounce — breaker NOT tripped |
| T1_READY GEO US/GB/AU never-touched | sanitized=0, unsanitized=6435 |
| Vercel `MYEMAILVERIFIER_API_KEY` | name exists, **value empty (len 0)** on earlier read; live-fire refill later ran MEV |
| Local `.env.local` | `QEV_API_KEY` len 60 — must be on Vercel Production |
| GEO allowlist | US / GB / AU (CA excluded by founder) |

## Live fire (same day, money blocker)

| Measure | Value |
|---|---|
| sanitize-refill | sendableBefore=0, checked=23, promoted=0, reason=`pool exhausted at 0/50 verified-valid (MyEmailVerifier)` |
| Remaining TOF | role_account 3602, catchall 1371, null 1244, unverified_unknown 120 |
| mev_valid ever | 2223 — **all already touch1'd** → sendable=0 |
| sequence | sent=0, `pauseNewTouch1=true`, drainableOverdue=1120 |
| msp-harvest | domainsQueued=0 after walking 1200 listings |

MEV ran. 0 valid. Leftover stock is role/catchall/inconclusive — not a hidden mev_valid pool. `pauseNewTouch1` would still zero T1 even after a refill. Harvest 1200 empty is a cursor desert, not new personal inboxes.

## Root cause (measured)

1. `runFullSequence` T1 SQL requires `sanitized_at IS NOT NULL`. Empty sanitized pool ⇒ `sent: 0` even with 6435 GEO-eligible never-touched leads.
2. `sanitizeRefill` fail-closes unless a mailbox verifier is keyed. Empty-string MEV counts as unset. QEV (`verifierClient.ts` / `QEV_API_KEY`) must be the fallback when MEV is empty, HTTP-fails, throws, or returns unknown.
3. Live fire: MEV checked 23 leftover unlabeled finds and promoted 0. Inconclusive rows (`sanitize_reason` NULL / `unverified_unknown`) with `refill_checked_at` set were stranded out of the candidate query.
4. Finder guard treated any non-org personal as "already sendable", including DISQUALIFIED catchall/role. Researcher retired those domains as `duplicate`. mev_valid stock is already T1'd, so the sendable pool cannot refill from existing leads.
5. `shouldPauseTouch1(crisis && drainableOverdue≥50)` paused new T1 while sendable=0 (drainableOverdue=1120). The pause is for draining follow-ups when T1 is still feeding — with T1 starved it is a lock.
6. Harvest empty-scan cap walked 1200 listings, queued 0, and kept the cursor in that desert.
7. Watchers hid the starve: harvest treated sanitized=0 as “supply, expected”; truth-report sequence liveness uses `GREATEST(touch1..touch4)` so T2/T3 keep the line green.

Bounce breaker did not pause T1. Autonomy/ramp is not the measured blocker.

## A — Restore T1

1. Wire **QEV** (`QEV_API_KEY` → `verifyViaService`) into `sanitizeRefill`. **MEV first when keyed; QEV fallback** when MEV is empty/fails/unknown. Mode `mev_qev` when both keys are set.
2. Treat empty-string MEV as unset. Alert when **both** MEV and QEV are empty. Alert when **sendable sanitized untouched hits 0** after a refill (Telegram + refill JSON).
3. Re-open inconclusive candidates (`sanitize_reason` NULL / `unverified_unknown` / timeout / blank) for QEV even if `refill_checked_at` is set. Do not re-spend on DISQUALIFIED labels.
4. Do **not** turn on `REFILL_ALLOW_MX_ONLY=1`. Optional last-resort: **maps personal MX bridge** — only when mailbox verifier is missing AND sanitized eligible is 0; only `google_maps` / `mymsphub`; skip org inboxes / DISQUALIFIED; MX required; reason `mx_maps_personal_bridge`.
5. Keep a 3× `dailySendCap` sanitized buffer. Run `/api/os/sanitize-refill` hourly (`30 * * * *`).
6. HQ + watchdog field `touch1LastAt`. Alert if T1 silent **>36h** while GEO-eligible never-touched **>100**, OR sanitized eligible **= 0** while that reservoir **>100**.
7. Harvest must not call sanitized=0 “expected” when the unsanitized GEO reservoir is >100. After a 1200-listing parser desert (`domainsQueued=0`, `noDomain=processed`), **wrap the harvest cursor to 0**.
8. Finder skip only **promotable** held addresses (`isPromotableHeldAddress`). Catchall/role do **not** skip. Re-open `lead_research_queue` rows retired as `duplicate` when the domain only holds DISQUALIFIED addresses. Finder budget counts `qev_valid` as well as `mev_valid`.
9. `shouldPauseTouch1` returns **false** when the sanitized untouched pool is starved (`t1Starved`). Drain tick and `runFullSequence` share `loadTouch1HealthForPause`. `whyT1SentZero` names `pause_new_touch1` only when sanitized eligible > 0.

Keep Dex / geo / CAN-SPAM / hourly drip / `DAILY_SEND_LIMIT` ramp caps. No warm touch 93. No LinkedIn autopost.

## B — Signup → TRUE trial

1. New org still stamps 30-day `planExpiresAt` (`createOrganization`).
2. `/api/auth/register` already calls `startProductTrial` + `markLeadTrial`. **Login** must too when the user has no org (409 “account exists” then sign-in was a dead-end).
3. Register 409 copy must tell the prospect to sign in. Login UI switches to sign-in on that error.
4. Do not stamp `planExpiresAt` onto grandfathered orgs (NULL = pre-trial orgs 6/7/8). Do not invent trials.

## C — After deploy (operator, do not invent keys)

Vercel → PhishSim production env:

- Set **`QEV_API_KEY`** to the real QuickEmailVerification key already in local `.env.local` (password manager / local env — **never commit the value**). Confirm it is present in **PhishSim Production**, not ScrollFuel.
- `MYEMAILVERIFIER_API_KEY` currently exists. Empty string is unset. A real MEV key is used first; QEV still runs on unknown/fail. Prefer keeping QEV set even if MEV is live.
- Do **not** set `REFILL_ALLOW_MX_ONLY=1`.

Verify: `/api/os/sanitize-refill` `promoted > 0` (QEV fallback or MEV valid) while inconclusive GEO leads exist; `/api/os/sequence` must **not** return `pauseNewTouch1: true` while `sanitizedEligible=0`; T1 `sent > 0` within the hourly slice once sanitized eligible > 0.

## Tests (must fail the Sep-12 / live-fire shapes)

- Empty MEV + no QEV ⇒ no mailbox verifier.
- QEV keyed ⇒ verifier present; QEV `valid` promotes; catch-all/risky does not.
- MEV unknown + QEV valid ⇒ promote (`mev_qev`); MEV valid does not spend QEV.
- T1 SQL still requires `sanitized_at`; `sanitized=0` + `unsanitized=6435` ⇒ sent:0 reason `pool_starved_sanitized`.
- `pauseNewTouch1` with drainable=1120 does **not** pause when `t1Starved`.
- T1 silence >36h + eligible>100 ⇒ alert; sanitized=0 + reservoir>100 ⇒ alert; sendable untouched=0 ⇒ alert.
- Finder proceeds on catchall/role; harvest wraps after a 1200 parser desert.
- Login calls `startProductTrial`; register 409 points at sign-in.

```sh
pnpm exec vitest run \
  server/os/sanitizeRefill.test.ts \
  server/os/touch1Health.test.ts \
  server/os/sequenceBacklog.test.ts \
  server/os/agents/finderGuard.test.ts \
  server/os/agents/mspHubHarvest.test.ts \
  server/os/startProductTrial.test.ts \
  server/_core/signupHonesty.test.ts \
  server/os/sendHealthLiveness.test.ts \
  server/os/rampHold.test.ts
```
