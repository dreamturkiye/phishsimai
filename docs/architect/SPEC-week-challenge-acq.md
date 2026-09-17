# SPEC — Week-challenge free multi-channel acquisition (PS-WEEK-ACQ-01)

**Date:** 2026-09-17  
**Product:** PhishSimAI  
**OS:** 7.10 only (amendment O.32.16) — do not open 7.11  
**Status:** implement in this change  
**Owner mandate:** ≥5 TRUE trials by 2026-09-25. Multi-channel free acquisition, not email-only. Do not wait on founder draft review. Spam-safe.

## Live facts (do not invent rates)

| Measure | Value |
|---|---|
| TRUE live trials | **1** (Grey Box Consulting, 0 campaigns) |
| Paying | **0** |
| Week challenge | ≥5 TRUE trials by 2026-09-25 |
| Warm CTA → TRUE trial | 0/17 (14d); 90/91/92 exhausted |

## Ship

1. OOO/auto-reply inbound must not create `founder_1to1` pending_review.
2. Public `/trial` + homepage CTA copy matches live offer: 60¢/user, $299/500, 30-day no-card.
3. Lightweight prerendered `/knowbe4-alternative` → `/trial`.
4. Crisis override: Sarah auto-queues and auto-publishes LinkedIn via PostForMe when credentials exist (≤1/day, quality, no dup). Kill `SOCIAL_CRISIS_PUBLISH=0`. Structural `PUBLIC_SOCIAL_POSTING_ENABLED` stays false.
5. Reddit cron posts/comments in allowed subs without founder approval; no link-drop spam; 3 comments + 1 post/day.
6. Unused-trial in-product 3-click path (Dashboard + Campaigns) for 0-campaign orgs. Do not add a second activation email. Do not add touch 93.

## Rails that must not move

- `WARM_CTA_TOUCHES = [90, 91, 92]` — no 93
- `DAILY_SEND_LIMIT = 20`
- Dex / bounce breaker / CAN-SPAM / geo
- No cold-email volume raise
- No deleting prod data
