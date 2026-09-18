# SPEC — Organic/SEO pages must start a trial (PS-SEO-TRIAL-01)

**Date:** 2026-09-18  
**Product:** PhishSimAI  
**OS:** 7.10 only (amendment O.32.19) — do not open 7.11  
**Status:** implement in this change  
**Owner mandate:** TRUE trials from organic/SEO. Week challenge ≥5 TRUE by 2026-09-25. No Dex cap raise. No touch 93. No invented social proof.

## Live facts (prod probed 2026-09-18 — do not invent rates)

| Measure | Value |
|---|---|
| TRUE live trials | **1** (Grey Box Consulting) |
| Paying | **0** |
| Week challenge | ≥5 TRUE by 2026-09-25 (~7 days left; today is Fri 2026-09-18) |
| Homepage hero/nav CTAs | crawlable `<a href="/trial?...">` (PRs #332–#334) |
| `/trial` | prerendered form, 200, offer strip live |
| `/knowbe4-alternative` | 200, comparison table live; **primary CTA is a `<button>` with JS `onClick`**, not an `<a href="/trial">` |
| `/signup` `/register` | 200 empty SPA shell (`<div id="root"></div>`). No vercel rewrite. Crawlers and no-JS users do not see the form. Canonical points at `/`. |
| Allowlist blog CTA | `[Start a free trial →](/signup)` — lands on that empty shell |
| Proofpoint / HIPAA / click-rate blogs | CTA is `https://phishsimai.com` (homepage), not `/trial` |
| Cyber-insurance blog | CTA is `[See plans →](/pricing)` — pricing detour |
| Blog / KnowBe4 chrome | header has **Pricing only**. No Start-trial control. |
| Sitemap `/trial` | 200 (WebFetch UA previously 500; curl is 200 and lists `/trial`) |

No invented click→signup rates. The leak is structural: high-intent SEO pages do not start a trial.

## Ship

1. **`/signup` and `/register` serve the prerendered `/trial` HTML** via `vercel.json` rewrites (before the `/app.html` catch-all). Canonical stays `/trial`. Do not add `/signup` to the sitemap (duplicate).
2. **KnowBe4 comparison CTA is a crawlable `<a href="/trial?utm…">`**, not `onClick`. Header also gets Start free trial.
3. **Every blog surface has a crawlable Start-trial control** (shared chrome: header + end-of-article). Markdown CTAs that pointed at `/signup`, `/pricing`, or the homepage now point at `/trial` with `utm_source=blog`.
4. **`/trial` form: required fields first.** Work email + password, then optional name/company behind a disclosure. Same register payload. No captcha, no card, no magic-link (hard stop #5).

## Rails that must not move

- `WARM_CTA_TOUCHES = [90, 91, 92]` — no 93
- `DAILY_SEND_LIMIT = 20`
- Dex / bounce breaker / CAN-SPAM / geo
- No invented testimonials (PS-NOFAKE-01)
- Competitor names stay off `/pricing` (PS-PRICE-05)

## Out of scope

Dex caps, touch 93, spam/social volume, fake social proof, magic-link trial start.

## How to verify

```sh
pnpm exec vitest run server/os/trialCta.test.ts
```

After deploy (prod, do not invent):

1. `curl -sS https://phishsimai.com/signup` contains `Start your 30-day free trial` and `Work email` (not an empty `#root`).
2. `curl -sS https://phishsimai.com/knowbe4-alternative` contains `href="/trial?` on the visible CTA (not only noscript).
3. `curl -sS https://phishsimai.com/blog/allowlist-phishing-simulation-microsoft-365` contains `/trial?` and does not contain `](/signup)` / `href="/signup"`.
4. `WARM_CTA_TOUCHES` still `[90, 91, 92]`.
