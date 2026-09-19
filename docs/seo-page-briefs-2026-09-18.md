# SEO page briefs — PhishSimAi (consolidated 2026-09-19)

Target: stand out for **KnowBe4 alternative** + **phishing training** keywords; larger-company / MSP ICP via search.

Consolidated from #337 (trial CTAs/meta, already on main), #338 (cluster landings), #339 (soft-404 301s + seoMeta escape/logo fix). Overlapping #339 URLs 301 onto the unique cluster so we do not ship doorway duplicates.

## Ranking pages (prerendered, unique title/H1/canonical)

| URL | Intent |
|---|---|
| `/knowbe4-alternative` | Hub — KnowBe4 alternative for MSPs (2026), FAQ, trial CTAs |
| `/knowbe4-vs` | KnowBe4 vs PhishSim |
| `/knowbe4-pricing` | KnowBe4 pricing / cheaper than KnowBe4 / seat tax |
| `/knowbe4-for-msps` | KnowBe4 for MSPs |
| `/phishing-simulation-software` | Category |
| `/security-awareness-training` | SAT + mid-market |
| `/phishing-training-for-msps` | MSP / larger-book ICP |

## 301s (kill soft-404 SPA aliases)

| From | To |
|---|---|
| `/knowbe4-vs-phishsimai` | `/knowbe4-vs` |
| `/vs/knowbe4` | `/knowbe4-vs` |
| `/compare/knowbe4` | `/knowbe4-alternative` |
| `/phishing-awareness-training` | `/security-awareness-training` |
| `/pricing-comparison` | `/knowbe4-pricing` |
| `/msp-phishing-training` | `/phishing-training-for-msps` |

## Conversion

Every landing CTA is a crawlable `<a href="/trial?utm_source=seo&utm_medium=web&utm_campaign=<page>">`. Frozen offer only. `/signup` and `/register` already rewrite to prerendered `/trial` (#337).

## Post-merge ops (manual)

1. Google Search Console → submit `https://phishsimai.com/sitemap.xml`
2. Request indexing for the seven landings
3. Optional: pitch listicle "KnowBe4 alternatives for MSPs 2026" with public pricing (no spam)

## Out of scope

No Dex raise. No touch 93. No email/sequence changes.
