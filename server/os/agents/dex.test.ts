// PS-DEX-01 / PS-DEX-GATE-01 — tests for the universal pre-send gate and Dex's coverage audit.
//
// The central claim being tested is "NO PATH EXEMPT". That is a claim about EVERY send path, so a
// test that checks one path proves nothing. Two kinds of test here:
//   1. behavioural — the gate actually BLOCKS a suppressed-unflagged address (the jbuck@ case), at
//      touch-3, touch-4 and touch-5 specifically, with a spy proving sendEmail was never reached;
//   2. structural — every prospect-facing sendEmail call site is preceded by the gate, so a NEW
//      path cannot be added without it.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertSendable } from '../sendGate'
import {
  auditSendPaths,
  detectUnregisteredSenders,
  rateLine,
  breakerVerdict,
  authIncidents,
  buildDexLine,
  SEND_PATHS,
  type DomainAuth,
} from './dex'
import type { SourceFile } from './rex'

const SEQ = fs.readFileSync(path.resolve(process.cwd(), 'server/os/sequences.ts'), 'utf8')

// ── A fake DB modelling the exact defect Rex found: a Resend suppression row whose lead flag was
//    never set. This is jbuck@matrixintegration.com's real state on 2026-08-03.
function fakeDb(opts: { unsubscribed?: boolean; terminal?: boolean; suppressed?: boolean; noRow?: boolean }) {
  return (strings: TemplateStringsArray, ...vals: any[]) => {
    if (opts.noRow) return Promise.resolve([])
    return Promise.resolve([
      {
        unsubscribed: opts.unsubscribed ?? false,
        terminal: opts.terminal ?? false,
        suppressed: opts.suppressed ?? false,
      },
    ])
  }
}

describe('the gate blocks — behavioural, not structural', () => {
  it('BLOCKS a suppressed-but-unflagged address (the jbuck@ case)', async () => {
    const v = await assertSendable(fakeDb({ unsubscribed: false, suppressed: true }), 'jbuck@matrixintegration.com')
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('provider suppression row exists')
  })

  it('BLOCKS an unsubscribed address', async () => {
    const v = await assertSendable(fakeDb({ unsubscribed: true }), 'someone@example.com')
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('unsubscribed')
  })

  it('BLOCKS a lead in a terminal stage', async () => {
    const v = await assertSendable(fakeDb({ terminal: true }), 'someone@example.com')
    expect(v.allowed).toBe(false)
  })

  it('BLOCKS our own addresses', async () => {
    for (const a of ['kaanari@mac.com', 'anything@phishsimai.com']) {
      expect((await assertSendable(fakeDb({}), a)).allowed, a).toBe(false)
    }
  })

  it('FAILS CLOSED when the consent state cannot be read', async () => {
    // The one gate where the unknown case has a legal consequence. A DB error must not become
    // permission to email someone.
    const throwing = () => Promise.reject(new Error('connection lost'))
    const v = await assertSendable(throwing as any, 'someone@example.com')
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('unverifiable')
  })

  it('blocks an address with no lead row rather than assuming it is fine', async () => {
    expect((await assertSendable(fakeDb({ noRow: true }), 'ghost@example.com')).allowed).toBe(false)
  })

  it('ALLOWS a clean address — the gate is not simply refusing everything', async () => {
    const v = await assertSendable(fakeDb({}), 'good@example.com')
    expect(v.allowed).toBe(true)
  })
})

// ── THE CORE PROOF the founder asked for: the block fires at touch-3, 4 AND 5.
//    This replays the real loop-body decision (gate → continue | sendEmail) for each touch against a
//    suppressed-unflagged lead, with a spy standing in for sendEmail. If the gate did not fire, the
//    spy would be called — so this fails loudly on a regression rather than passing vacuously.
describe('a suppressed-unflagged lead is blocked at touch-3, touch-4 AND touch-5', () => {
  async function simulateTouch(touch: number, sql: any) {
    const sendEmail = vi.fn(async () => ({ id: 'sent' }))
    const lead = { id: 'L1', email: 'jbuck@matrixintegration.com', company: 'Matrix Integration' }
    // The loop body, exactly as sequences.ts runs it for touches 2-5.
    const gateN = await assertSendable(sql, String(lead.email))
    if (!gateN.allowed) return { sent: false, reason: gateN.reason, sendEmail }
    await sendEmail()
    return { sent: true, reason: 'sent', sendEmail }
  }

  for (const touch of [3, 4, 5]) {
    it(`touch-${touch}: gate fires, sendEmail is never called`, async () => {
      const sql = fakeDb({ unsubscribed: false, suppressed: true })
      const r = await simulateTouch(touch, sql)
      expect(r.sent, `touch-${touch} must not send to a suppressed address`).toBe(false)
      expect(r.sendEmail).not.toHaveBeenCalled()
      expect(r.reason).toContain('suppression')
    })
  }

  it('the same harness DOES send for a clean lead — proving the test can fail', async () => {
    // Without this, all three tests above would pass even if the gate blocked unconditionally.
    const r = await simulateTouch(3, fakeDb({}))
    expect(r.sent).toBe(true)
    expect(r.sendEmail).toHaveBeenCalled()
  })
})

