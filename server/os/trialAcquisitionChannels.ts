/**
 * Acquisition besides cold email. PS-SOCIAL-LOCKOUT-01 stays ON: we queue founder-review
 * drafts, we do not publish. MSP hub harvest and magic-link checkout already exist.
 *
 * Do not invent cold copy. Trial URL and price claims are the frozen sequence strings.
 */
import { getSql } from './conn'
import { queueSocialItem } from './social/sarahSocial'
import { TRIAL_CTA_URL } from './sequences'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './social/publicPostingLockout'

export const TRIAL_ACQUISITION_CHANNELS = [
  {
    id: 'warm_reply_cta',
    status: 'live' as const,
    how: 'sendWarmTrialCtas — Dex-gated 30-day CTA to replied/engaged leads (not cold).',
  },
  {
    id: 'trial_org_nudges',
    status: 'live' as const,
    how: 'runTrialNudges D14/D25/D30 to TRUE trial orgs only (canary/test excluded).',
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
    id: 'linkedin_founder_draft',
    status: 'live' as const,
    how: 'Queue one LinkedIn trial-CTA draft/day for founder review. Publish remains lockout-blocked.',
  },
  {
    id: 'public_social_publish',
    status: 'locked' as const,
    how: 'PS-SOCIAL-LOCKOUT-01. Drafting/queueing allowed; outbound Reddit/LinkedIn publish throws.',
  },
] as const

const DRAFT_MEMORY_KEY = 'trial_acq_linkedin_draft_day'

export const TRIAL_LINKEDIN_DRAFT_BODY =
  `MSPs: 30-day no-card trial. One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Live in 10 minutes.\n\nStart: ${TRIAL_CTA_URL}`

export async function queueFounderReviewTrialDraft(sqlOverride?: any): Promise<{ queued: boolean; reason: string }> {
  if (PUBLIC_SOCIAL_POSTING_ENABLED) {
    return { queued: false, reason: 'lockout unexpectedly off — refusing to auto-queue while publish is live' }
  }
  const sql = sqlOverride ?? getSql()
  const day = new Date().toISOString().slice(0, 10)
  const prior = (await sql`
    SELECT value FROM janet_memory
    WHERE company_id='phishsimai' AND type='operating' AND key=${DRAFT_MEMORY_KEY}
    LIMIT 1
  `.catch(() => [])) as Array<{ value?: string }>
  if (String(prior[0]?.value || '') === day) {
    return { queued: false, reason: 'already queued a founder-review trial draft today' }
  }
  await queueSocialItem({
    platform: 'linkedin',
    action: 'post',
    title: '30-day no-card trial for MSPs',
    body: TRIAL_LINKEDIN_DRAFT_BODY,
  })
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES ('phishsimai', 'operating', ${DRAFT_MEMORY_KEY}, ${day}, 1, 'trial_acquisition')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `.catch(() => {})
  return { queued: true, reason: 'queued LinkedIn trial CTA for founder review (not published)' }
}
