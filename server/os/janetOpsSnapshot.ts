/**
 * Live ops snapshot for Janet HQ — employees, pipeline, social, no vague excuses.
 */
import { getSql } from './conn'
import { ensureSocialTables, listSocialQueue } from './social/sarahSocial'
import { getAllAgentHealth } from './agentHealth_v2'
import { AGENTS } from './agents/kaan_os_v4'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://phishsimai.com'

export type JanetOpsSnapshot = {
  companyId: string
  generatedAt: string
  text: string
  employees: Array<{ id: string; name: string; title: string; status: string; lastSuccess: string | null; lastError: string | null }>
  sarahLinkedIn: {
    status: 'not_wired' | 'queued' | 'scheduled' | 'posted_today'
    nextPostAt: string | null
    blocker: string | null
    nextPostHook: string | null
  }
  sarahReddit: {
    configured: boolean
    cronUtc: string
    queuedCount: number
    nextQueuedAt: string | null
    postedCommentsToday: number
    postedPostsToday: number
    limits: string
  }
  pipeline: { touched: number; replied: number; replyRate: string }
  openAlerts: string[]
  activeTasks: Array<{ agent: string; title: string; priority: string }>
}

async function countPostedToday(platform: string, action: string): Promise<number> {
  const sql = getSql()
  const [row] = await sql`
    SELECT count(*)::int as n FROM os_social_queue
    WHERE platform=${platform} AND action=${action} AND status='posted'
    AND posted_at > date_trunc('day', NOW() AT TIME ZONE 'UTC')
    AND company_id='phishsimai'
  `.catch(() => [{ n: 0 }])
  return Number(row?.n || 0)
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const h = (Date.now() - new Date(iso).getTime()) / 3600000
  if (h < 1) return `${Math.round(h * 60)}m ago`
  if (h < 48) return `${h.toFixed(1)}h ago`
  return `${Math.round(h / 24)}d ago`
}

