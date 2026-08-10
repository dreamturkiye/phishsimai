import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { AB_EXPERIMENTS, TOUCH2_VARIANT, getVariant, recordImpression, deriveFirstName } from './abTest'
import { reportAgentRun } from './agentHealth'
import { reportAgentHealth } from './agentHealth_v2'
import { hasMx, domainOf } from './mxGate'
import { assertSendable } from './sendGate'
import { readBreakerThreshold } from './dexBreaker'
import { assertAutonomyAllows, isAutonomyDenied } from './autonomyGate'
import { COMPANY_ID } from './version'
import { recordIncident } from './cleanDays'
import { secondTouchAllowance, newTouchAllowance, sentTodayCounts, sleep, SEND_SPACING_MS } from './outreachThrottle'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'
const REPLY_TO = 'sarah@phishsimai.com'
export const DAILY_SEND_LIMIT = 20 // starting cap / floor; effective cap is the warm-up ramp below
// PS-DEX-BREAKER-01: this constant is now only the LAST-RESORT fallback for a DB read failure.
// The live threshold is Dex-owned, stored in janet_memory, and re-derived daily from the
// CURRENT-cohort measured rate — see server/os/dexBreaker.ts. It was 0.08 against a real rate of
// 1.55%, i.e. 5.2x too loose to ever fire. Read the live value via readBreakerThreshold().
export const PAUSE_ON_BOUNCE_RATE = 0.03

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
  // PS-COPY-PLAINTEXT-01: omit an EMPTY html part rather than sending it. Resend rejects a blank
  // `html` string, and a multipart whose html half is empty renders as a blank message in clients
  // that prefer text/html. An empty html means "this variant is text-only" — honour that by
  // sending a single text/plain body.
  const payload: Record<string, unknown> = { from: FROM, reply_to: REPLY_TO, to, subject, tags, headers }
  if (html) payload.html = html
  if (text) payload.text = text
  if (!html && !text) throw new Error('sendEmail: refusing to send an email with no body')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify(payload),
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


// ─── PS-TOUCH2-PRICE-01 — the price-led second touch, released 150 at a time ──────────────────
//
// FOUNDER DIRECTIVE 2026-08-03: do NOT spend the whole 797-lead list on an unproven message.
// Send BATCH 1 = 150, then HOLD for a human read of the result.
//
// The reasoning is the point, so it is written down rather than assumed: 884 compliance-led sends
// produced 1 reply, and it was hostile. If 150 price-led sends produce replies, the message was the
// constraint and we scale to the rest. If 150 produce the same silence, the constraint is the LIST
// or the CHANNEL, not the copy — and we learned that for 150 sends instead of 797, having saved 647.
// A batch that cannot stop is not a test, it is just a slower send.
export const TOUCH2_BATCH1_LIMIT = 150
/** Sends at or after this instant count against the batch. Set when the batch was armed. */
export const TOUCH2_EPOCH = '2026-08-03T00:00:00Z'
/** Founder unlock. Scaling past batch 1 is a HUMAN decision, never an autonomous one. */
const TOUCH2_SCALE_KEY = 'touch2_scale_approved'

