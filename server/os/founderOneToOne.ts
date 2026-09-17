/**
 * PS-TRIAL-START-01 — founder-review 1:1 queue for exhausted warm leads.
 *
 * Live 2026-09-17: warm CTA → TRUE trial 0/17; 90/91/92 exhausted. Adding touch 93
 * or re-blasting warm is forbidden. This path does NOT send email. It drafts a
 * personalized 1:1 brief (call / founder-personal email / LinkedIn DM) onto
 * outreach_reply_drafts (classification=founder_1to1) and pages Telegram.
 *
 * Dex / CAN-SPAM / daily caps / bounce breaker are untouched because nothing
 * here hits sendEmail or outreach_sequence_outbox.
 */
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { trialCtaUrl } from './trialCta'
import { COMPANY_ID } from './version'

export const FOUNDER_1TO1_CLASS = 'founder_1to1'
export const FOUNDER_1TO1_CAP = 5
export const FOUNDER_1TO1_ESCALATE_HOURS = 2
export const WARM_EXHAUSTED_TOUCHES = [90, 91, 92] as const

const ESCALATE_MEMORY_KEY = 'founder_1to1_escalate_at'

export type FounderOneToOneLead = {
  id: string
  name: string | null
  company: string | null
  email: string
  last_reply_snippet?: string | null
}

export type FounderOneToOneQueued = {
  leadId: string
  email: string
  company: string
  draftId?: string
}

export type FounderOneToOneResult = {
  queued: number
  escalated: boolean
  skipped: number
  reason: string
  drafts: FounderOneToOneQueued[]
}

export const EMPTY_FOUNDER_1TO1: FounderOneToOneResult = {
  queued: 0,
  escalated: false,
  skipped: 0,
  reason: 'not attempted',
  drafts: [],
}

export function founderOneToOneDraftBody(lead: FounderOneToOneLead): string {
  const name = String(lead.name || '').trim() || 'there'
  const company = String(lead.company || '').trim() || 'their MSP'
  const snippet = String(lead.last_reply_snippet || '').trim().slice(0, 400) || '(no reply snippet on file)'
  const cta = trialCtaUrl({
    source: 'founder_1to1',
    medium: 'founder',
    campaign: 'exhausted_warm',
    email: lead.email,
  })
  return [
    `FOUNDER 1:1 — do not send via Sarah sequence. Do not add touch 93.`,
    ``,
    `Lead: ${name} <${lead.email}>`,
    `Company: ${company}`,
    `Why now: already received warm CTA touches 90 + 91 + 92. Automated email is exhausted.`,
    `Last reply: ${snippet}`,
    ``,
    `Pick one (you send it, not the sequence engine):`,
    `1. Personal email from you with this trial link: ${cta}`,
    `2. A 10-minute call — offer to stand up their first campaign on the call.`,
    `3. LinkedIn DM with the same no-card trial URL.`,
    ``,
    `Suggested opener:`,
    `"${name} — you wrote back and I don't want to keep dropping sequence mail on ${company}. 30-day trial, no card, live in 10 minutes: ${cta}  If you'd rather I run the first campaign for you, reply with a time."`,
  ].join('\n')
}

export function founderOneToOneTelegramHtml(opts: {
  queued: FounderOneToOneQueued[]
  kind: 'queued' | 'pending'
  hours?: number
}): string {
  const h = opts.hours != null ? ` (${opts.hours}h waiting)` : ''
  const title =
    opts.kind === 'pending'
      ? `📋 FOUNDER 1:1 still pending review${h}.`
      : `📋 FOUNDER 1:1 queued for review — exhausted warm leads (NOT email).`
  const lines = opts.queued
    .slice(0, FOUNDER_1TO1_CAP)
    .map((d) => `• ${escapeHtml(d.company)} &lt;${escapeHtml(d.email)}&gt;`)
    .join('\n')
  return (
    `${title}\n` +
    `Do <b>not</b> add touch 93. Do <b>not</b> re-blast 90–92.\n` +
    (lines || '• (none)') +
    `\nHQ → Pipeline tab.`
  )
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sqlRows(result: unknown): any[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object' && Array.isArray((result as any).rows)) return (result as any).rows
  return []
}

export async function listFounderOneToOneQueue(sqlOverride?: any): Promise<Array<{
  id: string
  email: string
  company: string
  name: string
  snippet: string
  createdAt: string
  draftBody: string
}>> {
  const sql = sqlOverride ?? getSql()
  const rows = sqlRows(await sql`
    SELECT d.id::text AS id, COALESCE(l.email, d.from_email) AS email,
           COALESCE(l.company, '') AS company, COALESCE(l.name, '') AS name,
           COALESCE(d.inbound_snippet, '') AS snippet,
           COALESCE(d.draft_body, '') AS draft_body,
           d.created_at::text AS created_at
    FROM outreach_reply_drafts d
    LEFT JOIN ps_outreach_leads l ON l.id = d.lead_id
    WHERE d.classification = ${FOUNDER_1TO1_CLASS}
      AND d.status = 'pending_review'
    ORDER BY d.created_at ASC
    LIMIT 20
  `.catch(() => []))
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email || ''),
    company: String(r.company || ''),
    name: String(r.name || ''),
    snippet: String(r.snippet || ''),
    createdAt: String(r.created_at || ''),
    draftBody: String(r.draft_body || ''),
  }))
}

