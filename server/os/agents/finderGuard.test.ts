// ─────────────────────────────────────────────────────────────────────────────
//  PS-ICY-GUARD-01 — a finder credit must never re-derive an address we hold.
//
//  PRECEDENT: AMF's shared pool was drained to 0 because the refill called the
//  FINDER on ps_outreach_leads rows that already had an email (PS-REFILL-03).
//  Icypeas inherited the same shared-pool exposure — one 1,000-credit pool split
//  with ScrollFuel — so the rule is enforced at the chokepoint, not by convention.
//
//  The narrowness of the predicate is the load-bearing part. Measured on prod
//  2026-07-24: of 149 queued domains overlapping the CSV import, 107 held ONLY
//  generic org inboxes (info@, sales@, support@) which sanitizeRefill.isOrgInbox()
//  blocks from promotion forever. Skipping those would save credits by starving
//  the send pool — trading the pipeline for the meter. So the guard skips ONLY
//  when we hold an address the refill would actually promote.
//
//  These tests run with no vendor keys set, so a "proceed" surfaces as
//  'vendor_error' (the finder's no-key path) and never touches the network.
//  skip vs proceed is therefore unambiguous and offline.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { findEmailForDomainOnly } from './leadResearcher'

/** Minimal tagged-template stand-in for the neon `sql` client. */
function stubSql(rows: Array<{ email: string }> | Error) {
  const calls: number[] = []
  const fn: any = async () => {
    calls.push(1)
    if (rows instanceof Error) throw rows
    return rows
  }
  fn.calls = calls
  return fn
}

beforeEach(() => {
  delete process.env.ICYPEAS_API_KEY
  delete process.env.ANYMAILFINDER_API_KEY
  delete process.env.HUNTER_API_KEY
  vi.restoreAllMocks()
})

describe('findEmailForDomainOnly — skips without spending', () => {
  it('skips when we already hold a personal address at the domain', async () => {
    const sql = stubSql([{ email: 'dylan@go2techs.net' }])
    const out = await findEmailForDomainOnly(sql, 'go2techs.net', 'Go2 Techs', 'icypeas')
    expect(out).toBe('already_have_sendable')
  })

  it('skips before any vendor call — the finder is never reached', async () => {
    // With no key, reaching Icypeas would return 'vendor_error'. Getting the skip
    // sentinel instead proves we returned upstream of the vendor entirely.
    const sql = stubSql([{ email: 'jane.smith@acme.com' }])
    expect(await findEmailForDomainOnly(sql, 'acme.com', 'Acme', 'icypeas')).toBe('already_have_sendable')
  })

  it('guards the AMF path identically — an env flip cannot bypass it', async () => {
    const sql = stubSql([{ email: 'jane.smith@acme.com' }])
    expect(await findEmailForDomainOnly(sql, 'acme.com', 'Acme', 'amf')).toBe('already_have_sendable')
  })

  it('logs the skip so the guard is visibly working', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await findEmailForDomainOnly(stubSql([{ email: 'dylan@go2techs.net' }]), 'go2techs.net', null, 'icypeas')
    expect(log.mock.calls.flat().join(' ')).toMatch(/\[finder-guard\] SKIP go2techs\.net.*0 credits spent/)
  })
})

describe('findEmailForDomainOnly — proceeds when a find is genuinely worth paying for', () => {
  it('PROCEEDS when the domain holds only generic org inboxes', async () => {
    // The 107-row case. These can never be promoted by the refill, so finding a
    // named human here is the highest-value thing the finder does.
    const sql = stubSql([{ email: 'info@netitude.co.uk' }, { email: 'sales@netitude.co.uk' }])
    expect(await findEmailForDomainOnly(sql, 'netitude.co.uk', 'Netitude', 'icypeas')).toBe('vendor_error')
  })

  it('PROCEEDS when we hold nothing at the domain', async () => {
    expect(await findEmailForDomainOnly(stubSql([]), 'brandnew.com', 'Brand New', 'icypeas')).toBe('vendor_error')
  })

  it('treats support@ / hello@ / contact@ as org inboxes, not as a reason to skip', async () => {
    for (const e of ['support@x.com', 'hello@x.com', 'contact@x.com', 'info2@x.com', 'no-reply@x.com']) {
      expect(await findEmailForDomainOnly(stubSql([{ email: e }]), 'x.com', 'X', 'icypeas')).toBe('vendor_error')
    }
  })
})

describe('findEmailForDomainOnly — failure behaviour', () => {
  it('fails OPEN on a precheck DB error rather than silently disabling lead generation', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await findEmailForDomainOnly(stubSql(new Error('connection reset')), 'acme.com', 'Acme', 'icypeas')
    expect(out).toBe('vendor_error') // proceeded to the finder
    expect(err.mock.calls.flat().join(' ')).toMatch(/precheck FAILED.*proceeding UNGUARDED/)
  })

  it('does not crash on an empty or malformed domain', async () => {
    expect(await findEmailForDomainOnly(stubSql([]), '', null, 'icypeas')).toBe('vendor_error')
  })
})
