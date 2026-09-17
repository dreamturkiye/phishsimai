import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { defaultOrgName, orgSlugFromName } from './startProductTrial'

describe('defaultOrgName', () => {
  it('prefers the MSP/company name when present', () => {
    expect(defaultOrgName({ company: 'Acme MSP', name: 'Pat', email: 'pat@acme.com' })).toBe('Acme MSP')
  })

  it('falls back to "<name>\'s organization"', () => {
    expect(defaultOrgName({ name: 'Pat', email: 'pat@acme.com' })).toBe("Pat's organization")
  })

  it('uses the email local part when name and company are missing', () => {
    expect(defaultOrgName({ email: 'jordan@msp.example' })).toBe("Jordan's organization")
  })

  it('ignores a one-character company string', () => {
    expect(defaultOrgName({ company: 'A', name: 'Pat', email: 'pat@x.com' })).toBe("Pat's organization")
  })
})

describe('orgSlugFromName', () => {
  it('is URL-safe and unique per call', () => {
    const a = orgSlugFromName('Acme MSP')
    const b = orgSlugFromName('Acme MSP')
    expect(a).toMatch(/^acme-msp-[a-zA-Z0-9_-]{6}$/)
    expect(a).not.toBe(b)
  })
})

describe('register actually starts the 30-day trial', () => {
  it('oauth register calls startProductTrial after the user row exists', () => {
    const oauth = readFileSync('server/_core/oauth.ts', 'utf8')
    expect(oauth).toContain('startProductTrial')
    expect(oauth).toMatch(/from ['"]\.\.\/os\/startProductTrial['"]/)
    const helper = readFileSync('server/os/startProductTrial.ts', 'utf8')
    expect(helper).toContain('createOrganization')
    expect(helper).toContain('markLeadTrial')
    expect(helper).toMatch(/markLeadTrial\([\s\S]*attribution/)
    expect(helper).toContain('sendWelcomeEmail')
    expect(readFileSync('server/db.ts', 'utf8')).toContain('planExpiresAt')
    expect(readFileSync('server/db.ts', 'utf8')).toContain('planActivatedAt')
    expect(readFileSync('server/db.ts', 'utf8')).toMatch(/plan:\s*"free"/)
    expect(oauth).toContain('registerResponseBody')
    expect(oauth).toContain('parseSignupAttribution')
    expect(oauth).not.toMatch(/captcha|recaptcha|stripe.*register|email.?verif/i)
  })

  it('login also starts a trial org when the user has none (409-then-signin dead-end)', () => {
    const oauth = readFileSync('server/_core/oauth.ts', 'utf8')
    expect(oauth).toMatch(/app\.post\("\/api\/auth\/login"[\s\S]*startProductTrial/)
  })

  it('register 409 tells the prospect to sign in rather than dead-ending', () => {
    const oauth = readFileSync('server/_core/oauth.ts', 'utf8')
    expect(oauth).toMatch(/already exists\. Sign in to continue your trial/)
    const trial = readFileSync('client/src/pages/TrialStart.tsx', 'utf8')
    expect(trial).toMatch(/res\.status === 409/)
    expect(trial).toMatch(/window\.location\.href = "\/login"/)
    const login = readFileSync('client/src/pages/Login.tsx', 'utf8')
    expect(login).toMatch(/window\.location\.replace\("\/trial"/)
    expect(login).not.toMatch(/setMode\("login"\)/)
  })

  it('orgs.create also stamps CRM trial_at so /setup is not a silent miss', () => {
    const routers = readFileSync('server/routers.ts', 'utf8')
    expect(routers).toMatch(/createOrganization[\s\S]{0,400}markLeadTrial/)
  })
})

describe('/trial offer strip + prerender SEO', () => {
  it('shows the live LinkedIn offer under the H1', () => {
    const trial = readFileSync('client/src/pages/TrialStart.tsx', 'utf8')
    expect(trial).toMatch(/<h1[\s\S]*Start your 30-day free trial[\s\S]*60¢\/user · \$299\/mo for 500 · 30-day, no card · live in 10 min\./)
    expect(trial).toContain('seoForPath("/trial")')
  })

  it('prerenders /trial with seoForPath and serves that HTML on Vercel', () => {
    const prerender = readFileSync('client/src/prerender.tsx', 'utf8')
    expect(prerender).toMatch(/["']\/trial["']\s*:\s*TrialStart/)
    expect(prerender).toContain('headTags(seoForPath(route))')
    const seo = readFileSync('client/src/lib/seoMeta.ts', 'utf8')
    expect(seo).toMatch(/pathname === "\/trial"[\s\S]*title: "Start your 30-day free trial — PhishSim AI"/)
    const vercel = readFileSync('vercel.json', 'utf8')
    expect(vercel).toMatch(/"source": "\/trial"[\s\S]*?"destination": "\/trial\/index.html"/)
    const sitemap = readFileSync('scripts/gen-sitemap.mjs', 'utf8')
    expect(sitemap).toContain('PRERENDER_ROUTES')
    expect(sitemap).toContain('dist/public/sitemap.xml')
  })
})
