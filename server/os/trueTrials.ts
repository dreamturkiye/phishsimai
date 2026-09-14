/**
 * True customer trials — exclusion rules (owner ruling 2026-09-14).
 *
 * Live DB that morning: 98 raw free trials with planExpiresAt > now. Of those:
 *   ~94 "Signup Canary's organization", 1 "test", 1 "Trial Walkthrough Co",
 *   1 "Adeo" (owner: ALSO a test trial), 1 "Grey Box Consulting".
 * Paid orgs: 0. Operating true trials ≈ 1.
 *
 * The morning brief's "92 verified" only excluded two founder admin emails, so canaries
 * inflated the sprint and the zero-trial crisis pack never fired.
 *
 * A TRUE trial is a live product entitlement (plan=free, planExpiresAt > now) that is
 * not a canary, walkthrough, named test tenant, internal org, or our own admin email.
 * Pattern-matching is limited to canary/walkthrough — never a slug rule like
 * "contains phishsim", which would drop a real customer called "PhishSim Partners".
 */
export const INTERNAL_ORG_IDS: readonly number[] = [6, 7, 8]

export const NON_LEAD_ORG_ADMIN_EMAILS: readonly string[] = [
  'kaanari@mac.com',
  'asadbek.munasar@forliion.com',
]

/** Exact org names (lowercased) that are never customer trials. */
export const NON_CUSTOMER_ORG_NAMES: readonly string[] = [
  'test',
  'adeo',
  'phishsim internal',
  'ai worker',
  'sending',
  'trial walkthrough co',
  "signup canary's organization",
]

export const TRUE_TRIAL_EXCLUSION_RULES = [
  'admin email in NON_LEAD_ORG_ADMIN_EMAILS (founder / known test accounts)',
  'admin email contains "canary" or is @phishsimai.com',
  'org id in INTERNAL_ORG_IDS (6/7/8)',
  'org name exact (lower): test, adeo, phishsim internal, ai worker, sending, trial walkthrough co, signup canary\'s organization',
  'org name matches /canary/i or /walkthrough/i (Signup Canary variants, Trial Walkthrough Co)',
].join('\n')

export function isNonCustomerOrg(input: {
  name?: string | null
  adminEmail?: string | null
  orgId?: number | null
}): boolean {
  const name = String(input.name || '').trim().toLowerCase()
  const email = String(input.adminEmail || '').trim().toLowerCase()
  if (input.orgId != null && INTERNAL_ORG_IDS.includes(Number(input.orgId))) return true
  if (email && NON_LEAD_ORG_ADMIN_EMAILS.includes(email)) return true
  if (email.includes('canary') || email.endsWith('@phishsimai.com')) return true
  if (name && NON_CUSTOMER_ORG_NAMES.includes(name)) return true
  if (/canary|walkthrough/i.test(String(input.name || ''))) return true
  return false
}

/**
 * SQL boolean (true = exclude). Safe: names are constants, not request input.
 * Use as `NOT (${trueTrialExcludedSql('o', 'admin_email')})` or `AS is_excluded`.
 */
export function trueTrialExcludedSql(orgAlias = 'o', adminEmailExpr = 'admin_email'): string {
  const names = NON_CUSTOMER_ORG_NAMES.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const emails = NON_LEAD_ORG_ADMIN_EMAILS.map((e) => `'${e.replace(/'/g, "''")}'`).join(',')
  const ids = INTERNAL_ORG_IDS.join(',')
  return `(
    lower(${orgAlias}.name) = ANY(ARRAY[${names}]::text[])
    OR ${orgAlias}.name ILIKE '%canary%'
    OR ${orgAlias}.name ILIKE '%walkthrough%'
    OR ${orgAlias}.id = ANY(ARRAY[${ids}]::int[])
    OR COALESCE(lower(${adminEmailExpr}) = ANY(ARRAY[${emails}]::text[]), false)
    OR COALESCE(lower(${adminEmailExpr}) LIKE '%canary%', false)
    OR COALESCE(lower(split_part(${adminEmailExpr}, '@', 2)) = 'phishsimai.com', false)
  )`
}

export type TrueOrgCounts = {
  trueLiveTrials: number
  excludedLiveTrials: number
  rawLiveTrials: number
  truePaying: number
}

/**
 * Canonical live counts. Neon tagged-templates cannot interpolate SQL fragments as
 * values (they become $1), so the exclusion is inlined here and every reader calls
 * this instead of copying a half-exclusion that only drops two founder emails.
 */
export async function measureTrueOrgCounts(sql: any): Promise<TrueOrgCounts> {
  const rows = (await sql`
    SELECT
      count(*) FILTER (WHERE is_live_trial AND NOT is_excluded)::int AS true_trials,
      count(*) FILTER (WHERE is_live_trial AND is_excluded)::int AS excluded_trials,
      count(*) FILTER (WHERE is_live_trial)::int AS raw_trials,
      count(*) FILTER (WHERE is_paying AND NOT is_excluded)::int AS true_paying
    FROM (
      SELECT
        o.plan = 'free' AND o."planExpiresAt" IS NOT NULL AND o."planExpiresAt" > now() AS is_live_trial,
        o.plan IS NOT NULL AND o.plan <> 'free' AS is_paying,
        (
          COALESCE(a.admin_email = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}), false)
          OR COALESCE(a.admin_email LIKE '%canary%', false)
          OR COALESCE(split_part(a.admin_email, '@', 2) = 'phishsimai.com', false)
          OR lower(o.name) = ANY(${NON_CUSTOMER_ORG_NAMES})
          OR o.name ILIKE '%canary%'
          OR o.name ILIKE '%walkthrough%'
          OR o.id = ANY(${INTERNAL_ORG_IDS}::int[])
        ) AS is_excluded
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT lower(u.email) AS admin_email
        FROM org_members m JOIN users u ON u.id = m."userId"
        WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
        ORDER BY m.id ASC LIMIT 1
      ) a ON true
    ) t
  `) as Array<{
    true_trials: number
    excluded_trials: number
    raw_trials: number
    true_paying: number
  }>
  const row = rows[0] || { true_trials: 0, excluded_trials: 0, raw_trials: 0, true_paying: 0 }
  return {
    trueLiveTrials: Number(row.true_trials ?? 0),
    excludedLiveTrials: Number(row.excluded_trials ?? 0),
    rawLiveTrials: Number(row.raw_trials ?? 0),
    truePaying: Number(row.true_paying ?? 0),
  }
}

/** True customer org creates in a rolling window (canary/test/walkthrough/Adeo excluded). */
export async function countTrueOrgCreates(sql: any, windowDays: number): Promise<number> {
  const iv = `${Math.max(1, Math.floor(windowDays))} days`
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM organizations o
    LEFT JOIN LATERAL (
      SELECT lower(u.email) AS admin_email
      FROM org_members m JOIN users u ON u.id = m."userId"
      WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
      ORDER BY m.id ASC LIMIT 1
    ) a ON true
    WHERE o."createdAt" > now() - ${iv}::interval
      AND NOT (
        COALESCE(a.admin_email = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}), false)
        OR COALESCE(a.admin_email LIKE '%canary%', false)
        OR COALESCE(split_part(a.admin_email, '@', 2) = 'phishsimai.com', false)
        OR lower(o.name) = ANY(${NON_CUSTOMER_ORG_NAMES})
        OR o.name ILIKE '%canary%'
        OR o.name ILIKE '%walkthrough%'
        OR o.id = ANY(${INTERNAL_ORG_IDS}::int[])
      )
  `) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}
