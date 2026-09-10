import { describe, expect, it } from 'vitest'
import { conversionLesson, rankWarmLeads } from './conversionEngine'
import { TRIAL_CTA_URL, WARM_CONVERSION_TOUCH } from './sequences'
import { readFileSync } from 'node:fs'

describe('CGO conversion ranking', () => {
  it('puts replied/engaged ahead of unopened prospects', () => {
    const ranked = rankWarmLeads([
      { email: 'cold@x.com', pipeline_stage: 'prospect' },
      { email: 'hot@x.com', replied: true, pipeline_stage: 'engaged' },
      { email: 'mid@x.com', pipeline_stage: 'lead' },
    ])
    expect(ranked[0].email).toBe('hot@x.com')
    expect(ranked[ranked.length - 1].email).toBe('cold@x.com')
  })
})

describe('conversionLesson is honest', () => {
  it('treats a Dex trip as a failed conversion, not a send', () => {
    const l = conversionLesson({ sent: 0, skipped: 0, blocked: 0, tripped: true, results: [] })
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/breaker tripped/)
  })

  it('records a real send as success', () => {
    const l = conversionLesson({ sent: 2, skipped: 0, blocked: 1, tripped: false, results: [] })
    expect(l.success).toBe(true)
    expect(l.lesson).toMatch(/Sent 2/)
  })

  it('does not celebrate an empty run', () => {
    const l = conversionLesson({ sent: 0, skipped: 0, blocked: 0, tripped: false, results: [] })
    expect(l.success).toBe(false)
    expect(l.lesson).toMatch(/No warm sendable/)
  })
})

describe('warm CTA stays on the Dex-registered send path', () => {
  it('lives in sequences.ts with rails and the live trial URL', () => {
    const seq = readFileSync('server/os/sequences.ts', 'utf8')
    expect(seq).toContain('export async function sendWarmTrialCtas')
    expect(seq).toContain(TRIAL_CTA_URL)
    expect(seq).toContain('assertSendable')
    expect(seq).toContain('hasMx')
    expect(seq).toContain('ps_outreach_suppression')
    expect(WARM_CONVERSION_TOUCH).toBe(90)
    expect(TRIAL_CTA_URL).toContain('login?mode=register')
    expect(readFileSync('server/os/agents/dex.ts', 'utf8')).toContain('warm_conversion')
  })
})
