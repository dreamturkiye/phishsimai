/**
 * Shareable HTML preview pages for Sarah social posts — open in Safari, approve/reject with comments → Janet.
 */
import { randomUUID } from 'crypto'
import { getSql } from '../conn'
import { sendTelegram } from '../telegram'
import { rememberFact } from '../memory'
import { ensureSocialTables } from './sarahSocial'
import { sanitizeStoredPostBody } from './parseSarahDraft'
import { renderLinkedInFeedPost } from './linkedinFeedPreview'
import type { LinkedInPreview } from './sarahLinkedIn'
import { issueTask } from '../../lib/kaan_os_v4'

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected'

export type SocialPreviewRecord = {
  id: string
  preview_token: string
  platform: string
  title: string | null
  body: string
  image_url: string | null
  hashtags?: string | null
  review_status: string
  founder_comment: string | null
  status: string
  scheduled_at: string | null
  created_at: string
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://phishsimai.com'

export async function ensureSocialPreviewColumns() {
  await ensureSocialTables()
  const sql = getSql()
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS preview_token TEXT UNIQUE`.catch(() => {})
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review'`.catch(() => {})
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS founder_comment TEXT`.catch(() => {})
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS image_url TEXT`.catch(() => {})
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`.catch(() => {})
  await sql`ALTER TABLE os_social_queue ADD COLUMN IF NOT EXISTS hashtags TEXT`.catch(() => {})
}

export function previewPublicUrl(token: string): string {
  return `${BASE_URL.replace(/\/$/, '')}/preview/social/${token}`
}

export async function getPreviewByToken(token: string): Promise<SocialPreviewRecord | null> {
  await ensureSocialPreviewColumns()
  const sql = getSql()
  const [row] = await sql`
    SELECT id, preview_token, platform, title, body, image_url, hashtags, review_status, founder_comment, status, scheduled_at, created_at
    FROM os_social_queue WHERE preview_token=${token} LIMIT 1
  `.catch(() => [] as SocialPreviewRecord[])
  return (row as SocialPreviewRecord) || null
}

export async function savePreviewForReview(input: {
  platform?: string
  title: string
  body: string
  hashtags?: string[]
  imageUrl?: string | null
  topic?: string
}): Promise<{ id: string; previewToken: string; previewUrl: string; preview: LinkedInPreview }> {
  await ensureSocialPreviewColumns()
  const sql = getSql()
  const token = randomUUID().replace(/-/g, '').slice(0, 24)

  const previewBase: Omit<LinkedInPreview, 'previewHtml'> = {
    id: undefined,
    status: 'draft',
    author: { name: 'Sarah Mitchell', title: 'Head of Compliance Partnerships @ PhishSimAI', avatarInitials: 'SM' },
    hook: input.title,
    body: input.body,
    hashtags: input.hashtags || ['MSP', 'Compliance', 'Phishing'],
    blocker: null,
    imageUrl: input.imageUrl || null,
  }

  const [row] = await sql`
    INSERT INTO os_social_queue (
      platform, action, title, body, status, review_status, preview_token, image_url, hashtags, scheduled_at, created_by
    ) VALUES (
      ${input.platform || 'linkedin'}, 'post', ${input.title.slice(0, 280)}, ${input.body},
      'draft', 'pending_review', ${token}, ${input.imageUrl || null},
      ${JSON.stringify(input.hashtags || ['MSP', 'Compliance', 'Phishing'])},
      ${new Date(Date.now() + 86400000).toISOString()}, 'janet'
    )
    RETURNING id, preview_token
  `

  const previewUrl = previewPublicUrl(token)
  const preview: LinkedInPreview = {
    ...previewBase,
    id: row.id,
    status: 'draft',
    previewHtml: renderLinkedInFeedPost({ ...previewBase, imageUrl: input.imageUrl || null }),
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  }

  await rememberFact({
    company_id: 'phishsimai',
    type: 'campaign',
    key: `social_preview:${token}`,
    value: `Sarah LinkedIn preview pending review — ${previewUrl}${input.topic ? ` topic: ${input.topic}` : ''}`,
    confidence: 1,
    source: 'janet',
  }).catch(() => {})

  await sendTelegram(
    `📋 SARAH LINKEDIN PREVIEW ready for Kaan\n${input.title.slice(0, 80)}\n\nOpen in Safari:\n${previewUrl}`
  ).catch(() => {})

  return { id: row.id, previewToken: token, previewUrl, preview: { ...preview, previewHtml: renderLinkedInFeedPost({ ...previewBase, imageUrl: input.imageUrl || null }) } }
}

export async function submitSocialReview(
  token: string,
  decision: ReviewDecision,
  comment: string
): Promise<{ ok: boolean; message: string }> {
  await ensureSocialPreviewColumns()
  const sql = getSql()
  const item = await getPreviewByToken(token)
  if (!item) return { ok: false, message: 'Preview not found' }

  const reviewStatus = decision
  const queueStatus =
    decision === 'approved' ? 'queued' : decision === 'rejected' ? 'cancelled' : 'draft'

  await sql`
    UPDATE os_social_queue
    SET review_status=${reviewStatus},
        founder_comment=${comment || null},
        reviewed_at=NOW(),
        status=${queueStatus},
        scheduled_at=${decision === 'approved' ? new Date(Date.now() + 3600000).toISOString() : item.scheduled_at}
    WHERE preview_token=${token}
  `

  const previewUrl = previewPublicUrl(token)
  const summary = [
    `Founder ${decision} Sarah LinkedIn preview`,
    comment ? `Comment: ${comment.slice(0, 400)}` : '',
    `Hook: ${item.title || ''}`,
    previewUrl,
  ].filter(Boolean).join('\n')

  await rememberFact({
    company_id: 'phishsimai',
    type: 'operating',
    key: `social_review:${token}:${Date.now()}`,
    value: summary,
    confidence: 1,
    source: 'founder',
  }).catch(() => {})

  await rememberFact({
    company_id: 'phishsimai',
    type: 'campaign',
    key: `social_preview:${token}`,
    value: `${decision}${comment ? ` — "${comment.slice(0, 200)}"` : ''} — ${previewUrl}`,
    confidence: 1,
    source: 'founder',
  }).catch(() => {})

  const emoji = decision === 'approved' ? '✅' : decision === 'rejected' ? '❌' : '✏️'
  await sendTelegram(`${emoji} FOUNDER → JANET (Sarah LinkedIn)\n${decision.toUpperCase()}\n${comment || '(no comment)'}\n${previewUrl}`).catch(() => {})

  if (decision === 'changes_requested' || decision === 'rejected') {
    try {
      await issueTask('aria', {
        agent_id: 'aria',
        title: `Revise Sarah LinkedIn post (${decision})`,
        description: `Kaan ${decision} the LinkedIn draft.\nComment: ${comment || 'See preview link'}\nOriginal hook: ${item.title}\n\nRevise and create a new preview.`,
        priority: 'high',
        due_in_hours: 4,
      }, 'phishsimai')
    } catch { /* non-fatal */ }
  }

  if (decision === 'changes_requested' && comment) {
    void (async () => {
      try {
        const { reviseSarahLinkedInDraft } = await import('./sarahLinkedIn')
        await reviseSarahLinkedInDraft(token)
      } catch (err) {
        console.error('[SocialReview] Auto-revision failed:', err)
        await sendTelegram(`⚠️ Sarah LinkedIn auto-revision failed: ${String(err).slice(0, 200)}`).catch(() => {})
      }
    })()
  }

  if (decision === 'approved') {
    await rememberFact({
      company_id: 'phishsimai',
      type: 'operating',
      key: 'janet_social_approved',
      value: `Sarah LinkedIn approved for publish. Token ${token}. ${comment || ''}`,
      confidence: 1,
      source: 'founder',
    }).catch(() => {})
  }

  return {
    ok: true,
    message:
      decision === 'approved'
        ? 'Approved — Janet will queue this for Sarah\'s LinkedIn when PostForMe is live.'
        : decision === 'rejected'
          ? 'Rejected — Janet and Aria were notified.'
          : 'Feedback received — Janet is generating a revised preview now. You\'ll get a new Safari link via Telegram shortly.',
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderSocialPreviewPage(item: SocialPreviewRecord, token: string, flash?: string, autopostBlocked?: boolean): string {
  let hashtags = ['MSP', 'Compliance', 'Phishing']
  try {
    const parsed = JSON.parse(String(item.hashtags || '[]'))
    if (Array.isArray(parsed) && parsed.length) hashtags = parsed
  } catch { /* default */ }

  const feed = renderLinkedInFeedPost({
    status: item.status as LinkedInPreview['status'],
    author: { name: 'Sarah Mitchell', title: 'Head of Compliance Partnerships @ PhishSimAI', avatarInitials: 'SM' },
    hook: item.title || '',
    body: sanitizeStoredPostBody(item.body, item.title),
    hashtags,
    scheduledAt: item.scheduled_at,
    imageUrl: item.image_url,
  })

  const statusBadge = item.review_status === 'approved'
    ? '<span style="background:#dcfce7;color:#166534;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600">Approved</span>'
    : item.review_status === 'changes_requested'
      ? '<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600">Changes requested</span>'
      : item.review_status === 'rejected'
        ? '<span style="background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600">Rejected</span>'
        : '<span style="background:#e0e7ff;color:#3730a3;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600">Pending your review</span>'

  const reviewed = item.review_status !== 'pending_review'
  const flashHtml = flash ? `<div style="max-width:552px;margin:0 auto 16px;padding:12px 16px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;color:#065f46;font-size:14px">${escapeHtml(flash)}</div>` : ''

  const formHtml = reviewed
    ? `<div style="max-width:552px;margin:24px auto;padding:16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;color:#374151;font-size:14px">
        <strong>Your decision:</strong> ${escapeHtml(item.review_status.replace(/_/g, ' '))}
        ${item.founder_comment ? `<p style="margin:8px 0 0;color:#6b7280">"${escapeHtml(item.founder_comment)}"</p>` : ''}
        <p style="margin:12px 0 0;font-size:12px;color:#9ca3af">Janet received this feedback. Generate a new draft from HQ if you want another version.</p>
      </div>`
    : `<form method="POST" action="/preview/social/${token}/review" style="max-width:552px;margin:24px auto;padding:20px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:8px">Comments for Janet (optional)</label>
        <textarea name="comment" rows="4" placeholder="e.g. Soften the CTA, add HIPAA stat, wrong tone…" style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;font-family:system-ui;resize:vertical;box-sizing:border-box"></textarea>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px">
          <button type="submit" name="decision" value="approved" style="flex:1;min-width:120px;padding:14px 20px;background:#0a66c2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">✓ Approve</button>
          <button type="submit" name="decision" value="changes_requested" style="flex:1;min-width:120px;padding:14px 20px;background:#f59e0b;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">✏ Request changes</button>
          <button type="submit" name="decision" value="rejected" style="padding:14px 20px;background:#fff;color:#dc2626;border:1px solid #fecaca;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Reject</button>
        </div>
        <p style="margin:14px 0 0;font-size:12px;color:#9ca3af;text-align:center">Your decision goes straight to Janet · PhishSim AI HQ</p>
      </form>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>Sarah Mitchell · LinkedIn · PhishSimAI</title>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f3f2ef;min-height:100vh;padding:0;padding-bottom:max(16px,env(safe-area-inset-bottom))}
    a{color:#0a66c2}
    .review-bar{max-width:552px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}
    .review-bar h1{margin:0;font-size:15px;font-weight:600;color:rgba(0,0,0,.9)}
    .review-bar p{margin:2px 0 0;font-size:12px;color:rgba(0,0,0,.6)}
    .feed-wrap{max-width:552px;margin:0 auto;padding:12px 0}
    .review-panel{max-width:552px;margin:0 auto;padding:0 12px}
  </style>
</head>
<body>
  <div class="review-bar">
    <div>
      <h1>LinkedIn preview</h1>
      <p>Below is exactly how Sarah's post appears in the feed — copy, image, and layout.</p>
    </div>
    ${statusBadge}
  </div>
  ${flashHtml ? `<div class="review-panel">${flashHtml}</div>` : ''}
  <div class="feed-wrap">${feed}</div>
  ${autopostBlocked ? `<div class="review-panel" style="margin-top:12px;padding:12px;background:#fef3c7;border-radius:8px;font-size:13px;color:#92400e">Autopost not live yet (PostForMe) — approve now and Janet will publish when wired.</div>` : ''}
  <div class="review-panel">${formHtml}</div>
  <footer style="max-width:552px;margin:24px auto 0;padding:0 12px;text-align:center;font-size:11px;color:#9ca3af">
    Kaan AI OS · <a href="https://phishsimai.com/hq">Open HQ</a>
  </footer>
</body>
</html>`
}
