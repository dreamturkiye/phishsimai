// PS-DMARC-WATCH-01 — pinned against the REAL first report (Microsoft, phishsimai.com,
// 2026-07-23) rather than a hand-written sample, so the classifier is tested on the actual shape
// and the actual mix of genuine sends vs gateway forwarding.
//
// The central assertion is the one that is easy to get wrong: this report is 75.9% overall pass,
// and that must NOT alert, because every failure is a recipient-side security gateway forwarding
// our own mail. A naive "pass rate < 100% => alarm" fires daily and gets ignored.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseDmarcXml, evaluate, classifySource, type DmarcSource } from './dmarcReports'

const xml = readFileSync(join(__dirname, '__fixtures__/dmarc-microsoft-2026-07-23.xml'), 'utf8')

const src = (over: Partial<DmarcSource> = {}): DmarcSource => ({
  ip: '1.2.3.4', count: 1, disposition: 'none',
  dkimAligned: 'pass', spfAligned: 'pass',
  envelopeFrom: 'send.phishsimai.com', headerFrom: 'phishsimai.com',
  dkimAuth: ['phishsimai.com(resend)=pass', 'amazonses.com(224i4yxa5dv7c2xz3womw6peuasteono)=pass'],
  spfAuth: ['send.phishsimai.com=pass'],
  ...over,
})

describe('parseDmarcXml (real Microsoft report)', () => {
  const r = parseDmarcXml(xml)
  it('reads the envelope', () => {
    expect(r.orgName).toBe('Enterprise Outlook')
    expect(r.domain).toBe('phishsimai.com')
    expect(r.policyP).toBe('none')
    expect(r.begin.toISOString()).toBe('2026-07-23T00:00:00.000Z')
  })
  it('reads every record', () => {
    expect(r.sources.length).toBe(53)
    expect(r.sources.reduce((n, s) => n + s.count, 0)).toBe(54)
  })
})

describe('evaluate — the alert threshold', () => {
  const v = evaluate(parseDmarcXml(xml))

  it('the overall pass rate is NOT 100% — 41/54 — and that is normal', () => {
    const aligned = parseDmarcXml(xml).sources
      .filter(s => s.dkimAligned === 'pass' || s.spfAligned === 'pass')
      .reduce((n, s) => n + s.count, 0)
    expect(aligned).toBe(41)
    expect(v.total).toBe(54)
  })

  it('every genuine SES-origin message passed alignment', () => {
    expect(v.sesTotal).toBe(41)
    expect(v.sesPass).toBe(41)
    expect(v.sesFailIps).toEqual([])
  })

  it('the 13 failures are classified as gateway forwarding, not unknown senders', () => {
    expect(v.gatewayTotal).toBe(13)
    expect(v.unknownTotal).toBe(0)
    expect(v.unknownIps).toEqual([])
  })

  it('DOES NOT ALERT — this is a clean report despite 75.9% overall pass', () => {
    expect(v.alert).toBe(false)
    expect(v.reasons).toEqual([])
  })
})

