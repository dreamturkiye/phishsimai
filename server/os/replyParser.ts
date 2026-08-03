import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { generateMagicCheckoutLink, buildCheckoutEmail } from './magicLink'
import { recordConversion } from './abTest'
import { llmComplete } from './llmChat'

export type ReplyIntent =
  | 'interested' | 'not_now' | 'not_interested' | 'question'
  | 'unsubscribe' | 'out_of_office' | 'spam_complaint' | 'unknown'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
}

// PS-CHECKOUT-GATE-01: the classifier decides whether a prospect gets a LIVE payment link, so it
// is biased HARD against a false 'interested'. The costly error is firing checkout at someone who
// declined; the cheap error is holding a genuine yes for a human glance. So: only 'interested' on
// an explicit, unambiguous request to proceed/buy/start; auto-replies and rejections get their own
// label and NEVER 'interested'; anything unclear is 'unknown', never 'interested'.
async function classifyIntent(body: string) {
  try {
    const { text } = await llmComplete({
      messages: [{ role: 'user', content:
        'Classify this email reply from an IT professional or MSP prospect. JSON only, no markdown.\n' +
        'RULES (follow exactly):\n' +
        '- "interested" ONLY if the sender EXPLICITLY wants to proceed, buy, start, get pricing to purchase, or book — an unambiguous yes. When in any doubt, DO NOT use "interested".\n' +
        '- An automatic out-of-office / vacation / "I am away" reply is "out_of_office", NEVER "interested".\n' +
        '- "remove me", "stop", "take me off", "not the right person", "unsubscribe" → "unsubscribe", NEVER "interested".\n' +
        '- A clear no / "not for us" → "not_interested". "maybe later" / "circle back" → "not_now".\n' +
        '- A genuine question that is not yet a yes → "question".\n' +
        '- Vague, one-word, unclear, or anything you are not sure about → "unknown". Never guess "interested".\n' +
        'Email: """' + body.slice(0, 800) + '"""\n' +
        'Return: {"intent":"interested|not_now|not_interested|question|unsubscribe|out_of_office|spam_complaint|unknown","confidence":0.0-1.0,"summary":"one sentence"}' }],
      max_tokens: 100,
      temperature: 0.2,
    })
    return JSON.parse(text || '{}')
  } catch {
    return { intent: 'unknown' as ReplyIntent, confidence: 0, summary: 'Parse failed' }
  }
}

// PS-CHECKOUT-GATE-01: the pure policy that turns a classifier verdict into an action. NOTHING
// outbound is ever automatic — only internal state changes are. A checkout link is held for the
// founder AND only when the model is confident; a low-confidence 'interested' is demoted to a held
// text reply, never a checkout; out_of_office / unknown reach neither. Exported so the gate is
// unit-tested rather than trusted.
export const INTERESTED_MIN_CONFIDENCE = 0.85
export type ReplyAction = 'auto_unsubscribe' | 'auto_dead' | 'hold_checkout' | 'hold_text' | 'ignore'
export function decideReplyAction(intent: string, confidence: number): { effectiveIntent: string; action: ReplyAction } {
  if (intent === 'unsubscribe' || intent === 'spam_complaint') return { effectiveIntent: intent, action: 'auto_unsubscribe' }
  if (intent === 'not_interested') return { effectiveIntent: intent, action: 'auto_dead' }
  if (intent === 'interested') {
    return confidence >= INTERESTED_MIN_CONFIDENCE
      ? { effectiveIntent: 'interested', action: 'hold_checkout' }
      : { effectiveIntent: 'question', action: 'hold_text' } // not confident enough to solicit payment
  }
  if (intent === 'question' || intent === 'not_now') return { effectiveIntent: intent, action: 'hold_text' }
  return { effectiveIntent: intent, action: 'ignore' } // out_of_office, unknown, anything else
}

async function buildAutoResponse(lead: any, intent: ReplyIntent, replyBody: string): Promise<string> {
  const prompts: Record<string, string> = {
    question: `You are Sarah Mitchell, Head of Compliance Partnerships at PhishSimAI. An IT/MSP prospect asked a question. Company: ${lead.company}. Reply: "${replyBody.slice(0, 300)}". Answer directly. PhishSimAI runs phishing simulations, live in under 10 minutes. PRICING IS FROZEN AND YOU MAY NOT ALTER IT: Starter $149/mo (100 users), Growth $299/mo (500 users = 60c each), Pro $749/mo (2,500 = 30c each), Enterprise $1,499/mo. Flat per-MSP pricing, so adding a client grows their margin. 30-day free trial, no credit card, cancel anytime. Never invent a discount or founding rate. End by offering the free trial. 3-4 sentences max.`,
    not_now: `You are Sarah Mitchell at PhishSimAI. Prospect said not right now. Company: ${lead.company}. Reply: "${replyBody.slice(0, 200)}". Write 2 gracious sentences leaving the door open.`,
  }
  const prompt = prompts[intent] || ''
  if (!prompt) return ''
  try {
    const { text } = await llmComplete({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    })
    return text || ''
  } catch { return '' }
}

