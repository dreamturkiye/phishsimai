import { llmComplete } from '../llmChat'
import { ensureSocialTables, queueSocialItem } from './sarahSocial'
import { getSql } from '../conn'
import { savePreviewForReview, previewPublicUrl, getPreviewByToken } from './socialPreviewPage'
import { createSarahLinkedInHeroImage, type SarahMarketingImageSpec } from './sarahLinkedInImage'
import { renderLinkedInFeedPost } from './linkedinFeedPreview'
import { sendTelegram } from '../telegram'
import { rememberFact } from '../memory'
import { parseSarahDraftResponse, sanitizeStoredPostBody } from './parseSarahDraft'

export type LinkedInPreview = {
  id?: string
  previewToken?: string
  previewUrl?: string
  status: 'draft' | 'queued' | 'posted' | 'blocked' | 'pending_review'
  reviewStatus?: string
  scheduledAt?: string | null
  author: { name: string; title: string; avatarInitials: string }
  hook: string
  body: string
  hashtags: string[]
  blocker?: string | null
  previewHtml: string
  imageUrl?: string | null
}

const SARAH = {
  name: 'Sarah Mitchell',
  title: 'Head of Compliance Partnerships @ PhishSimAI',
  initials: 'SM',
}

const FIRST_POST_REFERENCE = `Reference: Sarah's first LinkedIn post paired a split-screen marketing graphic (phishing email vs compliance dashboard, headline "Phishing Simulation. One-Click Compliance.") with long-form MSP copy. Every new post needs the same quality: designed marketing image WITH readable headline text on the image, not a generic stock photo.`

export function renderLinkedInPreviewCard(preview: Omit<LinkedInPreview, 'previewHtml'>): string {
  return renderLinkedInFeedPost(preview)
}

export async function generateSarahLinkedInDraft(topic?: string): Promise<LinkedInPreview> {
  const postForMeConfigured = !!(process.env.POSTFORME_API_KEY || process.env.POST_FOR_ME_API_KEY)
  const blocker = postForMeConfigured
    ? null
    : 'POSTFORME_API_KEY not set — autopost blocked; preview is draft-only'

  const topicLine = topic?.trim() || 'MSP compliance + phishing simulation ROI (67% breaches start with phishing)'

  const { text } = await llmComplete({
    messages: [
      {
        role: 'system',
        content: `Write a LinkedIn post as Sarah Mitchell, Head of Compliance Partnerships at PhishSimAI.
Voice: professional MSP/compliance peer, not salesy. 3-5 short paragraphs. Hashtags go ONLY in ---HASHTAGS--- block, never in body.
No "I'm excited to announce". Include one concrete stat. Soft CTA: free phishing simulation for their clients.
${FIRST_POST_REFERENCE}
MANDATORY marketing image spec: split-screen laptop visual, PhishSimAI branding, bold headline ON the image.`,
      },
      {
        role: 'user',
        content: `Topic: ${topicLine}

Reply using EXACTLY this format (plain text, no JSON, no code fences):

---HOOK---
One compelling opening line

---BODY---
Full LinkedIn post (multiple paragraphs, NO hashtags here)

---HASHTAGS---
MSP, CyberSecurity, Compliance

---IMAGE---
headline: Short bold headline for the graphic (max 8 words)
subheadline: One line for MSP audience
leftPanel: What to show on phishing side of split screen
rightPanel: What to show on compliance dashboard side
features: Feature1, Feature2, Feature3, Feature4`,
      },
    ],
    max_tokens: 1200,
    temperature: 0.75,
  })

  const parsed = parseSarahDraftResponse(text, topicLine)
  const hook = parsed.hook
  const body = parsed.body
  const hashtags = parsed.hashtags
  const marketingImage = parsed.marketingImage

  const heroImage = await createSarahLinkedInHeroImage({
    marketingImage,
    hook,
    topic: topicLine,
  })

  const preview: Omit<LinkedInPreview, 'previewHtml'> = {
    status: blocker ? 'blocked' : 'pending_review',
    author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
    hook,
    body,
    hashtags,
    blocker,
    imageUrl: heroImage.url,
  }

  const saved = await savePreviewForReview({
    title: hook,
    body,
    hashtags,
    topic: topicLine,
    imageUrl: heroImage.url,
  })

  const fullPreview = { ...preview, id: saved.id, previewToken: saved.previewToken, previewUrl: saved.previewUrl }

  return {
    ...fullPreview,
    status: blocker ? 'blocked' : 'pending_review',
    reviewStatus: 'pending_review',
    previewHtml: renderLinkedInFeedPost(fullPreview),
  }
}

