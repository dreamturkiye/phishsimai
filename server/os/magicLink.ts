import { createHmac } from 'crypto'

export function generateMagicCheckoutLink(leadId: string, tier = 'starter'): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || 'dev'
  const sig = createHmac('sha256', secret).update(leadId + ':' + tier).digest('hex').slice(0, 16)
  const base = process.env.APP_URL || 'https://phishsimai.com'
  return `${base}/checkout?lead=${leadId}&plan=${tier}&sig=${sig}`
}

// PS-JANET-DOCTRINE-01: the CTA hardcoded "$99/mo" — a price in no Stripe account — on a LIVE
// checkout button sent to prospects. The button now takes the tier's real price from the caller so
// it cannot drift from Stripe again, and the copy leads with the per-user maths rather than urgency.
export const TIER_PRICE_LABEL: Record<string, string> = {
  starter: '$149/mo — 100 users',
  growth: '$299/mo — 500 users, 60c each',
  pro: '$749/mo — 2,500 users, 30c each',
  enterprise: '$1,499/mo — 10,000 users',
}

export function buildCheckoutEmail(leadName: string, company: string, checkoutUrl: string, tier = 'starter'): string {
  const priceLabel = TIER_PRICE_LABEL[tier] ?? TIER_PRICE_LABEL.starter
  return `<div style="font-family:-apple-system,sans-serif;max-width:560px;padding:32px;color:#111">
<h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Great news, ${leadName}</h2>
<p style="color:#555;line-height:1.6">I can have a phishing simulation running for ${company} this week. To get started, click below — takes under 5 minutes to set up.</p>
<div style="margin:24px 0">
<a href="${checkoutUrl}" style="background:#e53e3e;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">Start PhishSimAI — ${priceLabel}</a>
</div>
<p style="color:#888;font-size:13px">Live in under 10 minutes, no security engineer. 30-day free trial, no credit card. Cancel anytime.</p>
<p>Sarah<br><a href="https://phishsimai.com" style="color:#e53e3e">PhishSimAI</a></p>
</div>`
}
