import { getSql } from './conn'

export interface ABVariant {
  id: string
  subject: (name: string, co: string) => string
  /**
   * PS-COPY-PLAINTEXT-01: return '' to send a TEXT-ONLY email. sendEmail omits an empty html part
   * from the Resend payload entirely, so the message goes out as a single text/plain body rather
   * than a multipart whose html half is blank.
   */
  html: (name: string, co: string, ind: string) => string
  text: (name: string, co: string, ind: string) => string
}

// PS-CANSPAM-01: mandatory footer on every commercial email — physical postal address (confirmed
// valid by the founder) + the reason-for-contact + a working one-click unsubscribe. Rendered in
// BOTH the HTML and plain-text parts. {{TOKEN}} is the per-recipient base64url unsubscribe token
// (replaced in sequences.ts); the same token backs the List-Unsubscribe one-click header.
const CANSPAM_POSTAL = '240 Queen Street N.E., Leesburg, VA 20176'
const CANSPAM_HTML = `<hr style="border:0;border-top:1px solid #eee;margin:24px 0 12px">
<p style="color:#666;font-size:12px;margin:0">Sarah Mitchell · PhishSim AI</p>
<p style="color:#666;font-size:12px;margin:0">${CANSPAM_POSTAL}</p>
<p style="color:#666;font-size:12px;margin:12px 0 0">You're receiving this because we work with MSPs on phishing-simulation and compliance tooling. Not a fit? <a href="https://phishsimai.com/unsubscribe?e={{TOKEN}}" style="color:#666">Unsubscribe</a> — one click, no hard feelings.</p>`
const CANSPAM_TEXT = `—
Sarah Mitchell · PhishSim AI
${CANSPAM_POSTAL}

You're receiving this because we work with MSPs on phishing-simulation and compliance tooling. Not a fit? Unsubscribe — one click, no hard feelings: https://phishsimai.com/unsubscribe?e={{TOKEN}}`

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
const TOUCH1_SUBJECT = `60¢/user, live in 10 minutes, 30 days free`

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

/**
 * PS-COPY-PRICE-01 (2026-08-02, founder-supplied copy) — replaces the insurance-underwriting
 * angle. Sent verbatim as the founder wrote it; not one figure is paraphrased.
 *
 * Every price claim here was verified against the LIVE Stripe account on 2026-08-02 before this
 * shipped, because a cold email that misquotes its own price is the fastest way to lose a deal
 * you already won:
 *   $299/mo, 500 users  -> price_1Tnerg2LZ4pKabuOJxHALY09, PhishSim AI Growth, month, $299.00
 *                          299/500 = $0.598 -> "60¢/user" ✓
 *   30¢ on Pro          -> price_1Tnerg2LZ4pKabuOV7I9j3Y3, PhishSim AI Pro, month, $749.00
 *                          749/2500 = $0.2996 -> "30¢" ✓
 *   "Starts at $149"    -> price_1Tnerf2LZ4pKabuO9rvqy2YI, PhishSim AI Starter, month, $149.00 ✓
 *   "30-day free trial, no credit card"
 *                       -> TRIAL_DAYS = 30 (server/lib/entitlements.ts:23) and createOrganization
 *                          (server/db.ts:118) stamps planExpiresAt with ZERO Stripe involvement —
 *                          no customer, no payment method. Trial resolves to tier 'trial' with
 *                          FULL limits, so "Full access" is true. ✓
 * If any of those change in Stripe, this copy is wrong and must change with it.
 *
 * PLAIN TEXT, NO HTML — founder directive. First-touch cold plain text lands in primary; an HTML
 * body with a logo block reads as bulk. touch1Html returns '' and sendEmail drops the empty part,
 * so this goes out as a single text/plain body (NOT a multipart with a blank html half).
 *
 * A/B REMOVED. Previously both slots held identical copy behind `active:false`; the test arm is
 * gone from the type entirely so a future editor cannot resurrect a second body by flipping a flag.
 */
const touch1Html = (_name: string) => '' // text-only: see PS-COPY-PLAINTEXT-01

