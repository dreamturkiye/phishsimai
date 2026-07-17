/**
 * PS-UNSUBSCRIBE-404 — the opt-out link that 245 delivered emails already carry.
 *
 * Every cold email since 2026-06-04 has shipped `https://phishsimai.com/unsubscribe?e=<token>`
 * (sequences.ts:31,42,52,62 and abTest.ts). There was no route. The link fell through
 * vercel.json's SPA catch-all to NotFound — a 404 dressed as a page. CAN-SPAM requires a
 * working opt-out mechanism, so this is a legal defect, not a technical one.
 *
 * Design constraints, each load-bearing:
 *  - NO AUTH. It must work from a cold click in Outlook by someone who has never seen this
 *    product's login. A recipient must never be asked to authenticate to stop being emailed.
 *  - GET, and it acts immediately. Some scanners (Outlook Safe Links, Gmail proxy) prefetch
 *    links, which can unsubscribe someone who never clicked. That is the SAFE direction to
 *    fail: a false unsubscribe costs one lead; a false send costs a CAN-SPAM violation.
 *    Erring toward not-emailing is the only acceptable bias here.
 *  - IDEMPOTENT. A second click, a prefetch, and a retry all show the same confirmation.
 *  - Unknown/garbage tokens still render success. Telling a stranger "that address is not in
 *    our database" leaks list membership to anyone who can guess a base64 string.
 */

import type { Request, Response } from 'express'
import { getSql } from './conn'

/** Mirrors the emitter exactly: Buffer.from(email).toString('base64url') — sequences.ts:158. */
export function decodeUnsubToken(token: string): string | null {
  try {
    const email = Buffer.from(token, 'base64url').toString('utf8').trim()
    // A token is only valid if it round-trips to something shaped like an address.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return email
  } catch {
    return null
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#111;line-height:1.6">
${body}
<p style="color:#999;font-size:12px;margin-top:40px">PhishSimAI · <a href="https://phishsimai.com" style="color:#999">phishsimai.com</a></p>
</body></html>`
}

export async function unsubscribePage(req: Request, res: Response) {
  const token = String((req.query?.e as string) ?? '')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Never let a scanner or proxy cache the outcome of a state change.
  res.setHeader('Cache-Control', 'no-store')

  if (!token) {
    res.status(400).send(
      page('Unsubscribe', `<h2>Unsubscribe link incomplete</h2>
<p>This link is missing its identifier. Reply to any email from us with the word <b>unsubscribe</b> and we will remove you by hand.</p>`),
    )
    return
  }

  const email = decodeUnsubToken(token)
  if (!email) {
    // Malformed token: show success. See the list-membership note in the header.
    res.status(200).send(
      page('Unsubscribed', `<h2>You're unsubscribed</h2>
<p>You will not receive further emails from PhishSimAI.</p>`),
    )
    return
  }

  try {
    const sql = getSql()
    const ts = new Date().toISOString()
    // pipeline_stage='dead' alongside unsubscribed=true: PS-TOUCH-GATE-01 established that
    // touch-2..5 honour `unsubscribed`, and touch-1 additionally honours pipeline_stage.
    // Setting both means every send path drops this lead, not just most of them.
    const rows = await sql`
      UPDATE ps_outreach_leads
      SET unsubscribed = true, pipeline_stage = 'dead', stage_updated_at = ${ts}
      WHERE LOWER(email) = LOWER(${email})
      RETURNING email`
    // rows.length === 0 means the address is not on our list. That is still a success for the
    // human: they are not going to be emailed. Fail loud in the log, quiet on the page.
    if (rows.length === 0) {
      console.warn('[unsubscribe] token decoded to an address not in ps_outreach_leads:', email)
    } else {
      console.log('[unsubscribe] opted out:', email)
    }
    res.status(200).send(
      page('Unsubscribed', `<h2>You're unsubscribed</h2>
<p><b>${email}</b> has been removed. You will not receive further emails from PhishSimAI.</p>
<p style="color:#666;font-size:14px">Removed in error? Reply to any earlier email and we will restore you.</p>`),
    )
  } catch (e: any) {
    // A failure here means we may keep emailing someone who asked us to stop. That is the
    // legal exposure this route exists to close, so it must be loud and it must be honest —
    // never show "you're unsubscribed" over a write that did not land.
    console.error('[unsubscribe] WRITE FAILED for', email, e)
    res.status(500).send(
      page('Unsubscribe failed', `<h2>Something went wrong</h2>
<p>We could not process your request automatically. Please reply to any email from us with the word <b>unsubscribe</b> — we will remove you manually and we will not email you again in the meantime.</p>`),
    )
  }
}
