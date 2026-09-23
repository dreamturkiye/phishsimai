/**
 * Acquisition besides cold email. PS-SOCIAL-LOCKOUT-01 stays the structural flag
 * (PUBLIC_SOCIAL_POSTING_ENABLED=false). Owner 2026-09-17: during crisis / week-challenge,
 * Sarah auto-queues AND auto-publishes LinkedIn via PostForMe when credentials exist.
 * Founder draft-review is NOT a gate. Kill switch: SOCIAL_CRISIS_PUBLISH=0.
 *
 * Do not invent cold copy. Trial URL and price claims are the frozen sequence strings.
 * LinkedIn ≤1 post/day, quality + de-dupe. No touch 93. No cold blast.
 */
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { rememberFact } from './memory'
import { TRIAL_CTA_URL } from './sequences'
import { canPublishPublicSocial } from './social/publicPostingLockout'
import { previewPublicUrl, savePreviewForReview, linkedInPreviewTelegramHtml } from './social/socialPreviewPage'
import { REFERENCE_PUBLIC_URL } from './social/linkedinHeroFallback'
import { publishSarahLinkedInPost } from './social/publishSarahLinkedIn'
import {
  LINKEDIN_DAILY_POST_CAP,
  crisisPublishBlockReason,
  isDuplicateSocialBody,
  planLinkedInCrisisActions,
} from './social/crisisSocialPublish'

export const TRIAL_ACQUISITION_CHANNELS = [
  {
    id: 'warm_reply_cta',
    status: 'live' as const,
    how: 'sendWarmTrialCtas — Dex-gated 30-day CTA to replied/engaged leads (not cold).',
  },
  {
    id: 'trial_org_nudges',
    status: 'live' as const,
    how: 'runTrialNudges D14/D25/D30 plus one-shot unused-trial activation (3-click + white-glove) to TRUE trial orgs only (canary/test excluded). Not a warm-CTA 90–92 blast.',
  },
  {
    id: 'msp_hub_harvest',
    status: 'live' as const,
    how: 'cron /api/os/msp-harvest — mymsphub sitemap → named MSP domains → existing AMF/MX refill. TOF that is not a new cold-copy blast.',
  },
  {
    id: 'magic_link_checkout',
    status: 'live' as const,
    how: '/checkout HMAC magic-link for interested leads (paid). Auth-path magic-link TRIAL is a five-hard-stop (protected auth) — staged, not built here.',
  },
  {
    id: 'founder_1to1',
    status: 'live' as const,
    how: 'queueFounderOneToOneReviews — exhausted 90/91/92 HUMAN replies (not OOO/auto-reply) get a 1:1 brief. NOT email. NOT touch 93.',
  },
  {
    id: 'linkedin_founder_draft',
    status: 'live' as const,
    how: 'Queue LinkedIn trial-CTA drafts and auto-publish via PostForMe during crisis (≤1/day, quality, no dup). Kill: SOCIAL_CRISIS_PUBLISH=0. No founder approval gate.',
  },
  {
    id: 'public_social_publish',
    status: 'crisis' as const,
    how: 'Crisis override: LinkedIn + Reddit publish when credentials exist. Structural PUBLIC_SOCIAL_POSTING_ENABLED stays false. Kill SOCIAL_CRISIS_PUBLISH=0.',
  },
  {
    id: 'knowbe4_seo',
    status: 'live' as const,
    how: 'SEO cluster: /knowbe4-alternative hub plus /knowbe4-vs /knowbe4-pricing /knowbe4-for-msps /phishing-simulation-software /security-awareness-training /phishing-training-for-msps → /trial (60¢/user, $299/500, 30-day no-card).',
  },
] as const

const DRAFT_MEMORY_KEY = 'trial_acq_linkedin_draft_day'
const ESCALATE_MEMORY_KEY = 'trial_acq_linkedin_escalate_at'
export const LINKEDIN_PENDING_ESCALATE_HOURS = 2

export { linkedInPreviewTelegramHtml } from './social/socialPreviewPage'

export const TRIAL_LINKEDIN_DRAFT_BODY =
  `MSPs: 30-day no-card trial. One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Live in 10 minutes.\n\nStart: ${TRIAL_CTA_URL}`

