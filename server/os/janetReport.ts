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
import { queueJanetArchitectTask } from './selfHeal'

const REPORT_EMAIL = process.env.FOUNDER_EMAIL || 'kaanari@mac.com'

/**
 * PS-INTERNAL-MAILBOX-01 — internal reporting is OFF the sales mailbox.
 *
 * History: this signed "Janet CGO <sarah@phishsimai.com>", the last survivor of the
 * three-identities-on-one-mailbox problem. Renaming it to Sarah Mitchell fixed the
 * name and left the actual defect in place, which was the ADDRESS.
 *
 * Why the address matters more than the name. sarah@ is the inbox scanned for
 * prospect replies, and since PS-REPLY-PROOF-01 every genuine inbound there is
 * recorded as a row that GTM-REPLY-CAPTURE and replyCaptureProven() read as
 * evidence the reply channel works. A founder replying to his own weekly report
 * therefore wrote a real inbound row into the same table used to decide whether
 * prospects can be followed up. The row is honest — the relay genuinely delivered
 * it — but it is self-generated, and a system that cannot tell its own traffic from
 * a customer's is one bad inference away from "we have engagement".
 *
 * So internal mail gets its own address. Sales traffic in sarah@ stays uncontaminated
 * by our own reports, and the reply-capture evidence keeps meaning what it says.
 *
 * `reply_to` points at the founder rather than the sending address: replying to a
 * report should reach a human, and it also means the send does not depend on
 * reports@ existing as a deliverable mailbox.
 */
const FROM = process.env.REPORT_FROM_EMAIL || 'PhishSim Reports <reports@phishsimai.com>'

export async function runJanetReport(companyId = 'phishsimai') {
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
      // Route through the gated writer — no direct insert bypasses the autonomy
      // gate. At 'manual' this is a logged no-op (returns null).
      await queueJanetArchitectTask({ task, source: 'janet_report', notify: false })
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
    body: JSON.stringify({
      from: FROM,
      // Replies reach the founder directly, not the sending address — so a reply to
      // this report never touches sarah@, and the send does not depend on reports@
      // existing as a deliverable mailbox.
      reply_to: REPORT_EMAIL,
      to: REPORT_EMAIL,
      subject: `Janet CGO Report — Week ${weekNumber} — PhishSimAI`,
      html,
    }),
  }).catch(() => {})

  await sendTelegram(
    `PHISHSIMAI JANET REPORT W${weekNumber}\nMRR: $${finance.mrr} | Pipeline: ${sales.touched} touched | ${sales.replied} replied` +
    (architectTasksQueued.length ? `\nArchitect tasks: ${architectTasksQueued.length}` : '')
  )

  return { ok: true, weekNumber, executiveSummary, sales, finance, marketing, product, cs, research, founderBrief, architectTasksQueued }
}