// The CAN-SPAM footer is appended by PS-CANSPAM-01 and is NOT optional — it carries the physical
// postal address and the one-click unsubscribe link that backs the List-Unsubscribe header. It is
// the only text added to the founder's copy.
const touch1Text = (name: string) => `Hi ${name},

Most MSPs either overpay for phishing simulation or skip it because setup eats a week.

PhishSim AI:

- $299/mo covers 500 users — 60¢/user. Drops to 30¢ on Pro. Flat pricing, so your margin grows as you add clients. Starts at $149 if you're smaller.
- Live in under 10 minutes — no security engineer. First campaign running the same afternoon.
- 30-day free trial, no credit card. Full access.

Built for MSPs who want a recurring revenue line without the complexity.

Reply "trial" or start here — you'll be live today: https://phishsimai.com/register

Sarah Mitchell
PhishSim AI

${CANSPAM_TEXT}`


/**
 * PS-TOUCH2-PRICE-01 (2026-08-03, founder-approved copy) — the second touch, price-led.
 *
 * 884 recipients got touch-1 on the insurance/compliance angle and produced 1 human reply, hostile.
 * This is the same list, a different argument, and it says so in the first line. The acknowledgement
 * is not politeness: "wrong angle, and I'd rather say so than send it again" is the only honest way
 * to re-approach someone who already ignored you once, and it is what earns the second read.
 *
 * The "tell me and I'll stop" close is deliberate and invites a NEGATIVE reply. Right now the queue
 * has 0 external replies and we cannot distinguish a dead offer from a dead list. A cheap "no" is
 * worth more than another month of silence, and every "no" also cleans the list.
 *
 * Prices verified against live Stripe before this shipped: Growth 299/500 = $0.598 -> 60c;
 * Pro 749/2500 = $0.2996 -> 30c; Starter $149. Trial: TRIAL_DAYS=30, no Stripe call at signup.
 * "Cancel anytime" is true as of 2026-08-03 (billing portal bpc_1U0EQ8..., subscription_cancel
 * enabled=true, mode=at_period_end, verified by a live sessions.create call).
 *
 * Plain text, no HTML — same doctrine as touch-1. touch2Html returns '' and sendEmail omits the
 * empty part, so this goes out as a single text/plain body.
 */
export const TOUCH2_SUBJECT = `Different pitch than my July email — 60¢/user`

const touch2Html = (_name: string) => '' // text-only: see PS-COPY-PLAINTEXT-01

const touch2Text = (name: string) => `Hi ${name},

I emailed you in July about phishing simulation and compliance paperwork. Wrong angle, and I'd rather say so than send it again.

Here's the actual reason an MSP switches to us:

- $299/mo covers 500 users — 60¢ each. Drops to 30¢ on Pro. Flat per-MSP pricing, so adding a client grows your margin instead of shrinking it. Starts at $149 if you're smaller.
- Live in under 10 minutes. No security engineer, no implementation call.
- 30 days free, no credit card, full access. Cancel anytime.

If phishing sim is already handled, tell me and I'll stop. If it's on the someday list, this is the cheapest way to get it off there: https://phishsimai.com/register

Sarah Mitchell
PhishSim AI

${CANSPAM_TEXT}`

export const TOUCH2_VARIANT: ABVariant = {
  id: 'ctrl_t2_price',
  subject: () => TOUCH2_SUBJECT,
  html: (name) => touch2Html(name),
  text: (name) => touch2Text(name),
}

// PS-COPY-PRICE-01: `test` is OPTIONAL and deliberately absent. With one honest email there is no
// loser slot for stale or invented copy to hide in — which is what it was used for historically.
// sequences.ts falls back to `control` whenever `active` is false or no test arm exists.
export const AB_EXPERIMENTS: Record<string, { control: ABVariant; test?: ABVariant; active: boolean }> = {
  touch1_subject: {
    active: false,
    control: {
      id: 'ctrl_t1_price',
      subject: () => TOUCH1_SUBJECT,
      html: (name) => touch1Html(name),
      text: (name) => touch1Text(name),
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
