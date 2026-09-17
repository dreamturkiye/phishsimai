# SPEC — Unused TRUE-trial activation nudge (PS-ACTIVATE-01)

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**OS:** 7.10 only (amendment O.32.12) — do not open 7.11  
**Status:** implement in this change  
**Owner mandate:** turn PhishSimAi into paid revenue, spam-safe.

## Live facts (prod 2026-09-16 — do not invent rates)

| Measure | Value |
|---|---|
| TRUE live trials | **1** — Grey Box Consulting (org 11, admin `dcharit@gmail.com`) |
| Grey Box campaigns | **0** rows |
| Grey Box `campaign_results` sent | **0** |
| Trial remaining | ~7 days |
| Warm CTA → TRUE trial (14d) | **0 / 17** |
| Warm pool | exhausted (15/16 already received touches 90+91+92) |
| Billing nudges already sent | D14 + D18 + crisis 181 |
| Missing beat | **activation** for unused trials |

Vera already names the intervention (`no_campaign_14d`): "Send the 3-click first-campaign path; offer to run the first one for them."  
`trialNudges` only fires D14/D18/D25/D30 billing-ish beats. Grey Box sat unused because nothing sent the activation copy.

## Ship

1. **Activation nudge, separate from billing.** One email max per org (`trial_nudges_sent` key `nudge_day = 4`). Copy: 3-click first-campaign path + white-glove offer. Use Janet lifecycle send (`server/email/janet.ts`). Not a blast to cold / warm CRM leads.
2. **Eligible:** live TRUE free trial (`plan=free`, `planExpiresAt > now`), **0** `campaigns` rows, age ≥ 3 days from `planActivatedAt` or `createdAt`. No upper age cap — unused trials past the 3–5 day earliest window (Grey Box at ~day 23) still get exactly one. Cap ≤ 5 / run.
3. **Wire:** `runTrialActivationNudges` called from `runTrialNudges` (existing 09:00 cron + conversion ticks) **and** sibling cron `/api/os/trial-activation` (09:15, Bearer `CRON_SECRET`, same HQ_SECRET query as trial-nudges). Idempotent claim so both paths cannot double-send.
4. **TRUE-trial exclusions** (`trueTrials.ts` / `isNonCustomerOrg`): no canaries, Adeo, walkthrough, test, internal ids 6/7/8, founder/canary/@phishsimai.com admins.
5. **Spam-safe:** do **not** reopen warm CTA touches 90–92 for exhausted leads. Do **not** invent touch 93. Do **not** raise cold-email caps. Do **not** publish LinkedIn.
6. **Tests:** selection (Grey Box unused / canary / has-campaign / too-new / expired) + idempotency (second claim is a no-op) + `WARM_CTA_TOUCHES === [90, 91, 92]`.

## Out of scope

Greenfield product, LinkedIn publish, raising daily cold email caps, Notya.

## How to verify on Grey Box (after prod deploy)

```sh
# First run should claim org 11 once (if still 0 campaigns, live TRUE trial).
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://phishsimai.com/api/os/trial-activation

# Second run must be a no-op (idempotent).
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://phishsimai.com/api/os/trial-activation
```

Expect first response `sent: [{ orgId: 11, nudge: 4 }]`. Second `sent: []`.  
Confirm Resend accepted mail to `dcharit@gmail.com`.  
Confirm `trial_nudges_sent` has `(org_id=11, nudge_day=4)` once.  
Confirm `outreach_sequence_outbox` did **not** gain a touch `93` row.
