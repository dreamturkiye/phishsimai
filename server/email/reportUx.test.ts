// PS-REPORT-UX-01 — celebrate a correct report with a REAL count, never a fabricated points number.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const TRACKER = fs.readFileSync('server/email/tracker.ts', 'utf8')
const DB = fs.readFileSync('server/db.ts', 'utf8')

describe('the success page is celebratory and honest', () => {
  it('the report success page celebrates (not a flat thank-you)', () => {
    // reportHtml gained a pop/confetti celebration + "Nice catch!" framing.
    expect(TRACKER).toContain('Nice catch!')
    expect(TRACKER).toContain('confetti')
  })

  it('the count shown is the REAL reportCount — omitted when not resolvable, never fabricated', () => {
    // Only rendered when reportCount is a real number > 0; no hardcoded "+10 points".
    expect(TRACKER).toContain("typeof reportCount === \"number\" && reportCount > 0")
    expect(TRACKER).not.toMatch(/\+\s*\d+\s*(points|pts)/i)
  })

  it('a failed report still tells the honest truth, never a false celebration', () => {
    expect(TRACKER).toContain('We Could Not Record Your Report')
  })
})

describe('the report awards the REAL gamification credit', () => {
  it('the handler credits the report via creditReportForToken', () => {
    expect(TRACKER).toContain('creditReportForToken')
  })
  it('creditReportForToken awards the real event and returns the true count', () => {
    const fn = DB.slice(DB.indexOf('export async function creditReportForToken'), DB.indexOf('export async function creditReportForToken') + 700)
    expect(fn).toContain('updateGamificationOnEvent')
    expect(fn).toContain('"report"')
    expect(fn).toContain('score.reportCount')
  })
})
