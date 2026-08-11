// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEDUPE-01 — task title normalisation.
//
//  os6Autonomy appends "- ${today}" to every title it builds, then deduped with an
//  EXACT-match `title=${title}` compare. That compare could never match yesterday's
//  row, so the same decision was minted every single day. intelligenceFinance had no
//  check at all. Prod showed the result: Finn and Scout drew byte-identical work on
//  2026-07-22 and again on 2026-07-23.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { normalizeTaskTitle } from './kaan_os_v4'

describe('normalizeTaskTitle — the os6 date-suffix bug', () => {
  it('collapses the same os6 decision issued on two different days', () => {
    const a = 'OS 6.0 weekly security awareness ICP sweep - 2026-07-22'
    const b = 'OS 6.0 weekly security awareness ICP sweep - 2026-07-23'
    expect(normalizeTaskTitle(a)).toBe(normalizeTaskTitle(b))
  })

  it('handles the separator styles the loops actually emit', () => {
    const base = 'OS 6.0 paid conversion and packaging review'
    const variants = [
      `${base} - 2026-07-23`,
      `${base} — 2026-07-23`,
      `${base} (2026-07-23)`,
      `${base} 2026/07/23`,
    ]
    for (const v of variants) expect(normalizeTaskTitle(v)).toBe(normalizeTaskTitle(base))
  })

  it('collapses the fixed intelligenceFinance titles across runs', () => {
    // These are pushed unconditionally every cycle and truncated to 80 chars by the caller.
    const t = '30-day revenue forecast with best/base/worst scenarios — highlight risks to Kaan'
    expect(normalizeTaskTitle(t)).toBe(normalizeTaskTitle(t.slice(0, 80)))
  })

  it('ignores case, punctuation and whitespace noise', () => {
    expect(normalizeTaskTitle('  Trend  Scan:  emerging   signals!! ')).toBe(
      normalizeTaskTitle('trend scan - emerging signals'),
    )
  })
})

describe('normalizeTaskTitle — must NOT over-collapse', () => {
  it('keeps genuinely different tasks distinct', () => {
    expect(normalizeTaskTitle('Unit economics review: LTV/CAC update'))
      .not.toBe(normalizeTaskTitle('30-day revenue forecast with scenarios'))
  })

  it('does not strip a date that is part of the task itself', () => {
    // A trailing stamp is a stamp; a leading/embedded date is content.
    expect(normalizeTaskTitle('Reconcile the 2026-07-01 invoice batch'))
      .not.toBe(normalizeTaskTitle('Reconcile the invoice batch'))
  })

  it('keeps per-agent scoping possible by returning a stable non-empty key', () => {
    expect(normalizeTaskTitle('Outbound pipeline refresh')).toBe('outbound pipeline refresh')
  })

  it('returns empty for junk so a blank title can never dedupe against another', () => {
    expect(normalizeTaskTitle('')).toBe('')
    expect(normalizeTaskTitle('   ---  ')).toBe('')
  })
})
