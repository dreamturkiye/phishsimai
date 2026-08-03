import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { recallContext, seedPhishSimMemory, learnFromOutcome, rememberFact } from './memory'
import { openSystemAlert, queueJanetArchitectTask } from './selfHeal'
import { runSalesAgent } from './agents/sales'
import { runRexAgent } from './agents/rex'
import { runDexAgent } from './agents/dex'
import { runAriaAgent } from './agents/aria'
import { runMasonAgent } from './agents/mason'
import { runScoutAgent } from './agents/scout'
import { runFinnAgent, mrrDisplay } from './agents/finn'
import { runVeraAgent } from './agents/vera'
import { runNovaAgent } from './agents/nova'
import { readMiaInbox } from '../mia/feedbackTool'
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
  const [sales, aria, nova, scout, finn, vera, rex, dex, mason] = await Promise.all([
    runSalesAgent(companyId),
    // PS-ARIA-01: marketing.ts is DELETED. It returned a hardcoded object and claimed an
    // "active experiment" that was inactive, had no test arm, and used an angle retired months ago.
    // Aria measures instead. skipCurrency — that belongs to her own 06:10 cron.
    runAriaAgent({ skipCurrency: true }).catch(() => null),
    // PS-NOVA-01: product.ts is DELETED. It shipped a hardcoded backlog with hand-written "(HIGH)"
    // priorities and wrote the top item to memory at confidence 0.9 — ranking by "revenue impact"
    // with zero revenue and zero usage. Nova derives priority from measured drop-off, or ranks
    // nothing and says why.
    runNovaAgent({ skipCurrency: true }).catch(() => null),
    // PS-SCOUT-01: research.ts is DELETED. It wrote four hardcoded competitor strings to memory at
    // confidence 0.9 — including dollar figures that came from a developer's memory, not a fetch.
    runScoutAgent({ skipCurrency: true }).catch(() => null),
    // PS-FINN-01: finance.ts is DELETED. It computed the whole revenue picture from
    // `const avgRevenue = 99` — a price that matches no live Stripe product — and derived a
    // projectedMrrIn90Days from it that Janet read every morning. Finn reads Stripe.
    runFinnAgent({ skipCurrency: true }).catch(() => null),
    // PS-VERA-01: customerSuccess.ts is DELETED. It returned retentionScore=100 over ZERO
    // customers, and Janet printed "100% retention" every morning with nothing to retain.
    runVeraAgent({ skipCurrency: true }).catch(() => null),
    // PS-REX-01. skipCurrency: the currency loop belongs to Rex's own 05:45 cron — running it again
    // inside the standup would double the network and LLM cost to re-read pages nothing has changed.
    // A failed sweep must not take the standup down, so a null verdict degrades to "NOT CHECKED"
    // below rather than throwing.
    runRexAgent({ skipCurrency: true }).catch(() => null),
    // PS-DEX-01. skipCurrency/skipDns for the same reason as Rex: those belong to Dex's own 05:50
    // cron. The standup needs his gate-coverage and bounce verdict, not a second DNS sweep.
    runDexAgent({ skipCurrency: true, skipDns: true }).catch(() => null),
    // PS-MASON-01. skipReplies: the reply sweep has its own */15 cron and an inline trigger — running
    // it again here would re-enter the same queue for no gain. dryRun: the standup REPORTS, it does
    // not perform retirement; that belongs to Mason's own 06:20 cron behind the crm_write gate.
    runMasonAgent({ skipCurrency: true, skipReplies: true, dryRun: true }).catch(() => null),
  ])
  // PS-MIA-HONEST-01 — the READER for what Mia logs. The weekly digest already existed; this is the
  // DAILY surface, and it exists mainly for unnotifiedHandoffs: a customer who asked for a human and
  // whose notification failed is invisible in every other channel.
  const miaInbox = await readMiaInbox().catch(() => null)

  const ea = await runEAAgent(sales, finn ?? { customers: 0 }, nova ?? {}, companyId)
  const memCtx = await recallContext(companyId)

  // Rex's verdict leads the metrics block deliberately: it tells Janet WHICH of the numbers below
  // she is allowed to quote. A trust verdict printed after the figures it governs gets read second
  // and ignored first.
  const rexBlock = rex
    ? `FUNNEL TRUST (Rex, RevOps — read this BEFORE quoting any number below):
${rex.line}
Metrics you MAY rely on: ${rex.trustedMetrics.length ? rex.trustedMetrics.join('; ') : 'NONE certified this cycle'}
Metrics that are SUSPECT — do not quote these as fact: ${rex.suspectMetrics.length ? rex.suspectMetrics.join('; ') : 'none'}`
    : `FUNNEL TRUST (Rex, RevOps): NOT CHECKED this cycle — the integrity sweep failed to run. ` +
      `Treat every figure below as unverified; do not present any of them as certified.`

  const prompt = `${JANET_SYSTEM}

MEMORY:
${memCtx}

${rexBlock}

DELIVERABILITY (Dex — whether the mail physically arrives):
${dex ? dex.line : 'NOT CHECKED this cycle — the deliverability sweep failed to run. Do not assert send health.'}

SALES (Mason — pipeline, replies, conversion; he defers to Rex and Dex on their domains):
${mason ? mason.line : 'NOT CHECKED this cycle — the sales operator failed to run. Do not assert pipeline numbers.'}

CURRENT METRICS:
Sales: ${sales.touched} contacted, ${sales.replied} replied (${(sales.replyRate*100).toFixed(1)}%), ${sales.customers} customers
Finance (Finn — live Stripe, never a constant): ${finn ? finn.line : 'NOT CHECKED this cycle — no MRR or pricing claim may be made.'}
Product growth (Nova): ${nova ? nova.line : 'NOT CHECKED this cycle — no activation claim may be made.'}
ICP / market: ${scout ? scout.line : 'NOT CHECKED this cycle — no targeting or competitor claim may be made.'}
CS (Vera): ${vera ? vera.line : 'NOT CHECKED this cycle — no retention or health claim may be made.'}
MESSAGING / CHANNELS (Aria — she owns current best outreach; pricing is a hard stop for her): ${aria ? aria.line : 'NOT CHECKED this cycle — no messaging or channel claim may be made.'}
CUSTOMER VOICE (Mia — trial feedback, bugs, and customers waiting on a human): ${miaInbox ? miaInbox.line : 'NOT CHECKED this cycle — no feedback or handoff claim may be made.'}

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
    `${mrrDisplay(finn)} ReplyRate:${(sales.replyRate*100).toFixed(1)}%`,
    summary.slice(0, 200))

  await sendTelegram(
    'PHISHSIMAI JANET BRIEF\n' +
    `${mrrDisplay(finn)}\n` +
    `Pipeline: ${sales.touched} touched | ${sales.replied} replied | ${sales.engaged} engaged\n` +
    (archTasks.length ? `Architect tasks: ${archTasks.length}\n` : '') +
    summary.slice(0, 300)
  )

  return { ok: true, summary, sales, finn, nova, scout, aria, mason, rex, dex, vera, ea, archTasks }
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
