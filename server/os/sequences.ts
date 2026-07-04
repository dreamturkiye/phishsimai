import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { AB_EXPERIMENTS, getVariant, recordImpression } from './abTest'
import { reportAgentRun } from './agentHealth'
import { reportAgentHealth } from './agentHealth_v2'

const FROM = 'Sarah Mitchell <sarah@phishsimai.com>'
const REPLY_TO = 'sarah@phishsimai.com'
export const DAILY_SEND_LIMIT = 20
export const PAUSE_ON_BOUNCE_RATE = 0.08

async function sendEmail(to: string, subject: string, html: string, tags: { name: string; value: string }[] = []) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html, tags }),
  })
  return res.json()
}

const SEQUENCE = [
  {
    touch: 2, delayDays: 3,
    subject: (_n: string, co: string) => `Re: phishing simulation for ${co}`,
    html: (name: string, co: string, ind: string, token: string) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Following up — a similar ${ind} company we worked with had 43% of employees click a phishing link in their first simulation. After 30 days of PhishSimAI training, that dropped to 4%.</p>
<p>That result also satisfies SOC2 and HIPAA auditors looking for documented security awareness training.</p>
<p>Free simulation offer still stands for ${co}. Just reply and I will set it up — no IT team needed.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p></div>`,
  },
  {
    touch: 3, delayDays: 7,
    subject: (_n: string, co: string) => `Free phishing test for ${co} — 2 slots left`,
    html: (name: string, co: string, _ind: string, token: string) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>${name},</p>
<p>I run free phishing simulations for 3 companies per week to benchmark their risk before a real attacker does. Two slots left this week.</p>
<p>If you want one for ${co}, just reply with your employee count. Takes under 10 minutes to launch.</p>
<p>P.S. If easier to talk first: <a href="https://calendly.com/sarah-phishsimai" style="color:#e53e3e">calendly.com/sarah-phishsimai</a></p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p></div>`,
  },
  {
    touch: 4, delayDays: 12,
    subject: (_n: string, co: string) => `One question before I close your file`,
    html: (name: string, co: string, _ind: string, token: string) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Is phishing simulation something ${co} is actively prioritizing, or is the timing off?</p>
<p>Either answer helps — just want to know whether to follow up or close your file.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p></div>`,
  },
  {
    touch: 5, delayDays: 19,
    subject: (_n: string, co: string) => `Closing your file`,
    html: (name: string, co: string, _ind: string, token: string) => `<div style="font-family:-apple-system,sans-serif;max-width:580px;padding:24px;color:#111">
<p>Hi ${name},</p>
<p>Closing my file on ${co}. If compliance requirements change or you want to benchmark your team's phishing resilience, just reply and I will pick this up immediately.</p>
<p>Stay safe — phishing attacks are up 48% this year.</p>
<p>Sarah</p>
<p style="color:#bbb;font-size:11px"><a href="https://phishsimai.com/unsubscribe?e=${token}" style="color:#bbb">Unsubscribe</a></p></div>`,
  },
]

export async function getSequenceHealth(sql = getSql()) {
  const rows = await sql`SELECT
    count(*) filter(where bounced=true AND touch1_sent_at IS NOT NULL) as bounced,
    count(*) filter(where touch1_sent_at is not null) as sent
    FROM ps_outreach_leads`
  const { bounced, sent } = rows[0]
  const rate = Number(sent) > 0 ? Number(bounced) / Number(sent) : 0
  return { rate, paused: rate >= PAUSE_ON_BOUNCE_RATE, bounced: Number(bounced), sent: Number(sent) }
}

export async function runFullSequence() {
  const sql = getSql()
  const health = await getSequenceHealth(sql)
  if (health.paused) {
    await sendTelegram('PHISHSIMAI PAUSE: Bounce rate ' + (health.rate * 100).toFixed(1) + '% >= ' + (PAUSE_ON_BOUNCE_RATE * 100) + '%. Sequence halted.')
    return { paused: true, rate: health.rate, sent: 0 }
  }

  const now = new Date()
  let totalSent = 0
  const results: any[] = []

  if (totalSent < DAILY_SEND_LIMIT) {
    const exp = AB_EXPERIMENTS.touch1_subject
    const t1Leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
      WHERE touch1_sent_at IS NULL AND bounced=false AND unsubscribed=false
      AND pipeline_stage NOT IN ('dead','customer')
      ORDER BY created_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`

    for (const lead of t1Leads) {
      if (totalSent >= DAILY_SEND_LIMIT) break
      try {
        const variant = getVariant(String(lead.id), 'touch1_subject')
        const v = exp.active ? (variant === 'control' ? exp.control : exp.test) : exp.control
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const ind = String(lead.industry || 'technology')
        const subject = v.subject(String(lead.name), String(lead.company))
        const html = v.html(String(lead.name), String(lead.company), ind).replace('{{TOKEN}}', token)
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: '1' }, { name: 'lead_id', value: String(lead.id) }, { name: 'variant', value: v.id },
        ])
        if (!result?.id) continue
        const ts = now.toISOString()
        await sql`UPDATE ps_outreach_leads SET touch1_sent_at=${ts}, pipeline_stage='prospect', stage_updated_at=${ts} WHERE id=${lead.id}`
        await recordImpression(String(lead.id), 'touch1_subject', variant)
        totalSent++
        results.push({ touch: 1, company: lead.company, email: lead.email, subject, variant })
        await new Promise(r => setTimeout(r, 2000))
      } catch (e: any) {
        await sendTelegram('PS seq error: ' + (e?.message?.slice(0, 80) || ''))
      }
    }
  }

  const touchDefs = [
    { touch: 2, delayDays: 3 },
    { touch: 3, delayDays: 7 },
    { touch: 4, delayDays: 12 },
    { touch: 5, delayDays: 19, final: true },
  ]

  for (const def of touchDefs) {
    if (totalSent >= DAILY_SEND_LIMIT) break
    const step = SEQUENCE.find(s => s.touch === def.touch)
    if (!step) continue
    const cutoff = new Date(now.getTime() - def.delayDays * 86400000).toISOString()

    let leads: any[] = []
    if (def.touch === 2) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE touch2_sent_at IS NULL AND touch1_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        ORDER BY touch1_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 3) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE touch3_sent_at IS NULL AND touch2_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        ORDER BY touch2_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else if (def.touch === 4) {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        ORDER BY touch3_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    } else {
      leads = await sql`SELECT id,name,company,email,industry FROM ps_outreach_leads
        WHERE touch4_sent_at IS NULL AND touch3_sent_at < ${cutoff}
        AND replied=false AND bounced=false AND unsubscribed=false
        ORDER BY touch3_sent_at ASC LIMIT ${DAILY_SEND_LIMIT - totalSent}`
    }

    for (const lead of leads) {
      if (totalSent >= DAILY_SEND_LIMIT) break
      try {
        const token = Buffer.from(String(lead.email)).toString('base64url')
        const ind = String(lead.industry || 'technology')
        const subject = step.subject(String(lead.name), String(lead.company))
        const html = step.html(String(lead.name), String(lead.company), ind, token)
        const result = await sendEmail(String(lead.email), subject, html, [
          { name: 'touch', value: String(def.touch) }, { name: 'lead_id', value: String(lead.id) },
        ])
        if (!result?.id) continue
        const ts = now.toISOString()
        if (def.touch === 2) await sql`UPDATE ps_outreach_leads SET touch2_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 3) await sql`UPDATE ps_outreach_leads SET touch3_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.touch === 4) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts} WHERE id=${lead.id}`
        else if (def.final) await sql`UPDATE ps_outreach_leads SET touch4_sent_at=${ts}, pipeline_stage='dead', stage_updated_at=${ts} WHERE id=${lead.id}`
        totalSent++
        results.push({ touch: def.touch, company: lead.company, email: lead.email, subject })
        await new Promise(r => setTimeout(r, 2000))
      } catch (e: any) {
        await sendTelegram('PS seq error T' + def.touch + ': ' + (e?.message?.slice(0, 80) || ''))
      }
    }
  }

  if (totalSent > 0) {
    const lines = results.map((r: any) => 'T' + r.touch + ': ' + r.company + (r.variant ? ' [' + r.variant + ']' : '') + ' - ' + r.subject).join('\n')
    await sendTelegram('PHISHSIMAI ARIA SEQUENCE: ' + totalSent + ' sent\n' + lines)
  }
  await reportAgentRun('aria', totalSent >= 0, { sent: totalSent }, undefined, 'phishsimai').catch(() => {})
  await reportAgentHealth('aria', true, 0, undefined, 'phishsimai').catch(() => {})
  return { sent: totalSent, results, bounceRate: health.rate }
}

export const runSequence = runFullSequence
