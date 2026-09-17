import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const updates: Array<{ sql: string; vals: any[] }> = []
const inserts: Array<{ sql: string; vals: any[] }> = []
let returning: any[] = [{ id: 'lead-1' }]

vi.mock('./conn', () => ({
  getSql: () => {
    const fn = async (strings: TemplateStringsArray, ...vals: any[]) => {
      const sql = strings.join(' ? ').replace(/\s+/g, ' ').trim()
      if (/UPDATE ps_outreach_leads/.test(sql)) {
        updates.push({ sql, vals })
        return returning
      }
      if (/INSERT INTO janet_memory/.test(sql)) {
        inserts.push({ sql, vals })
        return []
      }
      return returning
    }
    return fn as any
  },
}))

const { markLeadTrial, linkStripeCustomerToLead } = await import('./crmLink')

beforeEach(() => {
  updates.length = 0
  inserts.length = 0
  returning = [{ id: 'lead-1' }]
})

describe('markLeadTrial — signup email matches a lead', () => {
  it('sets pipeline_stage=trial on LOWER(email) and does not overwrite customer/trial/dead', async () => {
    expect(await markLeadTrial('Pat@MSP.com')).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].sql).toMatch(/pipeline_stage = 'trial'/)
    expect(updates[0].sql).toMatch(/trial_at = COALESCE\(trial_at, NOW\(\)\)/)
    expect(updates[0].sql).toMatch(/LOWER\(email\) = LOWER\(\s*\?\s*\)/)
    expect(updates[0].sql).toMatch(/pipeline_stage NOT IN \('customer', 'trial', 'dead'\)/)
    expect(updates[0].vals).toContain('Pat@MSP.com')
  })

  it('returns false when no lead row moved (organic signup)', async () => {
    returning = []
    expect(await markLeadTrial('organic@newco.com')).toBe(false)
  })

  it('persists UTM attribution in janet_memory without failing the trial stamp', async () => {
    await markLeadTrial('pat@msp.com', {
      source: 'warm_cta',
      utm_source: 'warm_cta',
      utm_medium: 'email',
      utm_campaign: 'convert_warm',
      orgId: 42,
    })
    expect(inserts.length).toBeGreaterThan(0)
    expect(inserts[0].sql).toMatch(/INSERT INTO janet_memory/)
    expect(inserts[0].vals.join(' ')).toMatch(/signup_attr:pat@msp.com/)
    expect(inserts[0].vals.join(' ')).toMatch(/warm_cta/)
  })
})

describe('linkStripeCustomerToLead is still the paid close', () => {
  it('refuses to rewrite an existing customer', async () => {
    await linkStripeCustomerToLead('pat@msp.com', { stripeCustomerId: 'cus_x' })
    expect(updates[0].sql).toMatch(/pipeline_stage <> 'customer'/)
  })
})

describe('register + orgs.create actually call markLeadTrial', () => {
  it('startProductTrial and oauth register and orgs.create all wire CRM trial_at', () => {
    const helper = readFileSync('server/os/startProductTrial.ts', 'utf8')
    expect(helper).toContain('markLeadTrial')
    expect(helper).toMatch(/markLeadTrial\([\s\S]*attribution/)
    const oauth = readFileSync('server/_core/oauth.ts', 'utf8')
    expect(oauth).toContain('parseSignupAttribution')
    expect(oauth).toContain('startProductTrial')
    expect(readFileSync('server/routers.ts', 'utf8')).toMatch(/createOrganization[\s\S]{0,400}markLeadTrial/)
  })
})
