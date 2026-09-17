# SPEC — Fast trial-start path + exhausted-warm 1:1 queue (PS-TRIAL-START-01)

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**OS:** 7.10 only (amendment O.32.15; O.32.13 T1 starve, O.32.14 exhausted-pool scoring already on main) — do not open 7.11  
**Status:** implement in this change  
**Owner mandate:** MANY more TRUE free trials. Spam-safe. No warm re-blast. No invented trials.

## Live facts (2026-09-17 — do not invent rates)

| Measure | Value |
|---|---|
| TRUE live trials | **1** (Grey Box Consulting) |
| Paying | **0** |
| Warm CTA → TRUE trial (14d) | **0 / 17** |
| Warm touches 90/91/92 | exhausted — do **not** add 93, do **not** re-blast |
| Never-touched leads | ~7076 (T2/T3 already ~7–8/hour under `touch2_scale_approved`) |
| CTA used | `https://phishsimai.com/login?mode=register` |
| Signup canaries | hourly; almost zero real users in 14d |

## What is already true (do not rip out)

Verified in `main` at `7e0afc0`:

1. `POST /api/auth/register` calls `startProductTrial` → `createOrganization` stamps `planExpiresAt` (30 days). `plan` defaults to `free`. No Stripe, no captcha, no email-verify.
2. `markLeadTrial(email)` exists and is called from register + `orgs.create`. Exact-email only; no UTM.
3. Password ≥ 8 is the remaining auth hard-stop. Magic-link **trial** start stays staged (hard stop #5).
4. `/register` still renders **OrgSetup** (org-name second form). Logged-out visitors bounce to `/login?mode=register`.
5. Blog CTAs point at `/signup`, which **404s**.
6. Login register mode looks like a login card ("Create your account") on a light gray page, not a trial start.
7. `DAILY_SEND_LIMIT` / bounce breaker stay intact. Do not raise caps.

## Ship

### 1. Fast trial-start destination

- Canonical path: `/trial` (aliases `/signup` and `/register` for logged-out visitors).
- One form: work email (prefill `?email=`), password, optional name + company.
- Copy: "Start your 30-day free trial — no credit card."
- Dark theme (match homepage). No captcha, no card, no verify step.
- `/login?mode=register` **redirects** to `/trial` preserving query (old warm emails still convert).
- `/setup` remains the fallback only if org creation missed.

### 2. CTA + UTM

- `TRIAL_CTA_URL` = `https://phishsimai.com/trial`
- `trialCtaUrl({ source, medium, campaign, email? })` adds UTM. Warm CTA includes `email=` so the form prefills the mailbox we already wrote to (the 0/17 hole is "clicked login wall, typed a different address or bounced").
- Cold T1/T2/T3 keep existing copy; only the URL destination + UTM change. Not new cold copy. Not a volume raise.

### 3. Signup → entitlement + lead attribution

- Register body accepts `utm_source/utm_medium/utm_campaign/source`.
- `createOrganization` also stamps `planActivatedAt = now()` (activation age must not depend only on `createdAt`).
- `markLeadTrial(email, attribution)` still matches `LOWER(email)`, still refuses to overwrite `customer`/`trial`/`dead`.
- Persist attribution in `janet_memory` key `signup_attr:<email>` (no silent DDL).

### 4. Exhausted warm → founder 1:1 (NOT email)

For replied/engaged leads that already have **all three** of 90/91/92 sent:

- Queue a `founder_1to1` draft on `outreach_reply_drafts` (`pending_review`, `action_taken=draft_for_kaan`).
- Telegram the founder with company, last reply snippet, and a 1:1 script (personal email / call / LinkedIn DM).
- Cap ≤ 5 / run. Idempotent per lead. Escalate every 2h while pending.
- **Do not send email. Do not insert outbox touch 93. Do not reopen 90–92.**
- Surface on HQ pipeline + founder brief.

### 5. Rails that must not move

- `WARM_CTA_TOUCHES = [90, 91, 92]`
- `DAILY_SEND_LIMIT = 20` (effective cap remains the warm-up ramp; do not raise)
- Bounce breaker / Dex `assertSendable` / MX / suppression / CAN-SPAM / geo
- Public LinkedIn publish stays locked
- Magic-link trial start stays staged

## Out of scope

Notya, LinkedIn auto-publish, inventing fake trials, raising cold caps, touch 93.

## How to verify

```sh
pnpm exec vitest run \
  server/os/startProductTrial.test.ts \
  server/os/crmLink.test.ts \
  server/os/trialCta.test.ts \
  server/os/founderOneToOne.test.ts \
  server/_core/registerResult.test.ts \
  server/_core/signupHonesty.test.ts \
  server/os/trialActivation.test.ts \
  server/os/conversionEngine.test.ts \
  server/os/cgoMandate.test.ts
```

After deploy (prod, do not invent):

1. `https://phishsimai.com/signup` and `/trial` render the trial form (not 404, not OrgSetup).
2. `POST /api/auth/register` with a unique email returns `trial.ok=true` and an org with future `planExpiresAt` and `plan=free`. Matching `ps_outreach_leads` email gets `pipeline_stage=trial`.
3. Warm CTA HTML contains `/trial?` + `utm_source=warm_cta` + `email=`.
4. Conversion tick with exhausted>0 queues `founder_1to1` drafts; `outreach_sequence_outbox` gains **no** touch 93.
5. `DAILY_SEND_LIMIT` still 20.
