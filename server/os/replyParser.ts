import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

function getMagicLink(leadId: string, plan = 'starter'): string {
  const crypto = require('crypto')
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET||'dev')
    .update(leadId+':'+plan).digest('hex').slice(0,16)
  const base = process.env.APP_URL || 'https://phishsimai.com'
  return `${base}/checkout?lead=${leadId}&plan=${plan}&sig=${sig}`
}

async function classifyIntent(body: string) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Classify this email reply from an IT professional or MSP. JSON only, no markdown.\nEmail: """' + body.slice(0,600) + '"""\nReturn: {"intent":"interested|not_now|not_interested|question|unsubscribe|out_of_office|spam_complaint|unknown","confidence":0.0-1.0,"summary":"one sentence"}' }],
        max_tokens: 100
      })
    })
    const d = await res.json()
    return JSON.parse(d.choices?.[0]?.message?.content || '{}')
  } catch {
    return { intent:'unknown', confidence:0, summary:'parse failed' }
  }
}

export async function processReply(fromEmail: string, subject: string, body: string) {
  const conn = connect({ url: process.env.DATABASE_URL! })
  let lead: any = null
  try {
    const rows = await conn.execute(`SELECT * FROM ps_outreach_leads WHERE LOWER(email)=LOWER(?) LIMIT 1`, [fromEmail])
    lead = (rows as any).rows?.[0]
  } catch {}

  const { intent, confidence, summary } = await classifyIntent(body)

  if (lead) {
    if (intent === 'interested') {
      await conn.execute(`UPDATE ps_outreach_leads SET replied=1, pipeline_stage='engaged', stage_updated_at=NOW() WHERE id=?`, [lead.id]).catch(()=>{})
      const url = getMagicLink(lead.id, 'starter')
      const html = `<div style="font-family:-apple-system,sans-serif;max-width:560px;padding:32px;color:#111">
<h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Great news, ${lead.name}</h2>
<p style="color:#555;line-height:1.6">I can have a phishing simulation running for ${lead.company} this week. To get started, click below — takes under 5 minutes to set up.</p>
<div style="margin:24px 0">
<a href="${url}" style="background:#e53e3e;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block">Start PhishSimAI — $99/mo</a>
</div>
<p style="color:#888;font-size:13px">No IT setup required. Cancel anytime. First simulation results within 24 hours.</p>
<p>Sarah<br><a href="https://phishsimai.com" style="color:#e53e3e">PhishSimAI</a></p>
</div>`
      await fetch('https://api.resend.com/emails', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.RESEND_API_KEY},
        body: JSON.stringify({ from:'Sarah Mitchell <sarah@phishsimai.com>', to:fromEmail, subject:`Getting ${lead.company} set up on PhishSimAI`, html })
      }).catch(()=>{})
      await sendTelegram(`PHISHSIMAI INTERESTED!\n${lead.company} <${fromEmail}>\n"${summary}"\nCheckout email sent automatically.`)

    } else if (intent==='unsubscribe' || intent==='spam_complaint') {
      await conn.execute(`UPDATE ps_outreach_leads SET unsubscribed=1, pipeline_stage='dead' WHERE id=?`, [lead.id]).catch(()=>{})
      await sendTelegram(`PHISHSIMAI UNSUB: ${fromEmail} (${lead.company})`)

    } else if (intent==='question') {
      await conn.execute(`UPDATE ps_outreach_leads SET replied=1, pipeline_stage='engaged', stage_updated_at=NOW() WHERE id=?`, [lead.id]).catch(()=>{})
      await sendTelegram(`PHISHSIMAI QUESTION: ${lead.company} <${fromEmail}>\n"${summary}"\nNeeds manual reply.`)

    } else if (intent==='not_now') {
      await conn.execute(`UPDATE ps_outreach_leads SET replied=1, pipeline_stage='not_now' WHERE id=?`, [lead.id]).catch(()=>{})

    } else if (intent==='not_interested') {
      await conn.execute(`UPDATE ps_outreach_leads SET replied=1, pipeline_stage='dead' WHERE id=?`, [lead.id]).catch(()=>{})
    }
  }

  await sendTelegram(`PS REPLY: ${fromEmail} | ${intent} | "${summary}"`)
  return { intent, confidence, summary }
}
