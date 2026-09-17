# SPEC — Restore cold touch-1 (sanitized pool + QEV) + signup→TRUE trial

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live owner paste 2026-09-17. No invented funnel rates. No fake trials.

## Live facts

| Measure | Value |
|---|---|
| Last T1 | 2026-09-12 07:00Z (dead 5 days) |
| T2/T3 | still ~7–8/hr |
| TRUE trials | 1 |
| Bounce 7d | 28 T1, 0 bounce — breaker NOT tripped |
| T1_READY GEO US/GB/AU never-touched | sanitized=0, unsanitized=6435 |
| Vercel `MYEMAILVERIFIER_API_KEY` | name exists, **value empty (len 0)** |
| Local `.env.local` | `QEV_API_KEY` len 60 — **sanitizeRefill does not read it** |
| GEO allowlist | US / GB / AU (CA excluded by founder) |

## Root cause (measured)

1. `runFullSequence` T1 SQL requires `sanitized_at IS NOT NULL`. Empty sanitized pool ⇒ `sent: 0` even with 6435 GEO-eligible never-touched leads.
2. `sanitizeRefill` fail-closes unless `MYEMAILVERIFIER_API_KEY` is non-empty (or `REFILL_ALLOW_MX_ONLY=1`). Empty-string MEV counts as unset. `verifierClient.ts` (QEV) exists and is unused by refill.
3. Original sendable pool was a one-off sanitization. Refill promoted 0 after MEV went empty → pool exhausted 2026-09-12.
4. Watchers hid it: harvest treated sanitized=0 as “supply, expected, not a fault”; truth-report sequence liveness uses `GREATEST(touch1..touch4)` so T2/T3 keep the line green; watchdog excludes the unsanitized reservoir by design.

Bounce breaker did not pause T1. Autonomy/ramp is not the measured blocker.

## A — Restore T1

1. Wire **QEV** (`QEV_API_KEY` → `verifyViaService`) into `sanitizeRefill` verify path. Keep MEV if a **non-empty** key is present. Prefer QEV (canonical mailbox verifier in this repo).
2. Treat empty-string MEV as unset. Alert (Telegram + refill JSON `verifierAlert`) when **both** MEV and QEV are empty.
3. Do **not** turn on `REFILL_ALLOW_MX_ONLY=1` (would promote ~82% catch-all). Optional last-resort: **maps personal MX bridge** — only when mailbox verifier is missing AND sanitized eligible is 0; only `google_maps` / `mymsphub`; skip org inboxes / DISQUALIFIED labels; MX required; reason `mx_maps_personal_bridge`.
4. Keep a 3× `dailySendCap` sanitized buffer so one missed refill does not starve hourly T1.
5. Run `/api/os/sanitize-refill` hourly (`30 * * * *`) so the pool refills before each hourly sequence slice.
6. HQ + watchdog field `touch1LastAt`. Alert if T1 silent **>36h** while GEO-eligible never-touched **>100**, OR sanitized eligible **= 0** while that reservoir **>100**.
7. Harvest must not call sanitized=0 “expected” when the unsanitized GEO reservoir is >100.

Keep Dex / geo / CAN-SPAM / hourly drip / `DAILY_SEND_LIMIT` ramp caps. No warm touch 93. No LinkedIn autopost.

## B — Signup → TRUE trial

1. New org still stamps 30-day `planExpiresAt` (`createOrganization`).
2. `/api/auth/register` already calls `startProductTrial` + `markLeadTrial`. **Login** must too when the user has no org (409 “account exists” then sign-in was a dead-end).
3. Register 409 copy must tell the prospect to sign in. Login UI switches to sign-in on that error.
4. Do not stamp `planExpiresAt` onto grandfathered orgs (NULL = pre-trial orgs 6/7/8). Do not invent trials.

## C — After deploy (operator, do not invent keys)

Vercel → PhishSim production env:

- Set **`QEV_API_KEY`** to the real QuickEmailVerification key already in local `.env.local` (password manager / local env — **never commit the value**).
- `MYEMAILVERIFIER_API_KEY` currently exists with an empty value. Either paste a real MEV key or leave it empty (code treats empty as unset). Prefer QEV.
- Do **not** set `REFILL_ALLOW_MX_ONLY=1`.

Verify: `/api/os/sanitize-refill` `promoted > 0` (or maps-bridge promotions) while unsanitized GEO leads exist; then `/api/os/sequence` T1 `sent > 0` within the hourly slice when sanitized eligible > 0.

## Tests (must fail the Sep-12 shape)

- Empty MEV + no QEV ⇒ no mailbox verifier.
- QEV keyed ⇒ verifier present; QEV `valid` promotes; catch-all/risky does not.
- T1 SQL still requires `sanitized_at`; `sanitized=0` + `unsanitized=6435` ⇒ sent:0 reason `pool_starved_sanitized`.
- T1 silence >36h + eligible>100 ⇒ alert; sanitized=0 + reservoir>100 ⇒ alert.
- Login calls `startProductTrial`; register 409 points at sign-in.

```sh
pnpm exec vitest run \
  server/os/sanitizeRefill.test.ts \
  server/os/touch1Health.test.ts \
  server/os/startProductTrial.test.ts \
  server/_core/signupHonesty.test.ts \
  server/os/sendHealthLiveness.test.ts \
  server/os/rampHold.test.ts
```