export type LinkedInAcquisitionFunnel = {
  pendingReview: number
  queued: number
  approved: number
  posted: number
  oldestPendingHours: number | null
}

export type LinkedInAcquisitionResult = {
  queued: boolean
  escalated: boolean
  posted?: boolean
  reason: string
  previewUrl?: string
  funnel: LinkedInAcquisitionFunnel
}

export const EMPTY_LINKEDIN_FUNNEL: LinkedInAcquisitionFunnel = {
  pendingReview: 0, queued: 0, approved: 0, posted: 0, oldestPendingHours: null,
}

export function linkedInFunnelLine(f: LinkedInAcquisitionFunnel): string {
  const age = f.oldestPendingHours == null ? 'none pending' : `oldest pending ${f.oldestPendingHours}h`
  return `LinkedIn funnel queued=${f.queued} pending_review=${f.pendingReview} approved=${f.approved} posted=${f.posted} (${age})`
}

function sqlRows(result: unknown): any[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object' && Array.isArray((result as any).rows)) return (result as any).rows
  return []
}

export async function measureLinkedInFunnel(sql: any): Promise<LinkedInAcquisitionFunnel> {
  const rows = (await sql`
    SELECT
      count(*) FILTER (WHERE review_status = 'pending_review' OR (status IN ('draft','queued') AND COALESCE(review_status, 'pending_review') = 'pending_review'))::int AS pending_review,
      count(*) FILTER (WHERE status = 'queued')::int AS queued,
      count(*) FILTER (WHERE review_status = 'approved')::int AS approved,
      count(*) FILTER (WHERE status = 'posted')::int AS posted,
      extract(epoch FROM (NOW() - MIN(created_at) FILTER (
        WHERE review_status = 'pending_review' OR (status IN ('draft','queued') AND COALESCE(review_status, 'pending_review') = 'pending_review')
      ))) / 3600 AS oldest_hours
    FROM os_social_queue
    WHERE platform = 'linkedin' AND company_id = 'phishsimai'
  `.catch(() => [{}])) as any[]
  const r = rows[0] || {}
  const oldest = r.oldest_hours == null ? null : Math.max(0, Math.round(Number(r.oldest_hours)))
  return {
    pendingReview: Number(r.pending_review ?? 0) || 0,
    queued: Number(r.queued ?? 0) || 0,
    approved: Number(r.approved ?? 0) || 0,
    posted: Number(r.posted ?? 0) || 0,
    oldestPendingHours: Number.isFinite(oldest as number) ? oldest : null,
  }
}

async function countLinkedInPostedToday(sql: any): Promise<number> {
  const rows = sqlRows(await sql`
    SELECT count(*)::int AS n FROM os_social_queue
    WHERE platform='linkedin' AND company_id='phishsimai' AND status='posted'
      AND posted_at > date_trunc('day', NOW() AT TIME ZONE 'UTC')
  `.catch(() => [{ n: 0 }]))
  return Number(rows[0]?.n || 0)
}

/**
 * Auto-publish one quality, non-duplicate LinkedIn trial draft. No founder approval.
 * Caps at LINKEDIN_DAILY_POST_CAP. Kill switch / missing creds → no-op.
 */
export type CrisisLinkedInPublishAttempt = {
  posted: boolean
  reason: string
  previewUrl?: string
}

function missedPublish(reason: string): CrisisLinkedInPublishAttempt {
  return { posted: false, reason }
}

