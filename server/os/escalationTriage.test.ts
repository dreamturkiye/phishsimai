import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isOperatorOwnedEscalation } from './escalationTriagePolicy'

describe('operator-owned escalations are not founder legal decisions', () => {
  it('owns protected-path preflight refusals', () => {
    expect(isOperatorOwnedEscalation({
      category: 'breaker_trip',
      payload: { last_error: 'PRE-FLIGHT REFUSED: task names protected path(s) server/os/routes.ts' },
      created_at: '2026-08-24T17:51:58.431Z',
    })).toBe(true)
  })

  it('owns week-old Grok format-mismatch trips', () => {
    expect(isOperatorOwnedEscalation({
      category: 'breaker_trip',
      payload: { last_error: 'Grok output format mismatch (finish=stop)' },
      created_at: '2026-08-24T17:56:42.478Z',
    })).toBe(true)
  })

  it('does not swallow a fresh pricing or spend decision', () => {
    expect(isOperatorOwnedEscalation({
      category: 'breaker_trip',
      payload: { last_error: 'founder must approve a new Stripe product' },
      created_at: new Date().toISOString(),
    })).toBe(false)
  })

  it('auto-resolves operator-owned rows and closes the breaker before re-paging', () => {
    const src = readFileSync('server/os/escalationTriage.ts', 'utf8')
    expect(src).toContain('isOperatorOwnedEscalation')
    expect(src).toContain("SET state='closed'")
    const already = src.indexOf("if (already === 'founder_required')")
    const owned = src.indexOf('if (isOperatorOwnedEscalation(row))')
    expect(owned).toBeGreaterThan(-1)
    expect(already).toBeGreaterThan(owned)
  })
})
