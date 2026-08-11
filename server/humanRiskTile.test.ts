// PS-HUMAN-RISK-01 tile — the QBR number, honest about null.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
const DASH = fs.readFileSync('client/src/pages/Dashboard.tsx', 'utf8')

describe('the Human Risk tile surfaces the honest composite', () => {
  it('queries analytics.humanRisk (the #102 composite)', () => {
    expect(DASH).toContain('trpc.analytics.humanRisk.useQuery')
  })
  it('null score reads "Not enough data yet" — never a fabricated number', () => {
    expect(DASH).toContain('humanRisk?.score == null')
    expect(DASH).toContain('Not enough data yet')
  })
  it('shows the "N of 3 dimensions" honesty, never implies a full composite falsely', () => {
    expect(DASH).toContain('of {humanRisk.total} dimensions measured')
  })
  it('never coalesces the score to 0 (the posture-50 defect class)', () => {
    expect(DASH).not.toMatch(/humanRisk\??\.score \?\? 0/)
  })
})
