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
    expect(helper).toContain('sendWelcomeEmail')
    expect(readFileSync('server/db.ts', 'utf8')).toContain('planExpiresAt')
  })

  it('orgs.create also stamps CRM trial_at so /setup is not a silent miss', () => {
    const routers = readFileSync('server/routers.ts', 'utf8')
    expect(routers).toMatch(/createOrganization[\s\S]{0,400}markLeadTrial/)
  })
})
