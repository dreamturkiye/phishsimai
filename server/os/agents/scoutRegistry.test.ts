// ─────────────────────────────────────────────────────────────────────────────
//  PS-SCOUT-LANDSCAPE-01 — an unsourced claim is DROPPED, not asserted.
//
//  Same shape as the n<30 floor and the placeholder guard: the guarantee is structural. A finding
//  is fact only with a source + a verbatim on-page quote; anything else is a proposal or NOT_CHECKED.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  SOURCE_REGISTRY,
  PROTECTED_TOPICS,
  verifyFinding,
  isProtectedTopic,
  isRegistrySource,
  normaliseText,
} from './scoutRegistry'

describe('the allowlist is fixed and there is no open web search', () => {
  it('only registry URLs are fetchable', () => {
    expect(isRegistrySource('https://www.nist.gov/cyberframework')).toBe(true)
    expect(isRegistrySource('https://evil.example.com/made-up-mandate')).toBe(false)
  })

  it('the module contains no web-search API — sources are structural, not discovered', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const runner = fs.readFileSync('server/os/agents/scoutLandscape.ts', 'utf8')
    for (const banned of ['googleapis.com/customsearch', 'bing.com/search', 'serpapi', 'duckduckgo.com/html']) {
      expect(runner.toLowerCase()).not.toContain(banned)
    }
  })

  it('every registry source is a real, categorised, authoritative entry', () => {
    expect(SOURCE_REGISTRY.length).toBeGreaterThan(0)
    for (const s of SOURCE_REGISTRY) {
      expect(s.url).toMatch(/^https:\/\//)
      expect(s.authority.length).toBeGreaterThan(10)
      expect(['regulatory', 'framework', 'insurance', 'threat']).toContain(s.topic)
    }
  })
})

describe('THE PROVENANCE GATE — verified only when the quote is on the page', () => {
  const page = 'Organizations should provide security awareness training to all staff on a regular basis.'

  it('a quote that appears verbatim on the page verifies', () => {
    expect(verifyFinding(page, 'security awareness training to all staff')).toBe(true)
  })

  it('an INVENTED quote not on the page is dropped', () => {
    expect(verifyFinding(page, 'a federal mandate requires quarterly phishing simulations by 2027')).toBe(false)
  })

  it('an empty or too-short quote is not verifiable', () => {
    expect(verifyFinding(page, '')).toBe(false)
    expect(verifyFinding(page, 'training')).toBe(false)
  })

  it('matching is whitespace/markup-insensitive but not fabrication-insensitive', () => {
    expect(verifyFinding('<p>security   awareness\n training</p>', 'security awareness training')).toBe(true)
    expect(verifyFinding('<p>security awareness training</p>', 'MANDATORY security audits')).toBe(false)
  })
})

describe('PROTECTED topics are never adopted from an external source', () => {
  it.each(PROTECTED_TOPICS)('refuses a claim touching %s', (topic) => {
    expect(isProtectedTopic(`the market suggests we change our ${topic} strategy`)).toBe(true)
  })

  it('an ordinary landscape claim is not protected', () => {
    expect(isProtectedTopic('NIST updated its awareness-training control guidance')).toBe(false)
  })
})
