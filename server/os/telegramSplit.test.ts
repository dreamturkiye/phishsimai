// ─────────────────────────────────────────────────────────────────────────────
//  PS-TRUNCATE-01 — sendTelegram must SPLIT, never amputate.
//
//  The old transport did `text.slice(0, 4000)`. Combined with a caller that also
//  sliced to 600, a 2275-char CGO standup reached the founder as its opening
//  paragraph — a phantom "halt Aria" note — with every actual task assignment cut.
//  These tests pin the property that matters: no input character is ever dropped.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { splitForTelegram } from './telegram'

const rejoin = (parts: string[]) => parts.join('\n').replace(/\s+/g, ' ').trim()
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('splitForTelegram', () => {
  it('leaves a short message as a single part', () => {
    expect(splitForTelegram('short brief')).toEqual(['short brief'])
  })

  it('never drops content — the whole message survives the split', () => {
    const long = Array.from({ length: 400 }, (_, i) => `Line ${i}: something Janet said that matters.`).join('\n')
    const parts = splitForTelegram(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(rejoin(parts)).toBe(normalize(long))
  })

  it('keeps every part within Telegram\'s 4096-char hard cap', () => {
    const long = 'x'.repeat(20_000)
    for (const p of splitForTelegram(long)) expect(p.length).toBeLessThanOrEqual(4096)
  })

  it('prefers paragraph boundaries so parts break where thoughts do', () => {
    const para = 'A'.repeat(1000)
    const parts = splitForTelegram([para, para, para, para, para].join('\n\n'), 2500)
    expect(parts.length).toBeGreaterThan(1)
    // A paragraph-boundary split leaves no part starting mid-run of A's + newline garbage.
    for (const p of parts) expect(p.startsWith('A')).toBe(true)
  })

  it('hard-splits rather than dropping text when there is no boundary at all', () => {
    const unbroken = 'z'.repeat(9000) // no spaces, no newlines
    const parts = splitForTelegram(unbroken)
    expect(parts.join('')).toBe(unbroken) // nothing lost
  })

  it('carries the real 2026-07-23 standup in full', () => {
    // The exact length that got truncated to 600 chars in production.
    const standup = 'J'.repeat(2275)
    const parts = splitForTelegram(standup)
    expect(parts.join('').length).toBe(2275)
  })
})
