import { nanoid } from 'nanoid'
import { createOrganization, getUserOrgs } from '../db'
import { markLeadTrial } from './crmLink'

/**
 * PS-TRIAL-AT-REGISTER-01 — the 30-day trial is a product entitlement, not a second form.
 *
 * /api/auth/register used to create a USER only. createOrganization (which stamps
 * planExpiresAt) lived behind /setup. Cold CTAs promise "start your free trial";
 * landing on a second org-name form after signup is how 269 clicks produced 0 trials
 * on the old /register path. This helper is the close: account → trial org → CRM.
 *
 * Failures here must never fail the HTTP register (the user exists; /setup remains
 * as a fallback). They ARE logged — a silent miss is how this hole lasted.
 */

export function defaultOrgName(opts: { name?: string; company?: string; email: string }): string {
  const company = String(opts.company || '').trim()
  if (company.length >= 2) return company.slice(0, 100)
  const name = String(opts.name || '').trim()
  if (name.length >= 2) return `${name}'s organization`.slice(0, 100)
  const local = (String(opts.email).split('@')[0] || 'trial').replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  const pretty = local ? local.charAt(0).toUpperCase() + local.slice(1) : 'New'
  return `${pretty}'s organization`.slice(0, 100)
}

export function orgSlugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${base || 'org'}-${nanoid(6)}`
}

export async function startProductTrial(opts: {
  userId: number
  email: string
  name?: string
  company?: string
}): Promise<{ orgId: number; name: string; created: boolean } | null> {
  const existing = await getUserOrgs(opts.userId)
  const already = existing.find((row) => row.org)?.org
  if (already) {
    markLeadTrial(opts.email).catch((e) =>
      console.error('[CRM] markLeadTrial failed (existing org, signup unaffected):', e),
    )
    return { orgId: already.id, name: already.name, created: false }
  }

  const name = defaultOrgName(opts)
  const org = await createOrganization({ name, slug: orgSlugFromName(name), userId: opts.userId })
  markLeadTrial(opts.email).catch((e) =>
    console.error('[CRM] markLeadTrial failed (signup unaffected):', e),
  )
  import('../email/janet')
    .then(({ sendWelcomeEmail }) => sendWelcomeEmail(opts.email, org.name).catch(console.error))
    .catch(console.error)
  return { orgId: org.id, name: org.name, created: true }
}
