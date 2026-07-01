import { getSql } from '../conn'
import { llmComplete } from '../llmChat'
import { sendTelegram } from '../telegram'
import { rememberFact } from '../memory'
import {
  fetchHotThreads,
  getRedditSession,
  submitComment,
  submitTextPost,
  verifyRedditLogin,
  clearRedditSessionCache,
} from './redditClient'

export type SocialPlatform = 'reddit' | 'linkedin' | 'x' | 'facebook' | 'threads'
export type SocialAction = 'comment' | 'post'

const TARGET_SUBS = ['msp', 'MSSP', 'sysadmin', 'cybersecurity', 'compliance']
const DAILY_COMMENT_LIMIT = 3
const DAILY_POST_LIMIT = 1

export async function ensureSocialTables() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS os_social_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL DEFAULT 'reddit',
    action TEXT NOT NULL DEFAULT 'comment',
    subreddit TEXT,
    target_url TEXT,
    thing_id TEXT,
    title TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    posted_at TIMESTAMPTZ,
    result_url TEXT,
    error TEXT,
    created_by TEXT DEFAULT 'janet',
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {})
}

async function countPostedToday(platform: SocialPlatform, action: SocialAction): Promise<number> {
  const sql = getSql()
  const [row] = await sql`
    SELECT count(*)::int as n FROM os_social_queue
    WHERE platform=${platform} AND action=${action} AND status='posted'
    AND posted_at > date_trunc('day', NOW() AT TIME ZONE 'UTC')
    AND company_id='phishsimai'
  `.catch(() => [{ n: 0 }])
  return Number(row?.n || 0)
}

export async function queueSocialItem(item: {
  platform?: SocialPlatform
  action: SocialAction
  subreddit?: string
  target_url?: string
  thing_id?: string
  title?: string
  body: string
  scheduled_at?: Date
}) {
  await ensureSocialTables()
  const sql = getSql()
  const [row] = await sql`
    INSERT INTO os_social_queue (platform, action, subreddit, target_url, thing_id, title, body, scheduled_at)
    VALUES (
      ${item.platform || 'reddit'}, ${item.action}, ${item.subreddit || null},
      ${item.target_url || null}, ${item.thing_id || null}, ${item.title || null},
      ${item.body}, ${item.scheduled_at?.toISOString() || new Date().toISOString()}
    )
    RETURNING id, platform, action, subreddit, status, created_at
  `
  return row
}