// PS-REPLY-NOISE-01: obviously-synthetic senders (liveness probes, test/reserved TLDs) must never
// reach the founder's live channel or spend an LLM classification. Reserved per RFC 2606 / 6761.
export function isSyntheticSender(email: string): boolean {
  const e = (email || '').toLowerCase().trim()
  return /@([^@]*\.)?(invalid|test|example|localhost)$/.test(e) ||
    /@example\.(com|net|org)$/.test(e) ||
    /(^|[._-])(liveness|healthcheck|probe|synthetic|test)([._-]|@)/.test(e)
}

export async function processReply(fromEmail: string, subject: string, body: string) {
  const NOOP = { matched: false, intent: null as string | null, confidence: 0, summary: '', autoResponseSent: false, checkoutLinkSent: false, escalate: false }
  // PS-REPLY-NOISE-01: gate BEFORE any side effect. A synthetic probe returns inert.
  if (isSyntheticSender(fromEmail)) {
    console.log(`[replyParser] dropped synthetic sender ${fromEmail} — no classify, no notify`)
    return NOOP
  }
  const sql = getSql()
  const leads = await sql`SELECT * FROM ps_outreach_leads WHERE LOWER(email)=LOWER(${fromEmail}) LIMIT 1`
  const lead = leads[0]
  // PS-REPLY-NOISE-01: only PROSPECTS in our outreach DB are actionable. An inbound from an
  // unknown sender — a bounce, an out-of-office, spam — is not a "reply" to anything and must not
  // classify (an LLM call) or fire the founder's channel. This is also why the earlier synthetic
  // liveness probe should never have paged: it matched no lead, yet the old code Telegram'd every
  // processed inbound unconditionally at the end. No match → do nothing.
  if (!lead) {
    console.log(`[replyParser] inbound from unknown sender ${fromEmail} — no matching lead, ignored`)
    return NOOP
  }
  const { intent: rawIntent, confidence, summary } = await classifyIntent(body)
  const { effectiveIntent, action } = decideReplyAction(rawIntent, Number(confidence) || 0)
  const ts = new Date().toISOString()
  let held = false

  // ── AUTOMATIC — internal state only, NEVER an outbound email to the prospect ──
  if (action === 'auto_unsubscribe') {
    await sql`UPDATE ps_outreach_leads SET unsubscribed=true, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
    await sendTelegram('PHISHSIMAI UNSUB: ' + fromEmail + ' (' + lead.company + ')')
  } else if (action === 'auto_dead') {
    await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
    await sendTelegram(`PHISHSIMAI NOT INTERESTED: ${lead.company} <${fromEmail}> — marked dead. "${summary}"`)

  // ── HELD — an outbound draft the founder must approve before anything is sent ──
  } else if (action === 'hold_checkout') {
    // PS-CHECKOUT-GATE-01: a confident 'interested' NO LONGER auto-fires a payment link. The lead
    // DID reply (real fact → mark it), but the Stripe checkout email is DRAFTED and HELD; it only
    // sends on the founder's explicit approval.
    await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='engaged', stage_updated_at=${ts} WHERE id=${lead.id}`
    await recordConversion(String(lead.id), 'touch1_subject', 'replied').catch(() => {})
    const checkoutUrl = generateMagicCheckoutLink(String(lead.id), 'starter')
    const html = buildCheckoutEmail(String(lead.name), String(lead.company), checkoutUrl)
    await createReplyApproval(sql, lead, { kind: 'checkout', intent: effectiveIntent, confidence: Number(confidence) || 0, summary, subject: `Getting ${lead.company} set up on PhishSimAI`, html, checkoutUrl })
    held = true
  } else if (action === 'hold_text') {
    await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='engaged', stage_updated_at=${ts} WHERE id=${lead.id}`
    const responseText = await buildAutoResponse(lead, (effectiveIntent as ReplyIntent), body)
    if (responseText) {
      const html = responseText.split('\n').map((l: string) => l ? '<p style="font-family:-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">' + l + '</p>' : '').join('')
      await createReplyApproval(sql, lead, { kind: 'text', intent: effectiveIntent, confidence: Number(confidence) || 0, summary, subject: 'Re: ' + subject.replace(/^Re:\s*/i, ''), html })
      held = true
    } else {
      await sendTelegram(`PS REPLY (no draft produced): ${lead.company} <${fromEmail}> — ${effectiveIntent}. "${summary}"`)
    }

  // ── IGNORE — out_of_office / unknown: note it, send nothing, solicit nothing ──
  } else {
    await sendTelegram(`PS REPLY (${effectiveIntent}, no action): ${lead.company} <${fromEmail}>. "${summary}"`)
  }

  return { matched: true, intent: effectiveIntent, confidence: Number(confidence) || 0, summary, held, action, autoResponseSent: false, checkoutLinkSent: false, escalate: held }
}

/**
 * PS-CHECKOUT-GATE-01: persist an outbound draft as a PENDING approval (reusing `escalations`) and
 * ping the founder with an inline Approve/Reject. Nothing is emailed to the prospect here — the
 * draft only leaves when APPROVE_REPLY <id> is confirmed (telegramCommands → sendApprovedReply).
 */
async function createReplyApproval(
  sql: ReturnType<typeof getSql>, lead: any,
  d: { kind: 'checkout' | 'text'; intent: string; confidence: number; summary: string; subject: string; html: string; checkoutUrl?: string },
): Promise<void> {
  const rows = (await sql`
    INSERT INTO escalations (product_id, category, payload, status)
    VALUES ('phishsimai', 'reply_approval', ${JSON.stringify({
      lead_id: String(lead.id), from_email: lead.email, company: lead.company, name: lead.name,
      kind: d.kind, intent: d.intent, confidence: d.confidence, summary: d.summary, subject: d.subject, html: d.html,
      checkout_url: d.checkoutUrl ?? null,
    })}::jsonb, 'pending')
    RETURNING id`) as Array<{ id: number | string }>
  const id = rows[0]?.id
  const head = d.kind === 'checkout' ? '💳 <b>CHECKOUT APPROVAL</b>' : '✉️ <b>REPLY APPROVAL</b>'
  const warn = d.kind === 'checkout'
    ? '\n⚠️ Approving emails a LIVE Stripe checkout link. Nothing is sent until you approve.'
    : '\nDrafted reply is held — nothing is sent until you approve.'
  await sendTelegram(
    `${head}\n${lead.company} <${lead.email}> replied <b>${d.intent}</b> (${Math.round(d.confidence * 100)}% conf)\n"${d.summary}"${warn}\n\n` +
    `✅ <code>APPROVE_REPLY ${id}</code>   🚫 <code>REJECT_REPLY ${id}</code>`,
    [[{ text: '✅ Approve & send', callback_data: `APPROVE_REPLY ${id}` }, { text: '🚫 Reject', callback_data: `REJECT_REPLY ${id}` }]],
  ).catch(() => {})
}

/** Approve a held reply: send the stored draft, mark resolved. Idempotent — a non-pending id no-ops. */
export async function sendApprovedReply(escalationId: number): Promise<{ ok: boolean; message: string }> {
  const sql = getSql()
  const rows = (await sql`SELECT id, payload, status FROM escalations WHERE id=${escalationId} AND category='reply_approval'`) as Array<{ payload: any; status: string }>
  const e = rows[0]
  if (!e) return { ok: false, message: `No pending reply approval #${escalationId}` }
  if (e.status !== 'pending') return { ok: false, message: `Approval #${escalationId} already ${e.status} — not sending again` }
  const p = e.payload
  await sendEmail(p.from_email, p.subject, p.html)
  await sql`UPDATE escalations SET status='approved', resolved_at=now(), resolved_via='telegram' WHERE id=${escalationId}`
  return { ok: true, message: `Sent ${p.kind === 'checkout' ? 'CHECKOUT link' : 'reply'} to ${p.company} <${p.from_email}>` }
}

/** Reject a held reply: mark resolved, send nothing. */
export async function rejectReply(escalationId: number): Promise<{ ok: boolean; message: string }> {
  const sql = getSql()
  const rows = (await sql`SELECT payload, status FROM escalations WHERE id=${escalationId} AND category='reply_approval'`) as Array<{ payload: any; status: string }>
  const e = rows[0]
  if (!e) return { ok: false, message: `No pending reply approval #${escalationId}` }
  if (e.status !== 'pending') return { ok: false, message: `Approval #${escalationId} already ${e.status}` }
  await sql`UPDATE escalations SET status='rejected', resolved_at=now(), resolved_via='telegram' WHERE id=${escalationId}`
  return { ok: true, message: `Rejected — nothing sent to ${e.payload?.company ?? 'prospect'}` }
}

export const processInboundReply = processReply
