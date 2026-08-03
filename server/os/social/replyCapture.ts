// PS-REPLY-CAPTURE-01 — inbound reply capture for the outreach ramp.
//
// Option B (forward, no MX change): Google Workspace routing rule copies inbound sarah@phishsimai.com
// to a mail-parse relay that POSTs the message here. This handler matches sender -> lead, sets
// replied=true, surfaces the reply to Kaan on Telegram immediately, and DRAFTS a response (never
// auto-sends). Capturing/surfacing is autonomous from day 1 (safe); auto-REPLY to a real prospect is
// gated behind the reply-trust flag — same earned-autonomy pattern as Sarah's posts. An untested
// auto-reply into a live sales conversation is the ScrollFuel-fabrication risk in a worse place.
import { getSql } from '../conn'
import { sendTelegram } from '../telegram'
import { llmComplete } from '../llmChat'

const COMPANY = 'phishsimai'

async function ensureReplyTables() {
  const sql = getSql()
  // additive columns on the lead + a dedicated draft store (drafts are never auto-sent)
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`.catch(() => {})
  await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS last_reply_snippet TEXT`.catch(() => {})
  await sql`CREATE TABLE IF NOT EXISTS outreach_reply_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID,
    from_email TEXT NOT NULL,
    inbound_snippet TEXT,
    draft_body TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {})
}

// Reply-trust flag — same pattern as outreach_ramp_enabled / linkedin_autopost. '1' = graduated to
// autonomous reply. Until then every reply is a DRAFT for Kaan. (Auto-send itself is deliberately not
// wired yet — graduation is earned on reply quality; this flag is the future gate.)
export async function isReplyAutoEnabled(): Promise<boolean> {
  const sql = getSql()
  const r = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY} AND type='operating' AND key='outreach_reply_autopost' LIMIT 1`.catch(() => [])
  return String((r as any[])[0]?.value ?? '') === '1'
}

// PS-REPLY-AUTH-01: close the injection hole. CloudMailin posts with HTTP Basic Auth (its native
// target-authentication). Enforce it ONLY when the secret is configured, so setting it up can't break
// the already-live pipeline: secret unset -> allow + warn (current behaviour); secret set -> reject any
// request whose Basic credentials don't match. Kaan sets the same user:pass in Vercel AND CloudMailin.
function checkInboundAuth(req: any): boolean {
  const pass = process.env.INBOUND_WEBHOOK_PASS
  if (!pass) {
    console.warn('[reply-capture] webhook UNAUTHENTICATED — set INBOUND_WEBHOOK_PASS (+ CloudMailin) to close it')
    return true
  }
  const user = process.env.INBOUND_WEBHOOK_USER || 'phishsim-inbound'
  const m = String(req.headers?.authorization || '').match(/^Basic\s+(.+)$/i)
  if (!m) return false
  const [u, ...rest] = Buffer.from(m[1], 'base64').toString().split(':')
  return u === user && rest.join(':') === pass
}

/**
 * PS-REPLY-TRIPWIRE-01 — the arming mechanism for reply capture.
 *
 * The loop cannot be proven by a fabricated event (that is the failure we are removing), so it
 * self-verifies on the FIRST real reply instead:
 *   • re-read the row after the UPDATE and confirm `replied` is actually true;
 *   • success  -> record `reply_capture_verified` in janet_memory once, stay SILENT;
 *   • failure  -> Telegram alarm, ONCE (guarded by `reply_capture_alarmed`), so a broken writer
 *                 cannot be lost in noise and cannot spam on every subsequent reply.
 *
 * The alarm is deliberately not wrapped in a silenceable try/catch-and-forget: if the alarm itself
 * fails we log loudly. A tripwire that can fail quietly is not a tripwire.
 */
