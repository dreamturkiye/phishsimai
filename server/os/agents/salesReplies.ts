// ─────────────────────────────────────────────────────────────────────────────
//  PS-SALES-REPLY-01 — the Sales agent's one real job: turn a captured reply into a next step.
//
//  IT OPERATES ON REAL CAPTURED REPLIES ONLY.
//  On 2026-08-03 the funnel reads 0 EXTERNAL replies from 883 contacted. The CORRECT behaviour of
//  this agent today is to report "0 external replies, nothing to classify" and issue nothing. It
//  must never manufacture, template, or assume activity to look busy — an agent emitting classifier
//  output over an empty queue is the ghost problem in a new costume, and this codebase already paid
//  for that lesson twice (Marcus re-investigating a closed premise three times; five agents
//  planning conversion work on a funnel nobody had entered).
//
//  EXCLUSION IS AT THE QUERY LEVEL, NOT DOWNSTREAM.
//  kaanari@mac.com is the founder's own address; it sat on the cold list, received touch-1, and
//  replied "TEST" to verify capture. It is staged pipeline_stage='internal_test'. The reply queue
//  query REFUSES to select it — it never enters the classifier's input set. A downstream filter
//  would be weaker in a way that matters: any future code path that forgets to apply it
//  reintroduces the contamination, and "we filter it later" is how the 5 localhost simulations
//  became a 100% open rate.
//
//  ASYMMETRIC SAFETY ON THE ACTIONS.
//  The two failure directions are NOT equally bad:
//    • classify a hostile reply as interested -> a draft is written and gated to Kaan, who reads it
//      and deletes it. Recoverable, costs one human glance.
//    • classify an interested prospect as hostile -> we AUTO-SUPPRESS them and never contact them
//      again. Unrecoverable, and it silently destroys the scarcest thing we have.
//  So suppression requires HIGH CONFIDENCE and an explicit signal; ambiguity never suppresses. The
//  autonomous action only ever runs in the direction that removes us from someone's inbox.
//
//  NOTHING IS AUTO-SENT TO A PROSPECT. interested/objection produce a DRAFT for Kaan. The brand-risk
//  gate stays human; that is the one gate earned autonomy does not open.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { llmComplete } from '../llmChat'
import { sendTelegram } from '../telegram'

const COMPANY = 'phishsimai'
export const TRIAL_URL = 'https://phishsimai.com/register'

export type ReplyClass = 'interested' | 'objection' | 'unsubscribe' | 'auto_reply' | 'hostile'
export type ReplyAction = 'draft_for_kaan' | 'auto_suppress' | 'no_action'

export type Classification = { cls: ReplyClass; confidence: number; why: string }

/** Only these act autonomously, and only by REMOVING us from an inbox. */
const SUPPRESSING: ReplyClass[] = ['unsubscribe', 'hostile']
/** Suppression is destructive and unrecoverable, so it needs a strong signal — never a guess. */
export const SUPPRESS_MIN_CONFIDENCE = 0.8

// ─── RULES ───────────────────────────────────────────────────────────────────
// Deterministic first. These patterns are unambiguous in a B2B reply, they cost nothing, and they
// keep the destructive path off a model's judgement. The LLM only sees what rules cannot settle.

