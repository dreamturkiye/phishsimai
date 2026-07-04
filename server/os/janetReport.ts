import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { recallContext, seedPhishSimMemory, learnFromOutcome } from './memory'
import { runSalesAgent } from './agents/sales'
import { runResearchAgent } from './agents/research'
import { runFinanceAgent } from './agents/finance'
import { runMarketingAgent } from './agents/marketing'
import { runProductAgent } from './agents/product'
import { runCSAgent } from './agents/customerSuccess'
import { runEAAgent } from './agents/ea'

const REPORT_EMAIL = process.env.FOUNDER_EMAIL || 'kaanari@mac.com'
const FROM = 'Janet CGO <sarah@phishsimai.com>'

export async function runJanetReport(companyId = 'phishsimai') {
  const sql = getSql()
  await seedPhishSimMemory().catch(() => {})

  const [sales, finance, marketing, product, cs, research] = await Promise.all([
    runSalesAgent(companyId),
    runFinanceAgent(companyId),
    runMarketingAgent(companyId),
    runProductAgent(companyId),
    runCSAgent(companyId),
    runResearchAgent(companyId),
  ])
  const founderBrief = await runEAAgent(sales, finance, product, companyId)
  const memoryContext = await recallContext(companyId)
  const weekNumber = Math.max(1, Math.ceil((Date.now() - new Date('2026-06-01').getTime()) / (7 * 86400000)))

  const prompt = `You are Janet, CGO of PhishSimAI (phishing simulation for MSPs).

MEMORY:
${memoryContext}

METRICS:
Sales: ${sales.touched} touched, ${sales.replied} replied (${(sales.replyRate * 100).toFixed(1)}%), ${sales.customers} customers
Finance: $${finance.mrr} MRR, next milestone: ${finance.nextMilestone}
Product top: ${product.topFeature}
CS: ${cs.retentionScore}% retention

Write a sharp CGO report (Week ${weekNumber}). Include top 3 actions, one founder decision, autonomous actions, one risk, 30-day revenue forecast.
If architect task needed: ARCHITECT_TASK: [what to build and why]`

  let executiveSummary = ''
  const architectTasksQueued: string[] = []

  try {
    const report = await llmComplete({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
    })
    executiveSummary = report.text
    for (const match of executiveSummary.matchAll(/ARCHITECT_TASK:\s*(.+)/gi)) {
      const task = match[1].trim()
      architectTasksQueued.push(task)
      try {
        await sql`INSERT INTO os_architect_tasks (task, source) VALUES (${task}, 'janet_report')`
      } catch {}
    }
  } catch (e: any) {
    executiveSummary = `Janet report error: ${e?.message}`
  }

  await learnFromOutcome(companyId, `janet_report_week_${weekNumber}`,
    `MRR: $${finance.mrr}, Customers: ${finance.customers}`, executiveSummary.slice(0, 200))

  const html = `<div style="font-family:-apple-system,sans-serif;max-width:700px;color:#111;padding:24px">
<h1 style="font-size:20px">Janet CGO Report — Week ${weekNumber}</h1>
<p style="color:#888;font-size:12px">PhishSimAI · ${new Date().toLocaleDateString()}</p>
<div style="background:#f7f7f5;border-radius:8px;padding:16px;margin:16px 0;white-space:pre-wrap;font-size:14px;line-height:1.75">${executiveSummary}</div>
<table style="width:100%;font-size:13px;border-collapse:collapse">
<tr><td style="padding:6px">MRR</td><td style="text-align:right">$${finance.mrr}</td></tr>
<tr><td style="padding:6px">Pipeline touched</td><td style="text-align:right">${sales.touched}</td></tr>
<tr><td style="padding:6px">Reply rate</td><td style="text-align:right">${(sales.replyRate * 100).toFixed(1)}%</td></tr>
</table>
${architectTasksQueued.length ? `<p style="margin-top:16px"><strong>Architect tasks:</strong> ${architectTasksQueued.join('; ')}</p>` : ''}
</div>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
    body: JSON.stringify({ from: FROM, to: REPORT_EMAIL, subject: `Janet CGO Report — Week ${weekNumber} — PhishSimAI`, html }),
  }).catch(() => {})

  await sendTelegram(
    `PHISHSIMAI JANET REPORT W${weekNumber}\nMRR: $${finance.mrr} | Pipeline: ${sales.touched} touched | ${sales.replied} replied` +
    (architectTasksQueued.length ? `\nArchitect tasks: ${architectTasksQueued.length}` : '')
  )

  return { ok: true, weekNumber, executiveSummary, sales, finance, marketing, product, cs, research, founderBrief, architectTasksQueued }
}
