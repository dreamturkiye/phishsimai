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

  const isFeedback = input.explicitFeedback || FEEDBACK_PATTERNS.test(input.message)
  let feedbackRecorded = false
  if (isFeedback && input.message.trim().length >= 8) {
    await recordProductFeedback({
      userId: input.userId,
      orgId: input.orgId,
      message: input.message,
      pathname,
      category: input.feedbackCategory,
      rating: input.rating,
    })
    feedbackRecorded = true
  }

  const activationBlock =
    `Activation: step ${activation.step}/${activation.totalSteps} (${activation.label}). ` +
    `Targets: ${activation.targetCount}, campaigns: ${activation.campaignCount}, launched: ${activation.launchedCount}. ` +
    `Next: ${activation.nextAction} Link: ${activation.nextLink}`

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

Pricing: Starter $99/mo, Growth $249, Pro $499, Unlimited $999. 14-day free trial.

Current page: ${pathname}. ${pageGuide}

${activationBlock}

Org: ${orgName}, plan: ${plan}.
${memory ? `User memory: ${memory}` : ''}

Rules:
- Max 3 sentences unless they ask for steps.
- Include deep links like "Go to /targets" when guiding.
- If they share feedback or frustration, thank them and say the team will review it.
- Proactively nudge toward the next activation step if they seem stuck.
${feedbackRecorded ? '- You just logged their feedback — acknowledge that.' : ''}`

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