export async function tryCrisisPublishLinkedIn(sqlOverride?: any): Promise<CrisisLinkedInPublishAttempt> {
  if (!canPublishPublicSocial('LinkedIn (PostForMe / publishSarahLinkedIn)')) {
    return missedPublish(crisisPublishBlockReason('linkedin'))
  }
  const sql = sqlOverride ?? getSql()
  const postedToday = await countLinkedInPostedToday(sql).catch(() => 0)

  const prior = sqlRows(await sql`
    SELECT body FROM os_social_queue
    WHERE platform='linkedin' AND company_id='phishsimai' AND status='posted'
      AND posted_at > NOW() - INTERVAL '14 days'
    ORDER BY posted_at DESC
    LIMIT 20
  `.catch(() => []))
  const previousBodies = prior.map((r) => String(r.body || ''))

  const candidates = sqlRows(await sql`
    SELECT preview_token, title, body, status, review_status, created_at FROM os_social_queue
    WHERE platform='linkedin' AND company_id='phishsimai'
      AND status IN ('draft','queued','pending_review')
      AND COALESCE(review_status, 'pending_review') NOT IN ('rejected','held_content_safety','superseded')
      AND preview_token IS NOT NULL
    ORDER BY CASE WHEN review_status = 'approved' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 8
  `.catch(() => []))

  const plan = planLinkedInCrisisActions({
    candidates,
    previousBodies,
    postedToday,
  })
  let cleared = 0
  let publishError = ''
  for (const action of plan) {
    if (action.type === 'clear') {
      const nextStatus = action.reviewStatus === 'held_content_safety' ? 'held_quality' : 'cancelled'
      await sql`
        UPDATE os_social_queue
        SET status=${nextStatus},
            review_status=${action.reviewStatus},
            error=${action.error}
        WHERE preview_token=${action.token}
          AND company_id='phishsimai'
          AND platform='linkedin'
          AND status IN ('draft','queued','pending_review')
      `.catch(() => {})
      cleared++
      continue
    }
    if (action.type !== 'publish') continue
    try {
      const result = await publishSarahLinkedInPost(action.token, { crisisAutoApprove: true })
      return {
        posted: true,
        reason: `published LinkedIn trial CTA via PostForMe (crisis override, ${LINKEDIN_DAILY_POST_CAP}/day)`,
        previewUrl: result.linkedInUrl || previewPublicUrl(action.token),
      }
    } catch (e: any) {
      // Leave the publishable draft in place for the next tick. Do not stack a duplicate.
      publishError = String(e?.message || e).slice(0, 180)
    }
  }
  if (publishError) return missedPublish(publishError)
  if (postedToday >= LINKEDIN_DAILY_POST_CAP) {
    return missedPublish(
      cleared > 0
        ? `linkedin ${LINKEDIN_DAILY_POST_CAP}/day cap already reached; cleared ${cleared} stuck draft(s)`
        : `linkedin ${LINKEDIN_DAILY_POST_CAP}/day cap already reached`,
    )
  }
  if (cleared > 0) {
    return missedPublish(`cleared ${cleared} stuck pending_review draft(s); no publishable non-duplicate remaining`)
  }
  return missedPublish('no quality non-duplicate LinkedIn draft ready')
}

/** @deprecated use advanceLinkedInAcquisition — kept so existing tests/callers compile. */
export async function queueFounderReviewTrialDraft(sqlOverride?: any): Promise<LinkedInAcquisitionResult> {
  return advanceLinkedInAcquisition(sqlOverride)
}

/**
 * Crisis-tick multi-channel: queue a LinkedIn trial draft if none is pending today,
 * then auto-publish when the crisis override + credentials + 1/day + quality rails pass.
 * Founder approval is not required. Kill switch SOCIAL_CRISIS_PUBLISH=0.
 */
