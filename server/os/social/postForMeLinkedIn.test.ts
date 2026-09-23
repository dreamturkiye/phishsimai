import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  POSTFORME_SOCIAL_POSTS_URL,
  resolvePostForMeApiKey,
  resolvePostForMeCreateUrl,
  resolvePostForMeLinkedInAccount,
} from './postForMeLinkedIn'

describe('PostForMe create URL', () => {
  it('maps the removed /v1/posts route to /v1/social-posts', () => {
    expect(POSTFORME_SOCIAL_POSTS_URL).toBe('https://api.postforme.dev/v1/social-posts')
    expect(resolvePostForMeCreateUrl({})).toBe(POSTFORME_SOCIAL_POSTS_URL)
    expect(resolvePostForMeCreateUrl({ POSTFORME_API_URL: 'https://api.postforme.dev/v1/posts' })).toBe(POSTFORME_SOCIAL_POSTS_URL)
    expect(resolvePostForMeCreateUrl({ POSTFORME_API_URL: 'https://api.postforme.dev/v1/posts/' })).toBe(POSTFORME_SOCIAL_POSTS_URL)
    expect(resolvePostForMeCreateUrl({ POSTFORME_API_URL: 'https://api.example.com/posts' })).toBe(POSTFORME_SOCIAL_POSTS_URL)
    expect(resolvePostForMeCreateUrl({ POSTFORME_API_URL: 'https://api.postforme.dev/v1/social-posts' })).toBe(
      'https://api.postforme.dev/v1/social-posts',
    )
  })

  it('prefers the PhishSim key and Sarah account', () => {
    expect(resolvePostForMeApiKey({
      POSTFORME_PHISHSIM_API_KEY: 'phish',
      POSTFORME_API_KEY: 'generic',
      POST_FOR_ME_API_KEY: 'alt',
    })).toBe('phish')
    expect(resolvePostForMeApiKey({ POSTFORME_API_KEY: 'generic' })).toBe('generic')
    expect(resolvePostForMeApiKey({})).toBe('')
    expect(resolvePostForMeLinkedInAccount({
      POSTFORME_SARAH_LINKEDIN_ID: 'sarah',
      POSTFORME_LINKEDIN_ACCOUNT: 'kaan',
    })).toBe('sarah')
    expect(resolvePostForMeLinkedInAccount({ POSTFORME_LINKEDIN_ACCOUNT: 'kaan' })).toBe('kaan')
  })

  it('approved publisher posts to the resolver and retries a /v1/posts 404', () => {
    const src = readFileSync('server/os/social/linkedInPublisher.ts', 'utf8')
    expect(src).toContain('resolvePostForMeCreateUrl')
    expect(src).toContain('social_accounts')
    expect(src).toContain("ILIKE '%/v1/posts%'")
    expect(src).not.toContain('https://api.postforme.dev/v1/posts')
    expect(src).not.toContain('account_ids')
  })
})