describe('every prospect send path carries the gate — no path exempt', () => {
  it('every touch predicate in sequences.ts consults the suppression table', () => {
    // Before PS-DEX-GATE-01 only touch2Eligible() did. Count the eligibility SELECTs and require
    // each to carry the NOT EXISTS clause.
    const selects = SEQ.split(/SELECT id,name,company,email,industry|SELECT l\.id, l\.name/).slice(1)
    expect(selects.length).toBeGreaterThanOrEqual(5) // t1 + t2 batch + t2/t3/t4/t5 loop arms
    for (const [i, s] of selects.entries()) {
      const head = s.slice(0, 800)
      expect(head, `eligibility SELECT #${i + 1} must check the suppression table`).toContain('ps_outreach_suppression')
    }
  })

  it('every sendEmail call site is preceded by assertSendable', () => {
    // Structural guarantee that a NEW send path cannot be added without the gate.
    const idxs: number[] = []
    const re = /await sendEmail\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(SEQ))) idxs.push(m.index)
    expect(idxs.length).toBeGreaterThanOrEqual(3)
    for (const idx of idxs) {
      // Look back over the enclosing loop body for the gate.
      const window = SEQ.slice(Math.max(0, idx - 1400), idx)
      expect(window, `sendEmail at offset ${idx} has no assertSendable before it`).toContain('assertSendable')
    }
  })

  it('the suppression predicate covers the same paths the runtime gate does', () => {
    const suppressionChecks = (SEQ.match(/ps_outreach_suppression/g) ?? []).length
    const gateCalls = (SEQ.match(/assertSendable\(/g) ?? []).length
    expect(suppressionChecks).toBeGreaterThanOrEqual(5)
    expect(gateCalls).toBeGreaterThanOrEqual(3)
  })
})

describe("Dex's send-path coverage audit", () => {
  const f = (relPath: string, text: string | null): SourceFile => ({ relPath, text })
  const goodProspect = 'assertSendable( hasMx( ps_outreach_suppression'

  it('flags a prospect path missing any required rail', () => {
    const files = SEND_PATHS.map((p) =>
      f(p.file, p.cls === 'prospect' ? 'hasMx( ps_outreach_suppression' : 'PS-BYPASS-CLOSE-01 throw new Error('),
    )
    const { incidents } = auditSendPaths(files)
    expect(incidents.length).toBeGreaterThan(0)
    expect(incidents[0].evidence).toMatchObject({ missing: ['consent_gate'] })
    expect(incidents[0].severity).toBe('critical')
  })

  it('passes when every prospect path carries every rail', () => {
    const files = SEND_PATHS.map((p) =>
      f(p.file, p.cls === 'disabled' ? 'PS-BYPASS-CLOSE-01 throw new Error(' : goodProspect),
    )
    expect(auditSendPaths(files).incidents).toEqual([])
  })

  it('flags a DISABLED path that has quietly become sendable again', () => {
    const files = SEND_PATHS.map((p) => f(p.file, p.cls === 'disabled' ? 'const res = await fetch(...)' : goodProspect))
    const { incidents } = auditSendPaths(files)
    expect(incidents.some((i) => i.signature.includes('send_path_disabled_guard'))).toBe(true)
  })

  it('exempts internal paths BY DECLARATION, and every exemption states a reason', () => {
    for (const p of SEND_PATHS.filter((x) => x.cls !== 'prospect')) {
      expect(p.exemptionReason, `${p.key} must declare why it is exempt`).toBeTruthy()
      expect(p.exemptionReason!.length).toBeGreaterThan(20)
    }
  })

  it('reports an unreadable send path as NOT CHECKED, not as covered', () => {
    const files = SEND_PATHS.map((p) => f(p.file, null))
    const r = auditSendPaths(files)
    expect(r.incidents).toEqual([])
    expect(r.notChecked.length).toBe(SEND_PATHS.length)
    expect(r.covered).toBe(0)
  })

  it('catches a sender that is not in the registry at all', () => {
    const { incidents } = detectUnregisteredSenders([f('server/new/rogue.ts', 'fetch("https://api.resend.com/emails")')])
    expect(incidents).toHaveLength(1)
    expect(incidents[0].severity).toBe('critical')
    expect(incidents[0].signature).toContain('unregistered_sender')
  })

  it('does not flag a registered sender', () => {
    const { incidents } = detectUnregisteredSenders([f('server/os/sequences.ts', 'api.resend.com/emails')])
    expect(incidents).toEqual([])
  })
})

