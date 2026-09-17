# SPEC — LinkedIn founder preview: cron revise path, never-null hero, pricing-first

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live 2026-09-17. No public LinkedIn auto-publish. No touch 93.

## Bugs

1. `/preview/social/:token` showed "Hero image generating…" forever because `os_social_queue.image_url` was NULL (`storagePut` returns `url=""` without `BLOB_READ_WRITE_TOKEN`; `${imageUrl || null}` persisted NULL; trial drafts omitted `imageUrl`).
2. `GET /api/os/sarah-social` (`cronSarahSocial`) always ran Reddit cron + LinkedIn monitor and **never** read `action`/`mode`/`token`. `linkedin-preview` / `mode=revise` / `produce-final` lived only on HQ-auth `hqSarahSocial`. Auto-revise with `CRON_SECRET` silently returned the cron payload.
3. Vercel rewrite to `/api/index.js` can leave Express `req.query` empty while the original query remains on `originalUrl` / `x-invoke-query`.
4. `submitSocialReview` fire-and-forget `void revise…` can be frozen by the lambda before a new `pending_review` row exists.
5. Revise copy regex was only `tone|copy|cta|stat|soften|add |rewrite|paragraph` — pricing/positioning feedback did not rewrite the post or drop 50–500 seats.

## Rules

1. `cronSarahSocial` uses `dispatchSarahSocialRoute` (shared with HQ `handleLinkedInPreview`). Collect query from `req.query`, `originalUrl`, `url`, and `x-invoke-query`. When `action=linkedin-preview`, dispatch `draft` / `revise` / `produce-final` / `next`. Bare `/api/os/sarah-social` (no action) still runs Reddit + LinkedIn monitor.
2. Do **not** flip `PUBLIC_SOCIAL_POSTING_ENABLED`. Publish remains lockout-gated.
3. **Never** insert a LinkedIn draft with null/empty `image_url`. Fallback: `REFERENCE_PUBLIC_URL` or `data:image/png`.
4. `getPreviewByToken` / `renderLinkedInFeedPost`: null `image_url` → reference URL. One-shot backfill in `ensureSocialPreviewColumns`.
5. HQ/ops snapshot warns when `BLOB_READ_WRITE_TOKEN` is missing.
6. When founder feedback asks to drop 50–500 seats framing / showcase per-seat pricing, **revise copy AND hero**. `shouldReviseLinkedInCopy` is not limited to `tone|copy|cta`. Marketing default is pricing-first (`60¢/user. $299/mo for 500. 30-day no-card trial.`).
7. `submitSocialReview` **awaits** `reviseSarahLinkedInDraft` so a new `pending_review` row with a new `preview_token` and non-null `image_url` exists before the review response returns.

## Tests

- `dispatchSarahSocialRoute`: `action=linkedin-preview&mode=revise` calls `reviseSarahLinkedInDraft` and never the Reddit cron fallback — including when `req.query` is empty and the query lives on `originalUrl`
- `mode=produce-final` likewise does not return `{reddit:...}`
- `shouldReviseLinkedInCopy` true for pricing/positioning
- Null `imageUrl` → reference PNG; `PUBLIC_SOCIAL_POSTING_ENABLED` stays false
