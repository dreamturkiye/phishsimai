import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { AB_EXPERIMENTS, getVariant, recordImpression, deriveFirstName } from './abTest'
import { reportAgentRun } from './agentHealth'
import { reportAgentHealth } from './agentHealth_v2'
import { hasMx, domainOf } from './mxGate'
import { assertAutonomyAllows, isAutonomyDenied } from './autonomyGate'
import { COMPANY_ID } from './version'
import { recordIncident } from './cleanDays'
import { FOLLOWUP_TOUCHES, approvedBody } from './outreachCopy'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'
const REPLY_TO = 'sarah@phishsimai.com'
export const DAILY_SEND_LIMIT = 20 // starting cap / floor; effective cap is the warm-up ramp below
export const PAUSE_ON_BOUNCE_RATE = 0.08

// PS-RAMP-01: decided warm-up ramp 20 → 50 → 100/day. Day 1 = RAMP_START. The step cadence is
// explicit and editable here; day 8+ holds at RAMP_MAX. Applied as the per-run cap in
// runFullSequence so no day exceeds it, drawing from the sanitized-clean pool.
const RAMP_START = '2026-07-19' // day 1 at 20/day
// PS-RAMP-HOLD-01 (2026-07-25): RAMP_MAX held at 50, NOT 100. Supply gates the ramp.
//
// Day 8 (2026-07-26) would have stepped to 100/day. Measured that morning:
//   · sendable pool ...... 475 (legacy stock, not a maintained reserve)
//   · sanitizeRefill ..... tops the pool up to dailySendCap() and no further — just-in-time,
//                          zero buffer. At sendable=475 it is currently a no-op.
//   · lead_research_queue  713 pending (newest today — the mymsphub harvester IS feeding it)
//                          but newest 'enriched' row is 2026-07-23: enrichment has been STALLED
//                          for 2 days while the backlog grows.
//
// At 100/day the 475 buffer drains in ~9 days into a JIT system with no margin, where one failed
// refill run (API quota, the 240s time budget, a yield dip) means ZERO sends that day — silently.
// Hold at 50 until enrichment is unstalled and enriched-per-day >= send rate for ~3 consecutive
// days. Raise this back to 100 only with that evidence.
const RAMP_MAX = 50
const RAMP: { throughDay: number; cap: number }[] = [
  { throughDay: 3, cap: 20 }, // days 1-3
  { throughDay: 7, cap: 50 }, // days 4-7
] // day 8+ => RAMP_MAX (50, held — see PS-RAMP-HOLD-01)
export function dailySendCap(now: Date = new Date()): number {
  const start = Date.parse(`${RAMP_START}T00:00:00Z`)
  const dayN = Math.floor((now.getTime() - start) / 86_400_000) + 1 // start day is day 1
  if (dayN < 1) return 0
  for (const step of RAMP) if (dayN <= step.throughDay) return step.cap
  return RAMP_MAX
}

// PS-RAMP-DECOUPLE-01: explicit founder switch for the warm-up ramp, stored in janet_memory so it
// can be flipped without a redeploy. '1' = the founder has authorized the ramp to send under its
// own rails (footer/sanitizer/MX/suppression/cap), decoupled from the earned autonomy level.
export async function isFounderRampEnabled(sql = getSql()): Promise<boolean> {
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY_ID} AND type='operating' AND key='outreach_ramp_enabled' LIMIT 1`.catch(() => [])
  return String((r as any[])[0]?.value ?? '') === '1'
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  tags: { name: string; value: string }[] = [],
  unsubToken?: string,
  text?: string,
  extraHeaders?: Record<string, string>,
) {
  // PS-COPY-REWRITE-01: List-Unsubscribe + one-click (RFC 8058). Gmail/Outlook require these for
  // bulk senders and they directly affect inbox placement. The URL is the same token-based
  // /unsubscribe route the visible footer links to; it must accept POST for one-click (mounted in
  // api/handler.ts). Header sent, verbatim:
  //   List-Unsubscribe: <https://phishsimai.com/unsubscribe?e=TOKEN>
  //   List-Unsubscribe-Post: List-Unsubscribe=One-Click
  const headers: Record<string, string> = { ...(extraHeaders || {}) }
  if (unsubToken) {
    headers['List-Unsubscribe'] = `<https://phishsimai.com/unsubscribe?e=${unsubToken}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html, text, tags, headers }),
  })
  return res.json()
}

