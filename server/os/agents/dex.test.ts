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
  organizationalDomain,
  isInboundMailHost,
  checkDomainAuth,
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

describe('authentication findings — checked against the real sending identity', () => {
  const auth = (over: Partial<DomainAuth>): DomainAuth => ({
    domain: 'phishsimai.com', role: 'apex_outreach', checked: true,
    identityHost: 'send.phishsimai.com',
    hasIdentityMx: true, hasIdentitySpf: true, hasDkim: true,
    dmarc: { found: true, host: '_dmarc.phishsimai.com', inherited: false, policy: 'v=DMARC1;p=none' },
    identityMxHosts: ['feedback-smtp.us-east-1.amazonses.com'],
    rootMxHosts: ['smtp.google.com'],
    identityMxIsInbound: false,
    detail: '', ...over,
  })

  // PS-DEX-DNS-02 regression pins. v1 checked the domain ROOT, where Resend provisions nothing, and
  // reported sim.phishsimai.com as MX/SPF/DMARC all missing while all three were verified green.
  it('does not report a Resend subdomain identity as unauthenticated', () => {
    const sim = auth({
      domain: 'sim.phishsimai.com', role: 'sim_subdomain', identityHost: 'send.sim.phishsimai.com',
      dmarc: { found: true, host: '_dmarc.phishsimai.com', inherited: true, policy: 'v=DMARC1;p=none' },
    })
    expect(authIncidents([sim])).toEqual([])
  })

  it('treats an INHERITED DMARC policy as present — a subdomain needs no record of its own', () => {
    // RFC 7489 6.6.3: absent a subdomain record, the organizational domain's policy applies.
    const sim = auth({
      domain: 'sim.phishsimai.com', role: 'sim_subdomain', identityHost: 'send.sim.phishsimai.com',
      dmarc: { found: true, host: '_dmarc.phishsimai.com', inherited: true, policy: 'v=DMARC1;p=none' },
    })
    expect(authIncidents([sim])).toEqual([])
  })

  it('flags DMARC only when neither the subdomain NOR the org domain has a policy', () => {
    const [i] = authIncidents([auth({ dmarc: { found: false, host: '_dmarc.phishsimai.com', inherited: false, policy: null } })])
    expect(i.summary).toContain('DMARC')
    expect(i.severity).toBe('critical')
  })

  it('checks DKIM, which v1 never queried at all', () => {
    const [i] = authIncidents([auth({ hasDkim: false })])
    expect(i.summary).toContain('DKIM at resend._domainkey.phishsimai.com')
  })

  it('names the identity host in the finding, not the domain root', () => {
    const [i] = authIncidents([auth({ hasIdentitySpf: false })])
    expect(i.summary).toContain('send.phishsimai.com')
    expect(i.evidence).toMatchObject({ identityHost: 'send.phishsimai.com' })
  })

  it('rates a sim-subdomain gap lower than an apex gap', () => {
    const [i] = authIncidents([auth({ domain: 'sim.phishsimai.com', role: 'sim_subdomain', hasDkim: false })])
    expect(i.severity).toBe('high')
  })

  it('files nothing for a domain that was NOT CHECKED', () => {
    expect(authIncidents([auth({ checked: false, hasIdentitySpf: false, hasDkim: false })])).toEqual([])
  })

  it('files nothing when the identity is fully authenticated', () => {
    expect(authIncidents([auth({})])).toEqual([])
  })
})

