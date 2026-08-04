// ─────────────────────────────────────────────────────────────────────────────
//  PS-TEMPLATE-SENDER-01 — a campaign inherits its template's default From display name.
//
//  Display-name spoofing is the biggest realism lever (the From shows a brand while the address
//  stays our authenticated sim domain). It already worked per campaign; this makes it the DEFAULT —
//  a campaign created from a template inherits the template's senderName unless the creator
//  overrides it. These tests pin the inheritance rule at source, without a DB.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

/** The exact resolution the create handler performs, extracted so the rule is testable in isolation. */
function resolveSenderName(
  campaignInput: string | undefined,
  template: { senderName?: string | null } | null | undefined,
): string | null {
  return campaignInput ?? template?.senderName ?? null
}

describe('inheritance precedence', () => {
  it('inherits the template default when the campaign specifies none', () => {
    expect(resolveSenderName(undefined, { senderName: 'Rewards Team' })).toBe('Rewards Team')
  })

  it('a campaign-level senderName OVERRIDES the template default', () => {
    expect(resolveSenderName('Custom Sender', { senderName: 'Rewards Team' })).toBe('Custom Sender')
  })

  it('falls back to null when neither has one (org default applies downstream)', () => {
    expect(resolveSenderName(undefined, { senderName: null })).toBeNull()
    expect(resolveSenderName(undefined, null)).toBeNull()
  })

  it('an empty campaign string is a value under ?? (only undefined/null are "absent")', () => {
    // Documents the actual resolution: ?? treats '' as a supplied value, so it wins over the
    // template default. The create input is z.string().optional(), so an omitted field is undefined
    // (inherits), not '' — this is the edge, pinned so the semantics are explicit.
    expect(resolveSenderName('', { senderName: 'Rewards Team' })).toBe('')
  })
})

describe('the create handler actually wires the inheritance', () => {
  const ROUTERS = fs.readFileSync('server/routers.ts', 'utf8')

  it('fetches the seed template and resolves senderName from it', () => {
    expect(ROUTERS).toContain('const seedTemplate = await getTemplateById(input.templateId, input.orgId)')
    expect(ROUTERS).toContain('input.senderName ?? seedTemplate?.senderName ?? null')
  })

  it('the createCampaign call uses the inherited value, not the raw input', () => {
    // Guards the regression where senderName reverts to `input.senderName ?? null`, dropping the
    // template default silently.
    const create = ROUTERS.slice(ROUTERS.indexOf('inheritedSenderName'), ROUTERS.indexOf('inheritedSenderName') + 1200)
    expect(create).toContain('senderName: inheritedSenderName,')
    expect(ROUTERS).not.toContain('senderName: input.senderName ?? null,')
  })
})

describe('the four families carry their display-name defaults in the seed', () => {
  const templates = JSON.parse(fs.readFileSync('server/seed_templates.json', 'utf8')) as Array<{ name: string; senderName?: string }>
  const want: Record<string, string> = {
    'Rewards — 25% Off Ends Tonight': 'Rewards Team',
    'Delivery On Hold — Confirm Details': 'Shipping Notifications',
    'Payment Failed — Review Required': 'Billing',
    'HR — Document Awaiting Acknowledgement': 'HR',
  }

  it.each(Object.entries(want))('%s seeds senderName "%s"', (name, sender) => {
    const t = templates.find((x) => x.name === name)
    expect(t, `${name} missing from seed`).toBeTruthy()
    expect(t!.senderName).toBe(sender)
  })

  it('the migration adding the column is additive and comment-safe', () => {
    const SQL = fs.readFileSync('drizzle/pg/0022_template_sender_name.sql', 'utf8')
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS "senderName"')
    for (const m of SQL.matchAll(/IS\s+'([^']*)'/g)) expect(m[1]).not.toContain(';')
  })
})
