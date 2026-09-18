# SPEC — KnowBe4 / MSP / seat-tax SEO cluster (PS-SEO-05)

**Date:** 2026-09-18  
**Product:** PhishSimAI  
**Status:** implement in this change  
**Owner mandate:** stand out in Google; maximize organic `/trial` starts. Caps / spam email rails unchanged.

## Live facts (probed 2026-09-18)

| Surface | Live state |
|---|---|
| `/` `/pricing` `/trial` `/blog` `/knowbe4-alternative` | Prerendered; title/canonical/og present |
| Organization + SoftwareApplication JSON-LD | **Missing** on every marketing route except blog `BlogPosting` |
| FAQPage JSON-LD | Only the cyber-insurance post |
| `/knowbe4-alternative` | Thin (~11k HTML); trial CTA is `onClick`, not a crawlable `<a href>` |
| Cluster URLs for vs / pricing / MSPs / category / seat-tax | **Do not exist** |
| Home footer | One KnowBe4 link; no blog; no category landings |
| Sitemap | Generated from `PRERENDER_ROUTES` (complete for current routes) |
| Email / Dex / warm-CTA caps | Out of scope — do not touch |

## Why this, not more thin pages

#329 shipped a single comparison URL. Commercial intent still has nowhere to land:

- KnowBe4 vs / KnowBe4 pricing / cheaper than KnowBe4 / KnowBe4 for MSPs
- phishing simulation software / security awareness training / phishing training for MSPs
- mid-market / larger MSP seat-tax pain

Each new URL is a full page (unique H1, unique sections, FAQ, crawlable `/trial` CTA). No doorway variants, no cloaking, no bought links, no invented KnowBe4 list prices, no invented customers or ratings (`aggregateRating` forbidden).

## Ship

1. Six prerendered landings + JSON-LD (Organization, SoftwareApplication, FAQPage, BreadcrumbList).
2. Expand `/knowbe4-alternative` into the cluster hub; trial CTAs become `<a href="/trial?…">`.
3. Internal links: home nav/footer, blog index/posts, hub ↔ satellites, all → `/trial` with `utm_source=seo`.
4. `vercel.json` rewrites so the catch-all does not serve `app.html` for the new URLs.
5. Sitemap fallback + `gen-sitemap` priority 0.8 for the cluster.
6. Do **not** change sequence touches, Dex caps, CAN-SPAM, or cold volume.

## Conversion

Search → landing (intent-matched) → `/trial?utm_source=seo&utm_medium=web&utm_campaign=<page>`.  
Frozen offer only: 60¢/user, $299/mo for 500, 30-day, no card, live in 10 minutes.

## Rails that must not move

- `WARM_CTA_TOUCHES = [90, 91, 92]` — no 93
- `DAILY_SEND_LIMIT` / Dex / bounce breaker / geo
- PS-PRICE-05: competitor names stay off `/pricing`
- PS-NOFAKE-01: no invented customers, savings, or star ratings
