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
import { isSyntheticSender } from '../replyParser'

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

    // PS-REPLY-NOISE-01, extended to this handler (OS 7.4) — but gated AFTER the lead
    // lookup, deliberately.
    //
    // The GSA governance layer probes this endpoint weekly, and an ungated probe would
    // mark a lead replied, alert Kaan, and manufacture the very inbound event that
    // GTM-REPLY-CAPTURE reads as proof the channel works — an auditor forging its own
    // evidence. So the gate is necessary.
    //
    // Ordering it after the lookup is what keeps it safe. The synthetic pattern matches
    // any address with a `test`/`probe` token, and dropping a REAL prospect who happens
    // to mail from `test@theirmsp.com` would recreate the exact blindness this system
    // exists to detect. A sender that matches a lead we actually emailed is by definition
    // not synthetic, so the lead match wins. The GSA probe uses a reserved .invalid domain
    // that can never match a lead, so it still lands here and stays inert.
    if (!lead && isSyntheticSender(from)) {
      console.log(`[reply-capture] dropped synthetic sender ${from} — no lead match, no notify, no row`)
      return res.json({ ok: true, matched: false, synthetic: true })
    }

    if (lead) {
      await sql`UPDATE ps_outreach_leads SET replied=true, replied_at=NOW(), last_reply_snippet=${snippet},
        pipeline_stage='engaged', stage_updated_at=NOW() WHERE id=${lead.id}`.catch(() => {})
    }

    // PS-REPLY-PROOF-01: record EVERY genuine inbound, matched or not.
    //
    // Previously a row was written only when the sender matched a lead, so an unmatched
    // reply left no trace in the database at all — it fired a Telegram and vanished. That
    // had two costs. Operationally, replies from a colleague, a forwarded thread, or a
    // different address than the one we mailed were invisible to every report. And it made
    // capture unprovable: replyCaptureProven() and GTM-REPLY-CAPTURE both read this table,
    // so an end-to-end test reply from the founder's own mailbox would light up Telegram
    // and still leave the system saying capture had never received anything.
    //
    // lead_id is nullable, so an unmatched inbound is a first-class row rather than a
    // special case. This is the artifact that proves the relay works.
    const inbound = (await sql`INSERT INTO outreach_reply_drafts (lead_id, from_email, inbound_snippet, draft_body, status)
      VALUES (${lead?.id ?? null}, ${from}, ${snippet}, NULL, ${lead ? 'awaiting_draft' : 'unmatched_inbound'})
      RETURNING id`
      .catch((e: any) => {
        console.error('[reply-capture] inbound row insert failed:', e?.message || e)
        return [] as any[]
      })) as any[]
    const inboundId = inbound[0]?.id ?? null

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
        // Fill in the row recorded above rather than inserting a second one: the inbound
        // EVENT and the drafted reply are one fact, and two rows would double-count the
        // evidence that capture works.
        if (inboundId) {
          await sql`UPDATE outreach_reply_drafts SET draft_body=${draft}, status='pending_review' WHERE id=${inboundId}`.catch(() => {})
        } else {
          await sql`INSERT INTO outreach_reply_drafts (lead_id, from_email, inbound_snippet, draft_body)
            VALUES (${lead.id}, ${from}, ${snippet}, ${draft})`.catch(() => {})
        }
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
