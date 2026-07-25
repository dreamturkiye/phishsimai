// PS-SOCIAL-LOCKOUT-01 — pins the structural lockout on public community/social posting.
//
// This is a POLICY test, not a behaviour test: the requirement is that no code path can publish to
// a public channel under any identity. It fails loudly if someone flips the constant or removes a
// guard from a publish choke point, which is exactly the regression that would go unnoticed
// (os_social_queue is empty, so nothing would visibly break until Sarah posted publicly).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_SOCIAL_POSTING_ENABLED, assertPublicPostingDisabled } from './publicPostingLockout'

const here = (f: string) => readFileSync(join(__dirname, f), 'utf8')

/** Slice out one function body: from its declaration to the next top-level declaration. */
function bodyOf(src: string, fnName: string): string {
  const start = src.search(new RegExp(`^(export )?(async )?function ${fnName}\\b`, 'm'))
  if (start < 0) throw new Error(`function ${fnName} not found`)
  const rest = src.slice(start + 1)
  const end = rest.search(/^(export )?(async )?function \w/m)
  return end < 0 ? rest : rest.slice(0, end)
}

describe('PS-SOCIAL-LOCKOUT-01', () => {
  it('the lockout is ON', () => {
    expect(PUBLIC_SOCIAL_POSTING_ENABLED).toBe(false)
  })

  it('assert throws, and names the channel it blocked', () => {
    expect(() => assertPublicPostingDisabled('Reddit /api/submit')).toThrow(/PS-SOCIAL-LOCKOUT-01/)
    expect(() => assertPublicPostingDisabled('Reddit /api/submit')).toThrow(/Reddit \/api\/submit/)
  })

  // Each entry is a publish choke point: the ONE function through which outbound public content
  // leaves for that channel. Adding a new public channel means adding it here too.
  const CHOKE_POINTS: [file: string, fn: string][] = [
    ['redditClient.ts', 'redditPostForm'],                // Reddit /api/submit + /api/comment
    ['linkedInPublisher.ts', 'postForMePublish'],          // LinkedIn via the autopost cron
    ['postForMeLinkedIn.ts', 'postLinkedInViaPostForMe'],  // LinkedIn via the preview-token route
  ]

  for (const [file, fn] of CHOKE_POINTS) {
    it(`${file}: ${fn}() is guarded before its network call`, () => {
      const body = bodyOf(here(file), fn)
      const guardAt = body.indexOf('assertPublicPostingDisabled(')
      const fetchAt = body.indexOf('fetch(')
      expect(guardAt, `${fn}() must call assertPublicPostingDisabled`).toBeGreaterThan(-1)
      expect(fetchAt, `${fn}() should make a network call`).toBeGreaterThan(-1)
      expect(guardAt, `guard must precede fetch() inside ${fn}()`).toBeLessThan(fetchAt)
    })
  }

  it('read/monitor paths are NOT blocked (only publishing is severed)', () => {
    // redditGet is the read path (hot.json, /api/v1/me). Monitoring must keep working.
    expect(bodyOf(here('redditClient.ts'), 'redditGet')).not.toMatch(/assertPublicPostingDisabled/)
  })
})
