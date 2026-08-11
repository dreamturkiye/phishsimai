/**
 * Mia — in-app customer success for PhishSim AI trial users.
 * Phases 1–3: chat + memory, activation context, product feedback → Telegram + Janet memory.
 */
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db'
import {
  campaigns,
  miaMemory,
  organizations,
  productFeedback,
  targets,
} from '../../drizzle/schema'
import { llmComplete } from '../os/llmChat'
import { sendTelegram } from '../os/telegram'
import { rememberFact } from '../os/memory'
import {
  classifyFeedbackContent,
  detectHandoffRequest,
  recordFeedbackVerified,
  requestHumanHandoff,
  type ActionResult,
} from './feedbackTool'

const FEEDBACK_PATTERNS =
  /\b(feedback|suggest(ion)?|confus(ed|ing)|frustrat(ed|ing)|bug|broken|doesn'?t work|improve(ment)?|wish|hard to|difficult|missing feature|feature request|report)\b/i

const PAGE_GUIDES: Record<string, string> = {
  '/dashboard': 'Overview — check activation checklist and recent campaign stats. Deep link: /campaigns to launch.',
  '/targets': 'Add employees here — CSV import or manual add. First step before any campaign. Deep link: /targets',
  '/templates': 'Pick or customize phishing email templates. Built-in HIPAA/SOC2 templates available. Deep link: /templates',
  '/campaigns': 'Create and launch simulations. Flow: name → template → targets → launch. Deep link: /campaigns',
  '/training': 'Auto-assigned training for employees who click phishing links. Deep link: /training',
  '/analytics': 'Click rates, trends, department breakdowns after campaigns run. Deep link: /analytics',
  '/compliance': 'HIPAA, SOC2, PCI audit reports and compliance certificates. Deep link: /compliance',
  '/settings': 'Org settings, billing, verified sending domains. Deep link: /settings',
  '/gamification': 'Leaderboard and risk scores when gamification is enabled. Deep link: /gamification',
}

export interface MiaChatInput {
  userId: number
  orgId: number
  message: string
  pathname?: string
  explicitFeedback?: boolean
  feedbackCategory?: 'bug' | 'ux' | 'feature' | 'praise' | 'other'
  rating?: number
  /** IANA zone from the browser. The contact FORM is a later build; this one field ships now
   *  because without it a stated call time cannot be resolved at all. */
  timezone?: string
}

export interface MiaChatResult {
  reply: string
  activation: ActivationState
  feedbackRecorded?: boolean
}

export interface ActivationState {
  step: number
  totalSteps: number
  label: string
  targetCount: number
  campaignCount: number
  launchedCount: number
  activated: boolean
  nextAction: string
  nextLink: string
}

let _tablesEnsured = false

export async function ensureMiaTables(): Promise<void> {
  if (_tablesEnsured) return
  const db = await getDb()
  if (!db) return
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mia_memory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        orgId INT NOT NULL,
        memory TEXT NOT NULL DEFAULT '',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY mia_memory_user_org_uniq (userId, orgId),
        KEY mia_memory_userId_idx (userId)
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        orgId INT NOT NULL,
        page VARCHAR(255),
        message TEXT NOT NULL,
        category ENUM('bug','ux','feature','praise','other') NOT NULL DEFAULT 'other',
        rating INT,
        plan VARCHAR(32),
        trialDay INT,
        source VARCHAR(32) NOT NULL DEFAULT 'mia',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY product_feedback_orgId_idx (orgId),
        KEY product_feedback_createdAt_idx (createdAt)
      )
    `)
    _tablesEnsured = true
  } catch (e) {
    console.error('[Mia] ensureMiaTables:', e)
  }
}

export async function getActivationState(orgId: number): Promise<ActivationState> {
  const db = await getDb()
  if (!db) {
    return {
      step: 0, totalSteps: 3, label: 'Setup', targetCount: 0, campaignCount: 0,
      launchedCount: 0, activated: false, nextAction: 'Add employees under Targets',
      nextLink: '/targets',
    }
  }

  const [[targetRow], [campaignRow], [launchedRow]] = await Promise.all([
    db.select({ n: count() }).from(targets).where(eq(targets.orgId, orgId)),
    db.select({ n: count() }).from(campaigns).where(eq(campaigns.orgId, orgId)),
    db.select({ n: count() }).from(campaigns).where(
      and(eq(campaigns.orgId, orgId), inArray(campaigns.status, ['active', 'completed', 'scheduled'])),
    ),
  ])

  const targetCount = Number(targetRow?.n ?? 0)
  const campaignCount = Number(campaignRow?.n ?? 0)
  const launchedCount = Number(launchedRow?.n ?? 0)
  const activated = launchedCount > 0

  let step = 1
  let label = 'Add employees'
  let nextAction = 'Import or add at least one employee under Targets — takes 2 minutes.'
  let nextLink = '/targets'

  if (targetCount > 0) {
    step = 2
    label = 'Create a campaign'
    nextAction = 'Go to Campaigns, pick a template, select your targets, and launch.'
    nextLink = '/campaigns'
  }
  if (campaignCount > 0 && launchedCount === 0) {
    step = 2
    label = 'Launch your campaign'
    nextAction = 'Your campaign is drafted — open it and click Launch to send your first simulation.'
    nextLink = '/campaigns'
  }
  if (activated) {
    step = 3
    label = 'Activated'
    nextAction = 'Review results in Analytics or generate a Compliance report.'
    nextLink = '/analytics'
  }

  return {
    step,
    totalSteps: 3,
    label,
    targetCount,
    campaignCount,
    launchedCount,
    activated,
    nextAction,
    nextLink,
  }
}

function inferFeedbackCategory(message: string): 'bug' | 'ux' | 'feature' | 'praise' | 'other' {
  const m = message.toLowerCase()
  if (/\b(bug|broken|error|crash|doesn'?t work|not working)\b/.test(m)) return 'bug'
  if (/\b(confus|hard to|difficult|unclear|frustrat|ux|ui)\b/.test(m)) return 'ux'
  if (/\b(feature|wish|would be nice|add |missing|need )\b/.test(m)) return 'feature'
  if (/\b(love|great|awesome|thanks|helpful|perfect)\b/.test(m)) return 'praise'
  return 'other'
}

export async function recordProductFeedback(opts: {
  userId: number
  orgId: number
  message: string
  pathname?: string
  category?: 'bug' | 'ux' | 'feature' | 'praise' | 'other'
  rating?: number
  source?: string
}): Promise<number | null> {
  await ensureMiaTables()
  const db = await getDb()
  if (!db) return null

  const org = await db.select().from(organizations).where(eq(organizations.id, opts.orgId)).limit(1)
  const plan = org[0]?.plan ?? 'free'
  const createdAt = org[0]?.createdAt
  const trialDay = createdAt
    ? Math.max(1, Math.ceil((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : undefined

  const category = opts.category ?? inferFeedbackCategory(opts.message)

  // Was: `const [insertResult] = await db.insert(...).values(...)` then read
  // `insertResult.insertId`. Two bugs: the insert resolves to a result OBJECT (not an
  // array, so the destructure threw "is not iterable"), and `insertId` is MySQL
  // semantics — Postgres returns nothing unless you ask. .returning() is the Postgres
  // way to get the new id back, and it is what the code below actually wants.
  const inserted = await db.insert(productFeedback).values({
    userId: opts.userId,
    orgId: opts.orgId,
    page: opts.pathname?.slice(0, 255) ?? null,
    message: opts.message.slice(0, 4000),
    category,
    rating: opts.rating ?? null,
    plan,
    trialDay: trialDay ?? null,
    source: opts.source ?? 'mia',
  }).returning({ id: productFeedback.id })

  const feedbackId = inserted[0]?.id ?? null
  const orgName = org[0]?.name ?? `Org #${opts.orgId}`

  await sendTelegram(
    `💬 <b>Trial feedback</b> (${category})\n` +
    `${orgName} · plan ${plan}${trialDay ? ` · day ${trialDay}` : ''}\n` +
    `Page: ${opts.pathname || 'n/a'}\n` +
    `${opts.message.slice(0, 500)}`,
  ).catch(() => {})

  await rememberFact({
    company_id: 'phishsimai',
    type: 'operating',
    key: `trial_feedback_${Date.now()}`,
    value: `[${category}] ${orgName}: ${opts.message.slice(0, 200)}`,
    confidence: 0.9,
    source: 'mia_feedback',
  }).catch(() => {})

  return feedbackId
}