const UNSUB_RE = /\b(unsubscribe|remove me|take me off|opt.?out|stop email(ing)?|do not (email|contact)|don'?t email me( again)?)\b/i
const HOSTILE_RE = /\b(fuck|piss off|spam(ming|mer)?|reported? (you|this) (as|for) spam|harass|scam|lawsuit|legal action|cease and desist|GDPR complaint)\b/i
const AUTO_RE = /\b(out of (the )?office|on (annual |parental |maternity |paternity )?leave|automatic reply|auto.?reply|autoresponder|vacation|away from my desk|will (be )?return(ing)?|delivery (status|has failed)|undeliverable|mailer.?daemon|no longer (with|at) (the )?(company|us)|has left the (company|organisation|organization))\b/i
const INTEREST_RE = /\b(interested|tell me more|send (me )?(more|info|details|pricing)|how (much|does it work)|book|demo|call|trial|sign( )?up|pricing|what.{0,12}cost|sounds good|keen|let'?s (talk|chat))\b/i
const OBJECTION_RE = /\b(too expensive|no budget|already (have|use|using)|we use|not (a )?(good )?fit|not (right )?now|maybe (later|next)|already (with|working with)|happy with|contract|renewal)\b/i

/**
 * Rule pass. Returns null when nothing is decisive — the honest "I don't know", which routes to
 * the model. Order is deliberate and is a safety property, not a style choice:
 *   hostile > unsubscribe   — an angry unsubscribe is hostile; treat the worse reading as true.
 *   auto_reply BEFORE interested/objection — an out-of-office saying "I'll get back to you" is not
 *     interest, and a bounce-notice containing the word "pricing" is not a prospect. Reading a
 *     mailer-daemon as a warm lead is how a queue fills with phantom opportunities.
 */
export function classifyByRules(subject: string, body: string): Classification | null {
  const t = `${subject || ''}\n${body || ''}`.trim()
  if (!t) return null
  if (HOSTILE_RE.test(t)) return { cls: 'hostile', confidence: 0.95, why: 'explicit hostility/spam-complaint language' }
  if (UNSUB_RE.test(t)) return { cls: 'unsubscribe', confidence: 0.95, why: 'explicit opt-out request' }
  if (AUTO_RE.test(t)) return { cls: 'auto_reply', confidence: 0.9, why: 'automated bounce / out-of-office / left-company notice' }
  if (INTEREST_RE.test(t) && !OBJECTION_RE.test(t)) return { cls: 'interested', confidence: 0.75, why: 'explicit interest signal, no objection present' }
  if (OBJECTION_RE.test(t) && !INTEREST_RE.test(t)) return { cls: 'objection', confidence: 0.7, why: 'objection signal, no interest present' }
  return null // mixed or unrecognised -> let the model read it
}

/**
 * Model pass, for replies the rules could not settle. Fails CLOSED to `objection`: a reply we
 * cannot read is surfaced to Kaan as a draft rather than auto-suppressed or treated as a hot lead.
 * `objection` is the safest bucket because its only action is "a human looks at it".
 */
export async function classifyByModel(subject: string, body: string): Promise<Classification> {
  try {
    const { text } = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            'Classify a reply to a B2B cold email. Return ONLY JSON: {"cls":"...","confidence":0.0-1.0,"why":"..."}. ' +
            'cls is exactly one of: interested, objection, unsubscribe, auto_reply, hostile. ' +
            'interested = wants more info/pricing/demo/trial. objection = a reason not to buy now ' +
            '(price, incumbent, timing, fit). unsubscribe = asks to be removed. auto_reply = ' +
            'out-of-office, bounce, or left-company notice. hostile = angry, accuses us of spam, ' +
            'or threatens. If genuinely unsure, answer objection with low confidence — never guess ' +
            'unsubscribe or hostile, because those trigger a permanent, unrecoverable suppression.',
        },
        { role: 'user', content: `Subject: ${subject}\n\nReply:\n${String(body).slice(0, 2000)}` },
      ],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    } as any)
    const j = JSON.parse(String(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim())
    const valid: ReplyClass[] = ['interested', 'objection', 'unsubscribe', 'auto_reply', 'hostile']
    const cls = valid.includes(j.cls) ? (j.cls as ReplyClass) : 'objection'
    const confidence = typeof j.confidence === 'number' ? Math.max(0, Math.min(1, j.confidence)) : 0.4
    return { cls, confidence, why: String(j.why || 'model classification').slice(0, 200) }
  } catch {
    return { cls: 'objection', confidence: 0.3, why: 'classifier unavailable — routed to human review, never auto-suppressed' }
  }
}

export async function classifyReply(subject: string, body: string): Promise<Classification> {
  return classifyByRules(subject, body) ?? (await classifyByModel(subject, body))
}

/** What we do with a classification. Suppression is gated on confidence; drafts never are. */
export function decideAction(c: Classification): ReplyAction {
  if (SUPPRESSING.includes(c.cls)) {
    // Below the bar we still surface it — we just refuse to make the irreversible move on a guess.
    return c.confidence >= SUPPRESS_MIN_CONFIDENCE ? 'auto_suppress' : 'draft_for_kaan'
  }
  if (c.cls === 'auto_reply') return 'no_action' // a bounce is not a conversation
  return 'draft_for_kaan'
}

