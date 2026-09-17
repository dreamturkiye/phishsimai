import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  defaultMarketingSpec,
  wantsPricingFirstMarketing,
  marketingImageFromFeedback,
  PRICING_FIRST_SUBHEADLINE,
  SEATS_FRAMING_SUBHEADLINE,
  createSarahLinkedInHeroImage,
} from './sarahLinkedInImage'
import { REFERENCE_PUBLIC_URL } from './linkedinHeroFallback'

vi.mock('../../storage', () => ({
  storagePut: vi.fn(async () => ({ key: 'social/linkedin/x.png', url: '' })),
  blobReadWriteTokenConfigured: () => false,
}))

vi.mock('./sarahLinkedInRaster', () => ({
  renderSarahMarketingSvgPng: vi.fn(async () => {
    throw new Error('svg fail')
  }),
}))

vi.mock('./sarahLinkedInReferenceStyle', async () => {
  const actual = await vi.importActual<typeof import('./sarahLinkedInReferenceStyle')>('./sarahLinkedInReferenceStyle')
  return {
    ...actual,
    renderSarahReferenceStylePng: vi.fn(async () => {
      throw new Error('reference png missing')
    }),
  }
})

describe('pricing-first marketing default', () => {
  it('detects founder feedback that drops 50–500 seats framing', () => {
    expect(wantsPricingFirstMarketing('')).toBe(false)
    expect(wantsPricingFirstMarketing('drop the 50–500 seats framing')).toBe(true)
    expect(wantsPricingFirstMarketing('Do not use 50-500 seats')).toBe(true)
    expect(wantsPricingFirstMarketing('pricing-first, lead with price')).toBe(true)
    expect(wantsPricingFirstMarketing('showcase best industry per-seat pricing')).toBe(true)
    expect(wantsPricingFirstMarketing('Match first LinkedIn post quality')).toBe(false)
  })

  it('defaultMarketingSpec is always pricing-first — never the baked-in 50–500 seats line', () => {
    const spec = defaultMarketingSpec('MSP trial', 'Start the trial')
    expect(spec.subheadline).toBe(PRICING_FIRST_SUBHEADLINE)
    expect(spec.subheadline).not.toBe(SEATS_FRAMING_SUBHEADLINE)
    expect(spec.subheadline).not.toMatch(/50–500 seats/)
    expect(defaultMarketingSpec('SOC 2 evidence', 'SOC 2', '').subheadline).toBe(PRICING_FIRST_SUBHEADLINE)
    expect(PRICING_FIRST_SUBHEADLINE).toMatch(/60¢/)
    expect(PRICING_FIRST_SUBHEADLINE).toContain('$299/mo for 500')
  })

  it('createSarahLinkedInHeroImage forces pricing-first subheadline over any seats copy', () => {
    const src = readFileSync('server/os/social/sarahLinkedInImage.ts', 'utf8')
    const fn = src.slice(src.indexOf('export async function createSarahLinkedInHeroImage'))
    expect(fn).toMatch(/subheadline: PRICING_FIRST_SUBHEADLINE/)
    expect(fn).toContain('...input.marketingImage')
    expect(fn.indexOf('subheadline: PRICING_FIRST_SUBHEADLINE')).toBeGreaterThan(fn.indexOf('...input.marketingImage'))
  })

  it('revise/produce marketingImageFromFeedback always overlays pricing-first (covers baked-in seats)', () => {
    expect(marketingImageFromFeedback('looks fine').subheadline).toBe(PRICING_FIRST_SUBHEADLINE)
    expect(marketingImageFromFeedback('drop 50-500 seats framing').subheadline).toBe(PRICING_FIRST_SUBHEADLINE)
    expect(marketingImageFromFeedback('drop 50-500 seats framing').headline).toContain('60¢')
    expect(marketingImageFromFeedback('looks fine').subheadline).not.toBe(SEATS_FRAMING_SUBHEADLINE)
    expect(marketingImageFromFeedback('wrong positioning — drop seats')).toEqual(
      expect.objectContaining({
        headline: '60¢/user. $299/mo for 500.',
        subheadline: PRICING_FIRST_SUBHEADLINE,
      }),
    )
  })
})

describe('createSarahLinkedInHeroImage never-null fallback', () => {
  const origRep = process.env.REPLICATE_API_TOKEN
  const origGem = process.env.GEMINI_API_KEY
  const origBlob = process.env.BLOB_READ_WRITE_TOKEN

  beforeEach(() => {
    delete process.env.REPLICATE_API_TOKEN
    delete process.env.GEMINI_API_KEY
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  afterEach(() => {
    if (origRep === undefined) delete process.env.REPLICATE_API_TOKEN
    else process.env.REPLICATE_API_TOKEN = origRep
    if (origGem === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = origGem
    if (origBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
    else process.env.BLOB_READ_WRITE_TOKEN = origBlob
  })

  it('returns the public reference URL when Replicate/Gemini/blob/raster all fail', async () => {
    const img = await createSarahLinkedInHeroImage({ hook: '30-day no-card trial for MSPs' })
    expect(img.url).toBe(REFERENCE_PUBLIC_URL)
    expect(img.url.length).toBeGreaterThan(0)
    expect(img.source).toBe('reference')
  })
})