describe('evaluate — what SHOULD alert', () => {
  const base = parseDmarcXml(xml)

  // THE REGRESSION THIS MODULE EXISTS FOR. If our SPF record and DKIM key both break, genuine
  // sends leave real SES IPs and fail alignment. An earlier classifier bucketed those as "gateway
  // forwarding" and stayed silent — a false negative on the one break we must never miss.
  // Resolving PTR first is what fixes it, so the fix is pinned here with SES PTRs supplied.
  it('ALERTS when genuine SES IPs fail alignment (our own key/DNS break)', () => {
    const ptrs = {
      '54.240.9.9': 'a9-9.smtp-out.amazonses.com',
      '54.240.9.10': 'a9-10.smtp-out.amazonses.com',
    }
    const broken = {
      ...base,
      sources: [
        src({ ip: '54.240.9.9', count: 10 }),
        src({
          ip: '54.240.9.10', count: 5, dkimAligned: 'fail', spfAligned: 'fail',
          dkimAuth: ['phishsimai.com(resend)=fail', 'amazonses.com(sel)=fail'],
          spfAuth: ['send.phishsimai.com=fail'],
        }),
      ],
    }
    const v = evaluate(broken, ptrs)
    expect(v.sesTotal).toBe(15)
    expect(v.sesPass).toBe(10)
    expect(v.sesFailIps).toEqual(['54.240.9.10'])
    expect(v.alert).toBe(true)
    expect(v.reasons.join(' ')).toMatch(/FAILED DMARC alignment/)
  })

  it('without PTR the same break degrades to silence — which is why ingest resolves PTRs', () => {
    const broken = {
      ...base,
      sources: [src({
        ip: '54.240.9.10', count: 5, dkimAligned: 'fail', spfAligned: 'fail',
        dkimAuth: ['phishsimai.com(resend)=fail'],
      })],
    }
    expect(evaluate(broken).alert).toBe(false) // documents the fallback's known limit
  })

  it('alerts on an unrecognised sender with none of our signatures (spoofing)', () => {
    const spoof = {
      ...base,
      sources: [
        src({ ip: '54.240.9.9', count: 10 }),
        src({
          ip: '203.0.113.77', count: 8, dkimAligned: 'fail', spfAligned: 'fail',
          dkimAuth: [], spfAuth: ['evil.example=fail'], envelopeFrom: 'evil.example',
        }),
      ],
    }
    const v = evaluate(spoof)
    expect(v.alert).toBe(true)
    expect(v.unknownIps).toEqual(['203.0.113.77'])
    expect(v.unknownTotal).toBe(8)
    expect(v.reasons.join(' ')).toMatch(/UNRECOGNISED/)
  })

  it('a gateway forwarding failure alone never alerts', () => {
    const fwd = {
      ...base,
      sources: [
        src({ ip: '54.240.9.9', count: 10 }),
        src({
          ip: '3.231.237.226', count: 40, dkimAligned: 'fail', spfAligned: 'fail',
          dkimAuth: ['phishsimai.com(resend)=fail', 'amazonses.com(sel)=fail'],
          spfAuth: ['send.phishsimai.com=softfail'],
        }),
      ],
    }
    const v = evaluate(fwd)
    expect(v.gatewayTotal).toBe(40)
    expect(v.alert).toBe(false) // even at 80% of volume — forwarding is not our fault
  })
})

describe('classifySource', () => {
  it('PTR wins: an SES IP is ours even when FAILING', () => {
    const failing = src({ dkimAligned: 'fail', spfAligned: 'fail', dkimAuth: ['phishsimai.com(resend)=fail'] })
    expect(classifySource(failing, 'a9-9.smtp-out.amazonses.com')).toBe('ses')
  })
  it('PTR wins: a known security gateway is forwarding', () => {
    const failing = src({ dkimAligned: 'fail', spfAligned: 'fail', dkimAuth: ['phishsimai.com(resend)=fail'] })
    for (const ptr of ['ipw-outbound.inkyphishfence.com', 'dispatch1-us1.ppe-hosted.com', 'us.cloud-sec-av.com']) {
      expect(classifySource(failing, ptr)).toBe('gateway')
    }
  })
  it('no PTR: aligned + our DKIM => ses', () => {
    expect(classifySource(src())).toBe('ses')
  })
  it('no PTR: our DKIM but broken => gateway (assumed forwarding)', () => {
    expect(classifySource(src({ dkimAligned: 'fail', spfAligned: 'fail', dkimAuth: ['phishsimai.com(resend)=fail'] }))).toBe('gateway')
  })
  it('no signature of ours => unknown, regardless of what it claims', () => {
    expect(classifySource(src({ dkimAligned: 'fail', spfAligned: 'fail', dkimAuth: [], spfAuth: [] }))).toBe('unknown')
  })
})
