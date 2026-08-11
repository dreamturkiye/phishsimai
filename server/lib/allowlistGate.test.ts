// ─────────────────────────────────────────────────────────────────────────────
//  PS-DELIVER-ALLOWLIST-01 — the gate holds, and it never claims a verification it cannot make.
//
//  Two separate guarantees:
//    (a) a new org cannot reach first-send without confirming OR knowingly skipping;
//    (b) nothing in this feature ever renders "verified" — no vendor API can produce that fact, so
//        claiming it would be the posture-50 fabrication wearing a tick.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  checkAllowlistGate,
  microsoft365Instructions,
  googleWorkspaceInstructions,
  SKIP_WARNING,
  SIM_SENDING_DOMAIN,
  SIM_URL_PATTERNS,
} from './allowlistGate'

describe('THE GATE — a new org cannot reach first-send unaware', () => {
  it('blocks a brand-new org with no row at all', () => {
    const v = checkAllowlistGate(null)
    expect(v.allowed).toBe(false)
    expect(v.state).toBe('not_started')
  })

  it('blocks an explicit not_started row', () => {
    const v = checkAllowlistGate({ state: 'not_started' })
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.reason).toBe('allowlist_not_started')
  })

  it('tells the admin what to do and why — a block with no reason is a wall', () => {
    const v = checkAllowlistGate({ state: 'not_started' })
    if (!v.allowed) {
      expect(v.detail).toMatch(/before launching your first campaign/i)
      expect(v.detail).toMatch(/filtered to spam/i)
    }
  })

  it('ALLOWS once the admin confirms', () => {
    const v = checkAllowlistGate({ state: 'confirmed_by_admin' })
    expect(v.allowed).toBe(true)
  })

  it('ALLOWS a knowing skip — informed choice, not a wall', () => {
    const v = checkAllowlistGate({ state: 'skipped', skipAckText: SKIP_WARNING })
    expect(v.allowed).toBe(true)
    if (v.allowed) expect(v.note).toMatch(/skipped knowingly/i)
  })

  // THE HOLE THIS CLOSES: a 'skipped' row with no acknowledgement is not an informed choice, it is
  // an unrecorded one. The whole value of the skip path is the consent record it leaves.
  it('BLOCKS a skip that carries no acknowledgement', () => {
    for (const ack of [undefined, null, '', '   ']) {
      const v = checkAllowlistGate({ state: 'skipped', skipAckText: ack as any })
      expect(v.allowed, `ack=${JSON.stringify(ack)}`).toBe(false)
      expect(v.state).toBe('not_started')
    }
  })
})

describe('NO FAKE VERIFICATION — the label matches what we actually know', () => {
  it('the confirmed note says explicitly that we did NOT verify it', () => {
    const v = checkAllowlistGate({ state: 'confirmed_by_admin' })
    if (v.allowed) {
      expect(v.note).toContain('NOT verified by us')
      expect(v.note).toMatch(/no vendor api/i)
    }
  })

  it('no state named "verified" exists in the AllowlistState type', () => {
    const SRC = fs.readFileSync('server/lib/allowlistGate.ts', 'utf8')
    // A 'verified' state would be unfalsifiable: nothing can set it truthfully. Check the TYPE
    // UNION specifically — an explanatory comment is allowed to name the absent value.
    const typeLine = SRC.match(/export type AllowlistState =([^\n]+)/)?.[1] ?? ''
    expect(typeLine).toContain("'not_started'")
    expect(typeLine).toContain("'confirmed_by_admin'")
    expect(typeLine).toContain("'skipped'")
    expect(typeLine).not.toContain("'verified'")
    // And no code path assigns state = 'verified' (comments excepted).
    expect(SRC).not.toMatch(/state:\s*'verified'/)
    expect(SRC).not.toMatch(/state\s*=\s*'verified'/)
  })

  it('the migration forbids evidence-free states at the schema level', () => {
    const SQL = fs.readFileSync('drizzle/pg/0021_org_allowlist_state.sql', 'utf8')
    expect(SQL).toContain('org_allowlist_state_evidence_required')
    expect(SQL).toMatch(/confirmed_by_admin.*confirmedAt.*IS NOT NULL/s)
    expect(SQL).toMatch(/skipped.*skip_ack_text IS NOT NULL/s)
  })

  it('the migration carries no semicolon inside a COMMENT literal', () => {
    // A ';' in a COMMENT string breaks naive statement splitters — 0017 and 0019 both hit this.
    const SQL = fs.readFileSync('drizzle/pg/0021_org_allowlist_state.sql', 'utf8')
    for (const m of SQL.matchAll(/IS\s+'([^']*)'/g)) {
      expect(m[1], 'semicolon inside a COMMENT literal').not.toContain(';')
    }
  })
})

