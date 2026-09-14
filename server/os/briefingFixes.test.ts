import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readOpenCommitments } from './founderBrief'

describe('Marcus overnight false-alarm (issue #312)', () => {
  it('heartbeat pokes marcus.yml when stale and only pages after 6h', () => {
    const src = readFileSync('scripts/marcus-heartbeat.mjs', 'utf8')
    expect(src).toContain("actions/workflows/marcus.yml/dispatches")
    expect(src).toContain('ALERT_STALE_HOURS = 6')
    expect(src).toContain("JSON.stringify({ ref: 'main' })")
  })

  it('empty workflow_dispatch falls through to the scheduled picker', () => {
    const resolve = readFileSync('scripts/marcus-resolve-task.mjs', 'utf8')
    expect(resolve).toContain('Empty dispatch')
    expect(resolve).toContain('heartbeat poke')
    const workflow = readFileSync('.github/workflows/marcus.yml', 'utf8')
    expect(workflow).toMatch(/task:[\s\S]*required: false/)
    const hb = readFileSync('.github/workflows/marcus-heartbeat.yml', 'utf8')
    expect(hb).toContain('actions: write')
  })
})

describe('escalation triage is visible on the founder-brief cron', () => {
  it('cronFounderBrief includes triage result or error in JSON (no swallowed catch)', () => {
    const routes = readFileSync('server/os/routes.ts', 'utf8')
    expect(routes).toContain('cronFounderBrief')
    expect(routes).toContain('triageEscalations')
    expect(routes).toMatch(/res\.json\(\{ ok: true, triage, \.\.\.result \}\)/)
    expect(routes).not.toMatch(/await triageEscalations\(COMPANY\)\.catch\(/)
  })
})

describe('OPEN-COMMITMENTS ledger — 2026-09-14 review', () => {
  it('does not ingest the Closed section as still-open operator work', () => {
    const items = readOpenCommitments()
    expect(items.some((c) => /Merge PR #272/i.test(c.item))).toBe(false)
    expect(items.some((c) => /401 every run/i.test(c.item))).toBe(false)
    expect(items.some((c) => /mobileOptimizedTemplates/i.test(c.item))).toBe(false)
    expect(items.filter((c) => c.owner === 'founder').length).toBe(4)
    expect(items.filter((c) => c.owner === 'operator').length).toBe(1)
  })

  it('signup canary pings the live register route without creating an account', () => {
    const smoke = readFileSync('server/os/architectAgent.ts', 'utf8')
    expect(smoke).toContain('/api/auth/register')
    expect(smoke).toContain("Expected 400 from register")
  })
})
