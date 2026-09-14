import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { TRIAL_ACQUISITION_CHANNELS, TRIAL_LINKEDIN_DRAFT_BODY } from './trialAcquisitionChannels'
import { TRIAL_CTA_URL } from './sequences'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './social/publicPostingLockout'

describe('trial acquisition besides cold email', () => {
  it('inventories live channels and keeps public publish locked', () => {
    const ids = TRIAL_ACQUISITION_CHANNELS.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([
      'warm_reply_cta',
      'trial_org_nudges',
      'msp_hub_harvest',
      'magic_link_checkout',
      'linkedin_founder_draft',
      'public_social_publish',
    ]))
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'msp_hub_harvest')?.status).toBe('live')
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'linkedin_founder_draft')?.status).toBe('live')
    expect(TRIAL_ACQUISITION_CHANNELS.find((c) => c.id === 'public_social_publish')?.status).toBe('locked')
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })

  it('LinkedIn draft uses frozen trial URL and price, and conversion shift queues it', () => {
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toContain(TRIAL_CTA_URL)
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toMatch(/60¢|60c/)
    expect(TRIAL_LINKEDIN_DRAFT_BODY).toContain('$299/mo for 500')
    const engine = readFileSync('server/os/conversionEngine.ts', 'utf8')
    expect(engine).toContain('queueFounderReviewTrialDraft')
    expect(readFileSync('api/handler.ts', 'utf8')).toContain('/api/os/msp-harvest')
  })
})
