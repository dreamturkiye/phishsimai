// PS-LEARNING-CONTENT-01 — the lesson is tied to the specific lure, not generic tips.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { LEARNING_MOMENTS, momentFor, lessonHtml, DEFAULT_MOMENT } from './learningMoments'

describe('every attack type has its own specific lesson', () => {
  it('all 6 enum attack types are covered with distinct content', () => {
    const types = ['credential_harvest', 'link_click', 'attachment', 'vishing', 'smishing', 'pretexting']
    for (const t of types) expect(LEARNING_MOMENTS[t as keyof typeof LEARNING_MOMENTS]).toBeTruthy()
    const frames = types.map((t) => LEARNING_MOMENTS[t as keyof typeof LEARNING_MOMENTS].frame)
    expect(new Set(frames).size).toBe(types.length) // no two share a frame
  })

  it('each lesson carries concrete red flags and a habit', () => {
    for (const m of Object.values(LEARNING_MOMENTS)) {
      expect(m.redFlags.length).toBeGreaterThanOrEqual(3)
      expect(m.habit.length).toBeGreaterThan(20)
    }
  })

  it('an unknown attack type falls to a still-useful default, never empty', () => {
    expect(momentFor(null)).toBe(DEFAULT_MOMENT)
    expect(momentFor('nonsense')).toBe(DEFAULT_MOMENT)
    expect(momentFor('credential_harvest')).toBe(LEARNING_MOMENTS.credential_harvest)
  })
})

describe('the lesson shows the REAL email details', () => {
  it('renders the actual sender and subject the recipient received', () => {
    const html = lessonHtml(momentFor('link_click'), { senderName: 'Delivery Notifications', subject: 'Package on hold' })
    expect(html).toContain('Delivery Notifications')
    expect(html).toContain('Package on hold')
    expect(html).toContain('Why this one was suspicious')
  })

  it('escapes the sender/subject — no HTML injection from template data', () => {
    const html = lessonHtml(momentFor('link_click'), { senderName: '<script>x</script>', subject: '"><img>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('the landing page renders the lesson, not the old generic tips', () => {
  const TRACKER = fs.readFileSync('server/email/tracker.ts', 'utf8')
  it('the generic "How to spot the next one" tip list is gone', () => {
    expect(TRACKER).not.toContain('How to spot the next one')
  })
  it('the landing handler resolves the per-token lesson context', () => {
    expect(TRACKER).toContain('getLessonContextForToken')
    expect(TRACKER).toContain('momentFor(')
  })
})
