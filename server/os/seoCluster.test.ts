import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CLUSTER_NAV, PRERENDER_LANDING_PATHS, SEO_LANDINGS, getLanding, trialHref } from '../../client/src/content/seoLandings'
import { headTags, seoForPath } from '../../client/src/lib/seoMeta'
import { assertPrerenderRewrites, stripStaticHead } from '../../scripts/assert-prerender-rewrites.mjs'

const PATHS = [
  '/knowbe4-vs',
  '/knowbe4-pricing',
  '/knowbe4-for-msps',
  '/phishing-simulation-software',
  '/security-awareness-training',
  '/phishing-training-for-msps',
]

const CLUSTER = ['/knowbe4-alternative', ...PATHS]
const SPA_TITLE = 'PhishSim AI — Phishing Simulation & Security Awareness Platform'

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
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const sitemap = readFileSync('client/public/sitemap.xml', 'utf8')
    const catchAll = vercel.rewrites.findIndex((r: { destination: string }) => r.destination === '/app.html')
    expect(catchAll).toBeGreaterThan(0)
    for (const path of CLUSTER) {
      expect(app).toContain(`path="${path}"`)
      const idx = vercel.rewrites.findIndex((r: { source: string }) => r.source === path)
      expect(idx, `${path} rewrite missing`).toBeGreaterThanOrEqual(0)
      expect(idx, `${path} rewrite after catch-all`).toBeLessThan(catchAll)
      expect(vercel.rewrites[idx].destination).toBe(`${path}/index.html`)
      expect(sitemap).toContain(`<loc>https://phishsimai.com${path}</loc>`)
    }
    assertPrerenderRewrites(vercel, CLUSTER)
    expect(readFileSync('scripts/prerender.mjs', 'utf8')).toContain('assertPrerenderRewrites')
    expect(readFileSync('scripts/gen-sitemap.mjs', 'utf8')).toContain('cluster(r)')
  })

  it('each cluster URL gets a unique title/H1/canonical — not the SPA homepage shell', () => {
    const homeTitle = seoForPath('/').title
    expect(homeTitle).not.toBe(SPA_TITLE)
    const shell = readFileSync('client/index.html', 'utf8')
    expect(shell).toContain(`<title>${SPA_TITLE}</title>`)

    const titles: string[] = []
    const h1s: string[] = []
    const canonicals: string[] = []
    for (const path of CLUSTER) {
      const meta = seoForPath(path)
      expect(meta.title, path).not.toBe(SPA_TITLE)
      expect(meta.title, path).not.toBe(homeTitle)
      expect(meta.title, path).not.toMatch(/Phishing Simulation & Security Awareness Platform/)
      expect(meta.path).toBe(path)
      expect(meta.title).toMatch(/KnowBe4|Phishing|Security Awareness/)
      const head = headTags(meta)
      const html = stripStaticHead(shell).replace('</head>', `    ${head}\n  </head>`)
      expect(html, path).not.toContain(`<title>${SPA_TITLE}</title>`)
      expect(html).toContain(`<title>${meta.title.replace(/&/g, '&amp;')}</title>`)
      expect(html).toContain(`<link rel="canonical" href="https://phishsimai.com${path}" />`)
      titles.push(meta.title)
      canonicals.push(meta.path)
      const landing = getLanding(path)
      expect(landing, path).toBeTruthy()
      h1s.push(landing!.h1)
    }
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(h1s).size).toBe(h1s.length)
    expect(new Set(canonicals).size).toBe(canonicals.length)
    expect(readFileSync('client/src/pages/KnowBe4Alternative.tsx', 'utf8')).toContain(getLanding('/knowbe4-alternative')!.h1)
  })

  it('fails the build if a cluster rewrite is missing or lands after the SPA catch-all', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const stripped = {
      ...vercel,
      rewrites: vercel.rewrites.filter((r: { source: string }) => r.source !== '/knowbe4-vs'),
    }
    expect(() => assertPrerenderRewrites(stripped, CLUSTER)).toThrow(/knowbe4-vs/)
    const afterCatchAll = {
      ...vercel,
      rewrites: [
        ...vercel.rewrites.filter((r: { source: string }) => r.source !== '/knowbe4-vs'),
        { source: '/knowbe4-vs', destination: '/knowbe4-vs/index.html' },
      ],
    }
    expect(() => assertPrerenderRewrites(afterCatchAll, CLUSTER)).toThrow(/knowbe4-vs/)
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
    expect(hub).toContain('getTrialUrl({ campaign: "knowbe4_alternative" })')
    expect(hub).toContain('<a href={TRIAL}')
    expect(hub).not.toMatch(/onClick=\{[^}]*TRIAL/)
  })

  it('301s soft-404 aliases onto the cluster (no doorway duplicates)', () => {
    const vercel = readFileSync('vercel.json', 'utf8')
    expect(vercel).toMatch(/"source": "\/knowbe4-vs-phishsimai"[\s\S]*"destination": "\/knowbe4-vs"/)
    expect(vercel).toMatch(/"source": "\/vs\/knowbe4"[\s\S]*"destination": "\/knowbe4-vs"/)
    expect(vercel).toMatch(/"source": "\/compare\/knowbe4"[\s\S]*"destination": "\/knowbe4-alternative"/)
    expect(vercel).toMatch(/"source": "\/phishing-awareness-training"[\s\S]*"destination": "\/security-awareness-training"/)
    expect(vercel).toMatch(/"source": "\/pricing-comparison"[\s\S]*"destination": "\/knowbe4-pricing"/)
    expect(vercel).toMatch(/"source": "\/msp-phishing-training"[\s\S]*"destination": "\/phishing-training-for-msps"/)
    expect(vercel).toContain('"source": "/blog"')
    expect(vercel).toContain('"destination": "/blog/index.html"')
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
