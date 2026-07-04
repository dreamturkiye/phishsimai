import { storagePut } from '../../storage'
import { generateReplicateImageUrl } from './replicateImage'
import { renderSarahMarketingSvgPng } from './sarahLinkedInRaster'
import { renderSarahReferenceStylePng, REFERENCE_PUBLIC_URL } from './sarahLinkedInReferenceStyle'
import { layoutFromFounderFeedback, DEFAULT_CARD_LAYOUT } from './marketingCardLayout'

export type SarahMarketingImageSpec = {
  headline: string
  subheadline: string
  leftPanel: string
  rightPanel: string
  features: string[]
}

export type SarahPostImage = {
  url: string
  source: 'replicate' | 'gemini' | 'reference' | 'svg' | 'generated'
}

const BRAND_BASE = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://phishsimai.com'

/** Photorealistic marketing prompt — must match Sarah's first LinkedIn post. */
export function buildMarketingImagePrompt(spec: SarahMarketingImageSpec, topic: string): string {
  return [
    'Professional LinkedIn marketing graphic 1200x800 pixels, identical quality and layout to this reference:',
    REFERENCE_PUBLIC_URL,
    'Photorealistic 3D MacBook laptop centered, red fishing hook left of screen, split laptop display:',
    'LEFT: phishing email "Urgent Reset Password" with red EXTERNAL EMAIL banner.',
    'RIGHT: green compliance dashboard "Simulation Complete" 98%, SOC 2 HIPAA PCI DSS compliant badges.',
    'PhishSim AI logo top left, tagline BUILDING HUMAN FIREWALLS.',
    'Four red-icon feature columns at bottom with short labels.',
    `Headline text at bottom: "${spec.headline}"`,
    `Subheadline: "${spec.subheadline}"`,
    `Topic: ${topic}.`,
    'Premium B2B SaaS, cinematic lighting, crisp readable text, agency quality. NO stock photos, NO wireframes.',
  ].join(' ')
}

export function defaultMarketingSpec(topic: string, hook: string): SarahMarketingImageSpec {
  const topicHeadline =
    hook.length > 15 && hook.length < 72 && !hook.includes('---')
      ? hook.replace(/\.$/, '')
      : topic.slice(0, 60).replace(/\.$/, '')

  const isSoc = /soc\s*2/i.test(`${topic} ${hook}`)
  return {
    headline: isSoc ? 'SOC 2 Evidence. One-Click Export.' : `${topicHeadline}.`,
    subheadline: isSoc
      ? 'Automate your audit trail without spreadsheets.'
      : 'Built for MSPs who manage 50–500 seats.',
    leftPanel: 'phishing email mockup',
    rightPanel: 'compliance dashboard',
    features: ['Automated Audit Trails', 'One-Click Export', 'Prove Compliance', 'MSP Ready'],
  }
}

async function persistImage(data: Buffer, contentType: string, ext: string): Promise<string> {
  const key = `social/linkedin/${Date.now()}.${ext}`
  const { url } = await storagePut(key, data, contentType)
  return url
}

async function fetchAndPersist(remoteUrl: string): Promise<string> {
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/webp'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') ? 'jpg' : 'webp'
  const stored = await persistImage(buf, contentType, ext)
  return stored || remoteUrl
}

async function generateWithGemini(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const models = [
    process.env.GEMINI_IMAGE_MODEL,
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.5-flash-image',
  ].filter(Boolean) as string[]

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: AbortSignal.timeout(120_000),
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        const inline = part?.inlineData || part?.inline_data
        if (inline?.data) return Buffer.from(inline.data, 'base64')
      }
    } catch {
      continue
    }
  }
  return null
}

/** Generate hero image — Replicate → Gemini → first-post reference template → SVG. */
export async function createSarahLinkedInHeroImage(input: {
  marketingImage?: Partial<SarahMarketingImageSpec>
  hook: string
  topic?: string
  founderFeedback?: string
}): Promise<SarahPostImage> {
  const topic = input.topic || 'MSP compliance'
  const spec: SarahMarketingImageSpec = {
    ...defaultMarketingSpec(topic, input.hook),
    ...input.marketingImage,
    features: input.marketingImage?.features?.length
      ? input.marketingImage.features
      : defaultMarketingSpec(topic, input.hook).features,
  }

  const layout = {
    ...DEFAULT_CARD_LAYOUT,
    ...layoutFromFounderFeedback(input.founderFeedback || ''),
  }

  const prompt = buildMarketingImagePrompt(spec, topic)
  const errors: string[] = []

  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const remoteUrl = await generateReplicateImageUrl(prompt, { aspectRatio: '3:2' })
      const url = await fetchAndPersist(remoteUrl)
      return { url, source: 'replicate' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[SarahLinkedInImage] Replicate failed:', msg)
      errors.push(`replicate: ${msg}`)
    }
  } else {
    errors.push('replicate: REPLICATE_API_TOKEN missing')
  }

  try {
    const geminiBuf = await generateWithGemini(prompt)
    if (geminiBuf) {
      const stored = await persistImage(geminiBuf, 'image/png', 'png')
      const url = stored || `data:image/png;base64,${geminiBuf.toString('base64')}`
      return { url, source: 'gemini' }
    }
    errors.push('gemini: no image in response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[SarahLinkedInImage] Gemini failed:', msg)
    errors.push(`gemini: ${msg}`)
  }

  try {
    const png = await renderSarahReferenceStylePng(spec)
    const stored = await persistImage(png, 'image/png', 'png')
    const url = stored || `data:image/png;base64,${png.toString('base64')}`
    return { url, source: 'reference' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[SarahLinkedInImage] Reference template failed:', msg)
    errors.push(`reference: ${msg}`)
  }

  try {
    const png = await renderSarahMarketingSvgPng(spec, topic, layout)
    const stored = await persistImage(png, 'image/png', 'png')
    const url = stored || `data:image/png;base64,${png.toString('base64')}`
    return { url, source: 'svg' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[SarahLinkedInImage] SVG fallback failed:', msg)
    errors.push(`svg: ${msg}`)
  }

  throw new Error(`Could not generate marketing image — ${errors.join(' | ')}`)
}
