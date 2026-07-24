// ─────────────────────────────────────────────────────────────────────────────
//  PS-FINDER-LEDGER-01 — the finder spend ledger.
//
//  The load-bearing property is NOT that it records accurately. It is that it can
//  never take down the thing it is measuring. An instrument that stops lead
//  generation when its own table is unavailable has made the product worse in
//  exchange for bookkeeping — and it would do so exactly when something is
//  already wrong, which is the worst possible moment.
//
//  Second property: a request the vendor REJECTED is not a call we were billed
//  for. Conflating "attempted" with "spent" would put fiction in the one table
//  built to end a reconstruction.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordProviderCall } from './providerUsage'

/** Captures the interpolated values a tagged-template sql call receives. */
function captureSql() {
  const rows: any[][] = []
  const fn: any = async (_strings: TemplateStringsArray, ...values: any[]) => { rows.push(values); return [] }
  fn.rows = rows
  return fn
}

beforeEach(() => vi.restoreAllMocks())

describe('recordProviderCall — never breaks the caller', () => {
  it('swallows a DB write failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom: any = async () => { throw new Error('relation "provider_usage" does not exist') }
    await expect(recordProviderCall({ provider: 'icypeas', endpoint: 'find-people', results: 3 }, boom)).resolves.toBeUndefined()
    expect(err.mock.calls.flat().join(' ')).toMatch(/ledger write failed/)
  })

  it('swallows an unresolvable DB client instead of throwing', async () => {
    // getSql() throws when DATABASE_URL is unset. That must be caught INSIDE the helper —
    // it was not, originally, and the throw propagated straight out into the finder guard.
    const saved = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordProviderCall({ provider: 'icypeas', endpoint: 'find-people', results: 1 })).resolves.toBeUndefined()
    if (saved !== undefined) process.env.DATABASE_URL = saved
  })
})

describe('recordProviderCall — records facts, not estimates', () => {
  it('counts a completed call as 1 call with its result count', async () => {
    const sql = captureSql()
    await recordProviderCall({ provider: 'icypeas', endpoint: 'find-people', results: 42 }, sql)
    const [provider, product, endpoint, calls, results, skipped] = sql.rows[0]
    expect(provider).toBe('icypeas')
    expect(product).toBe('phishsimai')
    expect(endpoint).toBe('find-people')
    expect(calls).toBe(1)
    expect(results).toBe(42)
    expect(skipped).toBe(0)
  })

  it('does NOT count a vendor-rejected request as a billed call', async () => {
    const sql = captureSql()
    await recordProviderCall({ provider: 'icypeas', endpoint: 'find-people', sent: false }, sql)
    const [, , , calls, results] = sql.rows[0]
    expect(calls).toBe(0)
    expect(results).toBe(0)
  })

  it('records a guard skip as spend avoided — 0 calls, 1 skip', async () => {
    const sql = captureSql()
    await recordProviderCall({ provider: 'icypeas', endpoint: 'guard/skip', sent: false, skipped: 1 }, sql)
    const [, , , calls, , skipped] = sql.rows[0]
    expect(calls).toBe(0)
    expect(skipped).toBe(1)
  })

  it('never writes a negative or fractional count', async () => {
    const sql = captureSql()
    await recordProviderCall({ provider: 'x', endpoint: 'y', results: -5 }, sql)
    await recordProviderCall({ provider: 'x', endpoint: 'y', results: 2.7 }, sql)
    expect(sql.rows[0][4]).toBe(0)
    expect(sql.rows[1][4]).toBe(2)
  })
})
