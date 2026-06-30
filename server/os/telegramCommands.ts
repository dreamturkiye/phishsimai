import { getSql } from './conn'
import { sendTelegram } from './telegram'

const VALID = ['PROSPECT', 'ENGAGED', 'TRIAL', 'DEAD', 'CUSTOMER', 'NEGOTIATING'] as const
type Cmd = (typeof VALID)[number]

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
  if (!VALID.some(c => upper.startsWith(c + ' '))) return

  const result = await processTelegramCommand(msg)
  await sendTelegram(result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`)
}
