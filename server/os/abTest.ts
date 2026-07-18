import { getSql } from './conn'

export interface ABVariant {
  id: string
  subject: (name: string, co: string) => string
  html: (name: string, co: string, ind: string) => string
}

/**
 * PS-COPY-REWRITE-01 (PS-POSITIONING-01) — why the OLD touch-1 copy failed, so nobody rebuilds it:
 *
 *   It sold MSPs a service they already RESELL. "your team", "your employees", "no IT team
 *   needed" — sent to companies whose entire business is being the IT team. On top of that it
 *   invented a customer ("a similar company we worked with had 43% → 4%"), invented scarcity
 *   ("2 slots left"), quoted unsourced stats (43/4/48/67%), linked a dead calendly (404), and
 *   signed three different identities on one mailbox. 245 delivered, 0 replies.
 *
 * The rewrite below sells the RESELLER motion (white-label, "your clients", a per-client
 * compliance certificate) and every claim is sourced or true. Nothing is invented: no fake
 * customers, no fake scarcity, no unsourced percentages. It states plainly that we are new and
 * have no logos. Industry is NOT interpolated (the old copy called hospitals "technology
 * organizations"); only FirstName is.
 *
 * A/B is OFF: one honest email beats two, and the loser slot is where invented copy used to hide.
 * Both slots hold the identical approved copy so no stale invented text survives in this file.
 */
const TOUCH1_SUBJECT = `Your Clients' Insurers Now Want Phishing-Sim Proof — White-Label It`

// PS-SALUTATION-01: AMF v5.1 find-email/company returns EMAILS ONLY — no name/first_name/title
// (verified: bcainc.com returned 20 emails, zero name fields). So the greeting can never come from
// AMF. Derive a first name from the email local part, but ONLY when it is a plausible single first
// name: no dots, no digits, not a role inbox. Otherwise "there" — NEVER a Google Maps business
// string (which is how "Hi BCA IT, Inc. - Managed IT Services Company Miami," shipped). Capitalized.
const ROLE_LOCALPARTS = new Set([
  'info','sales','support','hr','admin','contact','hello','team','office','billing','help','service',
  'marketing','careers','jobs','noreply','no-reply','gov','webmaster','enquiries','enquiry','mail',
  'accounts','accounting','it','ceo','owner','general','inbox','reception','sysadmin','postmaster',
])
export function deriveFirstName(email: string): string {
  const local = (email.split('@')[0] || '').toLowerCase().trim()
  if (!local || local.includes('.') || /\d/.test(local) || ROLE_LOCALPARTS.has(local)) return 'there'
  if (local.length < 2 || local.length > 14) return 'there'
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// {{TOKEN}} is replaced per-recipient with the base64url unsubscribe token (sequences.ts).
const touch1Html = (name: string) => `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:580px;font-size:15px;line-height:1.6;color:#111">
<p>Hi ${name},</p>
<p>Cyber insurance underwriting changed in 2026. Phishing simulation is now a hard requirement at renewal — carriers ask for simulation frequency, click-rate trends across the last 12 months, and evidence of remedial training for anyone who failed. Annual video training is explicitly flagged as insufficient by most major carriers.</p>
<p>And the question underwriters ask has shifted. It used to be "do you have this control?" Now it's "can you prove it was enforced at the time of the incident?" That gap is where claims get denied — and when your client's broker asks for the proof packet, someone has to produce it.</p>
<p>PhishSim AI is white-label. You run simulations for your clients under your own brand, and it issues a compliance certificate per client, per campaign — the documented evidence their underwriter is asking for.</p>
<p>Setup takes about 10 minutes. No agents, no IT project, no call with me.</p>
<p>I'll be straight: we're new. No logos to show you. What we do have is one of the best prices in the category as an introductory offer, and a 7-day trial with no credit card.</p>
<p style="margin:22px 0"><a href="https://phishsimai.com/register" style="color:#e53e3e;font-weight:700;text-decoration:none">→ Start your 7-day trial — phishsimai.com/register</a></p>
<p>If it's not useful in ten minutes, you've lost ten minutes.</p>
<p style="margin-top:24px;margin-bottom:0">Sarah Mitchell</p>
<p style="margin:0;color:#555">Head of Compliance, Partnerships</p>
<img src="https://www.phishsimai.com/brand/phishsim-nav.png" alt="PhishSim AI" width="150" style="display:block;border:0;outline:0;margin:8px 0 0 0;padding:0;height:auto">
<p style="color:#666;font-size:12px;margin-top:28px"><a href="https://phishsimai.com/unsubscribe?e={{TOKEN}}" style="color:#666">Unsubscribe</a></p>
</div>`

export const AB_EXPERIMENTS: Record<string, { control: ABVariant; test: ABVariant; active: boolean }> = {
  touch1_subject: {
    active: false,
    control: {
      id: 'ctrl_t1_insurance',
      subject: () => TOUCH1_SUBJECT,
      html: (name) => touch1Html(name),
    },
    test: {
      id: 'test_t1_insurance',
      subject: () => TOUCH1_SUBJECT,
      html: (name) => touch1Html(name),
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
