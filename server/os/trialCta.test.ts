import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TRIAL_CTA_PATH,
  TRIAL_CTA_URL,
  isTrialStartPath,
  parseSignupAttribution,
  signupAttrMemoryKey,
  trialCtaUrl,
} from './trialCta'

describe('trialCtaUrl', () => {
  it('lands on /trial with UTM, not the login wall', () => {
    expect(TRIAL_CTA_PATH).toBe('/trial')
    expect(TRIAL_CTA_URL).toBe('https://phishsimai.com/trial')
    expect(TRIAL_CTA_URL).not.toMatch(/login/)
    const url = trialCtaUrl({ source: 'warm_cta', medium: 'email', campaign: 'convert_warm', email: 'Pat@MSP.com' })
    expect(url).toContain('https://phishsimai.com/trial?')
    expect(url).toContain('utm_source=warm_cta')
    expect(url).toContain('utm_medium=email')
    expect(url).toContain('utm_campaign=convert_warm')
    expect(url).toContain('email=pat%40msp.com')
  })

  it('drops an invalid email prefill and sanitizes UTM', () => {
    const url = trialCtaUrl({ source: 'warm cta!', email: 'not-an-email' })
    expect(url).toContain('utm_source=warm_cta')
    expect(url).not.toContain('email=')
  })
})

describe('parseSignupAttribution', () => {
  it('reads UTM from the register body', () => {
    expect(parseSignupAttribution({
      utm_source: 'warm_cta',
      utm_medium: 'email',
      utm_campaign: 'convert_warm',
    })).toEqual({
      source: 'warm_cta',
      utm_source: 'warm_cta',
      utm_medium: 'email',
      utm_campaign: 'convert_warm',
    })
  })

  it('returns empty for missing/blank fields', () => {
    expect(parseSignupAttribution({})).toEqual({})
    expect(parseSignupAttribution(null)).toEqual({})
  })
})

describe('trial-start paths', () => {
  it('treats /trial /signup /register as the trial form, not /setup', () => {
    expect(isTrialStartPath('/trial')).toBe(true)
    expect(isTrialStartPath('/signup')).toBe(true)
    expect(isTrialStartPath('/register')).toBe(true)
    expect(isTrialStartPath('/login')).toBe(false)
    expect(isTrialStartPath('/setup')).toBe(false)
    expect(signupAttrMemoryKey('Pat@MSP.com')).toBe('signup_attr:pat@msp.com')
  })

  it('prerenders /trial so sitemap + SSR title use seoForPath, with the frozen offer strip', () => {
    const prerender = readFileSync('client/src/prerender.tsx', 'utf8')
    expect(prerender).toMatch(/["']\/trial["']:\s*TrialStart/)
    expect(prerender).toContain('"/knowbe4-alternative": KnowBe4Alternative')
    expect(prerender).toContain('headTags(seoForPath(route))')
    const seo = readFileSync('client/src/lib/seoMeta.ts', 'utf8')
    expect(seo).toContain('pathname === "/trial"')
    expect(seo).toContain('Start your 30-day free trial — PhishSim AI')
    const page = readFileSync('client/src/pages/TrialStart.tsx', 'utf8')
    expect(page).toContain('60¢/user · $299/mo for 500 · 30-day, no card · live in 10 min.')
    expect(page).toContain('seoForPath("/trial")')
    expect(readFileSync('scripts/gen-sitemap.mjs', 'utf8')).toContain('r === "/trial"')
  })

  it('homepage header/hero/footer trial CTAs are crawlable <a href> not onClick-only', () => {
    const home = readFileSync('client/src/pages/Home.tsx', 'utf8')
    expect(home).not.toMatch(/onClick=\{[^}]*getSignupUrl\(\)/)
    expect(home).toContain('href={getSignupUrl()}')
    expect(home).toContain('href="/trial"')
    expect(home).toContain('{ label: "Free Trial", href: "/trial" }')
    const signupAnchors = home.match(/getSignupUrl\(\)/g) ?? []
    expect(signupAnchors.length).toBeGreaterThanOrEqual(7)
    const constSrc = readFileSync('client/src/const.ts', 'utf8')
    expect(constSrc).toContain('export const getTrialUrl')
    expect(constSrc).toContain('return `/trial?${params.toString()}`')
    expect(constSrc).toContain('utm_source')
    expect(constSrc).toContain('marketing_site')
  })

  it('KnowBe4 comparison CTA is a crawlable /trial anchor, not onClick', () => {
    const page = readFileSync('client/src/pages/KnowBe4Alternative.tsx', 'utf8')
    expect(page).toContain('href={TRIAL}')
    expect(page).not.toMatch(/onClick=\{[^}]*TRIAL/)
    expect(page).toContain('SeoTrialHeader')
    expect(page).toContain('campaign: "knowbe4_alternative"')
  })

  it('blog chrome and posts land on /trial, never /signup or homepage-only CTAs', () => {
    const post = readFileSync('client/src/pages/BlogPost.tsx', 'utf8')
    expect(post).toContain('SeoTrialHeader')
    expect(post).toContain('SeoTrialFooter')
    const allowlist = readFileSync('client/src/content/blog/allowlist-phishing-simulation-microsoft-365.md', 'utf8')
    expect(allowlist).toContain('/trial?utm_source=blog')
    expect(allowlist).not.toContain('](/signup)')
    expect(allowlist).not.toContain('](/pricing)')
    for (const slug of [
      'proofpoint-alternative-msp-2026',
      'phishing-click-rate-benchmarks-2026',
      'hipaa-phishing-simulation-healthcare-msp-2026',
      'cyber-insurance-phishing-simulation-requirement-2026',
    ]) {
      const md = readFileSync(`client/src/content/blog/${slug}.md`, 'utf8')
      expect(md).toContain(`/trial?utm_source=blog&utm_medium=web&utm_campaign=${slug}`)
      expect(md).not.toContain('](/signup)')
      expect(md).not.toMatch(/\]\(https:\/\/phishsimai\.com\/?\)/)
    }
  })

  it('/signup and /register rewrite to prerendered /trial HTML (not empty app.html)', () => {
    const vercel = readFileSync('vercel.json', 'utf8')
    expect(vercel).toContain('"source": "/signup"')
    expect(vercel).toContain('"source": "/register"')
    expect(vercel).toMatch(/"source": "\/signup"[\s\S]*"destination": "\/trial\/index\.html"/)
    expect(vercel).toMatch(/"source": "\/register"[\s\S]*"destination": "\/trial\/index\.html"/)
    const page = readFileSync('client/src/pages/TrialStart.tsx', 'utf8')
    expect(page.indexOf('htmlFor="email"')).toBeLessThan(page.indexOf('htmlFor="company"'))
    expect(page).toContain('Add name & company (optional)')
  })
})

describe('static sitemap fallback', () => {
  it('lists /trial and /knowbe4-alternative for crawlers', () => {
    const sitemap = readFileSync('client/public/sitemap.xml', 'utf8')
    expect(sitemap).toContain('<loc>https://phishsimai.com/trial</loc>')
    expect(sitemap).toContain('<loc>https://phishsimai.com/knowbe4-alternative</loc>')
    expect(sitemap).toContain('<loc>https://phishsimai.com</loc>')
  })
})
