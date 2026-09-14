/**
 * Reply → trial-start instrumentation on recent warm CTAs (touches 90/91/92).
 * Janet/heartbeat read this so close performance is a number, not a vibe.
 * TRUE-trial exclusions stay (canary/test/walkthrough/Adeo).
 */
import { getSql } from './conn'
import { rememberFact } from './memory'
import { COMPANY_ID } from './version'
import { isNonCustomerOrg } from './trueTrials'

export type WarmCtaTrialRate = {
  ctaSent14d: number
  uniqueRecipients14d: number
  trueTrialsFromCta: number
  rate: number | null
  windowDays: number
}

export function computeWarmCtaTrialRate(ctaSent: number, trueTrialsFromCta: number, windowDays = 14): WarmCtaTrialRate {
  const sent = Math.max(0, Math.floor(Number(ctaSent) || 0))
  const trials = Math.max(0, Math.floor(Number(trueTrialsFromCta) || 0))
  return {
    ctaSent14d: sent,
    uniqueRecipients14d: sent,
    trueTrialsFromCta: trials,
    rate: sent > 0 ? trials / sent : null,
    windowDays,
  }
}

export function formatWarmCtaTrialRate(r: WarmCtaTrialRate): string {
  if (r.rate == null) return `warm CTA→TRUE trial: no data (${r.ctaSent14d} CTAs / ${r.windowDays}d)`
  const pct = (r.rate * 100).toFixed(1)
  return `warm CTA→TRUE trial: ${r.trueTrialsFromCta}/${r.ctaSent14d} = ${pct}% (${r.windowDays}d)`
}

export async function measureWarmCtaToTrial(sqlOverride?: any): Promise<WarmCtaTrialRate> {
  const sql = sqlOverride ?? getSql()
  const cta = (await sql`
    SELECT count(DISTINCT lower(o.recipient))::int AS n
    FROM outreach_sequence_outbox o
    WHERE o.touch IN (90, 91, 92) AND o.status = 'sent'
      AND o.updated_at > NOW() - INTERVAL '14 days'
  `.catch(() => [{ n: 0 }])) as Array<{ n: number }>
  const ctaSent = Number(cta[0]?.n ?? 0) || 0

  const matches = (await sql`
    SELECT o.id, o.name, o."planExpiresAt",
      lower(u.email) AS admin_email,
      MIN(x.updated_at) AS first_cta_at
    FROM organizations o
    JOIN org_members m ON m."orgId" = o.id AND m.role = 'admin'
    JOIN users u ON u.id = m."userId" AND u.email IS NOT NULL
    JOIN outreach_sequence_outbox x
      ON lower(x.recipient) = lower(u.email)
     AND x.touch IN (90, 91, 92) AND x.status = 'sent'
     AND x.updated_at > NOW() - INTERVAL '14 days'
    WHERE o.plan = 'free' AND o."planExpiresAt" IS NOT NULL AND o."planExpiresAt" > NOW()
      AND o."createdAt" >= x.updated_at - INTERVAL '2 days'
    GROUP BY o.id, o.name, o."planExpiresAt", u.email
  `.catch(() => [])) as Array<{ id: number; name: string; admin_email: string | null }>

  let trueTrialsFromCta = 0
  const seen = new Set<number>()
  for (const row of matches) {
    if (seen.has(Number(row.id))) continue
    if (isNonCustomerOrg({ name: row.name, adminEmail: row.admin_email, orgId: row.id })) continue
    seen.add(Number(row.id))
    trueTrialsFromCta++
  }

  const result = computeWarmCtaTrialRate(ctaSent, trueTrialsFromCta)
  await rememberFact({
    company_id: COMPANY_ID,
    type: 'operating',
    key: 'warm_cta_trial_rate',
    value: JSON.stringify({ ...result, ts: new Date().toISOString() }).slice(0, 800),
    confidence: 0.9,
    source: 'warm_close_metrics',
  }).catch(() => {})
  return result
}