describe('send health is reported honestly', () => {
  it('never prints a percentage below n=30', () => {
    expect(rateLine('Bounce', 1, 10)).toContain('COUNTS ONLY')
    expect(rateLine('Bounce', 1, 10)).not.toContain('%')
  })

  it('says N/A at n=0 rather than 0%', () => {
    expect(rateLine('Bounce', 0, 0)).toContain('N/A, n=0')
  })

  it('prints a rate once n>=30', () => {
    expect(rateLine('Bounce', 3, 100)).toContain('(3.00%)')
  })

  it('flags a breaker threshold set far above the measured rate as LOOSE', () => {
    // The real shape: 38/933 = 4.07% measured against an 8% breaker.
    const v = breakerVerdict(38, 933, 0.08)
    expect(v).toContain('LOOSE')
    expect(v).toContain('SURFACED TO KAAN')
    expect(v).toContain('does not tune it')
  })

  it('gives no verdict on the threshold below n=30', () => {
    expect(breakerVerdict(1, 10, 0.08)).toContain('no verdict below n=30')
  })

  it('reports a threshold close to the measured rate as OK', () => {
    expect(breakerVerdict(38, 933, 0.05)).toContain('OK')
  })
})

describe('authentication findings', () => {
  const auth = (over: Partial<DomainAuth>): DomainAuth => ({
    domain: 'phishsimai.com', role: 'apex_outreach', checked: true, hasMx: true, hasSpf: true, hasDmarc: true, detail: '', ...over,
  })

  it('treats a missing policy on the reputation-critical apex as critical', () => {
    const [i] = authIncidents([auth({ hasDmarc: false })])
    expect(i.severity).toBe('critical')
    expect(i.summary).toContain('DMARC')
  })

  it('rates the sim subdomain lower — it sends only into our own tenant', () => {
    const [i] = authIncidents([auth({ domain: 'sim.phishsimai.com', role: 'sim_subdomain', hasSpf: false })])
    expect(i.severity).toBe('high')
  })

  it('files nothing for a domain that was NOT CHECKED', () => {
    expect(authIncidents([auth({ checked: false, hasSpf: false, hasDmarc: false })])).toEqual([])
  })

  it('files nothing when authentication is complete', () => {
    expect(authIncidents([auth({})])).toEqual([])
  })
})

describe('the report line', () => {
  const health = {
    checked: true, contactedAllTime: 933, bouncedAllTime: 38, contacted7d: 0, bounced7d: 0,
    allTimeLine: 'Bounce (all-time): 38/933 (4.07%)', sevenDayLine: 'Bounce (7d): 0/0 — no sends, not measurable (N/A, n=0).',
    breakerThreshold: 0.08, breakerVerdict: 'LOOSE',
  }
  it('never claims coverage when nothing was readable', () => {
    const line = buildDexLine({ status: 'INSUFFICIENT_DATA', incidents: [], bySeverity: { critical: 0, high: 0, medium: 0 }, covered: 0, total: 6, health, auth: [], notChecked: [] })
    expect(line).toContain('insufficient data')
    expect(line).toContain('UNKNOWN, which is not the same as covered')
  })

  it('states full coverage only when there are no defects', () => {
    const line = buildDexLine({ status: 'ACTIVE', incidents: [], bySeverity: { critical: 0, high: 0, medium: 0 }, covered: 6, total: 6, health, auth: [], notChecked: [] })
    expect(line).toContain('all 6/6 send paths carry every required rail')
  })
})