export async function getJanetOpsSnapshot(companyId = 'phishsimai'): Promise<JanetOpsSnapshot> {
  await ensureSocialTables()
  const sql = getSql()
  const now = new Date()

  const [health, queue, pipelineRow, tasks, alerts] = await Promise.all([
    getAllAgentHealth(companyId).catch(() => []),
    listSocialQueue(30).catch(() => [] as any[]),
    sql`SELECT
      count(*) filter(where touch1_sent_at is not null) as touched,
      count(*) filter(where replied=true) as replied
      FROM ps_outreach_leads`.catch(() => [{ touched: 0, replied: 0 }]),
    sql`SELECT agent_id, title, priority FROM agent_tasks
      WHERE company_id=${companyId} AND status IN ('assigned','in_progress')
      ORDER BY created_at DESC LIMIT 8`.catch(() => []),
    sql`SELECT key, value as detail FROM janet_memory
      WHERE company_id='phishsimai' AND type='operating' AND key LIKE 'system_alert:%'
      ORDER BY created_at DESC LIMIT 6`.catch(() => []),
  ])

  const employees = health.map((h) => ({
    id: h.agent_id,
    name: h.agent_name,
    title: h.agent_title,
    status: h.status,
    lastSuccess: h.last_success_at,
    lastError: h.last_error,
  }))

  const postForMeConfigured = !!(process.env.POSTFORME_API_KEY || process.env.POST_FOR_ME_API_KEY)
  const redditConfigured = !!(process.env.SARAH_REDDIT_USERNAME && process.env.SARAH_REDDIT_PASSWORD)

  const linkedinQueued = (queue as any[]).filter((q) => q.platform === 'linkedin' && q.status === 'queued')
  const redditQueued = (queue as any[]).filter((q) => q.platform === 'reddit' && q.status === 'queued')
  const nextLinkedIn = linkedinQueued.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0]
  const nextReddit = redditQueued.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0]

  const commentsToday = await countPostedToday('reddit', 'comment')
  const postsToday = await countPostedToday('reddit', 'post')
  const linkedinPostedToday = await countPostedToday('linkedin', 'post')

  let linkedinStatus: JanetOpsSnapshot['sarahLinkedIn']['status'] = 'not_wired'
  let linkedinBlocker: string | null = null
  let linkedinNext: string | null = null

  if (!postForMeConfigured) {
    linkedinBlocker = 'POSTFORME_API_KEY not in Vercel — LinkedIn autopost not live'
  } else if (linkedinQueued.length === 0) {
    linkedinStatus = 'not_wired'
    linkedinBlocker = 'PostForMe ready but queue empty — tell Aria to draft Sarah LinkedIn posts'
  } else {
    linkedinStatus = 'queued'
    linkedinNext = nextLinkedIn?.scheduled_at || null
    if (linkedinPostedToday > 0) linkedinStatus = 'posted_today'
  }

  const touched = Number((pipelineRow as any[])[0]?.touched || 0)
  const replied = Number((pipelineRow as any[])[0]?.replied || 0)
  const replyRate = touched > 0 ? ((replied / touched) * 100).toFixed(1) + '%' : '0%'

  const nextCronUtc = (() => {
    const hours = [10, 16]
    const h = now.getUTCHours()
    const nextH = hours.find((x) => x > h) ?? hours[0]
    const d = new Date(now)
    if (nextH <= h) d.setUTCDate(d.getUTCDate() + 1)
    d.setUTCHours(nextH, 0, 0, 0)
    return d.toISOString()
  })()

  const activeTasks = (tasks as any[]).map((t) => ({
    agent: AGENTS[t.agent_id as keyof typeof AGENTS]?.name || t.agent_id,
    title: String(t.title).slice(0, 80),
    priority: t.priority,
  }))

  const openAlerts = (alerts as any[]).map((a) => `${a.key}: ${String(a.detail || '').slice(0, 100)}`)

  const employeeLines = employees
    .filter((e) => e.id !== 'janet')
    .map((e) => `- ${e.name} (${e.title}): ${e.status}, last active ${ago(e.lastSuccess)}${e.lastError ? `, err: ${e.lastError.slice(0, 60)}` : ''}`)

  const sarahLinkedIn = {
    status: linkedinStatus,
    nextPostAt: linkedinNext,
    blocker: linkedinBlocker,
    nextPostHook: nextLinkedIn?.title ? String(nextLinkedIn.title).slice(0, 120) : null,
  }

  const sarahReddit = {
    configured: redditConfigured,
    cronUtc: '10:00 + 16:00 UTC (/api/os/sarah-social)',
    queuedCount: redditQueued.length,
    nextQueuedAt: nextReddit?.scheduled_at || null,
    postedCommentsToday: commentsToday,
    postedPostsToday: postsToday,
    limits: '3 comments/day, 1 post/day',
  }

  const pendingReviews = await sql`
    SELECT preview_token, title, review_status, created_at
    FROM os_social_queue
    WHERE platform='linkedin' AND review_status='pending_review' AND preview_token IS NOT NULL
    ORDER BY created_at DESC LIMIT 3
  `.catch(() => [])

  const reviewLines = (pendingReviews as any[]).map(
    (r) => `  - PENDING: "${String(r.title).slice(0, 60)}" → ${BASE_URL.replace(/\/$/, '')}/preview/social/${r.preview_token}`
  )

  const lines = [
    `LIVE OPS @ ${now.toISOString()}`,
    '',
    'YOUR TEAM (real-time from agent_health_v2):',
    ...employeeLines,
    '',
    `PIPELINE: ${touched} touched, ${replied} replied (${replyRate})`,
    activeTasks.length
      ? `ACTIVE TASKS:\n${activeTasks.map((t) => `  - ${t.agent}: ${t.title} [${t.priority}]`).join('\n')}`
      : 'ACTIVE TASKS: none open',
    '',
    'SARAH LINKEDIN:',
    linkedinBlocker ? `BLOCKED: ${linkedinBlocker}` : `Status: ${linkedinStatus}${linkedinNext ? `, next ${linkedinNext}` : ''}`,
    sarahLinkedIn.nextPostHook ? `Hook: ${sarahLinkedIn.nextPostHook}` : '',
    reviewLines.length ? `PENDING KAAN REVIEW (Safari links):\n${reviewLines.join('\n')}` : 'PENDING REVIEW: none',
    linkedinPostedToday ? `Posted today: ${linkedinPostedToday}` : 'Posted today: 0',
    '',
    'SARAH REDDIT:',
    redditConfigured ? `Live. Cron ${sarahReddit.cronUtc}, next run ~${nextCronUtc}` : 'BLOCKED: SARAH_REDDIT credentials missing',
    `Queue: ${redditQueued.length}, today ${commentsToday}/3 comments ${postsToday}/1 posts`,
    '',
    openAlerts.length ? `ALERTS:\n${openAlerts.join('\n')}` : 'ALERTS: clear',
    '',
    'YOU ARE THE CGO — answer Kaan from this data. Ping employees via ask_employee tool. Show LinkedIn via get_sarah_linkedin_preview. No excuses, no "waiting on marketing".',
  ].filter(Boolean)

  return {
    companyId,
    generatedAt: now.toISOString(),
    text: lines.join('\n'),
    employees,
    sarahLinkedIn,
    sarahReddit,
    pipeline: { touched, replied, replyRate },
    openAlerts,
    activeTasks,
  }
}