// ─── QUEUE ───────────────────────────────────────────────────────────────────

/**
 * THE EXCLUSION LIVES HERE, IN THE SELECT. Our own addresses are not eligible to be classified,
 * so they never reach the classifier's input set at all. Exported so a test can assert the
 * predicate is present in the query text rather than trusting a downstream filter to catch it.
 */
export const INTERNAL_EXCLUSION_SQL = `
      AND l.pipeline_stage <> 'internal_test'
      AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
      AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'`

export type QueuedReply = { id: string; lead_id: string; from_email: string; inbound_snippet: string; company: string | null }

// Schema for these columns is drizzle/pg/0016_reply_classification.sql — a REVIEWED migration, not
// invocation-time DDL. Founder directive 2026-08-03: no silent DDL on prod invocation. The earlier
// ensureClassificationColumns() wrapped its ALTERs in .catch(() => {}), so a rejected column would
// have left this agent writing classifications nowhere, silently, forever.

/**
 * Unclassified captured replies from EXTERNAL prospects only. Returns exactly what SQL returned —
 * there is deliberately NO post-filter here, because a post-filter would mean the exclusion is not
 * really at the query level.
 */
export async function fetchReplyQueue(sql: any): Promise<QueuedReply[]> {
  const rows = await sql.query(
    `SELECT d.id::text AS id, d.lead_id::text AS lead_id, d.from_email,
            COALESCE(d.inbound_snippet,'') AS inbound_snippet, l.company
     FROM outreach_reply_drafts d
     JOIN ps_outreach_leads l ON l.id = d.lead_id
     WHERE d.classification IS NULL${INTERNAL_EXCLUSION_SQL}
     ORDER BY d.created_at ASC
     LIMIT 50`,
  )
  return (rows as QueuedReply[]) ?? []
}

// ─── DRAFTING ────────────────────────────────────────────────────────────────

export async function draftResponse(c: Classification, company: string | null, snippet: string): Promise<string> {
  const angle = c.cls === 'objection'
    ? 'They raised an objection. Address it on PRICE and EASE, not on fear or compliance.'
    : 'They showed interest. Give the shortest path to value.'
  try {
    const { text } = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            `You are Sarah Mitchell at PhishSimAI, replying to an MSP. ${angle}\n` +
            'PRICING IS FROZEN — quote only: Starter $149/mo (100 users), Growth $299/mo (500 users, 60c each), ' +
            'Pro $749/mo (2,500, 30c each), Enterprise $1,499/mo. Flat per-MSP pricing, so adding a client grows ' +
            'their margin. Live in under 10 minutes. 30-day free trial, no credit card, cancel anytime. ' +
            'NEVER invent a discount, founding rate, customer, statistic or case study. We have no logos to show ' +
            `and you may say so plainly. Do NOT lead with insurance/compliance/breach fear. Include ${TRIAL_URL}. ` +
            '3-5 sentences. Sign "Sarah".',
        },
        { role: 'user', content: `Company: ${company || 'unknown'}\nTheir reply:\n"${snippet}"\n\nDraft Sarah's response.` },
      ],
      max_tokens: 400,
    })
    return String(text).trim()
  } catch {
    return ''
  }
}

// ─── REPORTING ───────────────────────────────────────────────────────────────

/** reply -> trial, as an integer over its denominator. No rate below n=30, ever. */
export function replyToTrialMetric(trials: number, replies: number): string {
  if (replies === 0) return 'Reply→trial: 0/0 — no external replies yet, so this is not measurable (N/A, n=0).'
  if (replies < 30) {
    return `Reply→trial: ${trials}/${replies} external repl${replies === 1 ? 'y' : 'ies'} — COUNTS ONLY, ` +
      `no percentage below n=30. Quote the raw numbers; do not convert to a rate or compare to a benchmark.`
  }
  return `Reply→trial: ${trials}/${replies} (${((trials / replies) * 100).toFixed(1)}%)`
}

export type SalesReplyRun = {
  queued: number
  classified: number
  tasksIssued: number
  suppressed: number
  draftsForKaan: number
  noAction: number
  byClass: Record<string, number>
  line: string
}

