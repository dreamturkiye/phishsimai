import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { AB_EXPERIMENTS, TOUCH2_VARIANT, getVariant, recordImpression, deriveFirstName, computeAdaptiveSplit, splitByWeight, CANSPAM_TEXT } from './abTest'
import { reportAgentRun } from './agentHealth'
import { reportAgentHealth } from './agentHealth_v2'
import { hasMx, domainOf } from './mxGate'
import { assertSendable } from './sendGate'
import { readBreakerThreshold } from './dexBreaker'
import { assertAutonomyAllows, isAutonomyDenied } from './autonomyGate'
import { COMPANY_ID } from './version'
import { recordIncident } from './cleanDays'
import { secondTouchAllowance, newTouchAllowance, sentTodayCounts, sleep, SEND_SPACING_MS, COMBINED_DAILY_CAP } from './outreachThrottle'
import { randomUUID } from 'node:crypto'
import { isOperatingCrisis } from './cgoMandate'
import { measureTrueOrgCounts } from './trueTrials'
import {
  DRAIN_STALE_MARK_CAP,
  FOLLOWUP_DAILY_CAP,
  TOUCH2_COPY_ERA_CUTOFF,
  TOUCH2_POST_ERA_BATCH1_LIMIT,
  TOUCH2_POST_ERA_EPOCH,
  TOUCH2_POST_ERA_SCALE_KEY,
  countSequenceBacklog,
  followUpHourlySlice,
  postCutoffBatchHeadroom,
  secondTouchCopyKind,
  shouldCrisisUnlockTouch2,
  shouldPauseTouch1,
  type SequenceBacklogCensus,
} from './sequenceBacklog'

export { TOUCH2_COPY_ERA_CUTOFF, TOUCH2_POST_ERA_EPOCH, TOUCH2_POST_ERA_BATCH1_LIMIT } from './sequenceBacklog'

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

// PS-OPEN-TRACK-01: 1x1 pixel pointed at the route in server/os/trackOpen.ts, which decodes this
// same token (decodeUnsubToken) back to the lead's email and stamps open_count/first_opened_at/
// last_opened_at on ps_outreach_leads (see drizzle/pg/0030_ps_outreach_leads_open_tracking.sql).
function withOpenPixel(html: string, token: string): string {
  const pixel = `<img src="https://phishsimai.com/api/os/open?e=${token}" width="1" height="1" alt="" style="display:none" border="0">`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, pixel + '</body>') : html + pixel
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  tags: { name: string; value: string }[] = [],
  unsubToken?: string,
  text?: string,
  idempotencyKey?: string,
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
  // PS-OPEN-TRACK-01: pixel goes into the HTML part only, keyed off the same unsubToken every
  // touch already computes. Plain-text sends (touch-1/touch-2's current copy, PS-COPY-PLAINTEXT-01)
  // have no html here and are untouched — this must never force a text-only send into multipart.
  if (html) payload.html = unsubToken ? withOpenPixel(html, unsubToken) : html
  if (text) payload.text = text
  if (!html && !text) throw new Error('sendEmail: refusing to send an email with no body')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  })
  return res.json()
}

export function sequenceIdempotencyKey(leadId: string, touch: number): string {
  return `phishsimai:outreach:${leadId}:touch:${touch}`
}

type SequenceSendClaim = {
  claimed: boolean
  claimToken: string | null
  providerMessageId: string | null
}

let sequenceOutboxReady = false

