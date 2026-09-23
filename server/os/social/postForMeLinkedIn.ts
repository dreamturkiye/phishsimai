/**
 * PostForMe — Sarah Mitchell LinkedIn publish.
 *
 * PS-SOCIAL-LOCKOUT-01: publishing is severed here. This module's caller
 * (publishSarahLinkedIn.ts) had a self-approving "gate" — an unapproved item called
 * submitSocialReview(token,'approved') on itself and continued — so it enforced nothing.
 */
import { assertPublicPostingDisabled } from './publicPostingLockout'

const API_BASE = 'https://api.postforme.dev/v1'
/** Live 2026-09-23: POST /v1/posts → `404 Cannot POST /v1/posts`. Create is /v1/social-posts. */
export const POSTFORME_SOCIAL_POSTS_URL = `${API_BASE}/social-posts`

export type PostForMeEnv = Record<string, string | undefined>

/** Ignore a stale POSTFORME_API_URL that still points at the removed /v1/posts route. */
export function resolvePostForMeCreateUrl(env: PostForMeEnv = process.env): string {
  const raw = String(env.POSTFORME_API_URL || '').trim().replace(/\/$/, '')
  if (!raw || /\/v1\/posts$/.test(raw) || /\/posts$/.test(raw)) return POSTFORME_SOCIAL_POSTS_URL
  return raw
}

/** PhishSim key wins over a generic/ScrollFuel POSTFORME_API_KEY. */
export function resolvePostForMeApiKey(env: PostForMeEnv = process.env): string {
  return (
    env.POSTFORME_PHISHSIM_API_KEY?.trim() ||
    env.POSTFORME_API_KEY?.trim() ||
    env.POST_FOR_ME_API_KEY?.trim() ||
    ''
  )
}

/** Sarah's connected account. Fall back to the older Kaan-account env only if Sarah's id is unset. */
export function resolvePostForMeLinkedInAccount(env: PostForMeEnv = process.env): string {
  return env.POSTFORME_SARAH_LINKEDIN_ID?.trim() || env.POSTFORME_LINKEDIN_ACCOUNT?.trim() || ''
}

function apiKey(): string {
  const key = resolvePostForMeApiKey()
  if (!key) throw new Error('POSTFORME_API_KEY not configured')
  return key
}

function sarahLinkedInAccountId(): string {
  const id = resolvePostForMeLinkedInAccount()
  if (!id) throw new Error('POSTFORME_SARAH_LINKEDIN_ID not configured')
  return id
}

type PostStatus = {
  id?: string
  status?: string
  external_id?: string | null
  error?: string
  social_account_posts?: Array<{
    status?: string
    external_id?: string | null
    platform_post_id?: string | null
    platform?: string
    error?: string
  }>
}

async function fetchPostStatus(postId: string): Promise<PostStatus> {
  const res = await fetch(`${API_BASE}/social-posts/${postId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(25_000),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(`PostForMe status ${res.status}: ${JSON.stringify(result).slice(0, 300)}`)
  return result as PostStatus
}

async function fetchPostResults(postId: string): Promise<Array<{ success?: boolean; error?: string | null; platform_data?: { url?: string; id?: string } | null }>> {
  const res = await fetch(`${API_BASE}/social-post-results?post_id=${encodeURIComponent(postId)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(25_000),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(`PostForMe results ${res.status}: ${JSON.stringify(result).slice(0, 300)}`)
  return (Array.isArray(result) ? result : (result as { data?: unknown[] }).data ?? []) as Array<{
    success?: boolean
    error?: string | null
    platform_data?: { url?: string; id?: string } | null
  }>
}

export async function postLinkedInViaPostForMe(
  caption: string,
  imageUrl: string
): Promise<{ postId: string; externalId?: string; linkedInUrl?: string }> {
  assertPublicPostingDisabled('LinkedIn (PostForMe / publishSarahLinkedIn)')
  const socialAccountId = sarahLinkedInAccountId()

  const res = await fetch(resolvePostForMeCreateUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      caption,
      social_accounts: [socialAccountId],
      media: [{ url: imageUrl }],
    }),
    signal: AbortSignal.timeout(45_000),
  })

  const result = await res.json()
  if (!res.ok) {
    throw new Error(`PostForMe ${res.status}: ${JSON.stringify(result).slice(0, 400)}`)
  }

  const postId = (result as { id?: string }).id
  if (!postId) throw new Error(`PostForMe returned no post id: ${JSON.stringify(result).slice(0, 200)}`)

  const deadline = Date.now() + 3 * 60_000
  while (Date.now() < deadline) {
    const status = await fetchPostStatus(postId)
    if (status.status === 'failed') {
      throw new Error(`PostForMe publish failed: ${JSON.stringify(status).slice(0, 400)}`)
    }
    if (status.status === 'processed') {
      const results = await fetchPostResults(postId)
      const entry = results[0]
      if (entry && entry.success === false) {
        throw new Error(`LinkedIn rejected post: ${entry.error || 'unknown error'}`)
      }
      const entryLegacy = status.social_account_posts?.find((p) => p.platform?.includes('linkedin')) ?? status.social_account_posts?.[0]
      if (entryLegacy?.status === 'failed' && entryLegacy.error) {
        throw new Error(`LinkedIn rejected post: ${entryLegacy.error}`)
      }
      const externalId =
        entry?.platform_data?.id ||
        entryLegacy?.platform_post_id ||
        entryLegacy?.external_id ||
        status.external_id ||
        undefined
      const linkedInUrl =
        entry?.platform_data?.url ||
        (externalId ? `https://www.linkedin.com/feed/update/${externalId}` : undefined)
      return { postId, externalId: externalId ?? undefined, linkedInUrl }
    }
    await new Promise((r) => setTimeout(r, 5000))
  }

  throw new Error(`PostForMe still processing (${postId}) — check PostForMe dashboard`)
}
