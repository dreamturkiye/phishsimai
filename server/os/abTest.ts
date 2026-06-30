import { getSql } from './conn'

export interface ABVariant {
  id: string
  subject: (name: string, co: string) => string
  html: (name: string, co: string, ind: string) => string
}

export const AB_EXPERIMENTS: Record<string, { control: ABVariant; test: ABVariant; active: boolean }> = {
  touch1_subject: {
    active: true,
    control: {
      id: 'ctrl_t1_subject',
      subject: (_name, co) => `Quick compliance question for ${co}`,
      html: (name, co, ind) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Quick question — when did ${co} last run a phishing simulation for your team?</p>
<p>I ask because 67% of breaches start with phishing, and most ${ind} organizations haven't tested their staff in 6+ months — creating real compliance exposure.</p>
<p>We built PhishSimAI to fix this: 10-minute setup, AI-generated campaigns that evolve weekly, automated training for anyone who clicks.</p>
<p>Happy to run a free simulation for your team this week. Worth a quick look?</p>
<p>Sarah Mitchell<br>Head of Compliance Partnerships<br><a href="https://phishsimai.com">PhishSimAI</a></p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e={{TOKEN}}" style="color:#bbb">Unsubscribe</a></p>
</div>`,
    },
    test: {
      id: 'test_t1_subject',
      subject: (_name, co) => `phishing risk at ${co}`,
      html: (name, co, ind) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Quick question — how is ${co} currently handling security awareness training for ${ind} compliance requirements?</p>
<p>Most IT teams we talk to haven't run a phishing test in 6+ months. That's a real audit gap — and 67% of breaches still start with a phishing email.</p>
<p>PhishSimAI runs automated simulations in under 10 minutes. Happy to benchmark your team for free this week.</p>
<p>Worth a look?</p>
<p>Sarah Mitchell<br><a href="https://phishsimai.com">PhishSimAI</a></p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e={{TOKEN}}" style="color:#bbb">Unsubscribe</a></p>
</div>`,
    },
  },
}

export function getVariant(leadId: string, _experimentKey: string): 'control' | 'test' {
  const hash = leadId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return hash % 2 === 0 ? 'control' : 'test'
}

export async function recordImpression(leadId: string, experimentKey: string, variant: string) {
  try {
    const sql = getSql()
    await sql`INSERT INTO ab_impressions (lead_id, experiment_key, variant, event) VALUES (${leadId}, ${experimentKey}, ${variant}, 'sent')`
  } catch {}
}

export async function recordConversion(leadId: string, experimentKey: string, event: string) {
  try {
    const sql = getSql()
    await sql`INSERT INTO ab_impressions (lead_id, experiment_key, variant, event)
      SELECT lead_id, ${experimentKey}, variant, ${event} FROM ab_impressions
      WHERE lead_id=${leadId} AND experiment_key=${experimentKey} AND event='sent' LIMIT 1`
  } catch {}
}

export async function getExperimentResults(experimentKey: string) {
  try {
    const sql = getSql()
    return await sql`SELECT variant,
      count(*) filter(where event='sent') as sent,
      count(*) filter(where event='replied') as replied
      FROM ab_impressions WHERE experiment_key=${experimentKey} GROUP BY variant`
  } catch { return [] }
}
