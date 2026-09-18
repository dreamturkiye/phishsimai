import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CLUSTER_NAV, PRERENDER_LANDING_PATHS, SEO_LANDINGS, getLanding, trialHref } from '../../client/src/content/seoLandings'

const PATHS = [
  '/knowbe4-vs',
  '/knowbe4-pricing',
  '/knowbe4-for-msps',
  '/phishing-simulation-software',
  '/security-awareness-training',
  '/phishing-training-for-msps',
]

describe('PS-SEO-05 KnowBe4 / MSP / seat-tax cluster', () => {
  it('registers six unique commercial landings plus the hub', () => {
    expect(PRERENDER_LANDING_PATHS).toEqual(PATHS)
    expect(getLanding('/knowbe4-alternative')?.hub).toBe(true)
    expect(getLanding('/knowbe4')?.path).toBe('/knowbe4-alternative')
    const titles = SEO_LANDINGS.map((l) => l.title)
    expect(new Set(titles).size).toBe(titles.length)
    const h1s = SEO_LANDINGS.map((l) => l.h1)
    expect(new Set(h1s).size).toBe(h1s.length)
    for (const page of SEO_LANDINGS) {
      expect(page.faq.length).toBeGreaterThanOrEqual(3)
      expect(page.description.length).toBeGreaterThan(80)
      expect(page.campaign).toMatch(/^[a-z0-9_]+$/)
      expect(trialHref(page.campaign)).toContain('/trial?utm_source=seo')
    }
  })

  it('does not invent ratings, KnowBe4 list prices, or customer counts', () => {
    const src = readFileSync('client/src/content/seoLandings.ts', 'utf8') + readFileSync('client/src/lib/seoMeta.ts', 'utf8')
    expect(src).not.toMatch(/"aggregateRating"/)
    expect(src).not.toMatch(/KnowBe4 costs \$[0-9]/)
    expect(src).not.toMatch(/save 70%|customers saved/i)
    expect(src).toMatch(/we will not invent/i)
  })

  it('prerenders landings, wires App routes, and adds Vercel rewrites before the SPA catch-all', () => {
    const prerender = readFileSync('client/src/prerender.tsx', 'utf8')
    expect(prerender).toContain('PRERENDER_LANDING_PATHS')
    expect(prerender).toContain('"/knowbe4-alternative": KnowBe4Alternative')
    expect(prerender).toContain('jsonLdFor(route)')
    const app = readFileSync('client/src/App.tsx', 'utf8')
    const vercel = readFileSync('vercel.json', 'utf8')
    const sitemap = readFileSync('client/public/sitemap.xml', 'utf8')
    for (const path of PATHS) {
      expect(app).toContain(`path="${path}"`)
      expect(vercel).toContain(`"source": "${path}"`)
      expect(vercel).toContain(`"destination": "${path}/index.html"`)
      expect(sitemap).toContain(`<loc>https://phishsimai.com${path}</loc>`)
    }
    expect(readFileSync('scripts/gen-sitemap.mjs', 'utf8')).toContain('cluster(r)')
  })

  it('emits Organization + SoftwareApplication JSON-LD and crawlable /trial anchors', () => {
    const seo = readFileSync('client/src/lib/seoMeta.ts', 'utf8')
    expect(seo).toContain('SoftwareApplication')
    expect(seo).toContain('"@type": "Organization"')
    expect(seo).toContain('FAQPage')
    expect(seo).not.toContain('"aggregateRating"')
    const landing = readFileSync('client/src/pages/SeoLanding.tsx', 'utf8')
    expect(landing).toContain('href={trial}')
    expect(landing).not.toMatch(/onClick=\{[^}]*trial/)
    const hub = readFileSync('client/src/pages/KnowBe4Alternative.tsx', 'utf8')
    expect(hub).toContain('/trial?utm_source=seo')
    expect(hub).toContain('<a href={TRIAL}')
    expect(hub).not.toMatch(/onClick=\{[^}]*TRIAL/)
  })

  it('internally links home + blog surfaces to the cluster and /trial', () => {
    const home = readFileSync('client/src/pages/Home.tsx', 'utf8')
    expect(home).toContain('href="/blog"')
    expect(home).toContain('"/knowbe4-vs"')
    expect(home).toContain('"/knowbe4-pricing"')
    expect(home).toContain('"/phishing-simulation-software"')
    expect(home).toContain('"/phishing-training-for-msps"')
    const blogIndex = readFileSync('client/src/pages/BlogIndex.tsx', 'utf8')
    expect(blogIndex).toContain('/trial?utm_source=seo')
    const blogPost = readFileSync('client/src/pages/BlogPost.tsx', 'utf8')
    expect(blogPost).toContain('/trial?utm_source=seo&utm_medium=web&utm_campaign=blog_post')
    expect(CLUSTER_NAV).toHaveLength(7)
  })
})
