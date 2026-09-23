/**
 * PS-WEEK-ACQ-01 — crisis / week-challenge public social publish.
 *
 * Owner 2026-09-17: Kaan said handle ALL free multi-channel acquisition without
 * founder draft-review gates. Publish stays spam-safe:
 *   · LinkedIn ≤1 post/day, frozen 60¢ / $299 / 30-day no-card offer, no duplicates
 *   · Reddit = helpful comments/posts in allowed subs only; never link-drop spam
 *   · No cold email blast, no touch 93
 *
 * Kill switch (Vercel env SOCIAL_CRISIS_PUBLISH):
 *   '0' / 'false' → never auto-publish (PS-SOCIAL-LOCKOUT-01 fully on)
 *   '1' / 'true'  → crisis override ON when that channel's credentials exist
 *   unset         → ON through WEEK_CHALLENGE_END (2026-09-25 inclusive) when credentials exist
 *
 * PUBLIC_SOCIAL_POSTING_ENABLED stays false. Flipping that constant is the
 * permanent always-on path and still requires a reviewed commit.
 */
export const WEEK_CHALLENGE_END_ISO = '2026-09-25T23:59:59.999Z'
export const LINKEDIN_DAILY_POST_CAP = 1
export const REDDIT_DAILY_COMMENT_LIMIT = 3
export const REDDIT_DAILY_POST_LIMIT = 1
export const REDDIT_ALLOWED_SUBS = ['msp', 'MSSP', 'sysadmin', 'cybersecurity', 'compliance'] as const

export type CrisisPublishEnv = Record<string, string | undefined>

export function isCrisisPublishKilled(env: CrisisPublishEnv = process.env): boolean {
  const v = String(env.SOCIAL_CRISIS_PUBLISH || '').trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'off'
}

export function isWeekChallengeWindow(now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(WEEK_CHALLENGE_END_ISO)
}

/** Crisis override window: explicit env=1, or default-on during the week challenge. */
export function isCrisisPublishWindow(env: CrisisPublishEnv = process.env, now: Date = new Date()): boolean {
  if (isCrisisPublishKilled(env)) return false
  const v = String(env.SOCIAL_CRISIS_PUBLISH || '').trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'on') return true
  return isWeekChallengeWindow(now)
}

export function hasChannelPublishCredentials(channel: string, env: CrisisPublishEnv = process.env): boolean {
  const c = String(channel || '').toLowerCase()
  if (c.includes('linkedin') || c.includes('postforme')) {
    const key = !!(env.POSTFORME_PHISHSIM_API_KEY || env.POSTFORME_API_KEY || env.POST_FOR_ME_API_KEY)
    return key && !!String(env.POSTFORME_SARAH_LINKEDIN_ID || '').trim()
  }
  if (c.includes('reddit')) {
    return !!(String(env.SARAH_REDDIT_USERNAME || '').trim() && String(env.SARAH_REDDIT_PASSWORD || '').trim())
  }
  return false
}

export function crisisPublishBlockReason(channel: string, env: CrisisPublishEnv = process.env, now: Date = new Date()): string {
  if (isCrisisPublishKilled(env)) return 'SOCIAL_CRISIS_PUBLISH=0 (kill switch)'
  if (!isCrisisPublishWindow(env, now)) return 'crisis publish window closed (set SOCIAL_CRISIS_PUBLISH=1 to continue)'
  if (!hasChannelPublishCredentials(channel, env)) return `no ${channel} publish credentials`
  return 'ok'
}