// PS-COPY-REWRITE-01 / PS-FOLLOWUP-01: touches 2-5 were DELETED here on 2026-07-24 (invented case
// study "43% → 4%", invented scarcity "2 slots left", unsourced stat "attacks up 48%", dead calendly
// link — 245 delivered, 0 replies) and the empty array left behind was never refilled. That empty
// array WAS the single-touch bug: for 523 sends the sequence had exactly one touch and nothing in
// the system said so. Rebuilt in server/os/outreachCopy.ts as FOLLOWUP_TOUCHES, gated by
// FOLLOWUPS_ARMED + replyCaptureProven() below. This local const is gone deliberately — one home
// for the copy, so "the sequence" can never again be empty in one file and assumed full elsewhere.

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

// ── PS-FOLLOWUP-01: touches 2-5 ──────────────────────────────────────────────
/**
 * ARMING SWITCH — in CODE, not an env var, for the reason stated at PS-INCIDENT-01 above:
 * the 2026-07-12 ScrollFuel lesson was an env flag everyone believed was set and never was.
 *
 * Flip to true ONLY when BOTH are true:
 *   1. The founder has approved copy — APPROVED_VARIANT in outreachCopy.ts is populated.
 *      An unapproved touch is skipped, not defaulted, so a half-filled map is safe.
 *   2. Inbound reply capture is PROVEN to work. This is not a courtesy: with capture dead,
 *      `replied` never flips, so the sequence cannot see a reply and would keep emailing
 *      someone who already answered. That is the single worst thing this system could do to
 *      a real prospect — and at the time of writing, capture has produced zero rows ever.
 *
 * Condition 2 is ALSO enforced at runtime by replyCaptureProven() below, so arming this by
 * itself still cannot send into a blind funnel. Belt and braces, deliberately: the founder's
 * ordering rule ("verify capture BEFORE enabling touches 2-5") is structural, not a note in
 * a doc that a later edit can forget.
 */
const FOLLOWUPS_ARMED = false

/**
 * Has inbound reply capture ever demonstrably worked?
 *
 * "No one replied" and "we cannot receive replies" produce the same zero, and a follow-up
 * sequence is exactly where that ambiguity becomes expensive. Proof is any evidence that a
 * real inbound message reached us: a captured draft, or a lead marked replied. Absence is
 * NOT proof of a working-but-quiet channel — we fail closed and send nothing.
 */
export async function replyCaptureProven(sql = getSql()): Promise<{ proven: boolean; drafts: number; replied: number }> {
  const [d] = await sql`SELECT count(*)::int AS n FROM outreach_reply_drafts`.catch(() => [{ n: 0 }] as any)
  const [r] = await sql`SELECT count(*)::int AS n FROM ps_outreach_leads WHERE replied=true`.catch(() => [{ n: 0 }] as any)
  const drafts = Number(d?.n ?? 0), replied = Number(r?.n ?? 0)
  return { proven: drafts > 0 || replied > 0, drafts, replied }
}

// Touch 5 gets its OWN column. The dormant code reused touch4_sent_at for it, so touch 4
// and touch 5 selected the identical population (both keyed off `touch4_sent_at IS NULL AND
// touch3_sent_at < cutoff`) and touch 5 overwrote touch 4's timestamp. Nobody caught it
// because the loop never ran — a dormant bug in dormant code, waiting for the day it was armed.
async function ensureFollowUpColumns(sql: any) {
  // Additive and idempotent, matching ensureReplyTables()'s pattern.
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS touch5_sent_at TIMESTAMPTZ`.catch(() => {})
  // Threading state, captured at touch-1 send so follow-ups can reply ON the original thread.
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS thread_msgid TEXT`.catch(() => {})
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS touch1_subject TEXT`.catch(() => {})
  // Manual override: a human can pull one lead out of the sequence without touching the
  // per-touch timestamps the selector reads.
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS sequence_stopped_at TIMESTAMPTZ`.catch(() => {})
}