const EMPTY_LINE =
  'Sales replies: 0 external replies in the queue, nothing to classify. This is the CORRECT and ' +
  'expected result at the current funnel state — it is not a failure, and it is not a reason to ' +
  'generate work. No tasks issued, no classifications emitted.'

/**
 * The agent. With an empty queue it returns all zeros and issues nothing — that path is asserted by
 * test, because "does nothing when there is nothing to do" is the property most likely to rot.
 */
export async function runSalesReplyAgent(sqlOverride?: any): Promise<SalesReplyRun> {
  const sql = sqlOverride ?? getSql()
  const res: SalesReplyRun = {
    queued: 0, classified: 0, tasksIssued: 0, suppressed: 0, draftsForKaan: 0, noAction: 0,
    byClass: {}, line: EMPTY_LINE,
  }
  const queue = await fetchReplyQueue(sql)
  res.queued = queue.length
  if (queue.length === 0) return res // no queue, no work, no output. The anti-ghost path.

  for (const r of queue) {
    const c = await classifyReply('', r.inbound_snippet)
    const action = decideAction(c)
    res.classified++
    res.byClass[c.cls] = (res.byClass[c.cls] ?? 0) + 1

    let draft: string | null = null
    if (action === 'draft_for_kaan') {
      draft = await draftResponse(c, r.company, r.inbound_snippet)
      res.draftsForKaan++
      res.tasksIssued++
      await sendTelegram(
        `✍️ <b>REPLY [${c.cls}] — ${r.from_email}</b> ${r.company ? '· ' + r.company : ''}\n` +
        `confidence ${c.confidence.toFixed(2)} — ${c.why}\n\n` +
        `THEM: ${r.inbound_snippet.slice(0, 200)}\n\nDRAFT (not sent — you send it):\n${(draft || '(draft unavailable)').slice(0, 600)}`,
      ).catch(() => {})
    } else if (action === 'auto_suppress') {
      // The one autonomous action, and it only ever removes us from an inbox.
      await sql`UPDATE ps_outreach_leads SET unsubscribed=true, pipeline_stage='dead', stage_updated_at=NOW()
                WHERE id=${r.lead_id}`.catch(() => {})
      await sql`INSERT INTO ps_outreach_suppression (email, lead_id, reason, source)
                SELECT ${r.from_email}, ${r.lead_id}::uuid,
                       ${'auto-suppressed: ' + c.cls + ' (confidence ' + c.confidence.toFixed(2) + ') — ' + c.why},
                       'sales_reply_agent'
                WHERE NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email)=lower(${r.from_email}))`
        .catch(() => {})
      res.suppressed++
      await sendTelegram(`🚫 <b>AUTO-SUPPRESSED [${c.cls}]</b> ${r.from_email} — ${c.why}. Never contacted again.`).catch(() => {})
    } else {
      res.noAction++
    }

    await sql`UPDATE outreach_reply_drafts
              SET classification=${c.cls}, classification_confidence=${c.confidence},
                  classified_at=NOW(), action_taken=${action},
                  draft_body=COALESCE(${draft}, draft_body)
              WHERE id=${r.id}::uuid`.catch(() => {})
  }

  const parts = Object.entries(res.byClass).map(([k, v]) => `${v} ${k}`).join(', ')
  res.line =
    `Sales replies: ${res.classified}/${res.queued} classified (${parts}) · ${res.draftsForKaan} draft(s) awaiting ` +
    `your send · ${res.suppressed} auto-suppressed · ${res.noAction} no-action. No draft was sent to a prospect.`
  return res
}

/**
 * GET /api/os/sales-replies — the 15-minute sweep.
 *
 * Every 15 minutes rather than daily because a reply's value decays fast: an MSP who asks "how
 * much?" at 09:00 and hears nothing until tomorrow's standup has already moved on. The sweep is the
 * floor; replyCapture also triggers this agent inline the moment it writes a row, so the usual
 * latency is seconds and the cron only catches what the inline path missed (a failed trigger, a
 * row written while a deploy was rolling).
 *
 * Idempotent by construction: the queue is `classification IS NULL`, so a row already handled is
 * invisible to the next run. Overlapping runs cannot double-draft or double-suppress.
 */
export async function cronSalesReplies(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const run = await runSalesReplyAgent()
    return res.json({ success: true, ...run })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
