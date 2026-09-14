import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  harvestScanCap,
  harvestShouldStop,
  parseMspHubProfileHtml,
  HARVEST_SCAN_CAP_MAX,
} from './mspHubHarvest'

const JSON_LD = `<script type="application/ld+json">{"@type":"LocalBusiness","name":"Fresh Managed IT","url":"https://www.freshmanagedit.com"}</script>`

describe('msp hub harvest — do not burn the cursor on noDomain', () => {
  it('parses JSON-LD LocalBusiness.url and strips www', () => {
    const r = parseMspHubProfileHtml(JSON_LD)
    expect(r).toEqual({ domain: 'freshmanagedit.com', name: 'Fresh Managed IT' })
  })

  it('falls back to Website link when JSON-LD has no external url (live noDomain:50)', () => {
    const html = `<html><a href="https://acme-msp.com">Website</a></html>`
    expect(parseMspHubProfileHtml(html)).toEqual({ domain: 'acme-msp.com', name: null })
  })

  it('ignores mymsphub itself', () => {
    const html = `<script type="application/ld+json">{"@type":"LocalBusiness","url":"https://mymsphub.com/msp/company/x"}</script>`
    expect(parseMspHubProfileHtml(html)).toBeNull()
  })

  it('scan cap walks past a 50-listing noDomain streak instead of stopping at perRun', () => {
    expect(harvestScanCap(50)).toBeGreaterThan(50)
    expect(harvestScanCap(50)).toBeLessThanOrEqual(HARVEST_SCAN_CAP_MAX)
    expect(harvestShouldStop({
      domainsQueued: 0, queueTarget: 50, scanned: 50, scanCap: harvestScanCap(50),
      elapsedMs: 1000, timeBudgetMs: 240_000,
    })).toBe(false)
    expect(harvestShouldStop({
      domainsQueued: 50, queueTarget: 50, scanned: 12, scanCap: harvestScanCap(50),
      elapsedMs: 1000, timeBudgetMs: 240_000,
    })).toBe(true)
  })

  it('harvestMspHub walks scanCap and still queues on noDomain skips', () => {
    const src = readFileSync('server/os/agents/mspHubHarvest.ts', 'utf8')
    expect(src).toContain('harvestScanCap')
    expect(src).toContain('parseMspHubProfileHtml')
    expect(src).not.toMatch(/urls\.slice\(cursor, cursor \+ perRun\)/)
  })
})