/**
 * Our own RFC Message-ID for touch 1, so later touches can quote it in In-Reply-To /
 * References and land in the same conversation rather than as a fresh cold email.
 *
 * ⚠️ The 523 leads contacted before this shipped have thread_msgid NULL — their real
 * Message-IDs were Resend's and were never recorded, so they CANNOT be threaded. They
 * receive a standalone follow-up under the touch's own subject instead of "Re: …".
 * Faking a Re: on a thread the recipient's client cannot find is worse than not threading.
 */
export function threadMessageId(leadId: string): string {
  return `<ps-${leadId}-t1@phishsimai.com>`
}

/**
 * Eligible leads for one follow-up touch.
 *
 * Written out per touch rather than interpolating a column name, because the column IS the
 * logic here and the one time it was parameterised loosely (the dormant `else` branch) touch
 * 5 silently inherited touch 4's population. Explicit is the point.
 *
 * The stop conditions are identical in every branch and are the ONLY place they live:
 *   replied=false      → a lead who answered leaves the sequence immediately
 *   bounced=false      → never re-mail a hard bounce
 *   unsubscribed=false → never re-mail an opt-out
 *   stage NOT IN (dead, customer)
 * `sequence_stopped_at IS NULL` lets a human pull one lead out by hand without editing rows
 * the sequence also reads.
 */
async function selectFollowUpLeads(sql: any, touch: number, cutoff: string, limit: number): Promise<any[]> {
  // NOTE: every query is written out in full. This client does not splice nested template
  // fragments — a `sql`…`` embedded in another `sql`…`` is passed as a PARAMETER, not spliced
  // as SQL — so a shared `guard` fragment would silently become a bind value and the stop
  // conditions would vanish from the WHERE clause. Repetition here is correctness, not sloppiness.
  if (limit <= 0) return []
  switch (touch) {
    case 2: return await sql`SELECT id, name, company, email, thread_msgid, touch1_subject
      FROM ps_outreach_leads
      WHERE touch2_sent_at IS NULL AND touch1_sent_at IS NOT NULL AND touch1_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false AND sequence_stopped_at IS NULL
        AND pipeline_stage NOT IN ('dead','customer') AND country = ANY(${GEO})
      ORDER BY touch1_sent_at ASC LIMIT ${limit}`
    case 3: return await sql`SELECT id, name, company, email, thread_msgid, touch1_subject
      FROM ps_outreach_leads
      WHERE touch3_sent_at IS NULL AND touch2_sent_at IS NOT NULL AND touch2_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false AND sequence_stopped_at IS NULL
        AND pipeline_stage NOT IN ('dead','customer') AND country = ANY(${GEO})
      ORDER BY touch2_sent_at ASC LIMIT ${limit}`
    case 4: return await sql`SELECT id, name, company, email, thread_msgid, touch1_subject
      FROM ps_outreach_leads
      WHERE touch4_sent_at IS NULL AND touch3_sent_at IS NOT NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false AND sequence_stopped_at IS NULL
        AND pipeline_stage NOT IN ('dead','customer') AND country = ANY(${GEO})
      ORDER BY touch3_sent_at ASC LIMIT ${limit}`
    case 5: return await sql`SELECT id, name, company, email, thread_msgid, touch1_subject
      FROM ps_outreach_leads
      WHERE touch5_sent_at IS NULL AND touch4_sent_at IS NOT NULL AND touch4_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false AND sequence_stopped_at IS NULL
        AND pipeline_stage NOT IN ('dead','customer') AND country = ANY(${GEO})
      ORDER BY touch4_sent_at ASC LIMIT ${limit}`
    default: return []
  }
}

