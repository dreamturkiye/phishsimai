import { describe, expect, it } from 'vitest'
import {
  EMPTY_LINKEDIN_FUNNEL,
  LINKEDIN_PENDING_ESCALATE_HOURS,
  TRIAL_ACQUISITION_CHANNELS,
  TRIAL_LINKEDIN_DRAFT_BODY,
  linkedInFunnelLine,
  linkedInPreviewTelegramHtml,
} from './trialAcquisitionChannels'
import { TRIAL_CTA_URL } from './sequences'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './social/publicPostingLockout'
import { readFileSync } from 'node:fs'

describe('trial acquisition besides cold email', () => {
  it('inventories live channels; public publish is crisis-override, not founder-gated', () => {
    const ids = TRIAL_ACQUISITION_CHANNELS.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([
      'warm_reply_cta',
      'trial_org_nudges',
      'msp_hub_harvest',
      'magic_link_checkout',
      'founder_1to1',
      'linkedin_founder_draft',
      'public_social_publish',
      'knowbe4_seo',
    ]))
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'msp_hub_harvest')?.status).toBe('live')
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'linkedin_founder_draft')?.status).toBe('live')
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'public_social_publish')?.status).toBe('crisis')
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })

  it('LinkedIn draft uses frozen trial URL and price, and conversion shift advances it every tick', () => {
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toContain(TRIAL_CTA_URL)
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toMatch(/60¢|60c/)
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toContain('$299/mo for 500')
    const engine = readFileSync('server/os/conversionEngine.ts', 'utf8')
    expect(engine).toContain('advanceLinkedInAcquisition')
    expect(engine).toContain('runGreyBoxPaidNudge')
    expect(readFileSync('api/handler.ts', 'utf8')).toContain('/api/os/msp-harvest')
    const acq = readFileSync('server/os/trialAcquisitionChannels.ts', 'utf8')
    expect(acq).toContain('savePreviewForReview')
    expect(acq).toContain('tryCrisisPublishLinkedIn')
    expect(acq).toContain('LINKEDIN_PENDING_ESCALATE_HOURS')
    expect(acq).not.toMatch(/return \{ queued: false, reason: 'already queued a founder-review trial draft today' \}/)
  })

  it('pending LinkedIn drafts auto-publish in crisis; they are not a founder-review dead end', () => {
    expect(LINKEDIN_PENDING_ESCALATE_HOURS).toBe(2)
    const line = linkedInFunnelLine({ ...EMPTY_LINKEDIN_FUNNEL, pendingReview: 1, oldestPendingHours: 9 })
    expect(line).toMatch(/pending_review=1/)
    expect(line).toMatch(/oldest pending 9h/)
    const acq = readFileSync('server/os/trialAcquisitionChannels.ts', 'utf8')
    expect(acq).toContain('tryCrisisPublishLinkedIn')
    expect(acq).toContain('Not waiting on founder review')
    expect(acq).not.toMatch(/return \{[\s\S]*already queued a founder-review trial draft today[\s\S]*funnel[\s\S]*\}/)
    const html = linkedInPreviewTelegramHtml({
      title: '30-day no-card trial for MSPs',
      previewUrl: 'https://phishsimai.com/preview/social/abc123',
      hours: 3,
      kind: 'pending',
    })
    expect(html).toContain('<a href="https://phishsimai.com/preview/social/abc123">')
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })
})
