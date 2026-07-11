import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { recallContext, seedPhishSimMemory, learnFromOutcome, rememberFact } from './memory'
import { openSystemAlert, queueJanetArchitectTask } from './selfHeal'
import { runSalesAgent } from './agents/sales'
import { runMarketingAgent } from './agents/marketing'
import { runProductAgent } from './agents/product'
import { runResearchAgent } from './agents/research'
import { runFinanceAgent } from './agents/finance'
import { runCSAgent } from './agents/customerSuccess'
import { runEAAgent } from './agents/ea'
import { JANET_VOICE_RULES } from './janetVoiceRules'
import { getJanetOpsSnapshot } from './janetOpsSnapshot'
import { talkToAgent, AGENTS, type AgentId } from '../lib/kaan_os_v4'
import { getNextSarahLinkedInPreview } from './social/sarahLinkedIn'


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

Style: Direct, compliance-urgency framing, data-backed. Reference breach stats. 3-4 sentences max unless asked for more. No corporate speak.

When Kaan asks operational questions (posting schedule, Sarah LinkedIn, pipeline, agents): answer from LIVE OPS DATA in the prompt. If blocked, state the blocker and your immediate action — never loop on "waiting for confirmation".

You have real employees (Marcus, Aria, Nova, Rex, Scout, Finn, Vera, Max) with live health pings. Reference their status. If Kaan asks you to check with someone, you can relay what they last reported — do not pretend to wait hours for marketing.`

function detectEmployeeAsk(message: string): AgentId | null {
  const m = message.toLowerCase()
  for (const id of Object.keys(AGENTS) as AgentId[]) {
    if (id === 'janet') continue
    const name = AGENTS[id].name.toLowerCase()
    if (m.includes(name) && /ask|check|what.*(doing|up to)|status|talk to|ping/i.test(m)) return id
  }
  return null
}

function wantsLinkedInPreview(message: string): boolean {
  return /linkedin/i.test(message) && /preview|show|see|look like|full post|draft/i.test(message)
}

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

  try {
    const brief = await llmComplete({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
    })
    summary = brief.text
    const matches = [...summary.matchAll(/ARCHITECT_TASK:\s*(.+)/gi)]
    for (const m of matches) {
      archTasks.push(m[1].trim())
      // Route through the gated writer — no direct insert bypasses the autonomy
      // gate. At 'manual' this is a logged no-op (returns null).
      await queueJanetArchitectTask({ task: m[1].trim(), source: 'janet_phishsimai', notify: false })
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
  const memCtx = await recallContext(companyId, 25)
  const ops = await getJanetOpsSnapshot(companyId).catch(() => null)

  let extraContext = ''
  const employeeId = detectEmployeeAsk(message)
  if (employeeId) {
    const reply = await talkToAgent(employeeId, message, companyId, true).catch(() => null)
    if (reply) extraContext += `\n\nLIVE EMPLOYEE REPLY (${reply.agent}):\n${reply.response}`
  }
  if (wantsLinkedInPreview(message)) {
    const preview = await getNextSarahLinkedInPreview().catch(() => null)
    if (preview) {
      extraContext += `\n\nSARAH LINKEDIN PREVIEW (${preview.status}):\nHook: ${preview.hook}\n\n${preview.body.slice(0, 400)}${preview.previewUrl ? `\n\nSafari preview link for Kaan: ${preview.previewUrl}` : '\n\nTell Kaan to open HQ → Social tab for the Safari preview link.'}`
    }
  }

  const messages = [
    ...history.slice(-6).map(m => ({
      role: m.role === 'janet' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: message }
  ]
  let response: string
  try {
    const chat = await llmComplete({
      messages: [{ role: 'system', content: JANET_SYSTEM + '\n\nLIVE OPS DATA (authoritative):\n' + (ops?.text || 'unavailable') + extraContext + '\n\nMEMORY:\n' + memCtx }, ...messages],
      max_tokens: 400,
      temperature: 0.7,
    })
    response = chat.text
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e)
    await openSystemAlert('janet_hq_chat', err).catch(() => {})
    await sendTelegram(`🚨 <b>JANET HQ CHAT DOWN</b>\n${err}`).catch(() => {})
    return `Janet is temporarily unavailable (${err}). Try again shortly — Gemini/Ollama/Groq may be rate-limited.`
  }
  await rememberFact({ company_id:companyId, type:'operating', key:`directive_${Date.now()}`,
    value:`${message} -> ${response.slice(0,150)}`, confidence:0.8, source:'founder_hq' })
  if (/focus|priorit|change|stop|start|add|approve|target|try|test|pivot/i.test(message)) {
    await sendTelegram(`FOUNDER->JANET (PhishSim):\n"${message}"\n\nJanet: ${response}`)
  }
  return response
}

/** Shorter voice-mode replies for always-on bidirectional calls. */
export async function janetVoiceChat(message: string, history: { role: string; text: string }[] = [], companyId = 'phishsimai') {
  const memCtx = await recallContext(companyId, 20)
  const ops = await getJanetOpsSnapshot(companyId).catch(() => null)
  const messages = [
    ...history.slice(-6).map(m => ({
      role: m.role === 'janet' ? 'assistant' as const : 'user' as const,
      content: m.text,
    })),
    { role: 'user' as const, content: message },
  ]
  try {
    const chat = await llmComplete({
      messages: [{ role: 'system', content: JANET_SYSTEM + JANET_VOICE_RULES + '\n\nLIVE OPS DATA (authoritative):\n' + (ops?.text || 'unavailable') + '\n\nMEMORY:\n' + memCtx }, ...messages],
      max_tokens: 220,
      temperature: 0.7,
    })
    return chat.text
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e)
    return `Janet is temporarily unavailable (${err}).`
  }
}
