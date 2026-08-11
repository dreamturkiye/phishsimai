import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { sendApprovedReply, rejectReply } from './replyParser'

const VALID = ['PROSPECT', 'ENGAGED', 'TRIAL', 'DEAD', 'CUSTOMER', 'NEGOTIATING'] as const
type Cmd = (typeof VALID)[number]
// PS-CHECKOUT-GATE-01: approval verbs take a numeric approval id, not a domain — handled ahead of
// the stage commands below.
const APPROVAL_CMDS = ['APPROVE_REPLY', 'REJECT_REPLY'] as const

const STAGE: Record<Cmd, string> = {
  PROSPECT: 'prospect',
  ENGAGED: 'engaged',
  TRIAL: 'trial',
  DEAD: 'dead',
  CUSTOMER: 'customer',
  NEGOTIATING: 'negotiating',
}

export async function processTelegramCommand(text: string): Promise<{ ok: boolean; message: string }> {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 2) {
    return { ok: false, message: 'Use: PROSPECT domain.com (or ENGAGED, CUSTOMER, DEAD, etc.)' }
  }

  // PS-CHECKOUT-GATE-01: APPROVE_REPLY <id> / REJECT_REPLY <id> — the human confirm on a held
  // outbound draft (checkout link or reply). Send happens ONLY here, on the founder's tap/type.
  const verb = parts[0].toUpperCase()
  if (verb === 'APPROVE_REPLY' || verb === 'REJECT_REPLY') {
    const id = Number(parts[1])
    if (!Number.isFinite(id)) return { ok: false, message: `Use: ${verb} <id>` }
    return verb === 'APPROVE_REPLY' ? sendApprovedReply(id) : rejectReply(id)
  }

  const cmd = parts[0].toUpperCase() as Cmd
  const domain = parts[1].toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!VALID.includes(cmd)) {
    return { ok: false, message: `Unknown command: ${cmd}` }
  }

  const sql = getSql()
  const rows = await sql`
    SELECT id, email, name, company, pipeline_stage FROM ps_outreach_leads
    WHERE LOWER(email) LIKE ${'%' + domain + '%'} OR LOWER(company) LIKE ${'%' + domain + '%'}
    LIMIT 1
  `
  const lead = rows[0] as { id: number; email: string; name: string; company: string; pipeline_stage: string } | undefined
  if (!lead) {
    return { ok: false, message: `No lead found for: ${domain}` }
  }

  const stage = STAGE[cmd]
  await sql`
    UPDATE ps_outreach_leads SET pipeline_stage=${stage}, stage_updated_at=NOW() WHERE id=${lead.id}
  `

  if (cmd === 'CUSTOMER') {
    await sendTelegram(`🎉 <b>CUSTOMER</b> ${lead.company} (${lead.email}) — pipeline updated via Telegram`)
  }

  return { ok: true, message: `${lead.company} → ${stage}` }
}

export async function handleIncomingTelegram(update: any): Promise<void> {
  const msg = update?.message?.text || update?.callback_query?.data
  if (!msg || typeof msg !== 'string') return

  const upper = msg.trim().toUpperCase()
  if (![...VALID, ...APPROVAL_CMDS].some(c => upper.startsWith(c + ' '))) return

  const result = await processTelegramCommand(msg)
  await sendTelegram(result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`)
}
