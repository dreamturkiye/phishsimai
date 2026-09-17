import { describe, expect, it } from 'vitest'
import {
  LINKEDIN_DAILY_POST_CAP,
  REDDIT_ALLOWED_SUBS,
  REDDIT_DAILY_COMMENT_LIMIT,
  REDDIT_DAILY_POST_LIMIT,
  WEEK_CHALLENGE_END_ISO,
  crisisPublishBlockReason,
  hasChannelPublishCredentials,
  isCrisisPublishKilled,
  isCrisisPublishWindow,
  isDuplicateSocialBody,
  isWeekChallengeWindow,
  linkedInBodyIsPublishable,
  redditDraftIsPublishable,
  redditSubIsAllowed,
} from './crisisSocialPublish'
import { PUBLIC_SOCIAL_POSTING_ENABLED } from './publicPostingLockout'
import { WARM_CTA_TOUCHES, DAILY_SEND_LIMIT } from '../sequences'
import { readFileSync } from 'node:fs'

const LINKEDIN_CREDS = {
  POSTFORME_API_KEY: 'pk_test',
  POSTFORME_SARAH_LINKEDIN_ID: 'acc_sarah',
}
const REDDIT_CREDS = {
  SARAH_REDDIT_USERNAME: 'sarah',
  SARAH_REDDIT_PASSWORD: 'secret',
}

describe('crisis social publish — kill switch + window', () => {
  it('keeps the structural always-on flag OFF; crisis override is env + credentials', () => {
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
    expect(LINKEDIN_DAILY_POST_CAP).toBe(1)
    expect(REDDIT_DAILY_COMMENT_LIMIT).toBe(3)
    expect(REDDIT_DAILY_POST_LIMIT).toBe(1)
    expect(WEEK_CHALLENGE_END_ISO).toMatch(/^2026-09-25/)
    expect(isCrisisPublishKilled({ SOCIAL_CRISIS_PUBLISH: '0' })).toBe(true)
    expect(isCrisisPublishKilled({ SOCIAL_CRISIS_PUBLISH: '1' })).toBe(false)
  })

  it('kill switch wins even with credentials and week-challenge date', () => {
    const during = new Date('2026-09-20T12:00:00Z')
    expect(isCrisisPublishWindow({ SOCIAL_CRISIS_PUBLISH: '0', ...LINKEDIN_CREDS }, during)).toBe(false)
    expect(crisisPublishBlockReason('linkedin', { SOCIAL_CRISIS_PUBLISH: '0', ...LINKEDIN_CREDS }, during)).toMatch(/kill switch/)
  })

  it('unset env is ON during the week challenge, OFF after unless env=1', () => {
    expect(isWeekChallengeWindow(new Date('2026-09-25T23:00:00Z'))).toBe(true)
    expect(isWeekChallengeWindow(new Date('2026-09-26T00:00:00Z'))).toBe(false)
    expect(isCrisisPublishWindow({}, new Date('2026-09-20T12:00:00Z'))).toBe(true)
    expect(isCrisisPublishWindow({}, new Date('2026-09-26T12:00:00Z'))).toBe(false)
    expect(isCrisisPublishWindow({ SOCIAL_CRISIS_PUBLISH: '1' }, new Date('2026-09-26T12:00:00Z'))).toBe(true)
  })

  it('credentials are per-channel — LinkedIn key is not enough for Reddit', () => {
    expect(hasChannelPublishCredentials('LinkedIn (PostForMe)', LINKEDIN_CREDS)).toBe(true)
    expect(hasChannelPublishCredentials('LinkedIn (PostForMe)', { POSTFORME_API_KEY: 'pk' })).toBe(false)
    expect(hasChannelPublishCredentials('Reddit /api/submit', REDDIT_CREDS)).toBe(true)
    expect(hasChannelPublishCredentials('Reddit /api/submit', LINKEDIN_CREDS)).toBe(false)
  })
})

