import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'
const REPLY_TO = 'sarah@phishsimai.com'
const DAILY_CAP = 20

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html })
  })
  return res.json()
}

function t1Html(name: string, co: string, ind: string, token: string) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Quick question — when did ${co} last run a phishing simulation for your team?</p>
<p>I ask because 67% of breaches start with phishing, and most ${ind} organizations haven't tested their staff in 6+ months — creating real compliance exposure.</p>
<p>We built PhishSimAI to fix this: 10-minute setup, AI-generated campaigns that evolve weekly, automated training for anyone who clicks.</p>
<p>Happy to run a free simulation for your team this week. Worth a quick look?</p>
<p>Sarah Mitchell<br>Head of Compliance Partnerships<br><a href="https://phishsimai.com">PhishSimAI</a></p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p>
</div>`
}

function t2Html(name: string, co: string, ind: string, token: string) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Following up — a similar ${ind} company we worked with had 43% of employees click a phishing link in their first simulation. After 30 days of PhishSimAI training, that dropped to 4%.</p>
<p>That result also satisfies SOC2 and HIPAA auditors looking for documented security awareness training.</p>
<p>Free simulation offer still stands for ${co}. Just reply and I will set it up — no IT team needed.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p>
</div>`
}

function t3Html(name: string, co: string, ind: string, token: string) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>${name},</p>
<p>I run free phishing simulations for 3 companies per week to benchmark their risk before a real attacker does. Two slots left this week.</p>
<p>If you want one for ${co}, just reply with your employee count. Takes under 10 minutes to launch.</p>
<p>P.S. If easier to talk first: <a href="https://calendly.com/sarah-phishsimai" style="color:#e53e3e">calendly.com/sarah-phishsimai</a></p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p>
</div>`
}

function t4Html(name: string, co: string, ind: string, token: string) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Is phishing simulation something ${co} is actively prioritizing, or is the timing off?</p>
<p>Either answer helps — just want to know whether to follow up or close your file.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p>
</div>`
}

function t5Html(name: string, co: string, ind: string, token: string) {
  return `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Closing my file on ${co}. If compliance requirements change or you want to benchmark your team's phishing resilience, just reply and I will pick this up immediately.</p>
<p>Stay safe — phishing attacks are up 48% this year.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p>
</div>`
}

export async function runSequence() {
  const conn = connect({ url: process.env.DATABASE_URL! })
  let totalSent = 0
  const results: any[] = []

  // Bounce rate check
  try {
    const rows = await conn.execute(`SELECT
      COUNT(CASE WHEN bounced=1 THEN 1 END) as b,
      COUNT(CASE WHEN touch1_sent_at IS NOT NULL THEN 1 END) as s
      FROM ps_outreach_leads`)
    const r = (rows as any).rows?.[0] || {}
    const rate = Number(r.s)>0 ? Number(r.b)/Number(r.s) : 0
    if (rate >= 0.08) {
      await sendTelegram(`PHISHSIMAI SEQUENCE PAUSED: bounce rate ${(rate*100).toFixed(1)}%`)
      return { paused: true, rate, sent: 0 }
    }
  } catch {}

  // Touch 1
  try {
    const rows = await conn.execute(
      `SELECT id,name,company,email,industry FROM ps_outreach_leads
      WHERE touch1_sent_at IS NULL AND bounced=0 AND unsubscribed=0
      AND pipeline_stage NOT IN ('dead','customer')
      ORDER BY created_at ASC LIMIT ?`, [DAILY_CAP]
    )
    const leads = (rows as any).rows || []
    for (const lead of leads) {
      if (totalSent >= DAILY_CAP) break
      const token = Buffer.from(lead.email).toString('base64url')
      const subject = `Quick compliance question for ${lead.company}`
      const html = t1Html(lead.name, lead.company, lead.industry || 'technology', token)
      const r = await sendEmail(lead.email, subject, html)
      if (r.id) {
        await conn.execute(`UPDATE ps_outreach_leads SET touch1_sent_at=NOW(), pipeline_stage='prospect', stage_updated_at=NOW() WHERE id=?`, [lead.id])
        totalSent++; results.push({touch:1, company:lead.company, subject})
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  } catch (e: any) { await sendTelegram(`PHISHSIMAI T1 ERROR: ${e.message}`) }

  // Touches 2-4
  const followups = [
    { touch:2, prevCol:'touch1_sent_at', currCol:'touch2_sent_at', days:3,
      subj:(co:string)=>`Re: phishing simulation for ${co}`, htmlFn:t2Html },
    { touch:3, prevCol:'touch2_sent_at', currCol:'touch3_sent_at', days:7,
      subj:(co:string)=>`Free phishing test for ${co} — 2 slots left`, htmlFn:t3Html },
    { touch:4, prevCol:'touch3_sent_at', currCol:'touch4_sent_at', days:12,
      subj:(co:string)=>`One question before I close your file`, htmlFn:t4Html },
    { touch:5, prevCol:'touch4_sent_at', currCol:null, days:19,
      subj:(co:string)=>`Closing your file`, htmlFn:t5Html },
  ]

  for (const f of followups) {
    if (totalSent >= DAILY_CAP) break
    try {
      const cutoff = new Date(Date.now() - f.days * 86400000).toISOString().slice(0,19).replace('T',' ')
      const rows = await conn.execute(
        `SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE ${f.currCol || 'touch4_sent_at'} IS NULL AND ${f.prevCol} < ?
        AND replied=0 AND bounced=0 AND unsubscribed=0
        ORDER BY ${f.prevCol} ASC LIMIT ?`,
        [cutoff, DAILY_CAP - totalSent]
      )
      const leads = (rows as any).rows || []
      for (const lead of leads) {
        if (totalSent >= DAILY_CAP) break
        const token = Buffer.from(lead.email).toString('base64url')
        const subject = f.subj(lead.company)
        const html = f.htmlFn(lead.name, lead.company, lead.industry || 'technology', token)
        const r = await sendEmail(lead.email, subject, html)
        if (r.id) {
          if (f.currCol) await conn.execute(`UPDATE ps_outreach_leads SET ${f.currCol}=NOW() WHERE id=?`, [lead.id])
          else await conn.execute(`UPDATE ps_outreach_leads SET touch4_sent_at=NOW(), pipeline_stage='dead', stage_updated_at=NOW() WHERE id=?`, [lead.id])
          totalSent++; results.push({touch:f.touch, company:lead.company, subject})
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    } catch {}
  }

  if (totalSent > 0) {
    await sendTelegram(`PHISHSIMAI ARIA: ${totalSent} sent\n` + results.map(r=>`T${r.touch}: ${r.company}`).join('\n'))
  }
  return { sent: totalSent, results }
}