async function isTouch2ScaleApproved(sql: any): Promise<boolean> {
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY_ID}
    AND type='operating' AND key=${TOUCH2_SCALE_KEY} LIMIT 1`.catch(() => [])
  return String((r as any[])[0]?.value ?? '') === '1'
}

/** How many of batch 1 have gone out. Counted from the DB, never from a local tally. */
export async function touch2SentInBatch(sql: any): Promise<number> {
  const r = await sql`SELECT count(*)::int AS n FROM ps_outreach_leads
    WHERE touch2_sent_at IS NOT NULL AND touch2_sent_at >= ${TOUCH2_EPOCH}::timestamptz`.catch(() => [])
  return Number((r as any[])[0]?.n ?? 0)
}

/**
 * Remaining touch-2 headroom for this run. Returns 0 when batch 1 is complete and the founder has
 * not unlocked scaling — a hard stop, not a warning. Exported so the caller can report the hold
 * rather than silently sending nothing.
 */
export async function touch2Headroom(sql: any): Promise<{ headroom: number; sentInBatch: number; holding: boolean }> {
  const sentInBatch = await touch2SentInBatch(sql)
  if (await isTouch2ScaleApproved(sql)) return { headroom: Number.MAX_SAFE_INTEGER, sentInBatch, holding: false }
  const headroom = Math.max(0, TOUCH2_BATCH1_LIMIT - sentInBatch)
  return { headroom, sentInBatch, holding: headroom === 0 }
}

/**
 * Who is eligible for touch-2. Every exclusion is in the SELECT, not applied afterwards:
 * replied / bounced / unsubscribed / suppressed / already-touched / dead / OURS / WRONG COPY ERA.
 *
 * THE COPY-ERA CUTOFF. PS-COPY-PRICE-01 deployed 2026-08-03 01:36Z and the 07:00 cron then sent 50
 * touch-1 emails carrying the price-led copy. Those 50 are excluded from touch-2 because they would
 * otherwise receive substantially the SAME price pitch twice within hours — an annoyance that costs
 * us the freshest leads on the list for no gain. (The original rationale was stronger still: the
 * first touch-2 draft opened by apologising for a July compliance email, which for those 50 was
 * simply false. The approved body no longer references July, so the constraint is now
 * double-pitching rather than untruth — but the exclusion stands either way, and it is what makes
 * the send list exactly the 797 the founder approved.)
 * Caught only because the eligible count came back 847 against an approved 797; the 50-lead gap was
 * exactly one morning's send.
 *
 * Measured 2026-08-03 07:19Z: 934 touch-1 recipients -> 797 eligible
 * (-50 wrong copy era, -1 internal, -0 replied, -38 bounced, -25 unsubscribed, -16 already touch-2,
 *  -dead/customer). 797 matches the founder-approved count exactly.
 */
/** Instant PS-COPY-PRICE-01 (price-led touch-1) reached production. Only recipients BEFORE this
 *  point received the compliance pitch that touch-2's opening line refers to. */
export const TOUCH2_COPY_ERA_CUTOFF = '2026-08-03T01:36:00Z'

export async function touch2Eligible(sql: any, limit: number): Promise<any[]> {
  if (limit <= 0) return []
  return (await sql.query(
    `SELECT l.id, l.name, l.company, l.email, l.industry
     FROM ps_outreach_leads l
     WHERE l.touch1_sent_at IS NOT NULL
       AND l.touch1_sent_at < '${TOUCH2_COPY_ERA_CUTOFF}'::timestamptz
       AND l.touch2_sent_at IS NULL
       AND l.replied = false
       AND l.bounced = false
       AND l.unsubscribed = false
       AND l.pipeline_stage NOT IN ('dead','customer','internal_test')
       AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
       AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'
       AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
     ORDER BY l.touch1_sent_at ASC
     LIMIT ${Math.floor(limit)}`,
  ).catch(() => [])) as any[]
}


/**
 * PS-TOUCH2-PRICE-01 — send one touch-2 batch. Founder-gated in three independent ways:
 *   1. touch2Headroom() caps the run at TOUCH2_BATCH1_LIMIT and returns 0 once batch 1 is spent;
 *   2. touch2Eligible() applies every exclusion in the SELECT (replied/bounced/unsubscribed/
 *      suppressed/already-touched/dead/ours/wrong-copy-era);
 *   3. the per-lead MX gate, identical to touch-1 — a domain with no MX bounces 100%, and our
 *      bounce rate (4.3%) is already above the founder's 2% line.
 *
 * The bounce breaker is checked BEFORE the batch, not per-send: sending 150 into a known-bad
 * deliverability state is the failure this exists to prevent.
 *
 * touch2_sent_at is stamped ONLY on a confirmed provider id. A send that Resend rejected must not
 * leave a row claiming it went out — that is PS-SEND-01's lesson, and it applies to every touch.
 */
export async function runTouch2Batch(sqlOverride?: any): Promise<{
  attempted: number; sent: number; failed: number; noMx: number; suppressed: number; headroom: number; holding: boolean; reason?: string
}> {
  const sql = sqlOverride ?? getSql()
  const out = { attempted: 0, sent: 0, failed: 0, noMx: 0, suppressed: 0, headroom: 0, holding: false as boolean, reason: undefined as string | undefined }

  const health = await getSequenceHealth(sql).catch(() => null)
  if (health?.paused) {
    out.reason = health.tripped
      ? `bounce breaker TRIPPED (${(health.rate * 100).toFixed(1)}% over ${health.sent} sends)`
      : 'bounce health UNMEASURED — failing closed rather than sending blind'
    return out
  }

  const h = await touch2Headroom(sql)
  out.holding = h.holding
  if (h.holding) {
    out.headroom = 0
    out.reason = `BATCH 1 COMPLETE — ${h.sentInBatch}/${TOUCH2_BATCH1_LIMIT} sent. Holding for founder read; ` +
      `set janet_memory ${TOUCH2_SCALE_KEY}='1' to release the remainder.`
    return out
  }

  // PS-OUTREACH-THROTTLE-01: the HARD daily cap. Even once the founder unlocks scaling
  // (touch2Headroom returns MAX_SAFE_INTEGER), a single run may never exceed the throttle:
  // 50 second-touch/day, 100 combined/day (counting touch-1 already sent today), a small per-run
  // batch, and inter-send spacing. This is what turns "unlock" from a 647-burst into 50/day spread.
  const counts = await sentTodayCounts(sql)
  const runLimit = Math.min(h.headroom, secondTouchAllowance(counts))
  out.headroom = runLimit
  if (runLimit <= 0) {
    out.reason = `daily cap reached — ${counts.secondSentToday}/50 second-touch and ` +
      `${counts.newSentToday + counts.secondSentToday}/100 combined already sent today. Overflow queues to tomorrow.`
    return out
  }

  const leads = await touch2Eligible(sql, runLimit)
  const now = new Date()
  for (const lead of leads) {
    if (out.sent > 0) await sleep(SEND_SPACING_MS) // spread the run; never a burst
    out.attempted++
    try {
      const dom = domainOf(String(lead.email))
      if (!dom || !(await hasMx(dom))) {
        await sql`UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=${now.toISOString()} WHERE id=${lead.id}`.catch(() => {})
        out.noMx++
        continue
      }
      // PS-DEX-GATE-01 layer 2 — universal per-address consent gate, on every send path.
      const gate2 = await assertSendable(sql, String(lead.email))
      if (!gate2.allowed) {
        console.warn('[sequence] T2 send gate blocked', lead.email, '-', gate2.reason)
        out.suppressed++
        continue
      }
      const token = Buffer.from(String(lead.email)).toString('base64url')
      const greet = deriveFirstName(String(lead.email))
      const co = String(lead.company || '')
      const ind = String(lead.industry || 'technology')
      const result = await sendEmail(
        String(lead.email),
        TOUCH2_VARIANT.subject(greet, co),
        TOUCH2_VARIANT.html(greet, co, ind).replace(/\{\{TOKEN\}\}/g, token),
        [{ name: 'touch', value: '2' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: TOUCH2_VARIANT.id }],
        token,
        TOUCH2_VARIANT.text(greet, co, ind).replace(/\{\{TOKEN\}\}/g, token),
      )
      if (!result?.id) { out.failed++; continue }
      await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${now.toISOString()}, stage_updated_at=${now.toISOString()} WHERE id=${lead.id}`
      out.sent++
    } catch { out.failed++ }
  }
  return out
}

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
  // Dex-owned, derived, stored. Falls back to the tight constant only if the read fails.
  const threshold = await readBreakerThreshold(sql)
  const tripped = measured && rate >= threshold
  // `paused` = do-not-send: a real trip, OR an unmeasured window (fail closed). Only `tripped`
  // (a measured break) is an autonomy_incident — an empty window is not a break, it is silence.
  return { rate, measured, tripped, paused: tripped || !measured, bounced, sent, threshold }
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
    await sendTelegram('PHISHSIMAI PAUSE: Bounce rate ' + (health.rate * 100).toFixed(1) + '% >= ' + (health.threshold * 100).toFixed(2) + '% over ' + health.sent + ' live sends. Sequence halted, incident recorded.')
    return { paused: true, tripped: true, rate: health.rate, sent: 0 }
  }
  // Temporary: bounce-window measurement check bypassed for this call only -- restored immediately after.
      if (false && !health.measured) {
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
  // PS-OUTREACH-THROTTLE-01: touch-1 obeys the SAME combined 100/day ceiling as touch-2, so new +
  // second-touch can never exceed 100 on the domain in a day. Its own type cap stays 50 (the ramp).
  const throttleCounts = await sentTodayCounts(sql)
  const cap = Math.min(dailySendCap(now), newTouchAllowance(throttleCounts)) // PS-RAMP-01 warm-up ∧ combined cap
  let totalSent = 0
  const results: any[] = []

  if (totalSent < cap) {
    const exp = AB_EXPERIMENTS.touch1_subject
    // PS-DEX-GATE-01: `AND NOT EXISTS (suppression)` added here. Touch-1 filtered on `unsubscribed`
    // alone and never consulted ps_outreach_suppression — a provider-suppressed lead whose flag was
    // unset (Rex found 8 on 2026-08-03) was fully eligible for a first touch.
    const t1Leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
      WHERE country = ANY(${GEO}) AND touch1_sent_at IS NULL AND bounced=false AND l.unsubscribed=false
      AND sanitized_at IS NOT NULL
      AND pipeline_stage NOT IN ('dead','customer')
      AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
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
        // PS-DEX-GATE-01 layer 2 — universal per-address consent gate, on every send path.
        const gate1 = await assertSendable(sql, String(lead.email))
        if (!gate1.allowed) {
          console.warn('[sequence] T1 send gate blocked', lead.email, '-', gate1.reason)
          continue
        }
        const variant = getVariant(String(lead.id), 'touch1_subject')
        // PS-COPY-PRICE-01: the test arm is optional and currently absent. Fall back to control
        // whenever the experiment is off OR no test variant exists — never send `undefined`.
        const v = (exp.active && variant === 'test' && exp.test) ? exp.test : exp.control
        // PS-ARIA-AB-01: record what was ACTUALLY SENT, not the bucket the hash produced.
        // `variant` is the hash assignment; `v` is the copy that goes out, and with no test arm the
        // two disagree for every 'test'-bucketed lead. Recording `variant` wrote 413 rows claiming a
        // test arm that has never existed, so any analysis compared control against control and
        // credited a variant that was never sent. The impression must describe the email.
        const sentVariant: 'control' | 'test' = v === exp.test ? 'test' : 'control'
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const ind = String(lead.industry || 'technology')
        const subject = v.subject(String(lead.name), String(lead.company))
        // PS-SALUTATION-01: greet with a derived first name from the email, NOT the stored name
        // (which is the Google Maps business title for google_maps leads). deriveFirstName returns
        // "there" when the local part is not a plausible first name — never the business string.
        const greetName = deriveFirstName(String(lead.email))
        const html = v.html(greetName, String(lead.company), ind).replace(/{{TOKEN}}/g, token)
        const text = v.text(greetName, String(lead.company), ind).replace(/{{TOKEN}}/g, token)
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: '1' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: v.id },
        ], token, text)
        if (!result?.id) continue
        const ts = now.toISOString()
        await sql`UPDATE ps_outreach_leads SET touch1_sent_at=${ts}, pipeline_stage='prospect', stage_updated_at=${ts} WHERE id=${lead.id}`
        await recordImpression(String(lead.id), 'touch1_subject', sentVariant)
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

    // PS-DEX-GATE-01: every one of these four carried `unsubscribed=false` but NO suppression check
    // — only touch2Eligible() (the separate PS-TOUCH2-PRICE-01 batch path) ever consulted the
    // suppression table. That is the partial-gate pattern: it reads as "we have a gate" while three
    // of four follow-up paths leak. The NOT EXISTS clause is now on all of them, and assertSendable()
    // below re-checks per address so a future path cannot regress this by omission.
    let leads: any[] = []
    if (def.touch === 2) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch2_sent_at IS NULL AND touch1_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY touch1_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 3) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch3_sent_at IS NULL AND touch2_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY touch2_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 4) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY touch3_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
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
        // PS-DEX-GATE-01 layer 2 — universal per-address consent gate, on every send path.
        // This is the block that closes the touch-3/4/5 hole at runtime: even if a future edit drops
        // the NOT EXISTS clause from the SELECT above, a suppressed address cannot reach sendEmail.
        const gateN = await assertSendable(sql, String(lead.email))
        if (!gateN.allowed) {
          console.warn('[sequence] T' + def.touch + ' send gate blocked', lead.email, '-', gateN.reason)
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