describe('LinkedIn quality + 1/day duplicate rails', () => {
  const body =
    'MSPs: 30-day no-card trial. One of the lowest per-seat prices in the industry: 60¢/user, $299/mo for 500. Live in 10 minutes.\n\nStart: https://phishsimai.com/trial'

  it('accepts the frozen trial offer and rejects spam / short / offer-less copy', () => {
    expect(linkedInBodyIsPublishable(body).ok).toBe(true)
    expect(linkedInBodyIsPublishable('hi').ok).toBe(false)
    expect(linkedInBodyIsPublishable('A'.repeat(90) + ' click here!!!').ok).toBe(false)
    expect(linkedInBodyIsPublishable('A long thoughtful post about phishing awareness with no price and no trial URL, padded out so it clears the length bar.').ok).toBe(false)
  })

  it('treats the same offer body as a duplicate of a prior post', () => {
    expect(isDuplicateSocialBody(body, [body])).toBe(true)
    expect(isDuplicateSocialBody(body, ['unrelated previous post about a conference we attended last week in Austin'])).toBe(false)
  })
})

describe('Reddit allow-list + no link-drop', () => {
  it('only the five allowed subs', () => {
    expect([...REDDIT_ALLOWED_SUBS]).toEqual(['msp', 'MSSP', 'sysadmin', 'cybersecurity', 'compliance'])
    expect(redditSubIsAllowed('msp')).toBe(true)
    expect(redditSubIsAllowed('r/sysadmin')).toBe(true)
    expect(redditSubIsAllowed('funny')).toBe(false)
  })

  it('comments cannot contain URLs; posts may have one phishsimai.com URL', () => {
    const helpful = 'For MSPs, the usual miss is skipping the allow-list step so simulations land in junk. Walk the tenant through SPF/DKIM and a report button first.'
    expect(redditDraftIsPublishable('comment', helpful, 'msp').ok).toBe(true)
    expect(redditDraftIsPublishable('comment', `${helpful} https://phishsimai.com/trial`, 'msp').ok).toBe(false)
    expect(redditDraftIsPublishable('post', `${helpful}\n\nWe wrote this up at https://phishsimai.com/trial`, 'msp').ok).toBe(true)
    expect(redditDraftIsPublishable('post', `${helpful} https://bit.ly/x`, 'msp').ok).toBe(false)
    expect(redditDraftIsPublishable('comment', helpful, 'memes').ok).toBe(false)
  })
})

describe('spam-safe rails stay on', () => {
  it('does not invent touch 93 or raise the daily cold cap', () => {
    expect(WARM_CTA_TOUCHES).toEqual([90, 91, 92])
    expect(DAILY_SEND_LIMIT).toBe(20)
    const acq = readFileSync('server/os/trialAcquisitionChannels.ts', 'utf8')
    expect(acq).toContain('tryCrisisPublishLinkedIn')
    expect(acq).not.toMatch(/touch,\s*93/)
    const reddit = readFileSync('server/os/social/sarahSocial.ts', 'utf8')
    expect(reddit).toContain('redditDraftIsPublishable')
    expect(reddit).toContain("status='held_quality'")
    expect(reddit).not.toMatch(/review_status\s*===\s*'approved'/)
    const app = readFileSync('client/src/App.tsx', 'utf8')
    expect(app).toContain('/knowbe4-alternative')
    expect(readFileSync('client/src/prerender.tsx', 'utf8')).toContain('/knowbe4-alternative')
    expect(readFileSync('client/src/pages/KnowBe4Alternative.tsx', 'utf8')).toContain('/trial?utm_source=seo')
    expect(readFileSync('client/src/pages/KnowBe4Alternative.tsx', 'utf8')).toMatch(/60¢|\$299/)
    expect(readFileSync('client/src/pages/TrialStart.tsx', 'utf8')).toMatch(/\$299/)
  })
})
