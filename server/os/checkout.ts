/**
 * PS-CHECKOUT-404 — the magic-link checkout page that never existed.
 *
 * Every lead classified `interested` gets emailed a red "Start PhishSimAI" button pointing at
 * `${APP_URL}/checkout?lead=&plan=&sig=` (magicLink.ts:7, sent from replyParser.ts:68). There
 * was no route. The hottest lead in the funnel hit the SPA's NotFound. Stripe shows ZERO
 * checkout sessions ever — this 404 is why: it sits upstream of the price-map and the webhook,
 * and hid both.
 *
 * This is the NO-AUTH funnel entry: the clicker is a lead with no account. It verifies the HMAC
 * the email carried, resolves the price live from Stripe (PS-STRIPE-PRICEMAP-01), creates a
 * subscription Checkout Session, and 302s to Stripe. Activation happens later, when Stripe POSTs
 * checkout.session.completed to the webhook — which the founder must still register
 * (PS-STRIPE-WEBHOOK-UNREGISTERED).
 */

import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'
import Stripe from 'stripe'
import { getSql } from './conn'
import { priceIdForPlan, type StripePlan } from '../stripe/prices'

const VALID_PLANS: StripePlan[] = ['starter', 'growth', 'pro', 'enterprise']

/** Mirrors magicLink.ts exactly: HMAC-SHA256(secret, `${leadId}:${tier}`), first 16 hex chars. */
function expectedSig(leadId: string, plan: string): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || 'dev'
  return createHmac('sha256', secret).update(leadId + ':' + plan).digest('hex').slice(0, 16)
}

function sigOk(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function errPage(title: string, msg: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#111;line-height:1.6">
<h2>${title}</h2><p>${msg}</p>
<p style="color:#999;font-size:12px;margin-top:40px">Reply to any email from us and we will set this up by hand. — PhishSimAI</p></div>`
}

export async function checkoutRedirect(req: Request, res: Response) {
  const leadId = String((req.query?.lead as string) ?? '')
  const plan = String((req.query?.plan as string) ?? '').toLowerCase()
  const sig = String((req.query?.sig as string) ?? '')

  if (!leadId || !plan || !sig) {
    res.status(400).send(errPage('Link incomplete', 'This checkout link is missing information.'))
    return
  }
  if (!VALID_PLANS.includes(plan as StripePlan)) {
    res.status(400).send(errPage('Unknown plan', 'This checkout link references a plan we do not offer.'))
    return
  }
  // Verify the lead did not tamper with plan/lead. A forged link must not create a session.
  if (!sigOk(sig, expectedSig(leadId, plan))) {
    console.warn('[checkout] signature mismatch for lead', leadId, 'plan', plan)
    res.status(403).send(errPage('Link expired', 'This checkout link could not be verified. Reply to your email and we will send a fresh one.'))
    return
  }

  try {
    const sql = getSql()
    const leads = (await sql`SELECT id, email, company FROM ps_outreach_leads WHERE id = ${leadId}`) as any[]
    const lead = leads[0]
    if (!lead) {
      res.status(404).send(errPage('Not found', 'We could not find your record. Reply to your email and we will help directly.'))
      return
    }

    // Price comes from Stripe, never from an env-supplied ID. Magic links are monthly.
    const priceId = await priceIdForPlan(plan as StripePlan, 'monthly')
    if (!priceId) {
      // Loud: a missing price here means the funnel is dead for this tier. Never silently 302 nowhere.
      console.error('[checkout] no active Stripe price for plan', plan, 'monthly — cannot create session')
      res.status(500).send(errPage('Temporarily unavailable', 'We could not start checkout just now. Reply to your email and we will set it up for you.'))
      return
    }

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://phishsimai.com'
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-05-28.basil' as any })
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // The webhook reads these to link the payment back to the lead it came from.
      metadata: { lead_id: String(lead.id), plan, price_id: priceId },
      customer_email: lead.email ?? undefined,
      success_url: `${appUrl}/welcome?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    } as any)

    if (!session.url) {
      console.error('[checkout] Stripe returned a session with no url', session.id)
      res.status(502).send(errPage('Temporarily unavailable', 'Checkout could not start. Reply to your email and we will help.'))
      return
    }
    console.log('[checkout] session', session.id, 'created for lead', lead.id, 'plan', plan)
    res.redirect(303, session.url)
  } catch (e: any) {
    console.error('[checkout] failed for lead', leadId, e)
    res.status(500).send(errPage('Something went wrong', 'We could not start checkout. Reply to your email and we will set it up for you.'))
  }
}
