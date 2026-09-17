import { storagePut, blobReadWriteTokenConfigured } from '../../storage'
import { generateReplicateImageUrl } from './replicateImage'
import { renderSarahMarketingSvgPng } from './sarahLinkedInRaster'
import { renderSarahReferenceStylePng, REFERENCE_PUBLIC_URL } from './sarahLinkedInReferenceStyle'
import { linkedInHeroUrlOrReference } from './linkedinHeroFallback'
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

export const SEATS_FRAMING_SUBHEADLINE = 'Built for MSPs who manage 50–500 seats.'
export const PRICING_FIRST_SUBHEADLINE = '60¢/user. $299/mo for 500. 30-day no-card trial.'

/** Founder asked to drop the 50–500 seats framing → lead with frozen price. */
export function wantsPricingFirstMarketing(feedback: string): boolean {
  const c = String(feedback || '').toLowerCase()
  if (!c.trim()) return false
  if (/pricing[-\s]?first|lead with price/.test(c)) return true
  if (/seats framing/.test(c)) return true
  const mentionsSeatsBand = /50\s*[–-]\s*500/.test(c)
  const asksToDrop = /drop|remove|don'?t|do not|stop|no more|instead of|replace/.test(c)
  return mentionsSeatsBand && (asksToDrop || /seat/.test(c))
}

export function defaultMarketingSpec(topic: string, hook: string, founderFeedback = ''): SarahMarketingImageSpec {
  const topicHeadline =
    hook.length > 15 && hook.length < 72 && !hook.includes('---')
      ? hook.replace(/\.$/, '')
      : topic.slice(0, 60).replace(/\.$/, '')

  const isSoc = /soc\s*2/i.test(`${topic} ${hook}`)
  const pricingFirst = wantsPricingFirstMarketing(founderFeedback)
  return {
    headline: isSoc ? 'SOC 2 Evidence. One-Click Export.' : `${topicHeadline}.`,
    subheadline: pricingFirst
      ? PRICING_FIRST_SUBHEADLINE
      : isSoc
        ? 'Automate your audit trail without spreadsheets.'
        : SEATS_FRAMING_SUBHEADLINE,
    leftPanel: 'phishing email mockup',
    rightPanel: 'compliance dashboard',
    features: ['Automated Audit Trails', 'One-Click Export', 'Prove Compliance', 'MSP Ready'],
  }
}

/** Image spec for revise/produce-final. Pricing-first wins when founder drops 50–500 seats framing. */
export function marketingImageFromFeedback(feedback: string): Partial<SarahMarketingImageSpec> {
  if (wantsPricingFirstMarketing(feedback)) {
    return {
      headline: '60¢/user. $299/mo for 500.',
      subheadline: PRICING_FIRST_SUBHEADLINE,
      features: ['60¢ per user', '$299/mo for 500', '30-day no-card trial', 'Live in 10 min'],
    }
  }
  return {
    headline: 'SOC 2 Evidence. One-Click Export.',
    subheadline: 'Automate your audit trail without spreadsheets.',
    features: ['Automated Audit Trails', 'One-Click Export', 'Prove Compliance', 'MSP Ready'],
  }
}

function nonEmptyHeroUrl(url?: string | null): string | null {
  const v = String(url || '').trim()
  return v || null
}

function dataPngUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}

async function persistImage(data: Buffer, contentType: string, ext: string): Promise<string> {
  const key = `social/linkedin/${Date.now()}.${ext}`
  const { url } = await storagePut(key, data, contentType)
  return nonEmptyHeroUrl(url) || ''
}

async function persistOrInline(buf: Buffer, contentType: string, ext: string): Promise<string> {
  const stored = await persistImage(buf, contentType, ext)
  return nonEmptyHeroUrl(stored) || dataPngUrl(buf)
}

async function fetchAndPersist(remoteUrl: string): Promise<string> {
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/webp'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') ? 'jpg' : 'webp'
  const stored = await persistImage(buf, contentType, ext)
  return nonEmptyHeroUrl(stored) || nonEmptyHeroUrl(remoteUrl) || dataPngUrl(buf)
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
    ...defaultMarketingSpec(topic, input.hook, input.founderFeedback),
    ...input.marketingImage,
    features: input.marketingImage?.features?.length
      ? input.marketingImage.features
      : defaultMarketingSpec(topic, input.hook, input.founderFeedback).features,
  }
  if (wantsPricingFirstMarketing(input.founderFeedback || '')) {
    spec.subheadline = PRICING_FIRST_SUBHEADLINE
  }

  const layout = {
    ...DEFAULT_CARD_LAYOUT,
    ...layoutFromFounderFeedback(input.founderFeedback || ''),
  }

  const prompt = buildMarketingImagePrompt(spec, topic)
  const errors: string[] = []

  if (!blobReadWriteTokenConfigured()) {
    console.warn('[SarahLinkedInImage] BLOB_READ_WRITE_TOKEN missing — hero persist will skip; using data URL or public reference')
  }

  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const remoteUrl = await generateReplicateImageUrl(prompt, { aspectRatio: '3:2' })
      const url = nonEmptyHeroUrl(await fetchAndPersist(remoteUrl))
      if (url) return { url, source: 'replicate' }
      errors.push('replicate: persist returned empty url')
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
      const url = await persistOrInline(geminiBuf, 'image/png', 'png')
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
    const url = await persistOrInline(png, 'image/png', 'png')
    return { url, source: 'reference' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[SarahLinkedInImage] Reference template failed:', msg)
    errors.push(`reference: ${msg}`)
  }

  try {
    const png = await renderSarahMarketingSvgPng(spec, topic, layout)
    const url = await persistOrInline(png, 'image/png', 'png')
    return { url, source: 'svg' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[SarahLinkedInImage] SVG fallback failed:', msg)
    errors.push(`svg: ${msg}`)
  }

  const fallback = linkedInHeroUrlOrReference(null)
  console.warn(`[SarahLinkedInImage] All generators failed (${errors.join(' | ')}); falling back to ${fallback}`)
  return { url: fallback, source: 'reference' }
}