/**
 * Crisis-tick: queue up to FOUNDER_1TO1_CAP exhausted warm leads for founder 1:1.
 * Never writes outreach_sequence_outbox. Never calls sendEmail.
 */
export async function queueFounderOneToOneReviews(sqlOverride?: any): Promise<FounderOneToOneResult> {
  const sql = sqlOverride ?? getSql()
  const out: FounderOneToOneResult = { queued: 0, escalated: false, skipped: 0, reason: '', drafts: [] }

  const pending = await listFounderOneToOneQueue(sql).catch(() => [])
  const oldestHours = pending[0]?.createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(pending[0].createdAt).getTime()) / 3_600_000))
    : null

  if (pending.length > 0 && oldestHours != null && oldestHours >= FOUNDER_1TO1_ESCALATE_HOURS) {
    const due = await shouldEscalate(sql)
    if (due) {
      await sendTelegram(founderOneToOneTelegramHtml({
        queued: pending.map((p) => ({ leadId: p.id, email: p.email, company: p.company })),
        kind: 'pending',
        hours: oldestHours,
      })).catch(() => {})
      await stampEscalate(sql)
      out.escalated = true
    }
  }

  const leads = sqlRows(await sql`
    SELECT l.id::text AS id, l.name, l.company, l.email,
           COALESCE(l.last_reply_snippet, '') AS last_reply_snippet
    FROM ps_outreach_leads l
    WHERE COALESCE(l.bounced, false) = false
      AND COALESCE(l.unsubscribed, false) = false
      AND COALESCE(l.pipeline_stage, 'prospect') NOT IN ('dead','customer','internal_test','trial')
      AND (l.replied = true OR l.pipeline_stage = 'engaged')
      AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
      AND (
        SELECT count(*) FROM outreach_sequence_outbox o
        WHERE o.lead_id = l.id AND o.touch IN (90, 91, 92) AND o.status = 'sent'
      ) >= 3
      AND NOT EXISTS (
        SELECT 1 FROM outreach_reply_drafts d
        WHERE d.lead_id = l.id AND d.classification = ${FOUNDER_1TO1_CLASS}
      )
    ORDER BY l.replied_at DESC NULLS LAST, l.stage_updated_at DESC NULLS LAST
    LIMIT ${FOUNDER_1TO1_CAP}
  `.catch(() => [])) as FounderOneToOneLead[]

  if (!leads.length) {
    out.reason = out.escalated
      ? `escalated ${pending.length} pending founder 1:1 (oldest ${oldestHours}h)`
      : pending.length
        ? `${pending.length} founder 1:1 already pending review`
        : 'no exhausted warm leads without a 1:1 draft'
    return out
  }

  for (const lead of leads) {
    const body = founderOneToOneDraftBody(lead)
    const inserted = sqlRows(await sql`
      INSERT INTO outreach_reply_drafts
        (lead_id, from_email, inbound_snippet, draft_body, status, classification, action_taken, classified_at)
      VALUES
        (${lead.id}::uuid, ${lead.email}, ${String(lead.last_reply_snippet || '').slice(0, 500)},
         ${body}, 'pending_review', ${FOUNDER_1TO1_CLASS}, 'draft_for_kaan', NOW())
      RETURNING id::text AS id
    `.catch(() => []))
    const draftId = inserted[0]?.id
    if (!draftId) {
      out.skipped++
      continue
    }
    out.queued++
    out.drafts.push({
      leadId: String(lead.id),
      email: String(lead.email),
      company: String(lead.company || ''),
      draftId: String(draftId),
    })
  }

  if (out.queued > 0) {
    await sendTelegram(founderOneToOneTelegramHtml({ queued: out.drafts, kind: 'queued' })).catch(() => {})
    out.reason = `queued ${out.queued} founder 1:1 draft(s) for exhausted warm leads`
  } else {
    out.reason = out.reason || 'insert missed (table/columns?)'
  }
  return out
}

async function shouldEscalate(sql: any): Promise<boolean> {
  const rows = sqlRows(await sql`
    SELECT value FROM janet_memory
    WHERE company_id = ${COMPANY_ID} AND type = 'operating' AND key = ${ESCALATE_MEMORY_KEY}
    LIMIT 1
  `.catch(() => []))
  const last = Date.parse(String(rows[0]?.value || ''))
  if (!Number.isFinite(last)) return true
  return Date.now() - last >= FOUNDER_1TO1_ESCALATE_HOURS * 3_600_000
}

async function stampEscalate(sql: any): Promise<void> {
  const now = new Date().toISOString()
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${COMPANY_ID}, 'operating', ${ESCALATE_MEMORY_KEY}, ${now}, 1, 'founder_1to1')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `.catch(() => {})
}
