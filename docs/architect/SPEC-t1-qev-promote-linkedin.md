# SPEC — Personal-mailbox supply + PostForMe LinkedIn publish

**Date:** 2026-09-23  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** founder brief 2026-09-23, corrected by live ops the same day. Caps stay 50/50/100. No blast. No touch 93. Do not set `REFILL_ALLOW_MX_ONLY=1`. Do not touch Telegram (PR #345).

## Live facts

| Measure | Value |
|---|---|
| sanitizedEligible | 0 |
| Valid mailbox labels | 0 |
| Already DISQUALIFIED | ~3615 `role_*` + ~2312 catch-all |
| Inconclusive reopened for QEV | 59, sanitize-refill promoted 0 |
| LinkedIn `27ab5c64` | approved / re-queued; PostForMe `404 Cannot POST /v1/posts` |
| Owner rule | auto-publish ≤1/day, no founder gate. Kill `SOCIAL_CRISIS_PUBLISH=0` |

`sanitizedEligible=0` is not an unchecked backlog. Another sanitize loop will not create a sendable lead.

## A — Supply, not another sanitize loop

Catch-all is a domain property. Re-verifying it, or paying the finder for another address on that domain, does not produce a QEV-valid mailbox.

1. MEV **valid**, **invalid**, and **catch-all** are terminal. QEV runs only when MEV is unknown, empty, or fails. Do not re-queue `catchall` / `unverified_catchall`.
2. Already-checked inconclusive rows (`unverified_unknown` / `_timeout` / `_blank`) wait 7 days before another QEV attempt. Unchecked rows (`refill_checked_at IS NULL`) still verify.
3. Role-only domains (`role_account`, `role_strict`, generic/initials greetings) that the queue marked `duplicate` or `enriched` reopen for a named personal find. Cap 8 domains per researcher run. Reset `attempts` and `created_at` so they are selected ahead of the old desert (`ORDER BY attempts ASC, created_at DESC`).
4. The finder skips a domain that already holds a promotable or unchecked personal, and skips a catch-all domain (`catchall_closed` → `unenrichable`). It proceeds on role-only and on inconclusive personals that are already pending.
5. An org inbox (`info@`, `sales@`, …) is not inserted and does not mark the queue row enriched.
6. Maps MX bridge stays the existing last resort (both mailbox keys empty AND sendable 0). Do not enable `REFILL_ALLOW_MX_ONLY`. Do not raise Dex caps.

## B — LinkedIn pending_review and the PostForMe 404

`publishApprovedLinkedIn` only selected `review_status='approved'`. A non-offer draft left in `pending_review` made `advanceLinkedInAcquisition` return early. The approved draft `27ab5c64` then POSTed `https://api.postforme.dev/v1/posts`, which PostForMe answers with `404 Cannot POST /v1/posts`. Create is `POST /v1/social-posts`.

1. Crisis tick publishes at most one quality, non-duplicate draft (frozen 60¢ / $299 / 30-day offer). No founder approval telegram on that path.
2. Unpublishable or 14-day-duplicate `pending_review` rows are cleared (`superseded` / cancelled) the same tick so they cannot block the slot.
3. Approved copy that fails the offer check is `held_content_safety`, not posted.
4. Daily cap stays 1. A duplicate of a post from the last 14 days is not queued again.
5. `/api/os/sarah-social` runs the same crisis publish after the approved publisher. `PUBLIC_SOCIAL_POSTING_ENABLED` stays false.
6. Create URL resolves to `https://api.postforme.dev/v1/social-posts`. A `POSTFORME_API_URL` that still ends in `/v1/posts` or `/posts` is ignored. Body is `{ caption, social_accounts, media: [{ url }] }`.
7. Key order: `POSTFORME_PHISHSIM_API_KEY`, then `POSTFORME_API_KEY`, then `POST_FOR_ME_API_KEY`. Account order: `POSTFORME_SARAH_LINKEDIN_ID`, then `POSTFORME_LINKEDIN_ACCOUNT`.
8. Approved rows in `queued` / `draft` / `pending_review`, and `failed` rows whose error mentions `/v1/posts`, are eligible on the next sarah-social tick. This environment has no PostForMe key and no prod DB, so the live post is not sent from here.

## Tests

```sh
pnpm exec vitest run \
  server/os/sanitizeRefill.test.ts \
  server/os/agents/finderGuard.test.ts \
  server/os/social/postForMeLinkedIn.test.ts \
  server/os/social/crisisSocialPublish.test.ts \
  server/os/social/publicPostingLockout.test.ts
```
