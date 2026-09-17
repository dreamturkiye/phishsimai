/**
 * Acquisition besides cold email. PS-SOCIAL-LOCKOUT-01 stays ON: we queue founder-review
 * drafts with a real preview URL, we do not publish. MSP hub harvest and magic-link checkout already exist.
 *
 * Do not invent cold copy. Trial URL and price claims are the frozen sequence strings.
 *
 * "already queued a founder-review trial draft today" is NOT a permanent dead end:
 * pending drafts escalate on a 2h cadence until the founder reviews, and the funnel
 * (queued → pending_review → approved → posted → reply → trial) is returned every tick.
 */
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { rememberFact } from './memory'
import { TRIAL_CTA_URL } from './sequences'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './social/publicPostingLockout'
import { previewPublicUrl, savePreviewForReview, linkedInPreviewTelegramHtml } from './social/socialPreviewPage'

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
    how: 'queueFounderOneToOneReviews — exhausted 90/91/92 replied/engaged leads get a founder-review 1:1 brief (Telegram + HQ). NOT email. NOT touch 93.',
  },
  {
    id: 'linkedin_founder_draft',
    status: 'live' as const,
    how: 'Queue LinkedIn trial-CTA drafts with preview URL; escalate when pending >2h. Publish remains lockout-blocked until founder approves.',
  },
  {
    id: 'public_social_publish',
    status: 'locked' as const,
    how: 'PS-SOCIAL-LOCKOUT-01. Drafting/queueing allowed; outbound Reddit/LinkedIn publish throws.',
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

/** @deprecated use advanceLinkedInAcquisition — kept so existing tests/callers compile. */
export async function queueFounderReviewTrialDraft(sqlOverride?: any): Promise<LinkedInAcquisitionResult> {
  return advanceLinkedInAcquisition(sqlOverride)
}

/**
 * Crisis-tick multi-channel: queue a previewable LinkedIn trial draft if none is pending,
 * escalate when a draft sits unreviewed >2h, always return the funnel. Public publish stays locked.
 * "already queued today" with pendingReview=0 is a failed queue — retry, do not park.
 */
export async function advanceLinkedInAcquisition(sqlOverride?: any): Promise<LinkedInAcquisitionResult> {
  if (PUBLIC_SOCIAL_POSTING_ENABLED) {
    return {
      queued: false,
      escalated: false,
      reason: 'lockout unexpectedly off — refusing to auto-queue while publish is live',
      funnel: { ...EMPTY_LINKEDIN_FUNNEL },
    }
  }
  const sql = sqlOverride ?? getSql()
  const funnel = await measureLinkedInFunnel(sql).catch(() => ({ ...EMPTY_LINKEDIN_FUNNEL }))

  if (funnel.pendingReview > 0) {
    const hours = funnel.oldestPendingHours ?? 0
    if (hours >= LINKEDIN_PENDING_ESCALATE_HOURS) {
      const last = (await sql`
        SELECT value FROM janet_memory
        WHERE company_id='phishsimai' AND type='operating' AND key=${ESCALATE_MEMORY_KEY}
        LIMIT 1
      `.catch(() => [])) as Array<{ value?: string }>
      const lastAt = Date.parse(String(last[0]?.value || ''))
      const due = !Number.isFinite(lastAt) || Date.now() - lastAt >= LINKEDIN_PENDING_ESCALATE_HOURS * 3_600_000
      if (due) {
        const pending = (await sql`
          SELECT preview_token, title FROM os_social_queue
          WHERE platform='linkedin' AND company_id='phishsimai'
            AND (review_status='pending_review' OR status IN ('draft','queued'))
          ORDER BY created_at ASC LIMIT 1
        `.catch(() => [])) as Array<{ preview_token?: string; title?: string }>
        const token = String(pending[0]?.preview_token || '')
        const url = token ? previewPublicUrl(token) : 'https://phishsimai.com/preview/social'
        await sendTelegram(linkedInPreviewTelegramHtml({
          title: String(pending[0]?.title || '30-day no-card trial for MSPs'),
          previewUrl: url,
          hours,
          kind: 'pending',
        })).catch(() => {})
        await sql`
          INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
          VALUES ('phishsimai', 'operating', ${ESCALATE_MEMORY_KEY}, ${new Date().toISOString()}, 1, 'trial_acquisition')
          ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `.catch(() => {})
        return {
          queued: false,
          escalated: true,
          reason: `pending founder-review LinkedIn draft ${hours}h — escalated (not a dead end)`,
          previewUrl: token ? url : undefined,
          funnel,
        }
      }
      return {
        queued: false,
        escalated: false,
        reason: `pending founder-review LinkedIn draft ${hours}h — next escalate in <${LINKEDIN_PENDING_ESCALATE_HOURS}h`,
        funnel,
      }
    }
    return {
      queued: false,
      escalated: false,
      reason: `LinkedIn trial draft pending review (${hours}h old) — waiting for founder, will escalate at ${LINKEDIN_PENDING_ESCALATE_HOURS}h`,
      funnel,
    }
  }

  const day = new Date().toISOString().slice(0, 10)
  const prior = (await sql`
    SELECT value FROM janet_memory
    WHERE company_id='phishsimai' AND type='operating' AND key=${DRAFT_MEMORY_KEY}
    LIMIT 1
  `.catch(() => [])) as Array<{ value?: string }>
  if (String(prior[0]?.value || '') === day) {
    // Memory says we queued today but pendingReview is 0 — the insert never became
    // reviewable. Live dead end was returning here. Retry on the escalate cadence only.
    const last = (await sql`
      SELECT value FROM janet_memory
      WHERE company_id='phishsimai' AND type='operating' AND key=${ESCALATE_MEMORY_KEY}
      LIMIT 1
    `.catch(() => [])) as Array<{ value?: string }>
    const lastAt = Date.parse(String(last[0]?.value || ''))
    const due = !Number.isFinite(lastAt) || Date.now() - lastAt >= LINKEDIN_PENDING_ESCALATE_HOURS * 3_600_000
    if (!due) {
      return {
        queued: false,
        escalated: false,
        reason: `queued-today memory but pending_review=0 — retrying in <${LINKEDIN_PENDING_ESCALATE_HOURS}h (not a dead end)`,
        funnel,
      }
    }
    await sendTelegram(linkedInPreviewTelegramHtml({
      title: '30-day no-card trial for MSPs',
      previewUrl: 'https://phishsimai.com/preview/social',
      kind: 'retry',
    })).catch(() => {})
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
  const nextFunnel = await measureLinkedInFunnel(sql).catch(() => funnel)
  return {
    queued: true,
    escalated: true,
    reason: `queued LinkedIn trial CTA for founder review (preview ${saved.previewUrl}) — not published`,
    previewUrl: saved.previewUrl,
    funnel: nextFunnel,
  }
}