export async function runMiaFeedbackDigest(): Promise<{ count: number; summary: string }> {
  await ensureMiaTables()
  const db = await getDb()
  if (!db) return { count: 0, summary: 'No DB' }

  const since = new Date(Date.now() - 7 * 86_400_000)
  const rows = await db
    .select()
    .from(productFeedback)
    .where(gte(productFeedback.createdAt, since))
    .orderBy(desc(productFeedback.createdAt))
    .limit(50)

  if (!rows.length) {
    return { count: 0, summary: 'No trial feedback this week.' }
  }

  const byCat: Record<string, number> = {}
  for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1

  const summary =
    `Weekly trial feedback: ${rows.length} items. ` +
    Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ') +
    '. Top: ' +
    rows.slice(0, 3).map(r => r.message.slice(0, 80)).join(' | ')

  await sendTelegram(`📋 <b>Mia weekly digest</b>\n${summary}`).catch(() => {})
  await rememberFact({
    company_id: 'phishsimai',
    type: 'operating',
    key: `mia_weekly_digest_${Date.now()}`,
    value: summary.slice(0, 400),
    confidence: 0.95,
    source: 'mia_digest',
  }).catch(() => {})

  return { count: rows.length, summary }
}

export async function miaChat(input: MiaChatInput): Promise<MiaChatResult> {
  await ensureMiaTables()
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  const activation = await getActivationState(input.orgId)
  const pathname = input.pathname ?? '/dashboard'
  const pageGuide = PAGE_GUIDES[pathname] ?? PAGE_GUIDES['/dashboard']

  const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, input.orgId)).limit(1)
  const orgName = orgRow?.name ?? 'your organization'
  const plan = orgRow?.plan ?? 'free'

  const [memRow] = await db
    .select()
    .from(miaMemory)
    .where(and(eq(miaMemory.userId, input.userId), eq(miaMemory.orgId, input.orgId)))
    .limit(1)

  const memory = memRow?.memory ?? ''

  // ── PS-MIA-HONEST-01 — THE ACTION ALWAYS ATTEMPTS; THE CLAIM FOLLOWS THE RESULT ──
  //
  // Previously: a regex match set `feedbackRecorded = true` WITHOUT checking the write, and fired
  // on INTENT as readily as on content. The only row in production is a user asking WHETHER they
  // could give feedback — logged, and acknowledged as logged.
  //
  // Now: content is classified first, the write result is inspected, and every sentence Mia is
  // permitted to say is derived from an outcome that actually happened.
  const contentVerdict = input.explicitFeedback
    ? (input.message.trim().length >= 12 ? 'content' : 'intent_only')
    : classifyFeedbackContent(input.message)

  const conversationContext = memory ? `prior context: ${memory}` : undefined

  let feedbackResult: ActionResult | null = null
  if (contentVerdict === 'content') {
    feedbackResult = await recordFeedbackVerified({
      userId: input.userId,
      orgId: input.orgId,
      message: input.message,
      conversationContext,
      pathname,
      category: input.feedbackCategory,
      rating: input.rating,
    })
  }
  // THE GATE: an id, or no claim. Nothing else may set this true.
  const feedbackRecorded = feedbackResult?.ok === true

  // ── Human handoff. The human is Kaan; nothing else contacts this customer. ──
  const handoffKind = detectHandoffRequest(input.message)
  let handoffResult: ActionResult | null = null
  if (handoffKind) {
    handoffResult = await requestHumanHandoff({
      userId: input.userId,
      orgId: input.orgId,
      kind: handoffKind,
      message: input.message,
      conversationContext,
      pathname,
      // Name / phone / best-time come from the contact form, which is NOT built yet — they arrive
      // null and the Telegram says so rather than implying they were collected.
      // The EMAIL is not from the form: requestHumanHandoff resolves the logged-in account address
      // itself (PS-MIA-REACHABLE-01), so it cannot be lost by a caller that forgets to pass it.
      contact: { timezone: input.timezone },
    })
  }
  const handoffFlagged = handoffResult?.ok === true && handoffResult.notified === true
  // PS-MIA-REACHABLE-01. Being told is not the same as being able to answer. Mia may promise an
  // EMAIL only when the notification actually carried an address — otherwise "Kaan will email you
  // shortly" is a promise that was delivered and still cannot be kept, which is the exact defect
  // this ticket exists to remove.
  const handoffReachable = handoffResult?.ok === true && handoffResult.reachable === true

  const activationBlock =
    `Activation: step ${activation.step}/${activation.totalSteps} (${activation.label}). ` +
    `Targets: ${activation.targetCount}, campaigns: ${activation.campaignCount}, launched: ${activation.launchedCount}. ` +
    `Next: ${activation.nextAction} Link: ${activation.nextLink}`

  // Every sentence Mia is permitted to say about an action is derived HERE, from a verified
  // outcome — never from the model's impression that something probably happened.
  const actionLines: string[] = []

  if (contentVerdict === 'intent_only') {
    actionLines.push(
      'They ASKED WHETHER they can give feedback — they have not given any yet. Nothing was logged, ' +
      'and you must NOT say anything was. Tell them yes, and ask them to describe it now.',
    )
  } else if (feedbackRecorded) {
    actionLines.push('Their feedback WAS logged successfully. You may confirm that plainly, once.')
  } else if (feedbackResult && !feedbackResult.ok) {
    actionLines.push(
      "The attempt to log their feedback FAILED. Say honestly: \"I couldn't log that just now\" and " +
      'ask them to email sales@phishsimai.com so it is not lost. Do NOT say it was logged.',
    )
  }

  if (handoffKind) {
    if (handoffFlagged && handoffReachable) {
      actionLines.push(
        'They asked for a human, and the request WAS flagged to Kaan successfully, WITH their ' +
        'account email attached so he can reply. You may say: ' +
        '"I\'ve flagged this — Kaan will email you shortly." Do not promise a phone call or a time window. ' +
        'Do NOT ask them for their email address: we already have it and asking implies we do not.',
      )
    } else if (handoffFlagged) {
      // Told, but unanswerable. The honest sentence is the one that gets an address, not the one
      // that promises a reply we have no way to send.
      actionLines.push(
        'They asked for a human and the request WAS flagged to Kaan — but we have NO email address ' +
        'on file for this account, so he cannot reply. You may say it is flagged. You may NOT say ' +
        'he will email them. Ask them for the best address to reach them on, and give them ' +
        'sales@phishsimai.com as a channel they can use right now.',
      )
    } else {
      actionLines.push(
        'They asked for a human and the request FAILED to go through. Say honestly that you could not ' +
        'flag it, and give them sales@phishsimai.com as the direct channel. Do NOT promise contact.',
      )
    }
  }

  if (!actionLines.length) actionLines.push('No action was taken this message. Do not claim any.')
  const actionBlock = actionLines.map((l) => `- ${l}`).join('\n')

  const system = `You are Mia, customer success specialist at PhishSim AI. Warm, practical, concise — never say you are an AI.

Help trial users launch their first phishing simulation in under 10 minutes.

Product map:
- Targets (/targets) = employees to simulate
- Templates (/templates) = phishing email designs
- Campaigns (/campaigns) = create & launch simulations
- Training (/training) = post-click awareness modules
- Analytics (/analytics) = click rates & trends
- Compliance (/compliance) = HIPAA/SOC2/PCI audit reports
- Settings (/settings) = org & billing

Pricing (live Stripe, FROZEN — never alter): Starter $149/mo (100 users), Growth $299/mo (500 users), Pro $749/mo (2,500 users), Enterprise $1,499/mo (10,000 users). Annual = 10x monthly. 30-day free trial, no credit card, cancel anytime.

Current page: ${pathname}. ${pageGuide}

${activationBlock}

Org: ${orgName}, plan: ${plan}.
${memory ? `User memory: ${memory}` : ''}

REALITY BOUNDARY — READ THIS BEFORE ANSWERING ANYTHING.
You may ONLY reference features, pages, buttons and actions that are listed in this prompt. If it is
not listed here, IT DOES NOT EXIST and you must not mention it, even if products like this usually
have one. Your failure mode is confident invention of plausible-but-false product facts, and a false
fact told to a paying customer costs more than an unanswered question.

Specifically:
- NEVER describe a UI element, icon, menu, button or its screen position. You cannot see their
  screen and you do not have a reliable map of it. Guide by PAGE PATH only (e.g. "go to /targets").
- There is NO "Talk to Sales" option, NO live-chat-with-a-human, NO phone line, NO support ticket
  system, and NO help centre. You are the only in-app support channel that exists.
- NEVER promise that someone will contact them unless the system tells you below that a request was
  actually flagged. "Someone will reach out" with nothing behind it is a broken promise.
- NEVER claim to have logged, saved, filed, escalated or sent anything unless told below that it
  succeeded.
- If you do not know whether something exists, say what you CAN do instead of guessing. "I'm not
  able to do that from here, but I can ..." is always better than inventing a path.

WHAT ACTUALLY EXISTS: the pages in the product map above, this chat, and Kaan (the founder), who
can be reached at sales@phishsimai.com and whom I can flag urgent requests to.

Rules:
- Max 3 sentences unless they ask for steps.
- Include deep links like "Go to /targets" when guiding.
- Proactively nudge toward the next activation step if they seem stuck.

ACTION RESULTS FOR THIS MESSAGE — these are the ONLY action claims you may make:
${actionBlock}`

  const chat = await llmComplete({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input.message },
    ],
    max_tokens: 350,
    temperature: 0.65,
  })

  const reply = chat.text || "I'm here to help — try asking how to launch your first campaign."

  try {
    const memUpdate = await llmComplete({
      messages: [{
        role: 'user',
        content: `Prior memory: ${memory}\nUser: ${input.message}\nMia: ${reply}\nUpdate memory with key facts about this user (name, sector, blockers, preferences). Max 80 words. Output only the updated memory.`,
      }],
      max_tokens: 120,
      temperature: 0.3,
    })
    const newMem = memUpdate.text?.slice(0, 600) || memory
    if (memRow) {
      await db.update(miaMemory).set({ memory: newMem }).where(eq(miaMemory.id, memRow.id))
    } else {
      await db.insert(miaMemory).values({ userId: input.userId, orgId: input.orgId, memory: newMem })
    }
  } catch {
    // memory update is best-effort
  }

  return { reply, activation, feedbackRecorded }
}
