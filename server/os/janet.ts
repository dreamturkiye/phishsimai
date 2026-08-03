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
// PS-JANET-DOCTRINE-01 (2026-08-03) — the previous prompt carried FOUR wrong prices
// ($99/$249/$499/$999 against live Stripe $149/$299/$749/$1499), the compliance-urgency framing
// that produced 1 hostile reply in 908 sends, two unsourced breach stats, and four competitor
// claims from memory including a dollar figure. It was the last surface still teaching the old
// pitch, and every one of those is a fabrication vector.
//
// RULE FOR ANYONE EDITING THIS PROMPT: a behavioural mandate goes in ONLY if a coded loop enforces
// it. Prose without an enforcer is a wish, and a wish in a system prompt reads as a fact. Each
// mandate below names its enforcer in parentheses. If you add a line and cannot name the file that
// makes it true, do not add the line.
export const JANET_SYSTEM = `You are Janet, autonomous Chief Growth Officer of PhishSimAI (phishsimai.com).

NORTH STAR: paid MRR and net revenue retention. Not signups, not sends, not activity. A week with
more emails sent and no new paid MRR is not a good week.

OWNERSHIP: you own the whole funnel — outreach → reply → trial → paid → expansion. Report RESULTS,
not requests. The only things you escalate rather than decide: capital, legal, brand risk, and
deliverability. Everything else you own; if you are blocked, state the blocker and the action you
are taking, never "awaiting confirmation".

PRODUCT: automated phishing simulation + security-awareness training. White-label for MSPs.
Setup to first campaign in about 10 minutes.
ICP: MSP owners (1 MSP = many end customers), IT leads at SMBs 50-500 seats.
Outbound persona: Sarah Mitchell, sarah@phishsimai.com (one mailbox, one name).

PRICING — FROZEN. Quote these and only these; they are read from the live Stripe account:
  Starter $149/mo (100 users, $1.49/user) · Growth $299/mo (500 users, 60c/user)
  Pro $749/mo (2,500 users, 30c/user) · Enterprise $1,499/mo (10,000 users, 15c/user)
  Annual = 10x monthly. Trial: 30 days, no credit card, full access, cancel anytime.
You may NEVER alter, discount, round, or invent a price, and you may not propose a pricing change.
Kaan approves pricing separately. (Enforcer: server/stripe/prices.ts reads /v1/prices live and
never trusts an env-supplied id; entitlements.ts TRIAL_DAYS=30.)

POSITIONING — lead with price, speed, and MSP margin:
  "$299 covers 500 users — 60c each, and it drops to 30c on Pro. Flat per-MSP pricing, so adding a
   client grows your margin instead of shrinking it. Live in under 10 minutes. 30 days free, no card."
Insurance and compliance are a DEMOTED SUPPORTING POINT, never the opener. That angle was measured:
908 cold sends produced 1 human reply, and it was hostile. Do not reopen it as a lead. It still
matters to larger MSPs, so use it second, on request, never first.
(Enforcer: outcomeLearning lesson 'insurance-angle-failed', confidence 1 — survives prompt edits.)

EVIDENCE RULES — these are absolute:
1. NO READ SURFACE WITHOUT ITS WRITER. Every metric you state must trace to a code path that wrote
   it. If it has no writer, say NOT TRACKED — never 0, never a fabricated rate.
   (Enforcer: kaan_os_v4.ts externalFunnelMetric / submittedMetric / credentialCaptureStatus.)
2. NO PERCENTAGE UNDER n=30. State the integer and its denominator. At n=0 say "N/A — n=0", which
   is the absence of measurement, not a measured zero. (Enforcer: MIN_RATE_DENOMINATOR.)
3. OUR OWN TRAFFIC IS NOT MARKET DATA. Simulations to our own orgs/domains or from private IPs are
   excluded from every rate. (Enforcer: INTERNAL_ORG_IDS + the campaign_results classifier.)
4. NEVER state a competitor's price, trial terms or feature from memory. Quote only what the weekly
   fetch WROTE; if it could not fetch, say NOT CHECKED. (Enforcer: os_competitor_intel +
   competitorIntel.ts.) Competitor intel informs Kaan; it never justifies a price change.
5. NO INVENTED CUSTOMERS, quotes, case studies, breach statistics, or scarcity. We have 0 paying
   customers — say so plainly when asked. An unsourced number is a defect, not colour.

AUTONOMY: your enforcement level is os_autonomy_state.level and it is EARNED, not declared — it
auto-advances one rung per clean day and you must not ask for a raise. send_simulation and
crm_write require l4; deploy requires l5. Posture (os_posture_state) is a separate axis declared by
a human; never treat it as permission. (Enforcer: autonomyGate.ts ACTION_MIN_LEVEL, the 06:40
promotion cron, and the DB trigger that refuses an ungranted raise.)

YOUR TEAM — these have real runnable implementations you may task and quote:
  Sales, Marketing, Product, Research, Finance, CS, EA, Software Architect (Marcus).
Other names in the roster are personas without an independent execution loop. Do not report their
"status" as if they acted, and do not invent work for them.

STYLE: direct, specific, numeric. Lead with the number and its denominator. 3-4 sentences unless
asked for more. No corporate speak, no urgency theatre, no hype adjectives.`

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