describe('THE INSTRUCTIONS — real values, and honest about what we cannot supply', () => {
  it('names the empirically confirmed sending domain, not the apex', () => {
    // Confirmed 2026-08-04: a live sim to kaan@phishsimai.com arrived From security@sim.phishsimai.com.
    expect(SIM_SENDING_DOMAIN).toBe('sim.phishsimai.com')
    const m = microsoft365Instructions()
    expect(m.sendingDomain).toBe('sim.phishsimai.com')
    // Naming the apex would cause the very filtering the wizard exists to prevent.
    expect(m.sendingDomain).not.toBe('phishsimai.com')
  })

  it('lists only URL patterns that correspond to real routes', () => {
    const tracker = fs.readFileSync('server/email/tracker.ts', 'utf8')
    expect(tracker).toContain('"/c/:token"')
    expect(tracker).toContain('"/landing/:token"')
    expect(tracker).toContain('"/api/report/:token"')
    expect(SIM_URL_PATTERNS.length).toBe(4)
    for (const u of SIM_URL_PATTERNS) expect(u).toMatch(/^https:\/\/phishsimai\.com\//)
  })

  it('states the IP gap rather than leaving an empty box to be guessed at', () => {
    const m = microsoft365Instructions()
    const ip = m.unavailable.find((u) => /IP/i.test(u.field))
    expect(ip).toBeTruthy()
    expect(ip!.why).toMatch(/shared provider pool/i)
    expect(ip!.why).toMatch(/leave the\s+IP field empty/i)
  })

  it('M365 is shippable; Google is held with the reason recorded', () => {
    expect(microsoft365Instructions().available).toBe(true)
    const g = googleWorkspaceInstructions()
    expect(g.available).toBe(false)
    // Half an instruction that reads as complete is worse than none.
    expect(g.notes.join(' ')).toMatch(/would read as complete/i)
  })

  it('the skip warning states the actual consequence, not a euphemism', () => {
    expect(SKIP_WARNING).toMatch(/spam|quarantine/i)
    expect(SKIP_WARNING).toMatch(/may never see them/i)
  })
})

describe('the gate is WIRED into the launch path, before any send', () => {
  const ROUTERS = fs.readFileSync('server/routers.ts', 'utf8')
  const launch = ROUTERS.indexOf('launch: protectedProcedure')

  it('launch invokes checkAllowlistGate', () => {
    expect(launch).toBeGreaterThan(-1)
    expect(ROUTERS.indexOf('checkAllowlistGate(', launch)).toBeGreaterThan(-1)
  })

  it('the gate runs BEFORE the first sendCampaignEmail — a check after the send is not a gate', () => {
    const gate = ROUTERS.indexOf('checkAllowlistGate(', launch)
    const send = ROUTERS.indexOf('sendCampaignEmail(', launch)
    expect(gate).toBeGreaterThan(-1)
    expect(send).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(send)
  })

  it('a failed gate throws PRECONDITION_FAILED, halting the launch', () => {
    const block = ROUTERS.slice(launch, ROUTERS.indexOf('sendCampaignEmail(', launch))
    expect(block).toContain('PRECONDITION_FAILED')
  })
})
