import { createHmac } from 'crypto'

export function generateMagicCheckoutLink(leadId: string, tier = 'starter'): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || 'dev'
  const sig = createHmac('sha256', secret).update(leadId + ':' + tier).digest('hex').slice(0, 16)
  const base = process.env.APP_URL || 'https://phishsimai.com'
  return `${base}/checkout?lead=${leadId}&plan=${tier}&sig=${sig}`
}

export function buildCheckoutEmail(leadName: string, company: string, checkoutUrl: string): string {
  return `<div style="font-family:-apple-system,sans-serif;max-width:560px;padding:32px;color:#111">
<h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Great news, ${leadName}</h2>
<p style="color:#555;line-height:1.6">I can have a phishing simulation running for ${company} this week. To get started, click below — takes under 5 minutes to set up.</p>
<div style="margin:24px 0">
<a href="${checkoutUrl}" style="background:#e53e3e;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">Start PhishSimAI — $99/mo</a>
</div>
<p style="color:#888;font-size:13px">No IT setup required. Cancel anytime. First simulation results within 24 hours.</p>
<p>Sarah<br><a href="https://phishsimai.com" style="color:#e53e3e">PhishSimAI</a></p>
</div>`
}
