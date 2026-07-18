import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { AB_EXPERIMENTS, getVariant, recordImpression, deriveFirstName } from './abTest'
import { reportAgentRun } from './agentHealth'
import { reportAgentHealth } from './agentHealth_v2'
import { hasMx, domainOf } from './mxGate'
import { assertAutonomyAllows, isAutonomyDenied } from './autonomyGate'
import { COMPANY_ID } from './version'
import { recordIncident } from './cleanDays'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'
const REPLY_TO = 'sarah@phishsimai.com'
export const DAILY_SEND_LIMIT = 20
export const PAUSE_ON_BOUNCE_RATE = 0.08

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  tags: { name: string; value: string }[] = [],
  unsubToken?: string,
) {
  // PS-COPY-REWRITE-01: List-Unsubscribe + one-click (RFC 8058). Gmail/Outlook require these for
  // bulk senders and they directly affect inbox placement. The URL is the same token-based
  // /unsubscribe route the visible footer links to; it must accept POST for one-click (mounted in
  // api/handler.ts). Header sent, verbatim:
  //   List-Unsubscribe: <https://phishsimai.com/unsubscribe?e=TOKEN>
  //   List-Unsubscribe-Post: List-Unsubscribe=One-Click
  const headers: Record<string, string> = {}
  if (unsubToken) {
    headers['List-Unsubscribe'] = `<https://phishsimai.com/unsubscribe?e=${unsubToken}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html, tags, headers }),
  })
  return res.json()
}

// PS-COPY-REWRITE-01: touches 2-5 DELETED. The old bodies were end-user pitches with an invented
// case study ("43% → 4%"), invented scarcity ("2 slots left"), an unsourced stat ("attacks up 48%"),
// and a dead calendly link. Better one honest email than five that lie. The sequence is touch-1
// only until the founder supplies replacement follow-ups. touchDefs below is intentionally empty:
// runFullSequence sends touch-1 and stops.
const SEQUENCE: {
  touch: number
  delayDays: number
  subject: (n: string, co: string) => string
  html: (name: string, co: string, ind: string, token: string) => string
}[] = []

// PS-BOUNCE-WINDOW-01: a breaker exists to stop a CURRENT problem, so it must measure a CURRENT
// population. The old query counted bounced/sent over touch1_sent_at IS NOT NULL — LIFETIME. After
// the D2 purge, 42 of 43 leads are dead (fabricated), so that rate is 46.5% over a cohort that no
// longer exists and can never drop. Wiring THAT into the clock would freeze every day dirty forever
// — V7.3:699's "monitor measuring the wrong population", re-created by the purge. Rescoped to a
// rolling 7-day window over LIVE (non-dead) leads.
//
// `measured` is explicit: an empty window is NOT 0% healthy, it is NOT MEASURED. No data is not
// permission — the caller fails closed on !measured rather than reading a green over zero sends.
// `tripped` is TRUE only on a measured, over-threshold rate — a real, current bounce problem.
export async function getSequenceHealth(sql = getSql()) {
  const rows = await sql`SELECT
    count(*) filter(where bounced=true) as bounced,
    count(*) as sent
    FROM ps_outreach_leads
    WHERE touch1_sent_at > NOW() - interval '7 days' AND pipeline_stage NOT IN ('dead')`
  const bounced = Number(rows[0].bounced)
  const sent = Number(rows[0].sent)
  const measured = sent > 0
  const rate = measured ? bounced / sent : 0
  const tripped = measured && rate >= PAUSE_ON_BOUNCE_RATE
  // `paused` = do-not-send: a real trip, OR an unmeasured window (fail closed). Only `tripped`
  // (a measured break) is an autonomy_incident — an empty window is not a break, it is silence.
  return { rate, measured, tripped, paused: tripped || !measured, bounced, sent }
}

// PS-INCIDENT-01 (2026-07-15): HARD PAUSE. Aria sequenced leads that appear LLM-fabricated
// (same names across multiple cities -- researcher was watchdog-restarted every 15min against
// an empty agent_health table all night and filled the queue with invented personas). Real
// Resend sends went out. Paused in CODE, not env, per the 2026-07-12 ScrollFuel lesson:
// an env flag that nobody verifies is an instrument reporting state that does not exist.
// Unpause requires: lead-source audit + fabricated-lead purge + founder sign-off, then delete this block.
// PS-GEO-01 -- per-country send allowlist. FOUNDER DECISION 2026-07-15.
//
// Nothing in this codebase has ever known what country a lead is in. The four-country
// target ("US, Canada, UK, or Australia") lived only inside an LLM prompt -- a suggestion
// to a model, not a rule in code. That is not compliance; that is a hope.
//
//   US  CAN-SPAM      -- opt-out regime. Honest headers + physical address required.
//   UK  PECR/UK GDPR  -- legitimate interest works for corporate subscribers.
//   AU  Spam Act 2003 -- inferred consent for a published business address in-role.
//   CA  CASL          -- EXCLUDED BY FOUNDER DECISION. Strictest of the four: express or
//                        time-limited implied consent, no broad B2B carve-out, real
//                        penalties. Not sent to until deliberately re-enabled.
//
// FAIL-CLOSED BY CONSTRUCTION: this is an allowlist, and `country IS NULL` can never
// match a SQL IN (...) list. A lead whose geography we never established is unsendable
// without a single extra branch. Unknown is not permission.
const SEND_ALLOWED_COUNTRIES = ['US', 'GB', 'AU'] as const

// Applied to EVERY touch query, not just touch 1. ScrollFuel's 2026-07-12 incident sent
// ~20 garbage emails precisely because touch-2+ paths bypassed a gate that touch 1
// honoured. One list, every path, no exceptions -- passed as a parameter (= ANY) so the
// allowlist above is the ONLY place a country is named. Five inline literals would drift;
// this cannot.
const GEO: string[] = [...SEND_ALLOWED_COUNTRIES]

// PS-INCIDENT-01 CLOSED 2026-07-16 — founder sign-off. All four conditions met and MEASURED:
//
//   1. Fabricator deleted at source. discoverMSPsViaGroq() asked an LLM at temperature 0.7 to
//      "generate real MSP domains" and produced "James Thompson" in Cardiff, Manchester and
//      New York simultaneously. Deleted, not disabled. 3,049 invented rows purged.
//   2. Real discovery live. Google Maps via Outscraper: every lead traces to a listing a human
//      can open, with a real address. 66 real MSPs queued, ~90% ICP hit rate.
//   3. Enrichment MEASURED, not assumed: 23 of 25 = 92% named contacts via AnyMailFinder.
//      My hypothesis was "better than ScrollFuel's 5.4%". The answer was 17x better. MSPs
//      publish their people -- the founder said so days before the data did.
//   4. Geo gate closed end-to-end. country populates from the Maps address (AU 13 / US 8 /
//      null 2). The 2 nulls are unsendable BY CONSTRUCTION: an allowlist cannot match NULL.
//      Canada excluded at DISCOVERY, not just at send (CASL, founder decision).
//
// Zero emails were sent while paused (outreach_sends = 0 for phishsimai across the incident).
// The pause held, and it caught real mistakes twice -- it is why nobody emailed Dr Dennis
// Gross about phishing simulation when ScrollFuel's fabricated leads surfaced in a shared table.
//
// Rails that remain live: DAILY_SEND_LIMIT = 20, the bounce-rate breaker (auto-pause), the
// geo allowlist (fail-closed), and every finder failing LOUD rather than returning a silent
// null. If this needs pausing again, set this back to true -- in CODE, not an env var. The
// July-12 lesson on the other product was an env flag everyone believed was set and never was.
const OUTBOUND_HARD_PAUSED = false

export async function runFullSequence() {
  const sql = getSql()
  if (OUTBOUND_HARD_PAUSED) {
    return { paused: true, hard: true, reason: 'PS-INCIDENT-01: outbound halted pending fabricated-lead audit', sent: 0 }
  }
  const health = await getSequenceHealth(sql)
  if (health.tripped) {
    // A MEASURED, over-threshold bounce rate on the live 7-day window: the funnel is actively
    // breaking. Record an autonomy_incident so the clean-day clock goes DIRTY today — a broken
    // funnel is not a clean day. (A deliberate OUTBOUND_HARD_PAUSED above returned already and is
    // NOT an incident; an empty window below is silence, not a break, and is NOT an incident.)
    await recordIncident(sql, COMPANY_ID, `bounce breaker tripped: ${(health.rate * 100).toFixed(1)}% over ${health.sent} live sends (7d)`, 'aria').catch(() => {})
    await sendTelegram('PHISHSIMAI PAUSE: Bounce rate ' + (health.rate * 100).toFixed(1) + '% >= ' + (PAUSE_ON_BOUNCE_RATE * 100) + '% over ' + health.sent + ' live sends. Sequence halted, incident recorded.')
    return { paused: true, tripped: true, rate: health.rate, sent: 0 }
  }
  if (!health.measured) {
    // No live sends in the 7-day window. Fail closed — no data is not permission — but this is
    // NOT an incident: nothing broke, nothing was sent. The clock is not dirtied by silence.
    return { paused: true, measured: false, reason: 'not_measured: no live sends in 7d window', sent: 0 }
  }

  // PS-AUTONOMY-GATE-UNWIRED-01: the autonomy level now ACTUALLY gates sending. Before this,
  // send_simulation:'l4' lived only in the MIN_LEVEL map and autonomyGate.test.ts — the send path
  // consulted OUTBOUND_HARD_PAUSED and the breaker but never the level, so the gate everyone
  // believed locked sending controlled nothing (the purest Shape-3 instance). Checked AFTER the
  // hard-pause and breaker, so at any level below l4 (including l2) nothing sends even if someone
  // resets the breaker. A denial is a clean pause, not an error.
  try {
    await assertAutonomyAllows('send_simulation', COMPANY_ID)
  } catch (e) {
    if (isAutonomyDenied(e)) {
      return { paused: true, reason: 'autonomy: ' + e.message, sent: 0 }
    }
    throw e
  }

  const now = new Date()
  let totalSent = 0
  const results: any[] = []

  if (totalSent < DAILY_SEND_LIMIT) {
    const exp = AB_EXPERIMENTS.touch1_subject
    const t1Leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
      WHERE country = ANY(${GEO}) AND touch1_sent_at IS NULL AND bounced=false AND unsubscribed=false
      AND pipeline_stage NOT IN ('dead','customer')
      ORDER BY created_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`

    for (const lead of t1Leads) {
      if (totalSent >= DAILY_SEND_LIMIT) break
      try {
        // PS-PORT-01 / SF-DELIV-01: pre-send MX gate. A domain with no MX (or an RFC 7505 null MX)
        // cannot receive mail and bounces 100% — free to check, and the rail that would have caught
        // PhishSim's 6 dead mailboxes (csgnetworks.com, mtd.us…) before they were emailed. No MX ->
        // do not send, mark the lead dead so it never re-enters any touch query, log it.
        const dom = domainOf(String(lead.email))
        if (!dom || !(await hasMx(dom))) {
          const ts = now.toISOString()
          await sql`UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
          console.warn('[sequence] MX gate: no deliverable MX for', lead.email, '- marked dead, not sent')
          continue
        }
        const variant = getVariant(String(lead.id), 'touch1_subject')
        const v = exp.active ? (variant === 'control' ? exp.control : exp.test) : exp.control
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const ind = String(lead.industry || 'technology')
        const subject = v.subject(String(lead.name), String(lead.company))
        // PS-SALUTATION-01: greet with a derived first name from the email, NOT the stored name
        // (which is the Google Maps business title for google_maps leads). deriveFirstName returns
        // "there" when the local part is not a plausible first name — never the business string.
        const greetName = deriveFirstName(String(lead.email))
        const html = v.html(greetName, String(lead.company), ind).replace('{{TOKEN}}', token)
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: '1' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: v.id },
        ], token)
        if (!result?.id) continue
        const ts = now.toISOString()
        await sql`UPDATE ps_outreach_leads SET touch1_sent_at=${ts}, pipeline_stage='prospect', stage_updated_at=${ts} WHERE id=${lead.id}`
        await recordImpression(String(lead.id), 'touch1_subject', variant)
        totalSent++
        results.push({ touch: 1, company: lead.company, email: lead.email, subject, variant })
        await new Promise(r => setTimeout(r, 2000))
      } catch (e: any) {
        await sendTelegram('PS seq error: ' + (e?.message?.slice(0, 80) || ''))
      }
    }
  }

  // PS-COPY-REWRITE-01: no follow-up touches until the founder supplies honest replacements.
  // Empty by design — the loop below is a no-op and only touch-1 above sends.
  const touchDefs: { touch: number; delayDays: number; final?: boolean }[] = []

  for (const def of touchDefs) {
    if (totalSent >= DAILY_SEND_LIMIT) break
    const step = SEQUENCE.find(s => s.touch === def.touch)
    if (!step) continue
    const cutoff = new Date(now.getTime() - def.delayDays * 86400000).toISOString()

    let leads: any[] = []
    if (def.touch === 2) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE country = ANY(${GEO}) AND touch2_sent_at IS NULL AND touch1_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        ORDER BY touch1_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 3) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE country = ANY(${GEO}) AND touch3_sent_at IS NULL AND touch2_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        ORDER BY touch2_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 4) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        ORDER BY touch3_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        ORDER BY touch3_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    }

    for (const lead of leads) {
      if (totalSent >= DAILY_SEND_LIMIT) break
      try {
        // PS-TOUCH-GATE-01 / PS-SALUTATION-01 / PS-COPY-REWRITE-01: touch-2..5 inherit EVERY rail
        // touch-1 has. Built now so re-adding follow-up COPY (SEQUENCE + touchDefs, founder's job)
        // can never ship without them: MX pre-check, derived first-name salutation, and the
        // List-Unsubscribe one-click header. Without this block, follow-ups would repeat the exact
        // bugs touch-1 already fixed. The loop is inert today (touchDefs=[]) — these are dormant rails.
        const dom = domainOf(String(lead.email))
        if (!dom || !(await hasMx(dom))) {
          const ts0 = now.toISOString()
          await sql`UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=${ts0} WHERE id=${lead.id}`
          console.warn('[sequence] MX gate T' + def.touch + ': no MX for', lead.email, '- marked dead, not sent')
          continue
        }
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const ind = String(lead.industry || 'technology')
        const subject = step.subject(deriveFirstName(String(lead.email)), String(lead.company))
        const html = step.html(deriveFirstName(String(lead.email)), String(lead.company), ind, token)
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: String(def.touch) }, { name: 'lead_id', value: String(lead.id) },
        ], token)
        if (!result?.id) continue
        const ts = now.toISOString()
        if (def.touch === 2) await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 3) await sql`UPDATE ps_outreach_leads SET touch3_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 4) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.final) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts}, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
        totalSent++
        results.push({ touch: def.touch, company: lead.company, email: lead.email, subject })
        await new Promise(r => setTimeout(r, 2000))
      } catch (e: any) {
        await sendTelegram('PS seq error T' + def.touch + ': ' + (e?.message?.slice(0, 80) || ''))
      }
    }
  }

  if (totalSent > 0) {
    const lines = results.map((r: any) => 'T' + r.touch + ': ' + r.company + (r.variant ? ' [' + r.variant + ']' : '') + ' - ' + r.subject).join('\n')
    await sendTelegram('PHISHSIMAI ARIA SEQUENCE: ' + totalSent + ' sent\n' + lines)
  }
  await reportAgentRun('aria', totalSent >= 0, { sent: totalSent }, undefined, 'phishsimai').catch(() => {})
  await reportAgentHealth('aria', true, 0, undefined, 'phishsimai').catch(() => {})
  return { sent: totalSent, results, bounceRate: health.rate }
}

export const runSequence = runFullSequence
