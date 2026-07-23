// PS-CRON-ORDER-01 — the daily autonomy chain has a REAL ordering dependency that lives entirely
// in vercel.json, where nothing can express it (strict JSON, no comments) and nothing enforces it.
//
// The chain, and why each link matters:
//
//   06:00  /api/os/metrics-snapshot   writes metrics_daily for YESTERDAY
//   06:30  ...autonomy?action=compute judges YESTERDAY — posture check 8 requires that row, and
//                                     a missing snapshot is `unmeasured`, which is NOT clean
//   06:40  /api/os/autonomy-promote   reads the finalized clean day
//   08:00  /api/os/janet              daily standup renders the posture line from the judged day
//
// This got shipped wrong: compute ran at 00:10 and judged a day whose snapshot did not land until
// 06:00 — 5h50m LATER. Every day came back `unmeasured` → never clean → the L5.7 five-clean-day
// gate was unreachable, on a reason that had nothing to do with the product's behaviour. v1's
// computeCleanDay had no metrics check and scored those days clean, which is why the break stayed
// invisible until PS-POSTURE-01 switched the cron to v2 recordDay.
//
// These tests fail the build if anyone reschedules a link out of order.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const vercel = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'))
const crons: Array<{ path: string; schedule: string }> = vercel.crons

/** Minute-of-day for a `M H * * *` daily cron. Throws for anything not daily-at-a-fixed-time. */
function minuteOfDay(schedule: string): number {
  const [m, h, dom, mon, dow] = schedule.split(/\s+/)
  if (dom !== '*' || mon !== '*' || dow !== '*') throw new Error(`not a daily cron: ${schedule}`)
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) throw new Error(`not a fixed time: ${schedule}`)
  return Number(h) * 60 + Number(m)
}

const at = (needle: string): number => {
  const hit = crons.filter((c) => c.path.includes(needle))
  expect(hit, `expected exactly one cron matching ${needle}`).toHaveLength(1)
  return minuteOfDay(hit[0].schedule)
}

// vercel.json caps this function at 300s, so no cron can overrun its slot by more than 5 minutes.
const MAX_DURATION_MIN = Math.ceil(vercel.functions['api/index.js'].maxDuration / 60)

describe('daily autonomy cron ordering (PS-CRON-ORDER-01)', () => {
  it('metrics snapshot lands BEFORE the clean-day compute that requires it', () => {
    // The bug: this was 06:00 vs 00:10 — compute ran first and judged every day unmeasured.
    expect(at('metrics-snapshot')).toBeLessThan(at('autonomy?action=compute'))
  })

  it('compute finishes before promote starts — the gap exceeds the function timeout', () => {
    const compute = at('autonomy?action=compute')
    const promote = at('autonomy-promote')
    expect(promote).toBeGreaterThan(compute)
    // Not "they are in order" but "compute CANNOT still be running": the platform kills it at
    // maxDuration, so a gap wider than that is a hard guarantee rather than a hopeful one.
    expect(promote - compute).toBeGreaterThan(MAX_DURATION_MIN)
  })

  it('the compute→promote gap also clears the metrics snapshot ahead of it', () => {
    expect(at('autonomy?action=compute') - at('metrics-snapshot')).toBeGreaterThan(MAX_DURATION_MIN)
  })

  it('the judged day is ready before the standup that renders the posture line', () => {
    // runDailyStandup() calls evaluatePosture() and prints postureLine() into the Telegram
    // standup. Judged after the standup = the founder reads yesterday's posture every morning.
    expect(at('autonomy?action=compute')).toBeLessThan(at('/api/os/janet'))
    expect(at('autonomy-promote')).toBeLessThan(at('/api/os/janet'))
  })

  it('the whole chain runs on the same UTC day (no wrap past midnight)', () => {
    // Each link judges "yesterday" from its own wall clock. If the chain straddled midnight the
    // links would disagree about which day they are talking about.
    const chain = [at('metrics-snapshot'), at('autonomy?action=compute'), at('autonomy-promote'), at('/api/os/janet')]
    expect(chain).toEqual([...chain].sort((a, b) => a - b))
    expect(Math.max(...chain)).toBeLessThan(24 * 60)
  })
})
