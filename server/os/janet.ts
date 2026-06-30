import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'
import { recallContext, seedPhishSimMemory, learnFromOutcome, rememberFact } from './memory'
import { runSalesAgent } from './agents/sales'
import { runMarketingAgent } from './agents/marketing'
import { runProductAgent } from './agents/product'
import { runResearchAgent } from './agents/research'
import { runFinanceAgent } from './agents/finance'
import { runCSAgent } from './agents/customerSuccess'
import { runEAAgent } from './agents/ea'


// Smart Lead Researcher context added to Janet — v3.1
// Researcher agent runs every hour, discovers MSPs via Groq AI + Hunter.io enrichment
// Reports to agent_health table. Feeds leads directly into ps_outreach_leads for ARIA.
export const JANET_SYSTEM = `You are Janet, a world-class Chief Growth Officer with 15+ years scaling B2B SaaS companies from zero to multi-million ARR exits.

You are the autonomous CGO of PhishSimAI — an AI-powered phishing simulation and security awareness training platform.

Company: PhishSimAI (phishsimai.com)
Product: Automated phishing simulations + staff training. White-label for MSPs. 10-min setup.
ICP: MSP owners (1 MSP = 10-100x LTV), IT Directors at SMBs 50-500 employees, compliance buyers (SOC2/HIPAA/PCI)
Pricing: Starter $99/mo, Growth $249/mo, Pro $499/mo, Unlimited $999/mo
Persona: Sarah Mitchell (Head of Compliance Partnerships)
Key stat: 67% of breaches start with phishing. Average breach cost $4.45M.
Competitors: KnowBe4 (enterprise-only), Proofpoint ($50K+ contracts), Cofense (manual), Hoxhunt (Euro-centric)

Your Team: Sales, Marketing, Product, Research, Finance, CS, EA, Software Architect agents.

Control Levels: L1 Think | L2 Draft | L3 Execute with approval | L4 Autonomous (under thresholds)

New agent under you: Smart Lead Researcher — runs hourly, discovers MSPs via AI + Hunter.io, deduplicates before adding to pipeline. Monitor via agent health. When pipeline <20 prospects, direct researcher to increase batch.

Style: Direct, compliance-urgency framing, data-backed. Reference breach stats. 3-4 sentences max unless asked for more. No corporate speak.`

export async function runJanetBrief(companyId = 'phishsimai') {
  await seedPhishSimMemory().catch(() => {})
  const [sales, marketing, product, research, finance, cs] = await Promise.all([
    runSalesAgent(companyId),
    runMarketingAgent(companyId),
    runProductAgent(companyId),
    runResearchAgent(companyId),
    runFinanceAgent(companyId),
    runCSAgent(companyId),
  ])
  const ea = await runEAAgent(sales, finance, product, companyId)
  const memCtx = await recallContext(companyId)

  const prompt = `${JANET_SYSTEM}

MEMORY:
${memCtx}

CURRENT METRICS:
Sales: ${sales.touched} contacted, ${sales.replied} replied (${(sales.replyRate*100).toFixed(1)}%), ${sales.customers} customers
Finance: $${finance.mrr} MRR, next milestone: ${finance.nextMilestone}
Product top feature needed: ${product.topFeature}
ICP: ${research.icpNote}
CS: ${cs.retentionScore}% retention score

Write a sharp daily CGO brief for PhishSimAI. Include: top action for today, one autonomous action you are taking now (L4), one decision needed from Kaan. Specific and data-backed. If code improvement needed prefix with ARCHITECT_TASK:`

  let summary = ''
  const archTasks: string[] = []
  const conn = connect({ url: process.env.DATABASE_URL! })

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400
      })
    })
    const d = await res.json()
    summary = d.choices?.[0]?.message?.content || ''
    const matches = [...summary.matchAll(/ARCHITECT_TASK:\s*(.+)/gi)]
    for (const m of matches) {
      archTasks.push(m[1].trim())
      try {
        await conn.execute(`CREATE TABLE IF NOT EXISTS os_architect_tasks (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          task TEXT NOT NULL, status VARCHAR(50) DEFAULT 'pending',
          source VARCHAR(100) DEFAULT 'janet', notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`)
        await conn.execute(`INSERT INTO os_architect_tasks (task, source) VALUES (?, 'janet_phishsimai')`, [m[1].trim()])
      } catch {}
    }
  } catch (e: any) {
    summary = `Janet brief error: ${e?.message}. Agents ran OK.`
  }

  await learnFromOutcome(companyId, 'janet_daily_brief',
    `MRR:$${finance.mrr} Customers:${finance.customers} ReplyRate:${(sales.replyRate*100).toFixed(1)}%`,
    summary.slice(0, 200))

  await sendTelegram(
    'PHISHSIMAI JANET BRIEF\n' +
    `MRR: $${finance.mrr} | Customers: ${finance.customers}\n` +
    `Pipeline: ${sales.touched} touched | ${sales.replied} replied | ${sales.engaged} engaged\n` +
    (archTasks.length ? `Architect tasks: ${archTasks.length}\n` : '') +
    summary.slice(0, 300)
  )

  return { ok: true, summary, sales, finance, product, research, cs, ea, archTasks }
}

export async function janetChat(message: string, history: {role:string,text:string}[] = [], companyId = 'phishsimai') {
  const memCtx = await recallContext(companyId)
  const messages = [
    ...history.slice(-6).map(m => ({
      role: m.role === 'janet' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: message }
  ]
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: JANET_SYSTEM + '\n\nMEMORY:\n' + memCtx }, ...messages],
      max_tokens: 300, temperature: 0.7
    })
  })
  const d = await res.json()
  const response = d.choices?.[0]?.message?.content?.trim() || 'No response'
  await rememberFact({ company_id:companyId, type:'operating', key:`directive_${Date.now()}`,
    value:`${message} -> ${response.slice(0,150)}`, confidence:0.8, source:'founder_hq' })
  if (/focus|priorit|change|stop|start|add|approve|target|try|test|pivot/i.test(message)) {
    await sendTelegram(`FOUNDER->JANET (PhishSim):\n"${message}"\n\nJanet: ${response}`)
  }
  return response
}
