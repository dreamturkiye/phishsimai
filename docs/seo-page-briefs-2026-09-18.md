# SEO page briefs — PhishSimAi (2026-09-18 ET)

Target: stand out for **KnowBe4 alternative** + **phishing training** keywords; larger-company / MSP ICP via search.

## Live audit snapshot

| URL | Status | Title | Notes |
|---|---|---|---|
| `/` | 200 | PhishSim AI — AI Phishing Simulation & Security Awareness for MSPs | Strong product meta |
| `/trial` | 200 | Start your 30-day free trial — PhishSim AI | Offer strip + SSR |
| `/knowbe4-alternative` | 200 | KnowBe4 Alternative… | Was thin (~200 words); expanded in this PR |
| `/sitemap.xml` | 200 (WebFetch briefly 500) | — | Restored on prod via #334; build gen-sitemap |
| `/robots.txt` | 200 | — | Allows `/`, Disallows app routes, Sitemap declared |

**Indexing:** `site:phishsimai.com` web-search returned no usable Google hit list (likely thin/new index). Bing mentions domain. Soft-404 SPA catch-all was serving homepage meta+canonical `/` for keyword URLs — kills ranking.

## Top 5 SEO gaps vs KnowBe4-alternative SERP intent

1. **Thin comparison page** — winners (DefendWise, INFIMA, Lucy, Huntress) ship long vs tables + when-to-pick + FAQ; ours was ~200 words.
2. **No dedicated pricing-comparison URL** — SERP wants "$ vs KnowBe4" math; `/pricing` alone is feature matrix, not competitive intent.
3. **No MSP phishing-training pillar** — "MSP phishing training / awareness" is a separate head term from "KnowBe4 alternative".
4. **Soft-404 aliases** — `/vs/knowbe4`, `/knowbe4-vs-phishsimai`, `/pricing-comparison`, `/msp-phishing-training` returned 200 with homepage title/canonical (SPA `app.html`).
5. **Indexation / discovery** — sitemap only recently restored; need GSC submit + internal links from home/footer; limited third-party mentions vs competitors' listicles.

## Pages in this PR (shipped code)

### A) `/knowbe4-alternative` (expand)
- H1: KnowBe4 vs PhishSim AI — the MSP-fit alternative
- Full comparison table (fit, speed, trial, price, tenancy, white-label, compliance, library, PSA)
- When-to-pick each; day-one checklist; FAQ; CTAs → `/trial` + `/pricing-comparison`
- Meta: includes "vs KnowBe4" + mid-market/MSP

### B) `/pricing-comparison` (new)
- Intent: KnowBe4 pricing / phishing training cost comparison
- Publish only PhishSim list prices; KnowBe4 figures labeled directional
- Worked MSP seat examples; CTA trial

### C) `/msp-phishing-training` (new)
- Intent: MSP phishing training / phishing awareness training MSP
- ICP band 100–10k seats; multi-tenant / white-label / compliance / PSA
- How-to-go-live + why MSPs leave per-seat enterprise SAT

### Redirects (kill soft-404s)
- `/knowbe4-vs-phishsimai`, `/vs/knowbe4`, `/compare/knowbe4` → `/knowbe4-alternative`
- `/phishing-awareness-training` → `/msp-phishing-training`

## Post-merge ops (manual)
1. Google Search Console → submit `https://phishsimai.com/sitemap.xml`
2. Request indexing for the three landings
3. Optional: pitch listicle "KnowBe4 alternatives for MSPs 2026" with public pricing (no spam)

## Out of scope tonight
Dex rem=0 (combined_rem=0 as of 18:29 ET) — no sequence tick. No touch 93. No blasts.
