import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  harvestScanCap,
  harvestShouldStop,
  harvestNextCursor,
  hostFromListing,
  parseMspHubProfileHtml,
  HARVEST_EMPTY_SCAN_CAP,
  HARVEST_SCAN_CAP_MAX,
} from './mspHubHarvest'

const LIVE_DIRECTORY_JSONLD = `<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","url":"https://mymsphub.com/msp/company/fresh-managed-it"},
  {"@type":"LocalBusiness","name":"Fresh Managed IT","url":"https://mymsphub.com/msp/company/fresh-managed-it"}
]}
</script>
<img src="https://www.google.com/s2/favicons?domain=freshmanagedit.com&amp;sz=128" alt="Fresh Managed IT">
<img src="https://www.google.com/s2/favicons?domain=bhamtechwiz.com&amp;sz=128" alt="related">`

describe('msp hub harvest — extract real domains after directory-url change', () => {
  it('parses legacy JSON-LD LocalBusiness.url and strips www', () => {
    const html = `<script type="application/ld+json">{"@type":"LocalBusiness","name":"Fresh Managed IT","url":"https://www.freshmanagedit.com"}</script>`
    expect(parseMspHubProfileHtml(html)).toEqual({ domain: 'freshmanagedit.com', name: 'Fresh Managed IT' })
  })

  it('does not treat mymsphub profile url as the company domain (live noDomain:400)', () => {
    const html = `<script type="application/ld+json">{"@type":"LocalBusiness","url":"https://mymsphub.com/msp/company/x","name":"X"}</script>`
    expect(parseMspHubProfileHtml(html)).toBeNull()
  })

  it('takes the FIRST google favicon domain — not related-MSP favicons', () => {
    const r = parseMspHubProfileHtml(LIVE_DIRECTORY_JSONLD)
    expect(r?.domain).toBe('freshmanagedit.com')
    expect(r?.name).toBe('Fresh Managed IT')
  })

  it('walks @graph LocalBusiness and still rejects directory urls', () => {
    expect(hostFromListing('https://mymsphub.com/msp/company/x')).toBeNull()
    expect(hostFromListing('freshmanagedit.com')).toBe('freshmanagedit.com')
    expect(hostFromListing('https://www.cullumtech.com')).toBe('cullumtech.com')
  })

  it('falls back to Website link when present', () => {
    const html = `<html><a href="https://acme-msp.com">Website</a></html>`
    expect(parseMspHubProfileHtml(html)).toEqual({ domain: 'acme-msp.com', name: null })
  })

  it('does not stop at 400 empty scans — that wasted cursor 3500→3900', () => {
    expect(harvestScanCap(50)).toBeLessThanOrEqual(HARVEST_SCAN_CAP_MAX)
    expect(harvestShouldStop({
      domainsQueued: 0, queueTarget: 50, scanned: 400, scanCap: harvestScanCap(50),
      elapsedMs: 1000, timeBudgetMs: 240_000,
    })).toBe(false)
    expect(harvestShouldStop({
      domainsQueued: 0, queueTarget: 50, scanned: HARVEST_EMPTY_SCAN_CAP, scanCap: harvestScanCap(50),
      elapsedMs: 1000, timeBudgetMs: 240_000,
    })).toBe(true)
    expect(harvestShouldStop({
      domainsQueued: 50, queueTarget: 50, scanned: 12, scanCap: harvestScanCap(50),
      elapsedMs: 1000, timeBudgetMs: 240_000,
    })).toBe(true)
  })

  it('wraps to sitemap head after a 1200-listing parser desert (live domainsQueued=0)', () => {
    const desert = harvestNextCursor({
      cursorFrom: 4800, processed: HARVEST_EMPTY_SCAN_CAP, total: 12_500,
      domainsQueued: 0, noDomain: HARVEST_EMPTY_SCAN_CAP, alreadyQueued: 0,
    })
    expect(desert).toEqual({ cursorTo: 0, wrapped: true })
    const alreadyQueuedWindow = harvestNextCursor({
      cursorFrom: 4800, processed: HARVEST_EMPTY_SCAN_CAP, total: 12_500,
      domainsQueued: 0, noDomain: 0, alreadyQueued: HARVEST_EMPTY_SCAN_CAP,
    })
    expect(alreadyQueuedWindow.wrapped).toBe(false)
    expect(alreadyQueuedWindow.cursorTo).toBe(4800 + HARVEST_EMPTY_SCAN_CAP)
    const endOfList = harvestNextCursor({
      cursorFrom: 12_000, processed: 600, total: 12_500,
      domainsQueued: 2, noDomain: 10, alreadyQueued: 0,
    })
    expect(endOfList).toEqual({ cursorTo: 0, wrapped: true })
  })

  it('harvest path uses favicon + empty-scan continue', () => {
    const src = readFileSync('server/os/agents/mspHubHarvest.ts', 'utf8')
    expect(src).toContain('s2/favicons')
    expect(src).toContain('HARVEST_EMPTY_SCAN_CAP')
    expect(src).toContain('parseMspHubProfileHtml')
    expect(src).toContain('harvestNextCursor')
  })
})
