import { getSql } from '../conn'
import { sendTelegram } from '../telegram'
import { sanitizeStoredPostBody } from './parseSarahDraft'
import { getPreviewByToken, submitSocialReview, type SocialPreviewRecord } from './socialPreviewPage'
import { postLinkedInViaPostForMe } from './postForMeLinkedIn'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://phishsimai.com'

export function resolveHeroUrlForPublish(token: string, imageUrl: string | null): string {
  if (!imageUrl?.trim()) throw new Error('Post has no hero image')
  if (imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) return imageUrl
  const base = BASE_URL.replace(/\/$/, '')
  return `${base}/social/soc2-linkedin-hero.png`
}

function buildLinkedInCaption(item: SocialPreviewRecord): string {
  const hook = String(item.title || '')
  const body = sanitizeStoredPostBody(String(item.body || ''), hook)
  let hashtags: string[] = []
  try {
    const parsed = JSON.parse(String(item.hashtags || '[]'))
    if (Array.isArray(parsed) && parsed.length) hashtags = parsed.map(String)
  } catch {
    hashtags = ['MSP', 'CyberSecurity', 'Compliance']
  }
  const tagLine = hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
  return tagLine ? `${body.trim()}\n\n${tagLine}` : body.trim()
}

/** Approve (if needed) and publish Sarah LinkedIn post via PostForMe. */
export async function publishSarahLinkedInPost(token: string): Promise<{
  postId: string
  linkedInUrl?: string
  caption: string
  imageUrl: string
}> {
  const item = await getPreviewByToken(token)
  if (!item) throw new Error('Preview not found')
  if (item.platform !== 'linkedin') throw new Error('Not a LinkedIn post')
  if (item.status === 'posted') {
    const sql = getSql()
    await sql`
      UPDATE os_social_queue
      SET status='queued', posted_at=null, result_url=null, error='Retry after media URL fix'
      WHERE preview_token=${token} AND result_url IS NULL
    `.catch(() => {})
    const refreshed = await getPreviewByToken(token)
    if (refreshed?.status === 'posted' && refreshed.result_url) {
      throw new Error('Already posted successfully')
    }
  }

  if (item.review_status !== 'approved') {
    await submitSocialReview(token, 'approved', 'Founder approved — publish now')
  }

  const caption = buildLinkedInCaption(item)
  const imageUrl = resolveHeroUrlForPublish(token, item.image_url)

  const result = await postLinkedInViaPostForMe(caption, imageUrl)

  const sql = getSql()
  await sql`
    UPDATE os_social_queue
    SET status='posted',
        review_status='approved',
        posted_at=NOW(),
        result_url=${result.linkedInUrl || null},
        error=null
    WHERE preview_token=${token}
  `.catch(() => {})

  const msg = result.linkedInUrl
    ? `✅ Sarah LinkedIn LIVE\n${result.linkedInUrl}\n\n${String(item.title || '').slice(0, 80)}`
    : `✅ Sarah LinkedIn published (PostForMe ${result.postId})\n${String(item.title || '').slice(0, 80)}`

  await sendTelegram(msg).catch(() => {})

  return { postId: result.postId, linkedInUrl: result.linkedInUrl, caption, imageUrl }
}