/** Mirrors drizzle/pg/0031_agent_safety_containment.sql so a send cron never depends on Marcus applying the file. */
export async function ensureSequenceOutbox(sql: any = getSql()): Promise<void> {
  if (sequenceOutboxReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS outreach_sequence_outbox (
      idempotency_key TEXT PRIMARY KEY,
      lead_id UUID NOT NULL,
      touch INTEGER NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      claim_token UUID,
      claim_expires_at TIMESTAMPTZ,
      provider_message_id TEXT,
      last_error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  await sql`
    CREATE INDEX IF NOT EXISTS outreach_sequence_outbox_retry_idx
      ON outreach_sequence_outbox (claim_expires_at)
      WHERE provider_message_id IS NULL`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outreach_sequence_outbox_provider_id_uniq
      ON outreach_sequence_outbox (provider_message_id)
      WHERE provider_message_id IS NOT NULL`
  sequenceOutboxReady = true
}

export async function claimSequenceSend(
  sql: any,
  leadId: string,
  touch: number,
  recipient: string,
): Promise<SequenceSendClaim> {
  await ensureSequenceOutbox(sql)
  const key = sequenceIdempotencyKey(leadId, touch)
  const claimToken = randomUUID()
  const claimed = await sql`
    INSERT INTO outreach_sequence_outbox
      (idempotency_key, lead_id, touch, recipient, status, claim_token, claim_expires_at, attempts)
    VALUES
      (${key}, ${leadId}::uuid, ${touch}, ${recipient}, 'sending', ${claimToken}::uuid,
       NOW() + INTERVAL '15 minutes', 1)
    ON CONFLICT (idempotency_key) DO UPDATE
    SET status='sending',
        claim_token=EXCLUDED.claim_token,
        claim_expires_at=EXCLUDED.claim_expires_at,
        attempts=outreach_sequence_outbox.attempts + 1,
        updated_at=NOW()
    WHERE outreach_sequence_outbox.provider_message_id IS NULL
      AND (outreach_sequence_outbox.claim_expires_at IS NULL
           OR outreach_sequence_outbox.claim_expires_at <= NOW())
    RETURNING claim_token::text AS claim_token, provider_message_id`

  if ((claimed as any[])[0]?.claim_token === claimToken) {
    return { claimed: true, claimToken, providerMessageId: null }
  }

  const existing = await sql`
    SELECT provider_message_id
    FROM outreach_sequence_outbox
    WHERE idempotency_key=${key}
    LIMIT 1`
  return {
    claimed: false,
    claimToken: null,
    providerMessageId: String((existing as any[])[0]?.provider_message_id || '') || null,
  }
}

export async function completeSequenceSend(
  sql: any,
  leadId: string,
  touch: number,
  claimToken: string,
  providerMessageId: string,
): Promise<void> {
  const updated = await sql`
    UPDATE outreach_sequence_outbox
    SET status='sent', provider_message_id=${providerMessageId},
        claim_token=NULL, claim_expires_at=NULL, last_error=NULL, updated_at=NOW()
    WHERE idempotency_key=${sequenceIdempotencyKey(leadId, touch)}
      AND claim_token=${claimToken}::uuid
    RETURNING idempotency_key`
  if (!(updated as any[]).length) {
    throw new Error(`sequence outbox claim lost before provider id persisted: ${leadId}/touch-${touch}`)
  }
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
  /** PS-FOLLOWUP-COPY-01: plain-text body. html stays '' — see PS-COPY-PLAINTEXT-01. */
  text: (name: string, co: string) => string
  /** Last touch in the ladder; nothing follows it. */
  final?: boolean
}[] = [
  // ── Touch 3 — value re-frame, price-led ──────────────────────────────────────
  // Founder-approved 2026-08-24: lead with price, ten-minute setup, fully automated,
  // and the one-click trial link in the body so registering takes a single click.
  // Every figure below traces to priceClaims.generated.json (Starter $149, Growth $299 /
  // 500 users = 60c, Pro $749 / 2,500 = 30c) and to the founder feature matrix. Nothing
  // comparative ("cheapest in market") — the flat-vs-per-seat math is the argument.
  // TOUCH 2 IS DELIBERATELY ABSENT: it has its own batch path (PS-TOUCH2-PRICE-01,
  // cronSequenceTouch2) and adding it here would send it twice.
  {
    touch: 3,
    delayDays: 5,
    subject: () => 'Still $299/mo for 5 clients — 10 minutes to set up',
    html: () => '',
    text: (name: string) => `Hi ${name},

Quick recap in case the timing was wrong before.

PhishSim AI is flat MSP pricing, never per seat: $149/mo for your first client, $299/mo for five clients and 500 users — about 60 cents a user, dropping to 30 cents on Pro. Add a client and your margin widens instead of shrinking.

Setup is about ten minutes for one client. After that it runs itself: simulations fire on schedule, training goes out the moment someone clicks, and the per-tenant evidence builds in the background for QBRs. Fully automated — no engineer, nothing to babysit.

Start free, 30 days, no card: https://phishsimai.com/login?mode=register

Sarah Mitchell
PhishSim AI${CANSPAM_TEXT}`,
  },
  // ── Touch 4 — breakup. Invites a cheap "no", which also cleans the list ───────
  {
    touch: 4,
    delayDays: 6,
    final: true,
    subject: () => 'one question and I will stop',
    html: () => '',
    text: (name: string) => `Hi ${name},

Last note from me.

Is phishing training for your clients something you already handle in-house, or something you would rather not own at all?

Either answer is genuinely useful and one word is plenty. If it is simply the wrong month, say so and I will close the file.

If you would rather just look: https://phishsimai.com/login?mode=register (30 days, no card, about ten minutes to set up)

Sarah Mitchell
PhishSim AI${CANSPAM_TEXT}`,
  },
]


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
/**
 * Remaining pre-cutoff touch-2 headroom. Prod 2026-09-14: 796 sent since epoch, scale='1',
 * pre-cutoff stalled=0 — this path is spent. Post-cutoff uses touch2PostEraHeadroom; the
 * old scale flag must not unlock 1601 T3-as-T2 sends.
 */
export async function touch2Headroom(sql: any): Promise<{ headroom: number; sentInBatch: number; holding: boolean; crisisDrain?: boolean }> {
  const sentInBatch = await touch2SentInBatch(sql)
  if (await isTouch2ScaleApproved(sql)) return { headroom: Number.MAX_SAFE_INTEGER, sentInBatch, holding: false }
  const crisis = await readOperatingCrisis(sql).catch(() => true)
  if (shouldCrisisUnlockTouch2(crisis, false)) {
    return { headroom: Number.MAX_SAFE_INTEGER, sentInBatch, holding: false, crisisDrain: true }
  }
  const headroom = Math.max(0, TOUCH2_BATCH1_LIMIT - sentInBatch)
  return { headroom, sentInBatch, holding: headroom === 0 }
}

export async function touch2PostEraSentInBatch(sql: any): Promise<number> {
  const r = await sql`SELECT count(*)::int AS n FROM ps_outreach_leads
    WHERE touch2_sent_at IS NOT NULL
      AND touch2_sent_at >= ${TOUCH2_POST_ERA_EPOCH}::timestamptz
      AND touch1_sent_at >= ${TOUCH2_COPY_ERA_CUTOFF}::timestamptz`.catch(() => [])
  return Number((r as any[])[0]?.n ?? 0)
}

async function isPostCutoffScaleApproved(sql: any): Promise<boolean> {
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY_ID}
    AND type='operating' AND key=${TOUCH2_POST_ERA_SCALE_KEY} LIMIT 1`.catch(() => [])
  return String((r as any[])[0]?.value ?? '') === '1'
}

export async function touch2PostEraHeadroom(sql: any): Promise<{
  headroom: number; sentInBatch: number; holding: boolean; crisisDrain: boolean
}> {
  const sentInBatch = await touch2PostEraSentInBatch(sql)
  const crisis = await readOperatingCrisis(sql).catch(() => true)
  const postCutoffScaleApproved = await isPostCutoffScaleApproved(sql)
  return postCutoffBatchHeadroom({ sentInPostEraBatch: sentInBatch, postCutoffScaleApproved, operatingCrisis: crisis })
}

/**
 * Who is eligible for a SECOND touch via runTouch2Batch / /api/os/sequence-touch2.
 * Every exclusion is in the SELECT, not applied afterwards:
 * replied / bounced / unsubscribed / suppressed / already-touched / dead / OURS / stale-silent.
 *
 * COPY-ERA SAFETY (not a forever-exclude). PS-COPY-PRICE-01 deployed 2026-08-03 01:36Z.
 * Pre-cutoff (compliance-era T1) still receives the approved T2 price follow-up.
 * Post-cutoff (price-led T1) is EXCLUDED from that SAME T2 pitch — they would be double
 * price-pitched. Live 2026-09-14 proved the old "exclude forever" rule emptied eligible
 * (attempted:0 sent:0 headroom:10 holding:false) and left ~1565 T1-no-T2 >5d.
 *
 * Post-cutoff T1 ≥5 days old ARE eligible here, and runTouch2Batch sends the EXISTING
 * approved SEQUENCE touch-3 (value re-frame) then stamps touch2_sent_at + touch3_sent_at.
 * Dex / MX / assertSendable / suppression / bounce breaker / 10s spacing still bind.
 */
export async function touch2Eligible(sql: any, limit: number, opts?: { includePostCutoff?: boolean }): Promise<any[]> {
  if (limit <= 0) return []
  const includePost = opts?.includePostCutoff !== false
  const postCutoffClause = includePost
    ? `OR (
           l.touch1_sent_at >= '${TOUCH2_COPY_ERA_CUTOFF}'::timestamptz
           AND l.touch1_sent_at < NOW() - INTERVAL '5 days'
         )`
    : ''
  return (await sql.query(
    `SELECT l.id, l.name, l.company, l.email, l.industry, l.touch1_sent_at
     FROM ps_outreach_leads l
     WHERE l.touch1_sent_at IS NOT NULL
       AND l.touch2_sent_at IS NULL
       AND l.replied = false
       AND l.bounced = false
       AND l.unsubscribed = false
       AND l.pipeline_stage NOT IN ('dead','customer','internal_test')
       AND l.country = ANY(ARRAY['US','GB','AU'])
       AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
       AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'
       AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
       AND NOT (COALESCE(l.open_count, 0) = 0 AND l.touch1_sent_at < NOW() - INTERVAL '45 days')
       AND (
         l.touch1_sent_at < '${TOUCH2_COPY_ERA_CUTOFF}'::timestamptz
         ${postCutoffClause}
       )
     ORDER BY CASE WHEN l.industry IN (
       SELECT DISTINCT industry FROM ps_outreach_leads WHERE replied = true AND industry IS NOT NULL
     ) THEN 0 ELSE 1 END, l.touch1_sent_at ASC
     LIMIT ${Math.floor(limit)}`,
  ).catch(() => [])) as any[]
}


/**
 * PS-TOUCH2-PRICE-01 — send one touch-2 batch. Founder-gated in three independent ways:
 *   1. touch2Headroom() caps the run at TOUCH2_BATCH1_LIMIT and returns 0 once batch 1 is spent;
 *   2. touch2Eligible() applies every exclusion in the SELECT (replied/bounced/unsubscribed/
 *      suppressed/already-touched/dead/ours/stale). Post-cutoff T1 ≥5d are included so
 *      /api/os/sequence-touch2 can unstick them with approved T3 copy (not the T2 pitch);
 *   3. the per-lead MX gate, identical to touch-1 — a domain with no MX bounces 100%, and our
 *      bounce rate (4.3%) is already above the founder's 2% line.
 *
 * Touch-2 is intentionally NOT in the generic follow-up loop (`runSequence` /
 * `runFullSequence`) as a T2-copy send. That loop owns touches 3+; this dedicated
 * batch owns the second email. Dual crisis unlocks remaining headroom (Dex still
 * caps ≤10/run, ≤50 T2/day). Post-cutoff second emails use SEQUENCE T3 copy.
 *
 * The bounce breaker is checked BEFORE the batch, not per-send: sending 150 into a known-bad
 * deliverability state is the failure this exists to prevent.
 *
 * touch2_sent_at is stamped ONLY on a confirmed provider id. A send that Resend rejected must not
 * leave a row claiming it went out — that is PS-SEND-01's lesson, and it applies to every touch.
 */
export async function runTouch2Batch(sqlOverride?: any, opts?: { maxSends?: number }): Promise<{
  attempted: number; sent: number; failed: number; noMx: number; suppressed: number; headroom: number; holding: boolean; t3AsSecondTouch: number
  postEra?: { sentInBatch: number; limit: number; holding: boolean; crisisDrain: boolean; epoch: string }
  reason?: string
}> {
  const sql = sqlOverride ?? getSql()
  await ensureSequenceOutbox(sql)
  const out = {
    attempted: 0, sent: 0, failed: 0, noMx: 0, suppressed: 0, headroom: 0, holding: false as boolean, t3AsSecondTouch: 0,
    postEra: undefined as { sentInBatch: number; limit: number; holding: boolean; crisisDrain: boolean; epoch: string } | undefined,
    reason: undefined as string | undefined,
  }

  const health = await getSequenceHealth(sql).catch(() => null)
  if (health?.paused) {
    out.reason = health.tripped
      ? `bounce breaker TRIPPED (${(health.rate * 100).toFixed(1)}% over ${health.sent} sends)`
      : 'bounce health UNMEASURED — failing closed rather than sending blind'
    return out
  }

  // Pre-cutoff pool is exhausted (prod: 0). Do not use touch2_scale_approved='1' as
  // permission to send the 1601 post-cutoff list — that flag spent the 797 price-T2 cohort.
  const postH = await touch2PostEraHeadroom(sql)
  out.postEra = {
    sentInBatch: postH.sentInBatch,
    limit: TOUCH2_POST_ERA_BATCH1_LIMIT,
    holding: postH.holding,
    crisisDrain: postH.crisisDrain,
    epoch: TOUCH2_POST_ERA_EPOCH,
  }
  const includePostCutoff = !postH.holding && postH.headroom > 0
  if (postH.holding) {
    out.holding = true
    out.headroom = 0
    out.reason = `POST-CUTOFF BATCH 1 COMPLETE — ${postH.sentInBatch}/${TOUCH2_POST_ERA_BATCH1_LIMIT} T3-as-T2 since ${TOUCH2_POST_ERA_EPOCH}. ` +
      `Holding for founder read of this copy; set janet_memory ${TOUCH2_POST_ERA_SCALE_KEY}='1' to release more. ` +
      `Dual crisis continues Dex-capped drain (≤10/run, ≤50/day) — never a 1600 blast. ` +
      `Old touch2_scale_approved does not apply.`
    return out
  }

  const counts = await sentTodayCounts(sql)
  const cap = opts?.maxSends != null && Number.isFinite(opts.maxSends)
    ? Math.max(0, Math.floor(opts.maxSends))
    : Number.MAX_SAFE_INTEGER
  const postCap = postH.headroom === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : postH.headroom
  const runLimit = Math.min(postCap, secondTouchAllowance(counts), cap)
  out.headroom = runLimit
  if (runLimit <= 0) {
    out.reason = `daily cap reached — ${counts.secondSentToday}/50 second-touch and ` +
      `${counts.newSentToday + counts.secondSentToday}/100 combined already sent today. Overflow queues to tomorrow.`
    return out
  }

  const leads = await touch2Eligible(sql, runLimit, { includePostCutoff })
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
      const copyKind = secondTouchCopyKind(lead.touch1_sent_at || now)
      const t3 = copyKind === 'approved_t3_value_reframe' ? SEQUENCE.find((s) => s.touch === 3) : null
      const subject = t3 ? t3.subject(greet, co) : TOUCH2_VARIANT.subject(greet, co)
      const html = t3
        ? t3.html(greet, co, ind, token)
        : TOUCH2_VARIANT.html(greet, co, ind).replace(/\{\{TOKEN\}\}/g, token)
      const text = t3
        ? t3.text(greet, co)
        : TOUCH2_VARIANT.text(greet, co, ind).replace(/\{\{TOKEN\}\}/g, token)
      const variantId = t3 ? 'seq_t3_as_t2' : TOUCH2_VARIANT.id
      const sendClaim = await claimSequenceSend(sql, String(lead.id), 2, String(lead.email))
      if (!sendClaim.claimed && !sendClaim.providerMessageId) continue
      const idempotencyKey = sequenceIdempotencyKey(String(lead.id), 2)
      const result = sendClaim.providerMessageId
        ? { id: sendClaim.providerMessageId }
        : await sendEmail(
            String(lead.email),
            subject,
            html,
            [{ name: 'touch', value: '2' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: variantId }],
            token,
            text,
            idempotencyKey,
          )
      if (!result?.id) { out.failed++; continue }
      if (sendClaim.claimed) {
        await completeSequenceSend(sql, String(lead.id), 2, sendClaim.claimToken!, String(result.id))
      }
      const ts = now.toISOString()
      if (t3) {
        // Stamp T3 too so the T3 loop does not re-send this same value-reframe.
        const c3 = await claimSequenceSend(sql, String(lead.id), 3, String(lead.email))
        if (c3.claimed) {
          await completeSequenceSend(sql, String(lead.id), 3, c3.claimToken!, String(result.id))
        }
        await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts}, touch3_sent_at=${ts}, stage_updated_at=${ts} WHERE id=${lead.id}`
        out.t3AsSecondTouch++
      } else {
        await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts}, stage_updated_at=${ts} WHERE id=${lead.id}`
      }
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

export async function runFullSequence() {
  const sql = getSql()
  await ensureSequenceOutbox(sql)
  const health = await getSequenceHealth(sql)
      // PS-RAMP-DECOUPLE-01: one flag decides autonomous-mode vs founder-directed-mode. In
      // founder-directed mode the ramp's own rails (cap + geo + MX + consent, still enforced
      // below) are the safety net, not the bounce-measurement/autonomy gates meant for autonomous sends.
      const founderRamp = await isFounderRampEnabled(sql).catch(() => false)
  if (health.tripped) {
    // A MEASURED, over-threshold bounce rate on the live 7-day window: the funnel is actively
    // breaking. Record an autonomy_incident so the clean-day clock goes DIRTY today — a broken
    // funnel is not a clean day. (A deliberate OUTBOUND_HARD_PAUSED above returned already and is
    // NOT an incident; an empty window below is silence, not a break, and is NOT an incident.)
    await recordIncident(sql, COMPANY_ID, `bounce breaker tripped: ${(health.rate * 100).toFixed(1)}% over ${health.sent} live sends (7d)`, 'aria').catch(() => {})
    await sendTelegram('PHISHSIMAI PAUSE: Bounce rate ' + (health.rate * 100).toFixed(1) + '% >= ' + (health.threshold * 100).toFixed(2) + '% over ' + health.sent + ' live sends. Sequence halted, incident recorded.')
    return { paused: true, tripped: true, rate: health.rate, sent: 0 }
  }
  // Bounce-rate breaker: needs live send data before it can vouch for the funnel.
          if (!founderRamp && !health.measured) {
    // No live sends in the 7-day window. Fail closed — no data is not permission — but this is
    // NOT an incident: nothing broke, nothing was sent. The clock is not dirtied by silence.
    return { paused: true, measured: false, reason: 'not_measured: no live sends in 7d window', sent: 0 }
  }

  // Founder-directed mode also skips the earned-autonomy requirement below (founderRamp
          // computed once above, alongside the bounce-measurement check it also governs).
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
  const operatingCrisis = await readOperatingCrisis(sql).catch(() => true)
  const backlog = await countSequenceBacklog(sql).catch(() => null)
  const pauseNewTouch1 = shouldPauseTouch1(backlog?.drainableOverdue ?? 0, operatingCrisis)
  if (operatingCrisis) {
    await runTouch2Batch(sql).catch(() => {})
  }
  // PS-OUTREACH-THROTTLE-01: touch-1 obeys the SAME combined 100/day ceiling as touch-2, so new +
  // second-touch can never exceed 100 on the domain in a day. Its own type cap stays 50 (the ramp).
  // Dual crisis + large overdue follow-up pool: pause NEW T1 this hour so Dex budget drains
  // stuck sequences first (2/136 7d reply rate — do not scale bad TOF).
  const throttleCounts = await sentTodayCounts(sql)
  const dailyAllowance = pauseNewTouch1
    ? 0
    : Math.min(dailySendCap(now), newTouchAllowance(throttleCounts)) // PS-RAMP-01 warm-up ∧ combined cap
  // PS-DRIP-01 (2026-08-24, founder-directed): send the day's allowance as a DRIP, not a burst.
  // This route ran once at 07:00 and fired the entire remaining allowance in one go — 50 messages
  // from the same domain inside a couple of minutes, which is the pattern spam filtering is built
  // to catch, and it puts every send into one hour of the day regardless of where the recipient is.
  // The cron now runs hourly and each run takes at most a 1/24th slice. The DAILY ceiling is
  // unchanged and still enforced from the database (sentTodayCounts), so this only changes the
  // SHAPE of the day, never the volume: PS-RAMP-HOLD-01's 50/day hold still binds.
  const HOURLY_SLICE = Math.max(1, Math.ceil(dailySendCap(now) / 24))
  const cap = Math.min(dailyAllowance, HOURLY_SLICE)
  let totalSent = 0
  const results: any[] = []

  if (totalSent < cap) {
    const exp = AB_EXPERIMENTS.touch1_subject
    // PS-BANDIT-01: adaptive split, computed ONCE per batch (one query). Weights allocation toward
    // the higher open-rate subject once there is enough data; 0.5 (current 50/50) until then or if
    // the experiment is off. Fail-safe inside computeAdaptiveSplit.
    // Opens can never fire on plaintext touch-1/2 (PS-COPY-PLAINTEXT-01 + no HTML pixel).
    // Optimize on replies — the path recordConversion(..., 'replied') already writes.
    const testWeight = (exp.active && exp.test) ? await computeAdaptiveSplit('touch1_subject', 200, 0.2, 'replied') : 0
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
        const variant = splitByWeight(String(lead.id), testWeight)
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
        const sendClaim = await claimSequenceSend(sql, String(lead.id), 1, String(lead.email))
        if (!sendClaim.claimed && !sendClaim.providerMessageId) continue
        const idempotencyKey = sequenceIdempotencyKey(String(lead.id), 1)
        const result = sendClaim.providerMessageId
          ? { id: sendClaim.providerMessageId }
          : await sendEmail(String(lead.email), subject, html, [
              { name: 'touch', value: '1' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: v.id },
            ], token, text, idempotencyKey)
        if (!result?.id) continue
        if (sendClaim.claimed) {
          await completeSequenceSend(sql, String(lead.id), 1, sendClaim.claimToken!, String(result.id))
        }
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
  // PS-FOLLOWUP-COPY-01 (2026-08-24): re-enabled with founder-approved copy, which is what
  // PS-COPY-REWRITE-01 was waiting for. Touch 2 stays OUT of this list on purpose — it has its
  // own batch path and cron; listing it here would send it twice to the same lead.
  const touchDefs: { touch: number; delayDays: number; final?: boolean }[] = [
    { touch: 3, delayDays: 5 },
    { touch: 4, delayDays: 6, final: true },
  ]

  // PS-FOLLOWUP-BUDGET-01 (2026-08-24, founder-directed): follow-ups no longer share touch-1's
  // counter. As written, `totalSent` was incremented by every touch-1 send and then checked here
  // against DAILY_SEND_LIMIT (20) — so a full touch-1 day (50) guaranteed ZERO follow-ups, silently,
  // for the exact touches this file documents as the ones that produce replies. The bug is latent
  // only because touchDefs is empty; it would have bitten the moment follow-ups were switched on.
  // Follow-ups now draw their own daily budget and their own hourly slice; the combined domain
  // ceiling still governs the total across new + follow-up sends.
  const followUpDailyCap = pauseNewTouch1
    ? FOLLOWUP_DAILY_CAP
    : Math.max(0, COMBINED_DAILY_CAP - dailySendCap(now))
  const followUpSlice = followUpHourlySlice(operatingCrisis, Math.max(1, Math.ceil(followUpDailyCap / 24)))
  const followUpCap = Math.min(Math.max(0, followUpDailyCap - throttleCounts.secondSentToday), followUpSlice)
  let followUpSent = 0

  for (const def of touchDefs) {
    if (followUpSent >= followUpCap) break
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
        ORDER BY touch1_sent_at ASC LIMIT ${followUpCap - followUpSent}`
    } else if (def.touch === 3) {
      // Price-era T1 (touch1_sent_at >= TOUCH2_COPY_ERA_CUTOFF) skips T2 (same pitch) and
      // enters T3 after 5 days. Pre-cutoff leads still wait for the dedicated T2 batch.
      leads = await sql`SELECT id,name,company,email,industry,touch2_sent_at FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch3_sent_at IS NULL
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        AND (
          (touch2_sent_at IS NOT NULL AND touch2_sent_at < ${cutoff})
          OR (
            touch2_sent_at IS NULL
            AND touch1_sent_at >= ${TOUCH2_COPY_ERA_CUTOFF}::timestamptz
            AND touch1_sent_at < ${cutoff}
            AND NOT (COALESCE(open_count, 0) = 0 AND touch1_sent_at < NOW() - INTERVAL '45 days')
          )
        )
        ORDER BY CASE WHEN industry IN (
          SELECT DISTINCT industry FROM ps_outreach_leads WHERE replied = true AND industry IS NOT NULL
        ) THEN 0 ELSE 1 END, COALESCE(touch2_sent_at, touch1_sent_at) ASC
        LIMIT ${followUpCap - followUpSent}`
    } else if (def.touch === 4) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY touch3_sent_at ASC LIMIT ${followUpCap - followUpSent}`
    } else {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY touch3_sent_at ASC LIMIT ${followUpCap - followUpSent}`
    }

    for (const lead of leads) {
      if (followUpSent >= followUpCap) break
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
        // PS-FOLLOWUP-COPY-01: follow-ups are text-only. html is '' and sendEmail omits the empty
        // part, so this goes out as a single text/plain body — same doctrine as touch-1 and -2.
        const bodyText = step.text(deriveFirstName(String(lead.email)), String(lead.company))
        const sendClaim = await claimSequenceSend(sql, String(lead.id), def.touch, String(lead.email))
        if (!sendClaim.claimed && !sendClaim.providerMessageId) continue
        const idempotencyKey = sequenceIdempotencyKey(String(lead.id), def.touch)
        const result = sendClaim.providerMessageId
          ? { id: sendClaim.providerMessageId }
          : await sendEmail(String(lead.email), subject, html, [
              { name: 'touch', value: String(def.touch) }, { name: 'lead_id', value: String(lead.id) },
            ], token, bodyText, idempotencyKey)
        if (!result?.id) continue
        if (sendClaim.claimed) {
          await completeSequenceSend(sql, String(lead.id), def.touch, sendClaim.claimToken!, String(result.id))
        }
        const ts = now.toISOString()
        if (def.touch === 2) await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 3 && !lead.touch2_sent_at) {
          // Skip-T2 path: this T3 copy IS the second email — stamp T2 so heartbeat T1-no-T2 falls
          // and sequence-touch2 does not send the same copy again.
          await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts}, touch3_sent_at=${ts} WHERE id=${lead.id}`
        } else if (def.touch === 3) await sql`UPDATE ps_outreach_leads SET touch3_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 4) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.final) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts}, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
        totalSent++
        followUpSent++
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
  return {
    sent: totalSent,
    results,
    bounceRate: health.rate,
    pauseNewTouch1,
    drainableOverdue: backlog?.drainableOverdue ?? null,
    followUpSent,
  }
}

export const runSequence = runFullSequence

export type SequenceDrainResult = {
  sent: number
  t2: number
  t3: number
  t4: number
  staleMarked: number
  skipped: number
  blocked: number
  tripped: boolean
  pauseNewTouch1: boolean
  backlog: SequenceBacklogCensus
  reason?: string
}

/**
 * Automatic drain tick: suppress silent stale, resume approved T2 under crisis unlock,
 * send approved T3 (including price-era skip-T2) and T4. Called from heartbeat and
 * available to the sequence cron. Dex / MX / suppression / geo / outbox still bind.
 */
export async function runSequenceDrainTick(opts: {
  sql?: any
  includeTouch2?: boolean
  followUpCap?: number
  touch2MaxSends?: number
} = {}): Promise<SequenceDrainResult> {
  const sql = opts.sql ?? getSql()
  await ensureSequenceOutbox(sql)
  const includeTouch2 = opts.includeTouch2 !== false
  const emptyBacklog = await countSequenceBacklog(sql).catch(() => ({
    rawUnsentTouch2Over5d: 0, drainableOverdue: 0, waitingTouch2: 0,
    waitingTouch3SkipT2: 0, waitingTouch3AfterT2: 0, waitingTouch4: 0,
    staleSilent: 0, geoOrSuppressed: 0,
  }))
  const out: SequenceDrainResult = {
    sent: 0, t2: 0, t3: 0, t4: 0, staleMarked: 0, skipped: 0, blocked: 0,
    tripped: false, pauseNewTouch1: false, backlog: emptyBacklog,
  }

  const health = await getSequenceHealth(sql).catch(() => null)
  if (health?.tripped) {
    out.tripped = true
    out.reason = `bounce breaker tripped ${(health.rate * 100).toFixed(1)}%`
    return out
  }

  const stale = (await sql`
    UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=NOW()
    WHERE id IN (
      SELECT id FROM ps_outreach_leads
      WHERE touch1_sent_at IS NOT NULL
        AND COALESCE(replied, false) = false
        AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test','engaged')
        AND COALESCE(open_count, 0) = 0
        AND touch1_sent_at < NOW() - INTERVAL '45 days'
        AND COALESCE(bounced, false) = false
        AND COALESCE(unsubscribed, false) = false
      ORDER BY touch1_sent_at ASC
      LIMIT ${DRAIN_STALE_MARK_CAP}
    )
    RETURNING id
  `.catch(() => [])) as any[]
  out.staleMarked = stale.length

  const operatingCrisis = await readOperatingCrisis(sql).catch(() => true)
  out.backlog = await countSequenceBacklog(sql).catch(() => emptyBacklog)
  out.pauseNewTouch1 = shouldPauseTouch1(out.backlog.drainableOverdue, operatingCrisis)

  if (includeTouch2) {
    const t2 = await runTouch2Batch(sql, { maxSends: opts.touch2MaxSends }).catch((e: any) => ({ sent: 0, reason: String(e?.message || e).slice(0, 120) }))
    out.t2 = Number((t2 as any).sent) || 0
    if ((t2 as any).reason && !out.reason) out.reason = String((t2 as any).reason).slice(0, 200)
  }

  const now = new Date()
  const cap = Math.max(1, Math.min(FOLLOWUP_DAILY_CAP, Math.floor(opts.followUpCap ?? followUpHourlySlice(operatingCrisis, 3))))
  const touchDefs: { touch: 3 | 4; delayDays: number }[] = [
    { touch: 3, delayDays: 5 },
    { touch: 4, delayDays: 6 },
  ]

  for (const def of touchDefs) {
    if (out.t3 + out.t4 >= cap) break
    const step = SEQUENCE.find(s => s.touch === def.touch)
    if (!step) continue
    const cutoff = new Date(now.getTime() - def.delayDays * 86400000).toISOString()
    const remaining = cap - (out.t3 + out.t4)
    let leads: any[] = []
    if (def.touch === 3) {
      leads = await sql`SELECT id,name,company,email,industry,touch2_sent_at FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch3_sent_at IS NULL
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        AND (
          (touch2_sent_at IS NOT NULL AND touch2_sent_at < ${cutoff})
          OR (
            touch2_sent_at IS NULL
            AND touch1_sent_at >= ${TOUCH2_COPY_ERA_CUTOFF}::timestamptz
            AND touch1_sent_at < ${cutoff}
            AND NOT (COALESCE(open_count, 0) = 0 AND touch1_sent_at < NOW() - INTERVAL '45 days')
          )
        )
        ORDER BY CASE WHEN industry IN (
          SELECT DISTINCT industry FROM ps_outreach_leads WHERE replied = true AND industry IS NOT NULL
        ) THEN 0 ELSE 1 END, COALESCE(touch2_sent_at, touch1_sent_at) ASC
        LIMIT ${remaining}`
    } else {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads l
        WHERE country = ANY(${GEO}) AND touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND l.unsubscribed=false
        AND pipeline_stage NOT IN ('dead','customer')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        ORDER BY CASE WHEN industry IN (
          SELECT DISTINCT industry FROM ps_outreach_leads WHERE replied = true AND industry IS NOT NULL
        ) THEN 0 ELSE 1 END, touch3_sent_at ASC
        LIMIT ${remaining}`
    }

    for (const lead of leads) {
      if (out.t3 + out.t4 >= cap) break
      try {
        const dom = domainOf(String(lead.email))
        if (!dom || !(await hasMx(dom))) {
          const ts0 = now.toISOString()
          await sql`UPDATE ps_outreach_leads SET pipeline_stage='dead', stage_updated_at=${ts0} WHERE id=${lead.id}`
          out.skipped++
          continue
        }
        const gateN = await assertSendable(sql, String(lead.email))
        if (!gateN.allowed) {
          out.blocked++
          continue
        }
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const greet = deriveFirstName(String(lead.email))
        const subject = step.subject(greet, String(lead.company))
        const html = step.html(greet, String(lead.company), String(lead.industry || 'technology'), token)
        const bodyText = step.text(greet, String(lead.company))
        const sendClaim = await claimSequenceSend(sql, String(lead.id), def.touch, String(lead.email))
        if (!sendClaim.claimed && !sendClaim.providerMessageId) {
          out.skipped++
          continue
        }
        const idempotencyKey = sequenceIdempotencyKey(String(lead.id), def.touch)
        const result = sendClaim.providerMessageId
          ? { id: sendClaim.providerMessageId }
          : await sendEmail(String(lead.email), subject, html, [
              { name: 'touch', value: String(def.touch) }, { name: 'lead_id', value: String(lead.id) }, { name: 'drain', value: '1' },
            ], token, bodyText, idempotencyKey)
        if (!result?.id) { out.skipped++; continue }
        if (sendClaim.claimed) {
          await completeSequenceSend(sql, String(lead.id), def.touch, sendClaim.claimToken!, String(result.id))
        }
        const ts = now.toISOString()
        if (def.touch === 3 && !lead.touch2_sent_at) {
          await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts}, touch3_sent_at=${ts} WHERE id=${lead.id}`
        } else if (def.touch === 3) await sql`UPDATE ps_outreach_leads SET touch3_sent_at=${ts} WHERE id=${lead.id}`
        else await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts} WHERE id=${lead.id}`
        out.sent++
        if (def.touch === 3) out.t3++
        else out.t4++
        await new Promise(r => setTimeout(r, 2000))
      } catch {
        out.skipped++
      }
    }
  }

  out.backlog = await countSequenceBacklog(sql).catch(() => out.backlog)
  out.pauseNewTouch1 = shouldPauseTouch1(out.backlog.drainableOverdue, operatingCrisis)
  return out
}

/** Outbox touches reserved for warm conversion CTAs — never collide with sequence touches 1–5.
 *  90 = first Dex-gated trial CTA. 91/92 = follow-ups after WARM_CTA_COOLDOWN_DAYS.
 *  One row at touch 90 used to hide the whole replied/engaged pool forever ("No warm sendable leads"
 *  while 14 engaged US leads sat in the CRM — 2026-09-14). */
export const WARM_CONVERSION_TOUCH = 90
export const WARM_FOLLOWUP_TOUCHES = [91, 92] as const
export const WARM_CTA_TOUCHES = [90, 91, 92] as const
export const WARM_CTA_COOLDOWN_DAYS = 4
/** Dual-crisis follow-up: 6h between 90→91→92 instead of parking 14 leads for 4 days. */
export const CRISIS_WARM_FOLLOWUP_HOURS = 6
export const TRIAL_CTA_URL = 'https://phishsimai.com/login?mode=register'

export type WarmPoolCensus = {
  replied: number
  engaged: number
  sendable: number
  suppressed: number
  cooldown: number
  exhausted: number
  eligible: number
  autoReplyPending: number
}

export const EMPTY_WARM_POOL: WarmPoolCensus = {
  replied: 0, engaged: 0, sendable: 0, suppressed: 0, cooldown: 0, exhausted: 0, eligible: 0, autoReplyPending: 0,
}

export type WarmCtaResult = {
  sent: number
  skipped: number
  blocked: number
  tripped: boolean
  paused?: boolean
  reason?: string
  results: { email: string; company: string; outcome: string }[]
  pool?: WarmPoolCensus
  crisisFollowup?: boolean
  cooldownHours?: number
  reopenedAutoReplies?: number
}

/**
 * Live 2026-09-14T19:24Z: eligible=0, cooldown=14=sendable, autoReplyPending=12.
 * A single touch-90 must not park the whole warm pool for 4 days while TRUE<20 / paying<4.
 */
export function shouldCrisisWarmFollowup(pool: WarmPoolCensus, operatingCrisis: boolean): boolean {
  if (!operatingCrisis) return false
  if (pool.sendable <= 0) return false
  if (pool.eligible > 0) return false
  return pool.cooldown >= pool.sendable
}

export function warmCtaCooldownHours(pool: WarmPoolCensus, operatingCrisis: boolean): number {
  return shouldCrisisWarmFollowup(pool, operatingCrisis)
    ? CRISIS_WARM_FOLLOWUP_HOURS
    : WARM_CTA_COOLDOWN_DAYS * 24
}

async function readOperatingCrisis(sql: any): Promise<boolean> {
  try {
    const c = await measureTrueOrgCounts(sql)
    return isOperatingCrisis({
      liveProductTrials: c.trueLiveTrials,
      crmTrials: 0,
      payingCustomers: c.truePaying,
    })
  } catch {
    return true
  }
}

/** Count why convert_warm returned empty. Live 2026-09-14: 15 replied / 14 engaged → sent:0 because
 *  the SELECT treated NULL bounce flags and a single prior CTA as "no leads". */
export async function warmCtaPoolCensus(sql: any, cooldownHours = WARM_CTA_COOLDOWN_DAYS * 24): Promise<WarmPoolCensus> {
  const hours = Math.max(1, Math.floor(Number(cooldownHours) || WARM_CTA_COOLDOWN_DAYS * 24))
  const flags = (await sql`
    SELECT
      count(*) FILTER (WHERE replied = true)::int AS replied,
      count(*) FILTER (WHERE pipeline_stage = 'engaged')::int AS engaged,
      count(*) FILTER (
        WHERE COALESCE(bounced, false) = false
          AND COALESCE(unsubscribed, false) = false
          AND COALESCE(pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND (replied = true OR pipeline_stage = 'engaged')
      )::int AS sendable
    FROM ps_outreach_leads
  `.catch(() => [{ replied: 0, engaged: 0, sendable: 0 }])) as any[]
  const extra = (await sql`
    SELECT
      count(*) FILTER (
        WHERE COALESCE(l.bounced, false) = false
          AND COALESCE(l.unsubscribed, false) = false
          AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND (l.replied = true OR l.pipeline_stage = 'engaged')
          AND EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
      )::int AS suppressed,
      count(*) FILTER (
        WHERE COALESCE(l.bounced, false) = false
          AND COALESCE(l.unsubscribed, false) = false
          AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND (l.replied = true OR l.pipeline_stage = 'engaged')
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
          AND EXISTS (
            SELECT 1 FROM outreach_sequence_outbox o
            WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
              AND o.updated_at > NOW() - (${hours}::int * INTERVAL '1 hour')
          )
      )::int AS cooldown,
      count(*) FILTER (
        WHERE COALESCE(l.bounced, false) = false
          AND COALESCE(l.unsubscribed, false) = false
          AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND (l.replied = true OR l.pipeline_stage = 'engaged')
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
          AND (
            SELECT count(*) FROM outreach_sequence_outbox o
            WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
          ) >= 3
      )::int AS exhausted,
      count(*) FILTER (
        WHERE COALESCE(l.bounced, false) = false
          AND COALESCE(l.unsubscribed, false) = false
          AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
          AND (l.replied = true OR l.pipeline_stage = 'engaged')
          AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
          AND NOT EXISTS (
            SELECT 1 FROM outreach_sequence_outbox o
            WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
              AND o.updated_at > NOW() - (${hours}::int * INTERVAL '1 hour')
          )
          AND (
            SELECT count(*) FROM outreach_sequence_outbox o
            WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
          ) < 3
      )::int AS eligible
    FROM ps_outreach_leads l
  `.catch(() => [{ suppressed: 0, cooldown: 0, exhausted: 0, eligible: 0 }])) as any[]
  const drafts = (await sql`
    SELECT count(*)::int AS n FROM outreach_reply_drafts
    WHERE status = 'pending_review' AND classification = 'auto_reply'
  `.catch(() => [{ n: 0 }])) as any[]
  return {
    replied: Number(flags[0]?.replied ?? 0),
    engaged: Number(flags[0]?.engaged ?? 0),
    sendable: Number(flags[0]?.sendable ?? 0),
    suppressed: Number(extra[0]?.suppressed ?? 0),
    cooldown: Number(extra[0]?.cooldown ?? 0),
    exhausted: Number(extra[0]?.exhausted ?? 0),
    eligible: Number(extra[0]?.eligible ?? 0),
    autoReplyPending: Number(drafts[0]?.n ?? 0),
  }
}

export async function nextWarmCtaTouch(
  sql: any,
  leadId: string,
  cooldownHours = WARM_CTA_COOLDOWN_DAYS * 24,
): Promise<number | null> {
  const rows = (await sql`
    SELECT touch, status, updated_at
    FROM outreach_sequence_outbox
    WHERE lead_id = ${leadId}::uuid AND touch IN (90, 91, 92)
  `.catch(() => [])) as Array<{ touch: number; status: string; updated_at: string }>
  const sent = rows.filter((r) => r.status === 'sent')
  const coolMs = Math.max(1, Math.floor(Number(cooldownHours) || WARM_CTA_COOLDOWN_DAYS * 24)) * 3_600_000
  if (sent.some((r) => Date.now() - new Date(r.updated_at).getTime() < coolMs)) return null
  const used = new Set(sent.map((r) => Number(r.touch)))
  return WARM_CTA_TOUCHES.find((t) => !used.has(t)) ?? null
}

/**
 * CGO conversion tool: send the frozen 30-day no-card trial CTA to people who already
 * wrote back (or are engaged). This is NOT cold outreach. Dex rails still bind:
 * MX, assertSendable, suppression SELECT, outbox idempotency. Stand down only when
 * the bounce breaker is MEASURED-tripped — an unmeasured window must not freeze a
 * human who already replied.
 */
export async function sendWarmTrialCtas(opts: {
  emails?: string[]
  cap?: number
  sql?: any
} = {}): Promise<WarmCtaResult> {
  const sql = opts.sql ?? getSql()
  await ensureSequenceOutbox(sql)
  const cap = Math.max(1, Math.min(8, Math.floor(opts.cap ?? 8)))
  const out: WarmCtaResult = { sent: 0, skipped: 0, blocked: 0, tripped: false, results: [], pool: { ...EMPTY_WARM_POOL } }

  const health = await getSequenceHealth(sql).catch(() => null)
  if (health?.tripped) {
    out.tripped = true
    out.paused = true
    out.reason = `bounce breaker tripped ${(health.rate * 100).toFixed(1)}% over ${health.sent} live 7d sends`
    out.pool = await warmCtaPoolCensus(sql).catch(() => ({ ...EMPTY_WARM_POOL }))
    return out
  }

  const founderRamp = await isFounderRampEnabled(sql).catch(() => false)
  if (!founderRamp) {
    try {
      await assertAutonomyAllows('send_simulation', COMPANY_ID)
    } catch (e) {
      if (isAutonomyDenied(e)) {
        out.reason = 'autonomy: ' + (e as Error).message
        out.pool = await warmCtaPoolCensus(sql).catch(() => ({ ...EMPTY_WARM_POOL }))
        return out
      }
      throw e
    }
  }

  const baselinePool = await warmCtaPoolCensus(sql).catch(() => ({ ...EMPTY_WARM_POOL }))
  const operatingCrisis = await readOperatingCrisis(sql)
  const cooldownHours = warmCtaCooldownHours(baselinePool, operatingCrisis)
  const crisisFollowup = shouldCrisisWarmFollowup(baselinePool, operatingCrisis)
  out.crisisFollowup = crisisFollowup
  out.cooldownHours = cooldownHours
  out.pool = crisisFollowup
    ? await warmCtaPoolCensus(sql, cooldownHours).catch(() => baselinePool)
    : baselinePool

  const wanted = (opts.emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean)
  // COALESCE bounce/unsub: NULL = false used to drop the whole 14-engaged pool.
  // Lifetime one-shot at touch 90 used to hide replied/engaged after the first CTA.
  // Follow-ups use 91/92. Default wait is 4 days; dual crisis + all-parked cooldown
  // shortens to CRISIS_WARM_FOLLOWUP_HOURS so one old 90 cannot freeze revenue.
  const leads = wanted.length
    ? await sql`SELECT l.id, l.name, l.company, l.email, l.industry FROM ps_outreach_leads l
        WHERE lower(l.email) = ANY(${wanted})
        AND COALESCE(l.bounced, false) = false AND COALESCE(l.unsubscribed, false) = false
        AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        LIMIT ${cap}`
    : await sql`SELECT l.id, l.name, l.company, l.email, l.industry FROM ps_outreach_leads l
        WHERE COALESCE(l.bounced, false) = false AND COALESCE(l.unsubscribed, false) = false
        AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test')
        AND (l.replied = true OR l.pipeline_stage = 'engaged')
        AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
        AND NOT EXISTS (
          SELECT 1 FROM outreach_sequence_outbox o
          WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
            AND o.updated_at > NOW() - (${cooldownHours}::int * INTERVAL '1 hour')
        )
        AND (
          SELECT count(*) FROM outreach_sequence_outbox o
          WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status='sent'
        ) < 3
        ORDER BY CASE WHEN l.replied = true THEN 0 ELSE 1 END, l.replied_at DESC NULLS LAST
        LIMIT ${cap}`

  const now = new Date()
  for (const lead of leads as any[]) {
    if (out.sent >= cap) break
    try {
      const dom = domainOf(String(lead.email))
      if (!dom || !(await hasMx(dom))) {
        out.skipped++
        out.results.push({ email: String(lead.email), company: String(lead.company || ''), outcome: 'no_mx' })
        continue
      }
      const gateW = await assertSendable(sql, String(lead.email))
      if (!gateW.allowed) {
        out.blocked++
        out.results.push({ email: String(lead.email), company: String(lead.company || ''), outcome: 'blocked_dex' })
        continue
      }
      const token = Buffer.from(String(lead.email)).toString('base64url')
      const greet = deriveFirstName(String(lead.email))
      const co = String(lead.company || 'your MSP')
      const subject = `${greet}, start the 30-day trial — no card`
      const text = `Hi ${greet},

You wrote back. Shortest path from here:

One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Drops to 30¢ on Pro. Flat MSP pricing — every client you add widens your margin instead of eating it.

Live in 10 minutes, no engineer. 30-day trial, no card, full access.

Start here: ${TRIAL_CTA_URL}

Sarah
${CANSPAM_TEXT}`.replace(/\{\{TOKEN\}\}/g, token)
      const html = `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${greet},</p>
<p>You wrote back. Shortest path from here:</p>
<p>One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Drops to 30¢ on Pro. Flat MSP pricing — every client you add widens your margin instead of eating it.</p>
<p>Live in 10 minutes, no engineer. 30-day trial, no card, full access.</p>
<p><a href="${TRIAL_CTA_URL}">Start the 30-day no-card trial</a></p>
<p>Sarah</p>
<hr style="border:0;border-top:1px solid #eee;margin:24px 0 12px">
<p style="color:#666;font-size:12px;margin:0">Sarah Mitchell · PhishSim AI</p>
<p style="color:#666;font-size:12px;margin:0">240 Queen Street N.E., Leesburg, VA 20176</p>
<p style="color:#666;font-size:12px;margin:12px 0 0">You're receiving this because we work with MSPs on phishing-simulation and compliance tooling. Not a fit? <a href="https://phishsimai.com/unsubscribe?e={{TOKEN}}" style="color:#666">Unsubscribe</a> — one click, no hard feelings.</p>
</div>`.replace(/\{\{TOKEN\}\}/g, token)
      const touch = await nextWarmCtaTouch(sql, String(lead.id), cooldownHours)
      if (touch == null) {
        out.skipped++
        out.results.push({ email: String(lead.email), company: co, outcome: 'cooldown_or_exhausted' })
        continue
      }
      const sendClaim = await claimSequenceSend(sql, String(lead.id), touch, String(lead.email))
      if (!sendClaim.claimed && !sendClaim.providerMessageId) {
        out.skipped++
        out.results.push({ email: String(lead.email), company: co, outcome: 'already_sent' })
        continue
      }
      const idempotencyKey = sequenceIdempotencyKey(String(lead.id), touch)
      const result = sendClaim.providerMessageId
        ? { id: sendClaim.providerMessageId }
        : await sendEmail(
            String(lead.email),
            subject,
            html,
            [{ name: 'touch', value: 'warm_cta' }, { name: 'lead_id', value: String(lead.id) }, { name: 'warm_touch', value: String(touch) }],
            token,
            text,
            idempotencyKey,
          )
      if (!result?.id) {
        out.skipped++
        continue
      }
      if (sendClaim.claimed) {
        await completeSequenceSend(sql, String(lead.id), touch, sendClaim.claimToken!, String(result.id))
      }
      await sql`UPDATE ps_outreach_leads SET pipeline_stage='engaged', stage_updated_at=${now.toISOString()}
                WHERE id=${lead.id} AND pipeline_stage NOT IN ('dead','customer','internal_test')`.catch(() => {})
      out.sent++
      out.results.push({ email: String(lead.email), company: co, outcome: 'trial_cta_sent' })
      await new Promise(r => setTimeout(r, 2000))
    } catch (e: any) {
      out.skipped++
      out.results.push({ email: String(lead.email || ''), company: String(lead.company || ''), outcome: 'error' })
      await sendTelegram('PS warm CTA error: ' + (e?.message?.slice(0, 80) || '')).catch(() => {})
    }
  }

  if (out.sent > 0) {
    const lines = out.results.filter(r => r.outcome === 'trial_cta_sent').map(r => r.company + ' <' + r.email + '>').join('\n')
    await sendTelegram('PHISHSIMAI WARM TRIAL CTA: ' + out.sent + ' sent\n' + lines).catch(() => {})
  }
  return out
}