/**
 * Record a sent touch. Touch 5 is terminal: the lead is marked dead, which is what makes the
 * breakup email's "this is my last email" a fact about the system rather than a sales line.
 */
async function markTouchSent(sql: any, touch: number, leadId: string, ts: string): Promise<void> {
  switch (touch) {
    case 2: await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts} WHERE id=${leadId}`; return
    case 3: await sql`UPDATE ps_outreach_leads SET touch3_sent_at=${ts} WHERE id=${leadId}`; return
    case 4: await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts} WHERE id=${leadId}`; return
    case 5: await sql`UPDATE ps_outreach_leads SET touch5_sent_at=${ts}, pipeline_stage='dead',
              stage_updated_at=${ts} WHERE id=${leadId}`; return
  }
}

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
  // PS-RAMP-DECOUPLE-01: the founder-directed warm-up ramp is NOT an autonomous action — it is an
  // explicit founder operation with its own rails (footer + sanitizer + MX + suppression + cap).
  // When the founder flag is ON it sends independent of the EARNED autonomy level (which gates
  // Janet's AUTONOMOUS sends). Autonomous callers (flag OFF) still require send_simulation >= l4.
  const founderRamp = await isFounderRampEnabled(sql).catch(() => false)
  if (!founderRamp) {
    try {
      await assertAutonomyAllows('send_simulation', COMPANY_ID)
    } catch (e) {
      if (isAutonomyDenied(e)) {
        return { paused: true, reason: 'autonomy: ' + e.message, sent: 0 }
      }
      throw e
    }
  }

  const now = new Date()
  const cap = dailySendCap(now) // PS-RAMP-01: today's warm-up cap (20 → 50 → 100)
  let totalSent = 0
  const results: any[] = []

  await ensureFollowUpColumns(sql)

  // ── FOLLOW-UPS (touches 2-5) — run BEFORE touch 1, deliberately ────────────
  //
  // They share ONE daily cap with touch 1 rather than adding to it. That is the
  // founder's deliverability rule made structural: turning on four more touches must
  // not multiply daily volume against a domain still inside its warm-up ramp. Because
  // follow-ups draw first, touch-1 volume falls automatically as the sequence fills up
  // — which is also the right business order. A second email to someone who already
  // heard from us is worth more than a first email to a stranger.
  const followUpState = await replyCaptureProven(sql).catch(() => ({ proven: false, drafts: 0, replied: 0 }))
  const armed = FOLLOWUPS_ARMED && followUpState.proven
  if (FOLLOWUPS_ARMED && !followUpState.proven) {
    // Loud, because this is the exact failure mode the gate exists to prevent: the
    // founder armed the sequence but inbound capture is still dead, so `replied` can
    // never flip and we would keep emailing people who have already answered.
    console.warn('[sequence] follow-ups ARMED but reply capture UNPROVEN — refusing to send touches 2-5')
    await sendTelegram(
      '⛔ <b>Follow-ups blocked</b>\nTouches 2-5 are armed, but inbound reply capture has never received ' +
      'anything (0 drafts, 0 replied leads). Sending now risks emailing prospects who already replied. ' +
      'Verify the inbound relay, then re-run.',
    ).catch(() => {})
  }

  if (armed) {
    for (const t of FOLLOWUP_TOUCHES) {
      if (totalSent >= cap) break
      const body = approvedBody(t)
      if (!body) continue // no approved variant for this touch — skip, never default
      const cutoff = new Date(now.getTime() - t.delayDays * 86400000).toISOString()
      const room = cap - totalSent

      const leads = await selectFollowUpLeads(sql, t.touch, cutoff, room).catch((e: any) => {
        console.error(`[sequence] T${t.touch} lead select failed:`, e?.message || e)
        return [] as any[]
      })

      for (const lead of leads) {
        if (totalSent >= cap) break
        try {
          // PS-TOUCH-GATE-01 / PS-SALUTATION-01: every rail touch 1 has, touch 2-5 inherit —
          // MX pre-check, derived first-name salutation, List-Unsubscribe one-click header.
          const dom = domainOf(String(lead.email))
          if (!dom || !(await hasMx(dom))) {
            const ts0 = now.toISOString()
            await sql`UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=${ts0} WHERE id=${lead.id}`
            console.warn(`[sequence] MX gate T${t.touch}: no MX for`, lead.email, '- marked dead, not sent')
            continue
          }
          const token = Buffer.from(String(lead.email)).toString('base64url')
          const greetName = deriveFirstName(String(lead.email))
          const co = String(lead.company || 'your team')

          // Thread onto the original conversation when we recorded its Message-ID. Legacy
          // leads (contacted before threading shipped) have none — they get a standalone
          // email under this touch's own subject rather than a "Re:" the recipient's client
          // cannot resolve to any thread.
          const parentId = lead.thread_msgid ? String(lead.thread_msgid) : null
          const canThread = t.threaded && !!parentId && !!lead.touch1_subject
          const subject = canThread
            ? `Re: ${String(lead.touch1_subject)}`
            : body.subject(co)
          const threadHeaders = canThread
            ? { 'In-Reply-To': parentId!, References: parentId! }
            : undefined

          const html = body.html(greetName, co).replace(/{{TOKEN}}/g, token)
          const text = body.text(greetName, co).replace(/{{TOKEN}}/g, token)
          const result = await sendEmail(String(lead.email), subject, html, [
            { name: 'touch', value: String(t.touch) },
            { name: 'lead_id', value: String(lead.id) },
            { name: 'variant', value: body.id },
          ], token, text, threadHeaders)
          if (!result?.id) continue

          await markTouchSent(sql, t.touch, String(lead.id), now.toISOString())
          totalSent++
          results.push({ touch: t.touch, company: lead.company, email: lead.email, subject, variant: body.id })
          await new Promise(r => setTimeout(r, 2000))
        } catch (e: any) {
          await sendTelegram(`PS seq error T${t.touch}: ` + (e?.message?.slice(0, 80) || ''))
        }
      }
    }
  }

  if (totalSent < cap) {
    const exp = AB_EXPERIMENTS.touch1_subject
    const t1Leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
      WHERE country = ANY(${GEO}) AND touch1_sent_at IS NULL AND bounced=false AND unsubscribed=false
      AND sanitized_at IS NOT NULL
      AND pipeline_stage NOT IN ('dead','customer')
      ORDER BY created_at ASC LIMIT ${cap - totalSent}`

    for (const lead of t1Leads) {
      if (totalSent >= cap) break
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
        const html = v.html(greetName, String(lead.company), ind).replace(/{{TOKEN}}/g, token)
        const text = v.text(greetName, String(lead.company), ind).replace(/{{TOKEN}}/g, token)
        // PS-FOLLOWUP-01: stamp OUR OWN Message-ID so touches 2-5 can reply on this thread.
        // Resend does not surface the RFC Message-ID it generates, so a header we control is
        // the only way to thread later. Derived from the lead id — same input, same id, always.
        const msgId = threadMessageId(String(lead.id))
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: '1' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: v.id },
        ], token, text, { 'Message-ID': msgId })
        if (!result?.id) continue
        const ts = now.toISOString()
        await sql`UPDATE ps_outreach_leads SET touch1_sent_at=${ts}, pipeline_stage='prospect',
          stage_updated_at=${ts}, thread_msgid=${msgId}, touch1_subject=${subject} WHERE id=${lead.id}`
        await recordImpression(String(lead.id), 'touch1_subject', variant)
        totalSent++
        results.push({ touch: 1, company: lead.company, email: lead.email, subject, variant })
        await new Promise(r => setTimeout(r, 2000))
      } catch (e: any) {
        await sendTelegram('PS seq error: ' + (e?.message?.slice(0, 80) || ''))
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
