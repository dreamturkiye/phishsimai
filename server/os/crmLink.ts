import { getSql } from './conn'

/**
 * PS-CRM-01 — the join between billing and the CRM.
 *
 * PhishSim's Stripe webhook knew `org_id`. ps_outreach_leads knows `email`. Nothing
 * translated, so a lead we cold-emailed could sign up, pay, and stay 'prospect' forever
 * while routes.ts queried pipeline_stage='customer' -- a value no code path ever wrote.
 *
 * Rules:
 *  - Match on LOWER(email). Stripe casing is not ours to trust.
 *  - Idempotent: a lead already 'customer' is left alone. Stripe retries webhooks; a retry
 *    must not rewrite customer_at and corrupt the conversion timestamp.
 *  - Returns true only if a real row moved. False = organic signup (never cold-emailed),
 *    which is information, not an error.
 *  - Never throws for "no match". Throws only on a real DB fault, and the caller swallows
 *    that so billing is never held hostage to bookkeeping.
 */
export async function linkStripeCustomerToLead(
  email: string,
  opts: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; tier?: string | null },
): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    UPDATE ps_outreach_leads
    SET pipeline_stage = 'customer',
        customer_at = COALESCE(customer_at, NOW()),
        stage_updated_at = NOW(),
        stripe_customer_id = COALESCE(${opts.stripeCustomerId ?? null}, stripe_customer_id),
        subscription_id = COALESCE(${opts.stripeSubscriptionId ?? null}, subscription_id),
        tier = COALESCE(${opts.tier ?? null}, tier)
    WHERE LOWER(email) = LOWER(${email})
      AND pipeline_stage <> 'customer'
    RETURNING id`) as any[]
  return rows.length > 0
}

/**
 * A lead that started a trial but has not paid. This is the step where trials become
 * revenue, and PhishSim had nothing here -- cold touches existed, reply handling existed,
 * and the gap between "signed up" and "paid" was empty.
 */
export async function markLeadTrial(email: string): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    UPDATE ps_outreach_leads
    SET pipeline_stage = 'trial',
        trial_at = COALESCE(trial_at, NOW()),
        stage_updated_at = NOW()
    WHERE LOWER(email) = LOWER(${email})
      AND pipeline_stage NOT IN ('customer', 'trial', 'dead')
    RETURNING id`) as any[]
  return rows.length > 0
}
