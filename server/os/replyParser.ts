import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { generateMagicCheckoutLink, buildCheckoutEmail } from './magicLink'
import { recordConversion } from './abTest'

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

async function classifyIntent(body: string) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Classify this email reply from an IT professional or MSP. JSON only, no markdown.\nEmail: """' + body.slice(0, 800) + '"""\nReturn: {"intent":"interested|not_now|not_interested|question|unsubscribe|out_of_office|spam_complaint|unknown","confidence":0.0-1.0,"summary":"one sentence"}' }],
        max_tokens: 100,
      }),
    })
    const d = await res.json()
    return JSON.parse(d.choices?.[0]?.message?.content || '{}')
  } catch {
    return { intent: 'unknown' as ReplyIntent, confidence: 0, summary: 'Parse failed' }
  }
}

async function buildAutoResponse(lead: any, intent: ReplyIntent, replyBody: string): Promise<string> {
  const prompts: Record<string, string> = {
    question: `You are Sarah Mitchell, Head of Compliance Partnerships at PhishSimAI. An IT/MSP prospect asked a question. Company: ${lead.company}. Reply: "${replyBody.slice(0, 300)}". Answer directly. PhishSimAI runs phishing simulations in 10 minutes. Pricing from $99/mo. End by offering a free simulation. 3-4 sentences max.`,
    not_now: `You are Sarah Mitchell at PhishSimAI. Prospect said not right now. Company: ${lead.company}. Reply: "${replyBody.slice(0, 200)}". Write 2 gracious sentences leaving the door open.`,
  }
  const prompt = prompts[intent] || ''
  if (!prompt) return ''
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
    })
    const d = await res.json()
    return d.choices?.[0]?.message?.content || ''
  } catch { return '' }
}

export async function processReply(fromEmail: string, subject: string, body: string) {
  const sql = getSql()
  const leads = await sql`SELECT * FROM ps_outreach_leads WHERE LOWER(email)=LOWER(${fromEmail}) LIMIT 1`
  const lead = leads[0]
  const { intent, confidence, summary } = await classifyIntent(body)
  let autoResponseSent = false
  let checkoutLinkSent = false
  let escalate = false
  const ts = new Date().toISOString()

  if (lead) {
    if (intent === 'unsubscribe' || intent === 'spam_complaint') {
      await sql`UPDATE ps_outreach_leads SET unsubscribed=true, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
      await sendTelegram('PHISHSIMAI UNSUB: ' + fromEmail + ' (' + lead.company + ')')
    } else if (intent === 'interested') {
      await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='engaged', stage_updated_at=${ts} WHERE id=${lead.id}`
      await recordConversion(String(lead.id), 'touch1_subject', 'replied')
      escalate = true
      const checkoutUrl = generateMagicCheckoutLink(String(lead.id), 'starter')
      const checkoutHtml = buildCheckoutEmail(String(lead.name), String(lead.company), checkoutUrl)
      await sendEmail(fromEmail, `Getting ${lead.company} set up on PhishSimAI`, checkoutHtml)
      checkoutLinkSent = true
      autoResponseSent = true
      await sendTelegram(
        'PHISHSIMAI INTERESTED: ' + lead.company + ' <' + fromEmail + '>\n' +
        'Intent: ' + intent + ' (' + Math.round(confidence * 100) + '%)\n"' + summary + '"\nCheckout link sent automatically.'
      )
    } else if (intent === 'question') {
      await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='engaged', stage_updated_at=${ts} WHERE id=${lead.id}`
      escalate = true
      const responseText = await buildAutoResponse(lead, intent, body)
      if (responseText) {
        const html = responseText.split('\n').map((l: string) => l ? '<p style="font-family:-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">' + l + '</p>' : '').join('')
        await sendEmail(fromEmail, 'Re: ' + subject.replace(/^Re:\s*/i, ''), html)
        autoResponseSent = true
      }
      await sendTelegram('PHISHSIMAI QUESTION: ' + lead.company + ' (' + fromEmail + ')\n"' + summary + '"')
    } else if (intent === 'not_now') {
      await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='not_now', stage_updated_at=${ts} WHERE id=${lead.id}`
      const responseText = await buildAutoResponse(lead, intent, body)
      if (responseText) {
        const html = responseText.split('\n').map((l: string) => l ? '<p style="font-family:-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">' + l + '</p>' : '').join('')
        await sendEmail(fromEmail, 'Re: ' + subject.replace(/^Re:\s*/i, ''), html)
        autoResponseSent = true
      }
    } else if (intent === 'not_interested') {
      await sql`UPDATE ps_outreach_leads SET replied=true, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
    }
  }

  await sendTelegram('PS REPLY: ' + fromEmail + ' | ' + intent + ' | "' + summary + '"')
  return { intent, confidence, summary, autoResponseSent, checkoutLinkSent, escalate }
}

export const processInboundReply = processReply
