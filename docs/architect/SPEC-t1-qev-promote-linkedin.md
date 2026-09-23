# SPEC — QEV-valid refill promotion + LinkedIn pending_review auto-publish

**Date:** 2026-09-23  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** founder brief 2026-09-23. Caps stay 50/50/100. No blast. No touch 93. Do not set `REFILL_ALLOW_MX_ONLY=1`.

## Live facts

| Measure | Value |
|---|---|
| sanitizedEligible | 0 |
| unsanitizedEligible | ≈6124 |
| Verifier mode | `mev_qev` (both keys set) |
| LinkedIn | a draft in `pending_review` for ~63h |
| Owner rule | auto-publish ≤1/day, no founder gate. Kill `SOCIAL_CRISIS_PUBLISH=0` |

## A — Sanitize refill promotes QEV-valid leads

MEV `Catch-all` / `catch_all=true` was terminal. The candidate query then excluded those labels, so QEV never ran and `sanitized_at` stayed null.

1. When QEV is keyed, MEV **valid** and **invalid** stay terminal (no QEV spend). MEV **catch-all** and **unknown** (including Grey-listed) fall through to QEV.
2. Re-open only `catchall` and `unverified_catchall` for that QEV pass. Role, no-MX, `mev_invalid`, and QEV-confirmed `qev_catchall` / `qev_invalid` stay out.
3. QEV `valid` (not catch-all, not risky) stamps `sanitized_at` + `qev_valid`. QEV catch-all overwrites the label to `qev_catchall` so the row cannot loop.
4. Unknown after both verifiers stamps `refill_checked_at` and rotates. It does not disqualify.
5. Do not bind a JS boolean into the candidate SQL.
6. Maps MX bridge stays the existing last resort (both mailbox keys empty AND sendable 0). Do not enable `REFILL_ALLOW_MX_ONLY`.

## B — LinkedIn pending_review

`publishApprovedLinkedIn` only selected `review_status='approved'`. A non-offer draft left in `pending_review` made `advanceLinkedInAcquisition` return early, so the frozen trial post never published. `$299` could also be held as an unsourced stat.

1. Crisis tick publishes at most one quality, non-duplicate draft (frozen 60¢ / $299 / 30-day offer). No founder approval telegram on that path.
2. Unpublishable or 14-day-duplicate `pending_review` rows are cleared (`superseded` / cancelled) the same tick so they cannot block the slot.
3. Approved copy that fails the offer check is `held_content_safety`, not posted.
4. Daily cap stays 1. A duplicate of a post from the last 14 days is not queued again.
5. `/api/os/sarah-social` runs the same crisis publish after the approved publisher. `PUBLIC_SOCIAL_POSTING_ENABLED` stays false.

## Tests

```sh
pnpm exec vitest run \
  server/os/sanitizeRefill.test.ts \
  server/os/social/crisisSocialPublish.test.ts
```
