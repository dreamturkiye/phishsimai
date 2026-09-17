import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  REFERENCE_PUBLIC_URL,
  linkedInHeroUrlOrReference,
  isLinkedInHeroUrlMissing,
} from './linkedinHeroFallback'
import { renderLinkedInFeedPost } from './linkedinFeedPreview'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './publicPostingLockout'

const previewBase = {
  status: 'draft' as const,
  author: { name: 'Sarah Mitchell', title: 'Head of Compliance Partnerships @ PhishSimAI', avatarInitials: 'SM' },
  hook: '30-day no-card trial for MSPs',
  body: 'Start the trial.',
  hashtags: ['MSP'],
}

describe('linkedInHeroUrlOrReference', () => {
  it('never returns empty — null/blank become the public reference PNG', () => {
    expect(linkedInHeroUrlOrReference(null)).toBe(REFERENCE_PUBLIC_URL)
    expect(linkedInHeroUrlOrReference(undefined)).toBe(REFERENCE_PUBLIC_URL)
    expect(linkedInHeroUrlOrReference('')).toBe(REFERENCE_PUBLIC_URL)
    expect(linkedInHeroUrlOrReference('   ')).toBe(REFERENCE_PUBLIC_URL)
    expect(isLinkedInHeroUrlMissing(null)).toBe(true)
    expect(linkedInHeroUrlOrReference('https://blob.example/hero.png')).toBe('https://blob.example/hero.png')
  })
})

describe('renderLinkedInFeedPost — null image must not show generating forever', () => {
  it('embeds the reference URL when imageUrl is null', () => {
    const html = renderLinkedInFeedPost({ ...previewBase, imageUrl: null })
    expect(html).toContain(REFERENCE_PUBLIC_URL)
    expect(html).not.toContain('Hero image generating')
    expect(html).not.toContain('li-image-missing')
  })

  it('keeps a real image URL when present', () => {
    const html = renderLinkedInFeedPost({ ...previewBase, imageUrl: 'https://example.com/x.png' })
    expect(html).toContain('https://example.com/x.png')
    expect(html).not.toContain('Hero image generating')
  })
})

describe('persist + preview paths never write null LinkedIn image_url', () => {
  it('savePreviewForReview coerces via linkedInHeroUrlOrReference', () => {
    const src = readFileSync('server/os/social/socialPreviewPage.ts', 'utf8')
    expect(src).toContain('linkedInHeroUrlOrReference')
    expect(src).toMatch(/WHERE platform='linkedin' AND \(image_url IS NULL/)
    expect(src).toContain('REFERENCE_PUBLIC_URL')
    expect(src).not.toMatch(/imageUrl: input\.imageUrl \|\| null/)
  })

  it('createSarahLinkedInHeroImage falls back instead of throwing', () => {
    const src = readFileSync('server/os/social/sarahLinkedInImage.ts', 'utf8')
    expect(src).toContain('falling back to')
    expect(src).toContain('linkedInHeroUrlOrReference')
    expect(src).not.toMatch(/throw new Error\(`Could not generate marketing image/)
  })

  it('ops snapshot warns when BLOB_READ_WRITE_TOKEN is missing', () => {
    const src = readFileSync('server/os/janetOpsSnapshot.ts', 'utf8')
    expect(src).toContain('BLOB_READ_WRITE_TOKEN')
    expect(src).toContain('blobReadWriteTokenConfigured')
  })

  it('does not enable public LinkedIn auto-publish', () => {
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })
})