export async function getNextSarahLinkedInPreview(): Promise<LinkedInPreview> {
  await ensureSocialTables()
  const sql = getSql()

  const [queued] = await sql`
    SELECT id, title, body, status, scheduled_at, preview_token, review_status, image_url, hashtags
    FROM os_social_queue
    WHERE platform='linkedin' AND status IN ('queued', 'draft')
    ORDER BY scheduled_at ASC NULLS LAST
    LIMIT 1
  `.catch(() => [] as any[])

  if (queued) {
    const token = (queued as any).preview_token
    let hashtags = ['MSP', 'Compliance', 'Phishing']
    try {
      const parsed = JSON.parse(String((queued as any).hashtags || '[]'))
      if (Array.isArray(parsed) && parsed.length) hashtags = parsed
    } catch { /* default */ }

    const preview: Omit<LinkedInPreview, 'previewHtml'> = {
      id: queued.id,
      previewToken: token,
      previewUrl: token ? previewPublicUrl(token) : undefined,
      status: queued.status === 'queued' ? 'queued' : 'draft',
      reviewStatus: (queued as any).review_status,
      scheduledAt: queued.scheduled_at,
      author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
      hook: String(queued.title || '').slice(0, 120),
      body: sanitizeStoredPostBody(String(queued.body || ''), String(queued.title || '')),
      hashtags,
      blocker: null,
      imageUrl: (queued as any).image_url,
    }
    return { ...preview, previewHtml: renderLinkedInFeedPost(preview) }
  }

  return generateSarahLinkedInDraft()
}

/** Final production-quality image + new preview — for approval-ready posts. */
export async function produceSarahLinkedInForApproval(sourceToken: string): Promise<LinkedInPreview> {
  await ensureSocialTables()
  const item = await getPreviewByToken(sourceToken)
  if (!item) throw new Error('Preview not found')

  const hook = String(item.title || '').trim()
  const body = sanitizeStoredPostBody(String(item.body || ''), hook)
  let hashtags = ['MSP', 'CyberSecurity', 'Compliance']
  try {
    const parsed = JSON.parse(String(item.hashtags || '[]'))
    if (Array.isArray(parsed) && parsed.length) hashtags = parsed
  } catch { /* default */ }

  const feedback = [
    String(item.founder_comment || ''),
    'Match first LinkedIn post quality exactly — professional 3D MacBook reference template. No stock photos. No wireframe mockups.',
  ].filter(Boolean).join('\n')

  const marketingImage: Partial<SarahMarketingImageSpec> = {
    headline: 'SOC 2 Evidence. One-Click Export.',
    subheadline: 'Automate your audit trail without spreadsheets.',
    features: ['Automated Audit Trails', 'One-Click Export', 'Prove Compliance', 'MSP Ready'],
  }

  const heroImage = await createSarahLinkedInHeroImage({
    marketingImage,
    hook,
    topic: 'SOC 2 evidence for MSPs',
    founderFeedback: feedback,
  })

  const sql = getSql()
  await sql`
    UPDATE os_social_queue SET status='cancelled', review_status='superseded'
    WHERE preview_token=${sourceToken} AND review_status != 'approved'
  `.catch(() => {})

  const saved = await savePreviewForReview({
    title: hook,
    body,
    hashtags,
    topic: 'SOC 2 evidence for MSPs — final image',
    imageUrl: heroImage.url,
  })

  const fullPreview: LinkedInPreview = {
    status: 'pending_review',
    author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
    hook,
    body,
    hashtags,
    blocker: null,
    imageUrl: heroImage.url,
    id: saved.id,
    previewToken: saved.previewToken,
    previewUrl: saved.previewUrl,
    reviewStatus: 'pending_review',
    previewHtml: renderLinkedInFeedPost({
      status: 'draft',
      author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
      hook,
      body,
      hashtags,
      imageUrl: heroImage.url,
    }),
  }

  await sendTelegram(
    `🎨 FINAL Sarah LinkedIn ready for approval (${heroImage.source})\n${hook.slice(0, 80)}\n\n${saved.previewUrl}`
  ).catch(() => {})

  return fullPreview
}

