# SPEC — LinkedIn founder preview: cron revise path, never-null hero, pricing-first

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Facts:** live 2026-09-17. No public LinkedIn auto-publish. No touch 93.

## Bugs

1. `/preview/social/:token` showed "Hero image generating…" forever because `os_social_queue.image_url` was NULL (`storagePut` returns `url=""` without `BLOB_READ_WRITE_TOKEN`; `${imageUrl || null}` persisted NULL; trial drafts omitted `imageUrl`).
2. `GET /api/os/sarah-social` (`cronSarahSocial`) always ran Reddit cron + LinkedIn monitor and **never** read `action`/`mode`/`token`. `linkedin-preview` / `mode=revise` / `produce-final` lived only on HQ-auth `hqSarahSocial`. Auto-revise with `CRON_SECRET` against `/api/os/sarah-social?action=linkedin-preview&mode=revise` silently returned the cron payload.

## Rules

1. `cronSarahSocial` and `hqSarahSocial` share `handleLinkedInPreview`. When `action=linkedin-preview`, dispatch `draft` / `revise` / `produce-final` / `next` (and existing HQ `publish`/`queue`). Bare `/api/os/sarah-social` (Vercel cron, no action) still runs Reddit + LinkedIn monitor.
2. Do **not** flip `PUBLIC_SOCIAL_POSTING_ENABLED`. Publish remains lockout-gated.
3. **Never** insert a LinkedIn draft with null/empty `image_url`. Fallback: `REFERENCE_PUBLIC_URL` (`https://phishsimai.com/brand/sarah-linkedin-reference-v2.png`) or `data:image/png`.
4. `getPreviewByToken` / `renderLinkedInFeedPost`: null `image_url` → reference URL. One-shot backfill in `ensureSocialPreviewColumns`.
5. HQ/ops snapshot warns when `BLOB_READ_WRITE_TOKEN` is missing.
6. When founder feedback asks to drop 50–500 seats framing, marketing default is **pricing-first** (`60¢/user. $299/mo for 500. 30-day no-card trial.`), not the seats subheadline.

## Tests

- `parseLinkedInPreviewDispatch`: no action → cron; `mode=revise` without token → 400; revise/produce-final/draft/next dispatch
- Source-pin: `cronSarahSocial` calls `handleLinkedInPreview` before Reddit cron
- `linkedInHeroUrlOrReference(null)` → reference; render has no "Hero image generating"
- `wantsPricingFirstMarketing('drop the 50–500 seats framing')` → pricing-first subheadline
- `PUBLIC_SOCIAL_POSTING_ENABLED` stays false