async function assertReplyWritten(sql: any, leadId: string, fromEmail: string): Promise<void> {
  try {
    const back = (await sql`SELECT replied, replied_at FROM ps_outreach_leads WHERE id=${leadId} LIMIT 1`) as any[]
    const wrote = back[0]?.replied === true && back[0]?.replied_at != null
    if (wrote) {
      // First verified capture ever — record it and say nothing. Silence IS the success signal.
      await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
        VALUES (${COMPANY}, 'operating', 'reply_capture_verified',
                ${'verified ' + new Date().toISOString() + ' via ' + fromEmail}, 1, 'tripwire')
        ON CONFLICT DO NOTHING`.catch(() => {})
      console.log('[reply-capture] tripwire OK — writer verified for', fromEmail)
      return
    }
    const already = (await sql`SELECT 1 FROM janet_memory WHERE company_id=${COMPANY}
      AND type='operating' AND key='reply_capture_alarmed' LIMIT 1`.catch(() => [])) as any[]
    if (already.length) return // already alarmed once; do not repeat
    await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
      VALUES (${COMPANY}, 'operating', 'reply_capture_alarmed',
              ${'FAILED ' + new Date().toISOString() + ' for ' + fromEmail}, 1, 'tripwire')`.catch(() => {})
    await sendTelegram(
      `🚨 <b>REPLY CAPTURE WRITER FAILED</b>\nA real inbound reply from ${fromEmail} matched lead ${leadId}, ` +
      `but ps_outreach_leads.replied did NOT persist. Every reply metric is undercounting from now on. ` +
      `This alarm fires ONCE — check server/os/social/replyCapture.ts and the DB before the next reply.`,
    )
  } catch (e) {
    // Never fail the response — but never swallow this either.
    console.error('[reply-capture] TRIPWIRE ITSELF FAILED for', fromEmail, e)
  }
}

function extractEmail(raw: string): string {
  const m = String(raw || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return m ? m[0].toLowerCase() : ''
}

async function draftReply(fromEmail: string, lead: any, snippet: string): Promise<string> {
  const { text } = await llmComplete({
    messages: [
      {
        role: 'system',
        content: `You are Sarah Mitchell, Head of Compliance Partnerships at PhishSimAI, replying to an MSP who responded to a cold email about white-label phishing simulation + compliance certificates.
Voice: warm, concise, helpful peer. NEVER fabricate stats, customers, or claims. No invented numbers. If they asked a question, answer it plainly. Soft next step (30-day trial, no CC) only if natural. 3-6 sentences. Sign "Sarah".`,
      },
      { role: 'user', content: `Lead: ${lead.company || fromEmail}\nTheir reply:\n"${snippet}"\n\nDraft Sarah's response.` },
    ],
    max_tokens: 400,
  })
  return text.trim()
}

// Inbound webhook. Accepts flexible payload shapes from common mail-parse relays (Resend inbound,
// CloudMailin, Mailgun Routes, or a plain {from,subject,text}). Always 200s so the relay doesn't retry-storm.
export async function resendInbound(req: any, res: any) {
  try {
    if (!checkInboundAuth(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const b = req.body || {}
    const from = extractEmail(b.from || b.sender || b.From || b.envelope?.from || b.from_email || b['from-email'] || '')
    const subject = String(b.subject || b.Subject || '')
    const text = String(b.text || b['body-plain'] || b['stripped-text'] || b.plain || b.TextBody || b.html || '').trim()
    if (!from) return res.json({ ok: true, matched: false, note: 'no sender email in payload' })

    await ensureReplyTables()
    const sql = getSql()
    const snippet = text.replace(/\s+/g, ' ').slice(0, 500) || subject
    const rows = (await sql`SELECT id, email, company FROM ps_outreach_leads WHERE LOWER(email)=LOWER(${from}) LIMIT 1`.catch(() => [])) as any[]
    const lead = rows[0]

    if (lead) {
      await sql`UPDATE ps_outreach_leads SET replied=true, replied_at=NOW(), last_reply_snippet=${snippet},
        pipeline_stage='engaged', stage_updated_at=NOW() WHERE id=${lead.id}`.catch(() => {})
      // PS-REPLY-TRIPWIRE-01: assert the writer actually ran. This handler swallows its own errors
      // by design (a relay must never retry-storm), which is exactly how a write can fail in total
      // silence — the same "read surface with no verified writer" pattern that produced
      // replied_ever=0 against a real reply. So we read the row BACK and prove it changed.
      // Silent on success. On failure, one un-silenceable alarm — the operator learns on the FIRST
      // real reply, not the first quarterly review.
      await assertReplyWritten(sql, lead.id, from)
    }

    // Surface to Kaan immediately — replies are the highest-value revenue signal.
    await sendTelegram(
      `📬 <b>REPLY — ${from}</b>${lead ? ` · ${lead.company || ''}` : ' · (no lead match)'}\n` +
      (subject ? `Subj: ${subject.slice(0, 100)}\n` : '') +
      `${snippet.slice(0, 350)}`,
    ).catch(() => {})

    // Draft a response — NEVER auto-sent. Stored for Kaan's approval; the trust flag gates any future
    // auto-reply (not wired — graduation is earned on reply quality).
    let drafted = false
    if (lead) {
      const draft = await draftReply(from, lead, snippet).catch(() => null)
      if (draft) {
        await sql`INSERT INTO outreach_reply_drafts (lead_id, from_email, inbound_snippet, draft_body)
          VALUES (${lead.id}, ${from}, ${snippet}, ${draft})`.catch(() => {})
        drafted = true
        const auto = await isReplyAutoEnabled().catch(() => false)
        await sendTelegram(
          `✍️ Draft reply ready for approval — ${lead.company || from}\n` +
          `${draft.slice(0, 400)}\n\n` +
          `Auto-reply: ${auto ? 'flag ON (still drafts-only until reply-quality graduation)' : 'OFF — drafts-only'}`,
        ).catch(() => {})
      }
    }

    return res.json({ ok: true, matched: !!lead, replied: !!lead, drafted })
  } catch (e: any) {
    return res.json({ ok: false, error: String(e?.message || e) })
  }
}