export async function advanceLinkedInAcquisition(sqlOverride?: any): Promise<LinkedInAcquisitionResult> {
  const sql = sqlOverride ?? getSql()
  let funnel = await measureLinkedInFunnel(sql).catch(() => ({ ...EMPTY_LINKEDIN_FUNNEL }))

  const published: CrisisLinkedInPublishAttempt = await tryCrisisPublishLinkedIn(sql).catch((e: any) =>
    missedPublish(String(e?.message || e).slice(0, 160)),
  )
  funnel = await measureLinkedInFunnel(sql).catch(() => funnel)
  if (published.posted) {
    funnel = await measureLinkedInFunnel(sql).catch(() => funnel)
    return {
      queued: true,
      escalated: true,
      posted: true,
      reason: published.reason,
      previewUrl: published.previewUrl,
      funnel,
    }
  }

  const postedToday = await countLinkedInPostedToday(sql).catch(() => 0)
  if (postedToday >= LINKEDIN_DAILY_POST_CAP) {
    return {
      queued: false,
      escalated: false,
      posted: false,
      reason: `already posted LinkedIn today (${LINKEDIN_DAILY_POST_CAP}/day cap) — ${published.reason}`,
      funnel,
    }
  }

  if (funnel.pendingReview > 0 || funnel.queued > 0) {
    return {
      queued: false,
      escalated: false,
      posted: false,
      reason: `LinkedIn draft already queued — publish blocked (${published.reason}). Not waiting on founder review.`,
      funnel,
    }
  }

  const recentPosted = sqlRows(await sql`
    SELECT body FROM os_social_queue
    WHERE platform='linkedin' AND company_id='phishsimai' AND status='posted'
      AND posted_at > NOW() - INTERVAL '14 days'
    ORDER BY posted_at DESC
    LIMIT 20
  `.catch(() => []))
  if (isDuplicateSocialBody(TRIAL_LINKEDIN_DRAFT_BODY, recentPosted.map((r) => String(r.body || '')))) {
    return {
      queued: false,
      escalated: false,
      posted: false,
      reason: 'frozen LinkedIn trial CTA duplicates a post from the last 14 days — not queued',
      funnel,
    }
  }

  const day = new Date().toISOString().slice(0, 10)
  const prior = (await sql`
    SELECT value FROM janet_memory
    WHERE company_id='phishsimai' AND type='operating' AND key=${DRAFT_MEMORY_KEY}
    LIMIT 1
  `.catch(() => [])) as Array<{ value?: string }>
  if (String(prior[0]?.value || '') === day && funnel.pendingReview === 0 && funnel.queued === 0) {
    // Memory says queued today but nothing is reviewable — retry the insert.
    await sql`
      INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
      VALUES ('phishsimai', 'operating', ${ESCALATE_MEMORY_KEY}, ${new Date().toISOString()}, 1, 'trial_acquisition')
      ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `.catch(() => {})
  }

  const saved = await savePreviewForReview({
    platform: 'linkedin',
    title: '30-day no-card trial for MSPs',
    body: TRIAL_LINKEDIN_DRAFT_BODY,
    hashtags: ['MSP', 'PhishingSimulation', 'Compliance'],
    topic: 'frozen 60¢ / $299/500 trial CTA',
    imageUrl: REFERENCE_PUBLIC_URL,
  })
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES ('phishsimai', 'operating', ${DRAFT_MEMORY_KEY}, ${day}, 1, 'trial_acquisition')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `.catch(() => {})
  await rememberFact({
    company_id: 'phishsimai',
    type: 'operating',
    key: 'linkedin_trial_funnel',
    value: JSON.stringify({ queued: true, previewUrl: saved.previewUrl, ts: new Date().toISOString() }).slice(0, 600),
    confidence: 0.9,
    source: 'trial_acquisition',
  }).catch(() => {})

  const publishedAfter: CrisisLinkedInPublishAttempt = await tryCrisisPublishLinkedIn(sql).catch((e: any) =>
    missedPublish(String(e?.message || e).slice(0, 160)),
  )
  const nextFunnel = await measureLinkedInFunnel(sql).catch(() => funnel)

  if (publishedAfter.posted) {
    await sendTelegram(
      `✅ Sarah LinkedIn AUTO-PUBLISHED (crisis override, 1/day).\nKill: SOCIAL_CRISIS_PUBLISH=0\n${publishedAfter.previewUrl || saved.previewUrl}`,
    ).catch(() => {})
    return {
      queued: true,
      escalated: true,
      posted: true,
      reason: publishedAfter.reason,
      previewUrl: publishedAfter.previewUrl || saved.previewUrl,
      funnel: nextFunnel,
    }
  }

  await sendTelegram(linkedInPreviewTelegramHtml({
    title: '30-day no-card trial for MSPs',
    previewUrl: saved.previewUrl,
    kind: 'new',
  })).catch(() => {})

  return {
    queued: true,
    escalated: true,
    posted: false,
    reason: `queued LinkedIn trial CTA (not published: ${publishedAfter.reason})`,
    previewUrl: saved.previewUrl,
    funnel: nextFunnel,
  }
}