async function draftWithJanet(prompt: string): Promise<string> {
  const { text } = await llmComplete({
    messages: [
      {
        role: 'system',
        content: `You are Janet, CGO for PhishSimAI. Write as Sarah Mitchell (Head of Compliance Partnerships) on Reddit.
Voice: helpful MSP/compliance peer, not salesy. 90% value, 10% soft mention of phishing simulation only if natural.
No links in comments under 200 karma account. 2-4 short paragraphs max for posts, 2-6 sentences for comments.
Never claim to be the founder. Disclose affiliation if mentioning PhishSimAI.`,
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 500,
  })
  return text.trim()
}

export async function generateSarahRedditDrafts(): Promise<{ queued: number; items: any[] }> {
  await ensureSocialTables()
  if (!process.env.SARAH_REDDIT_USERNAME || !process.env.SARAH_REDDIT_PASSWORD) {
    return { queued: 0, items: [], ...({ skipped: 'credentials not configured' } as any) }
  }

  const commentsToday = await countPostedToday('reddit', 'comment')
  const postsToday = await countPostedToday('reddit', 'post')
  const items: any[] = []
  let queued = 0

  const session = await getRedditSession().catch(() => null)

  if (commentsToday < DAILY_COMMENT_LIMIT) {
    const slots = Math.min(DAILY_COMMENT_LIMIT - commentsToday, 2)
    for (let i = 0; i < slots; i++) {
      const sub = TARGET_SUBS[i % TARGET_SUBS.length]
      try {
        const threads = await fetchHotThreads(sub, 8, session || undefined)
        const pick = threads.find((t) =>
          /compliance|phish|security|audit|HIPAA|SOC|MSP|MSSP|breach|training/i.test(t.title)
        ) || threads[Math.floor(Math.random() * Math.max(1, threads.length))]

        if (!pick) continue

        const body = await draftWithJanet(
          `Draft a helpful Reddit comment for r/${sub} on this thread:\nTitle: ${pick.title}\nURL: ${pick.permalink}\n\nAnswer the implied question. No links.`
        )
        const row = await queueSocialItem({
          action: 'comment',
          subreddit: sub,
          target_url: pick.permalink,
          thing_id: pick.id,
          body,
        })
        items.push(row)
        queued++
      } catch (e: any) {
        await sendTelegram(`Sarah Reddit draft skip r/${sub}: ${e.message?.slice(0, 80)}`).catch(() => {})
      }
    }
  }

  if (postsToday < DAILY_POST_LIMIT && queued === 0) {
    const sub = TARGET_SUBS[new Date().getUTCDay() % TARGET_SUBS.length]
    try {
      const title = await draftWithJanet(
        `Write a concise Reddit post TITLE for r/${sub} about MSP compliance or phishing awareness. One line only, no quotes.`
      )
      const body = await draftWithJanet(
        `Write a Reddit self-post body for r/${sub}. Title: ${title}. Educational, compliance-focused, invite discussion. No product links.`
      )
      const row = await queueSocialItem({
        action: 'post',
        subreddit: sub,
        title: title.replace(/^["']|["']$/g, '').slice(0, 280),
        body,
      })
      items.push(row)
      queued++
    } catch { /* skip */ }
  }

  if (queued > 0) {
    await rememberFact({
      company_id: 'phishsimai',
      type: 'campaign',
      key: `sarah_reddit_drafts:${new Date().toISOString().slice(0, 10)}`,
      value: `Queued ${queued} Reddit items for Sarah`,
      confidence: 1,
      source: 'janet',
    }).catch(() => {})
  }

  return { queued, items }
}

export async function processSarahSocialQueue(maxItems = 2): Promise<{
  processed: number
  posted: number
  failed: number
  results: Array<{ id: string; status: string; url?: string; error?: string }>
}> {
  await ensureSocialTables()
  if (!process.env.SARAH_REDDIT_USERNAME || !process.env.SARAH_REDDIT_PASSWORD) {
    return { processed: 0, posted: 0, failed: 0, results: [] }
  }

  const commentsToday = await countPostedToday('reddit', 'comment')
  const postsToday = await countPostedToday('reddit', 'post')
  const sql = getSql()

  const pending = await sql`
    SELECT * FROM os_social_queue
    WHERE status='queued' AND platform='reddit' AND scheduled_at <= NOW()
    ORDER BY scheduled_at ASC
    LIMIT ${maxItems}
  `.catch(() => [] as any[])

  const session = await getRedditSession()
  const results: Array<{ id: string; status: string; url?: string; error?: string }> = []
  let posted = 0
  let failed = 0

  for (const item of pending as any[]) {
    if (item.action === 'comment' && commentsToday + posted >= DAILY_COMMENT_LIMIT) break
    if (item.action === 'post' && postsToday + posted >= DAILY_POST_LIMIT) break

    try {
      let resultUrl = ''
      if (item.action === 'comment') {
        if (!item.thing_id) throw new Error('missing thing_id')
        const res = await submitComment(session, item.thing_id, item.body)
        const link = res?.json?.data?.things?.[0]?.data?.permalink
        resultUrl = link ? `https://www.reddit.com${link}` : item.target_url || ''
      } else {
        const res = await submitTextPost(session, item.subreddit, item.title || 'MSP compliance note', item.body)
        const link = res?.json?.data?.url || res?.json?.data?.id
        resultUrl = typeof link === 'string' && link.startsWith('http') ? link : `https://www.reddit.com/r/${item.subreddit}`
      }

      await sql`
        UPDATE os_social_queue
        SET status='posted', posted_at=NOW(), result_url=${resultUrl}, error=NULL
        WHERE id=${item.id}
      `
      results.push({ id: item.id, status: 'posted', url: resultUrl })
      posted++
      await sendTelegram(`✅ Sarah Reddit ${item.action} on r/${item.subreddit}\n${resultUrl}`).catch(() => {})
      await new Promise((r) => setTimeout(r, 15000))
    } catch (e: any) {
      const err = e.message?.slice(0, 300) || 'post failed'
      await sql`UPDATE os_social_queue SET status='failed', error=${err} WHERE id=${item.id}`
      results.push({ id: item.id, status: 'failed', error: err })
      failed++
      clearRedditSessionCache()
    }
  }

  return { processed: results.length, posted, failed, results }
}

export async function runSarahSocialCron(): Promise<{
  login: Awaited<ReturnType<typeof verifyRedditLogin>>
  drafts: Awaited<ReturnType<typeof generateSarahRedditDrafts>>
  publish: Awaited<ReturnType<typeof processSarahSocialQueue>>
}> {
  const login = await verifyRedditLogin()
  const drafts = login.ok ? await generateSarahRedditDrafts() : { queued: 0, items: [] }
  const publish = login.ok ? await processSarahSocialQueue(2) : { processed: 0, posted: 0, failed: 0, results: [] }
  return { login, drafts, publish }
}

export async function listSocialQueue(limit = 20) {
  await ensureSocialTables()
  const sql = getSql()
  return sql`
    SELECT id, platform, action, subreddit, target_url, title, body, status, scheduled_at, posted_at, result_url, error, created_at,
      preview_token, review_status, founder_comment, image_url
    FROM os_social_queue ORDER BY created_at DESC LIMIT ${limit}
  `.catch(() => [])
}