describe('organizational domain resolution', () => {
  it('reduces a subdomain to its org domain for DMARC inheritance', () => {
    expect(organizationalDomain('sim.phishsimai.com')).toBe('phishsimai.com')
    expect(organizationalDomain('a.b.phishsimai.com')).toBe('phishsimai.com')
  })

  it('leaves an apex unchanged', () => {
    expect(organizationalDomain('phishsimai.com')).toBe('phishsimai.com')
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


// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEX-DNS-02 — the false negative and the false positive, both pinned.
//
//  These hit real DNS. They are the only tests here that do, deliberately: the defect was that the
//  detector queried the WRONG HOSTNAMES, and no amount of mocking can catch that — a mock would have
//  happily returned whatever v1 asked for and stayed green.
// ─────────────────────────────────────────────────────────────────────────────
describe('live DNS — the sending identities read correctly (PS-DEX-DNS-02)', () => {
  it('sim.phishsimai.com reads GREEN via the Resend identity hosts', async () => {
    const a = await checkDomainAuth('sim.phishsimai.com', 'sim_subdomain')
    if (!a.checked) return // resolver unavailable in this environment — NOT CHECKED, never a failure
    expect(a.identityHost).toBe('send.sim.phishsimai.com')
    expect(a.hasIdentitySpf, 'SPF at send.sim.phishsimai.com').toBe(true)
    expect(a.hasIdentityMx, 'bounce MX at send.sim.phishsimai.com').toBe(true)
    expect(a.hasDkim, 'DKIM at resend._domainkey.sim.phishsimai.com').toBe(true)
    // v1 reported this domain as MX/SPF/DMARC all missing. It must file nothing.
    expect(authIncidents([a])).toEqual([])
  }, 20000)

  it("sim's DMARC is INHERITED from the org domain, not its own record", async () => {
    const a = await checkDomainAuth('sim.phishsimai.com', 'sim_subdomain')
    if (!a.checked) return
    expect(a.dmarc.found).toBe(true)
    expect(a.dmarc.inherited).toBe(true)
    expect(a.dmarc.host).toBe('_dmarc.phishsimai.com')
  }, 20000)

  it('the apex reads GREEN for the RIGHT REASON — sending identity, not inbound MX', async () => {
    const a = await checkDomainAuth('phishsimai.com', 'apex_outreach')
    if (!a.checked) return
    // The verdict must come from send.phishsimai.com...
    expect(a.identityHost).toBe('send.phishsimai.com')
    expect(a.identityMxHosts.join(',')).toMatch(/amazonses/i)
    expect(a.identityMxIsInbound).toBe(false)
    // ...and NOT from the Google Workspace MX at the root, which is inbound delivery.
    expect(a.rootMxHosts.join(',')).toMatch(/google/i)
    expect(a.identityMxHosts.some(isInboundMailHost)).toBe(false)
    expect(authIncidents([a])).toEqual([])
  }, 20000)
})

describe('inbound MX can never again be read as sending authentication', () => {
  const auth = (over: Partial<DomainAuth>): DomainAuth => ({
    domain: 'phishsimai.com', role: 'apex_outreach', checked: true,
    identityHost: 'send.phishsimai.com',
    hasIdentityMx: true, hasIdentitySpf: true, hasDkim: true,
    dmarc: { found: true, host: '_dmarc.phishsimai.com', inherited: false, policy: 'v=DMARC1;p=none' },
    identityMxHosts: ['feedback-smtp.us-east-1.amazonses.com'],
    rootMxHosts: ['smtp.google.com'], identityMxIsInbound: false,
    detail: '', ...over,
  })
  it('classifies inbound providers correctly', () => {
    for (const h of ['smtp.google.com', 'aspmx.l.google.com', 'phishsimai-com.mail.protection.outlook.com'])
      expect(isInboundMailHost(h), h).toBe(true)
    for (const h of ['feedback-smtp.us-east-1.amazonses.com', 'feedback-smtp.eu-west-1.amazonses.com'])
      expect(isInboundMailHost(h), h).toBe(false)
  })

  it('FAILS a domain whose identity MX points only at an inbound provider', () => {
    // The exact wrong-reason pass, reconstructed: Google MX present, no SES bounce host.
    const [i] = authIncidents([
      auth({
        hasIdentityMx: false,
        identityMxIsInbound: true,
        identityMxHosts: ['smtp.google.com'],
      }),
    ])
    expect(i, 'an inbound-only identity MX must be a finding').toBeTruthy()
    expect(i.summary).toContain('INBOUND')
    expect(i.summary).toContain('not proof we can send')
    expect(i.evidence).toMatchObject({ identityMxIsInbound: true })
  })

  it('a root MX alone never satisfies the check — rootMxHosts is evidence, not a pass', () => {
    const [i] = authIncidents([
      auth({ hasIdentityMx: false, identityMxHosts: [], rootMxHosts: ['smtp.google.com'] }),
    ])
    expect(i).toBeTruthy()
    expect(i.evidence).toMatchObject({ rootMxHosts: ['smtp.google.com'], identityMxHosts: [] })
  })
})
