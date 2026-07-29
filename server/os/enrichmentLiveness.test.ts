// PS-ENRICH-LIVENESS-01 — pins the stall detector against the exact misdiagnosis that produced it.
//
// On 2026-07-25 `max(created_at)` among status='enriched' rows read 07-23 and was reported as
// "enrichment stalled 2 days". It had not stalled: the queue is FIFO, so rows queued 07-24/07-25
// were behind the backlog, and measured on `last_attempt_at` the researcher had processed 155 rows
// that day. These tests fix the correct column and the correct predicate in place.
import { describe, it, expect } from 'vitest'
import { checkEnrichmentLiveness } from './enrichmentLiveness'

const HOUR = 3_600_000
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

const sqlWith = (row: { last_attempt: string | null; selectable: number; processed_24h: number }) =>
  (() => Object.assign(Promise.resolve([row]), { catch: () => Promise.resolve([row]) })) as any

describe('checkEnrichmentLiveness', () => {
  it('HEALTHY: recent attempts with a backlog — the real 2026-07-25 state', async () => {
    // 700 selectable, 155 processed in 24h, last attempt minutes ago.
    const v = await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(0.2), selectable: 700, processed_24h: 155 }))
    expect(v.stalled).toBe(false)
    expect(v.ok).toBe(true)
    expect(v.processedLast24h).toBe(155)
    expect(v.reason).toMatch(/healthy/)
  })

  it('does NOT alarm on a large backlog alone — backlog is not a stall', async () => {
    const v = await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(1), selectable: 5000, processed_24h: 40 }))
    expect(v.stalled).toBe(false)
  })

  it('STALLED: work is selectable but nothing has been touched', async () => {
    const v = await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(30), selectable: 700, processed_24h: 0 }))
    expect(v.stalled).toBe(true)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/nothing touched in 30\.0h/)
  })

  it('STALLED: selectable work but the researcher has never run', async () => {
    const v = await checkEnrichmentLiveness(sqlWith({ last_attempt: null, selectable: 120, processed_24h: 0 }))
    expect(v.stalled).toBe(true)
    expect(v.reason).toMatch(/NEVER touched/)
  })

  it('SILENT when the queue is drained — idle is correct, not a fault', async () => {
    const v = await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(240), selectable: 0, processed_24h: 0 }))
    expect(v.stalled).toBe(false)
    expect(v.ok).toBe(true)
    expect(v.reason).toMatch(/idle is correct/)
  })

  it('respects the idle threshold boundary', async () => {
    expect((await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(5.5), selectable: 10, processed_24h: 3 }))).stalled).toBe(false)
    expect((await checkEnrichmentLiveness(sqlWith({ last_attempt: ago(6.5), selectable: 10, processed_24h: 3 }))).stalled).toBe(true)
  })
})