/** Revise a draft from founder feedback — new preview link + Telegram to Kaan. */
export async function reviseSarahLinkedInDraft(sourceToken: string): Promise<LinkedInPreview> {
  await ensureSocialTables()
  const sql = getSql()
  const item = await getPreviewByToken(sourceToken)
  if (!item) throw new Error('Preview not found')
  const feedback = String(item.founder_comment || '').trim()
  if (!feedback) throw new Error('No founder feedback on this preview')

  const hook = String(item.title || '').trim()
  const body = sanitizeStoredPostBody(String(item.body || ''), hook)
  let hashtags = ['MSP', 'CyberSecurity', 'Compliance']
  try {
    const parsed = JSON.parse(String(item.hashtags || '[]'))
    if (Array.isArray(parsed) && parsed.length) hashtags = parsed
  } catch { /* default */ }

  let revisedHook = hook
  let revisedBody = body
  const copyFeedback = /tone|copy|cta|stat|soften|add |rewrite|paragraph/i.test(feedback)

  if (copyFeedback) {
    const { text } = await llmComplete({
      messages: [
        {
          role: 'system',
          content: `Revise Sarah Mitchell's LinkedIn post per founder feedback. Keep MSP/compliance voice. Use delimiter format only.`,
        },
        {
          role: 'user',
          content: `---HOOK---\n${hook}\n\n---BODY---\n${body}\n\n---HASHTAGS---\n${hashtags.join(', ')}\n\nFOUNDER FEEDBACK:\n${feedback}\n\nReturn revised post in same delimiter format. If feedback is image-only, return copy unchanged.`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.5,
    })
    const parsed = parseSarahDraftResponse(text, hook)
    revisedHook = parsed.hook || hook
    revisedBody = parsed.body || body
    if (parsed.hashtags.length) hashtags = parsed.hashtags
  }

  const marketingImage: Partial<SarahMarketingImageSpec> = {
    headline: 'SOC 2 Evidence. One-Click Export.',
    subheadline: 'Automate your audit trail without spreadsheets.',
    features: ['Automated Audit Trails', 'One-Click Export', 'Prove Compliance', 'MSP Ready'],
  }

  const heroImage = await createSarahLinkedInHeroImage({
    marketingImage,
    hook: revisedHook,
    topic: 'SOC 2 evidence for MSPs',
    founderFeedback: feedback,
  })

  await sql`
    UPDATE os_social_queue
    SET status='cancelled', review_status='superseded'
    WHERE preview_token=${sourceToken}
  `.catch(() => {})

  const saved = await savePreviewForReview({
    title: revisedHook,
    body: revisedBody,
    hashtags,
    topic: `Revision of ${sourceToken.slice(0, 8)}`,
    imageUrl: heroImage.url,
  })

  const fullPreview: LinkedInPreview = {
    status: 'pending_review',
    author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
    hook: revisedHook,
    body: revisedBody,
    hashtags,
    blocker: null,
    imageUrl: heroImage.url,
    id: saved.id,
    previewToken: saved.previewToken,
    previewUrl: saved.previewUrl,
    reviewStatus: 'pending_review',
    previewHtml: renderLinkedInFeedPost({
      status: 'draft',
      author: { name: SARAH.name, title: SARAH.title, avatarInitials: SARAH.initials },
      hook: revisedHook,
      body: revisedBody,
      hashtags,
      imageUrl: heroImage.url,
    }),
  }

  await rememberFact({
    company_id: 'phishsimai',
    type: 'campaign',
    key: `social_preview:${saved.previewToken}`,
    value: `Sarah LinkedIn REVISION pending review (from ${sourceToken}) — ${saved.previewUrl}. Feedback: ${feedback.slice(0, 200)}`,
    confidence: 1,
    source: 'janet',
  }).catch(() => {})

  await sendTelegram(
    `✏️ REVISED Sarah LinkedIn ready for review\n${revisedHook.slice(0, 80)}\n\nFounder feedback applied.\nOpen in Safari:\n${saved.previewUrl}`
  ).catch(() => {})

  return fullPreview
}

export async function queueSarahLinkedInDraft(topic?: string): Promise<LinkedInPreview> {
  const draft = await generateSarahLinkedInDraft(topic)
  if (draft.blocker) return draft

  const row = await queueSocialItem({
    platform: 'linkedin',
    action: 'post',
    title: draft.hook.slice(0, 280),
    body: draft.body,
    scheduled_at: new Date(Date.now() + 3600000),
  })

  return {
    ...draft,
    id: (row as any)?.id,
    status: 'queued',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  }
}