export function normalizeSocialBody(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDuplicateSocialBody(candidate: string, previous: string[]): boolean {
  const n = normalizeSocialBody(candidate)
  if (n.length < 40) return false
  const head = n.slice(0, 180)
  return previous.some((p) => {
    const q = normalizeSocialBody(p)
    if (!q) return false
    if (q === n) return true
    return head.length >= 40 && q.slice(0, 180) === head
  })
}

export type LinkedInCrisisPlanAction =
  | { type: 'publish'; token: string }
  | { type: 'clear'; token: string; reviewStatus: 'superseded' | 'held_content_safety'; error: string }
  | { type: 'skip'; token: string; reason: string }

/**
 * One crisis tick: publish at most one quality non-duplicate draft, and clear
 * pending_review rows that can never publish (offer missing, or a 14-day duplicate).
 * Live miss 2026-09-23: a draft sat pending_review ~63h because a failed quality
 * check returned early and advanceLinkedIn treated any pending row as a founder gate.
 * Approved + unpublishable is held_content_safety (not superseded). Caps stay 1/day.
 */
export function planLinkedInCrisisActions(input: {
  candidates: Array<{ preview_token?: string | null; body?: string | null; review_status?: string | null }>
  previousBodies: string[]
  postedToday: number
  dailyCap?: number
}): LinkedInCrisisPlanAction[] {
  const cap = input.dailyCap ?? LINKEDIN_DAILY_POST_CAP
  const actions: LinkedInCrisisPlanAction[] = []
  let publishing = false
  for (const item of input.candidates) {
    const token = String(item.preview_token || '').trim()
    if (!token) continue
    const body = String(item.body || '')
    const quality = linkedInBodyIsPublishable(body)
    const dup = isDuplicateSocialBody(body, input.previousBodies)
    const approved = String(item.review_status || '') === 'approved'
    if (quality.ok && !dup) {
      if (input.postedToday >= cap || publishing) {
        actions.push({ type: 'skip', token, reason: `linkedin ${cap}/day cap` })
        continue
      }
      actions.push({ type: 'publish', token })
      publishing = true
      continue
    }
    actions.push({
      type: 'clear',
      token,
      reviewStatus: approved && !dup ? 'held_content_safety' : 'superseded',
      error: dup
        ? 'duplicate of a LinkedIn post in the last 14 days'
        : (quality.reason || 'not publishable'),
    })
  }
  return actions
}

/** Frozen live offer must be present; spammy urgency copy is refused. */
export function linkedInBodyIsPublishable(body: string): { ok: boolean; reason: string } {
  const t = String(body || '').trim()
  if (t.length < 80) return { ok: false, reason: 'too short for a LinkedIn post' }
  if (!/60\s*[¢c]|\$299|30[-\s]?day|no[-\s]?card|phishsimai\.com\/trial/i.test(t)) {
    return { ok: false, reason: 'missing frozen 60¢ / $299 / 30-day no-card trial offer' }
  }
  if (/\b(act now|limited time|buy now|click here!!!)\b/i.test(t)) {
    return { ok: false, reason: 'spammy urgency copy' }
  }
  return { ok: true, reason: 'ok' }
}

export function redditSubIsAllowed(subreddit: string | null | undefined): boolean {
  const sub = String(subreddit || '').replace(/^r\//i, '').trim()
  return (REDDIT_ALLOWED_SUBS as readonly string[]).some((s) => s.toLowerCase() === sub.toLowerCase())
}

/**
 * Reddit = helpful peer, not a link-drop. Comments: no URLs. Posts: at most one
 * phishsimai.com URL, and only if the rest of the body is educational.
 */
export function redditDraftIsPublishable(
  action: 'comment' | 'post' | string,
  body: string,
  subreddit?: string | null,
): { ok: boolean; reason: string } {
  if (!redditSubIsAllowed(subreddit)) {
    return { ok: false, reason: `sub r/${String(subreddit || '').replace(/^r\//, '')} is not on the allow-list` }
  }
  const t = String(body || '').trim()
  if (t.length < 40) return { ok: false, reason: 'too short to be helpful' }
  const urls = t.match(/https?:\/\/[^\s)]+/gi) || []
  if (action === 'comment') {
    if (urls.length > 0 || /phishsimai\.com/i.test(t)) {
      return { ok: false, reason: 'Reddit comments must not link-drop' }
    }
  } else if (urls.length > 1) {
    return { ok: false, reason: 'Reddit posts may include at most one URL' }
  } else if (urls.some((u) => !/phishsimai\.com/i.test(u))) {
    return { ok: false, reason: 'off-site link in Reddit post' }
  }
  const pitchy = (t.match(/\b(sign up|start (a |your )?trial|buy|pricing|\$299|60¢)\b/gi) || []).length
  const words = t.split(/\s+/).length
  if (pitchy >= 3 && words < 80) return { ok: false, reason: 'mostly a pitch, not a helpful post' }
  return { ok: true, reason: 'ok' }
}
