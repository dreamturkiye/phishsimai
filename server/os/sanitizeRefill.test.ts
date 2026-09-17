import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  mapQevToRefillVerdict,
  sendablePoolTarget,
  shouldUseMapsMxBridge,
  isMapsSourced,
  refillSendablePool,
  SANITIZE_BUFFER_DAYS,
} from './sanitizeRefill'
import { mailboxVerifierKeys } from './touch1Health'

vi.mock('./verifierClient', () => ({
  verifierConfigured: () => !!(process.env.QEV_API_KEY || '').trim(),
  verifyViaService: vi.fn(),
}))

vi.mock('./mxGate', async () => {
  const actual = await vi.importActual<typeof import('./mxGate')>('./mxGate')
  return {
    ...actual,
    hasMx: vi.fn(async (domain: string) => domain !== 'nomx.example'),
  }
})

import { verifyViaService } from './verifierClient'

function fakeSql(handlers: Array<{ match: RegExp; rows?: any[] }>) {
  const calls: string[] = []
  const sql: any = async (strings: TemplateStringsArray) => {
    const q = strings.join('?')
    calls.push(q)
    const h = handlers.find((x) => x.match.test(q))
    return h?.rows ?? []
  }
  sql.calls = calls
  return sql
}

const saved: Record<string, string | undefined> = {}

function stashEnv() {
  for (const k of ['MYEMAILVERIFIER_API_KEY', 'QEV_API_KEY', 'REFILL_ALLOW_MX_ONLY']) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
}

function restoreEnv() {
  for (const k of Object.keys(saved)) {
    if (saved[k] == null) delete process.env[k]
    else process.env[k] = saved[k]
  }
}

beforeEach(() => {
  stashEnv()
  vi.mocked(verifyViaService).mockReset()
})
afterEach(restoreEnv)

describe('QEV vs empty MEV (Sep 12 death shape)', () => {
  it('empty MEV + no QEV is not a mailbox verifier', () => {
    process.env.MYEMAILVERIFIER_API_KEY = ''
    expect(mailboxVerifierKeys().any).toBe(false)
  })

  it('sanitizeRefill source wires verifyViaService / QEV_API_KEY', () => {
    const src = readFileSync('server/os/sanitizeRefill.ts', 'utf8')
    expect(src).toContain('verifyViaService')
    expect(src).toContain('QEV_API_KEY')
    expect(src).toContain('maps_mx_bridge')
    expect(src).not.toMatch(/REFILL_ALLOW_MX_ONLY === '1'[\s\S]{0,80}hasVerifier/)
  })

  it('QEV valid promotes; catch-all/risky does not', () => {
    expect(mapQevToRefillVerdict({ status: 'valid', catchAll: false, reached: true })).toBe('valid')
    expect(mapQevToRefillVerdict({ status: 'valid', catchAll: true, reached: true })).toBe('catchall')
    expect(mapQevToRefillVerdict({ status: 'risky', catchAll: false, reached: true })).toBe('catchall')
    expect(mapQevToRefillVerdict({ status: 'invalid', catchAll: false, reached: true })).toBe('invalid')
    expect(mapQevToRefillVerdict({ status: 'unknown', catchAll: false, reached: false })).toBe('unknown')
  })
})

describe('maps MX bridge is NOT REFILL_ALLOW_MX_ONLY', () => {
  it('activates only when both mailbox keys are empty AND sanitized pool is 0', () => {
    expect(shouldUseMapsMxBridge({ hasMailboxVerifier: false, allowMxOnly: false, sendableBefore: 0 })).toBe(true)
    expect(shouldUseMapsMxBridge({ hasMailboxVerifier: true, allowMxOnly: false, sendableBefore: 0 })).toBe(false)
    expect(shouldUseMapsMxBridge({ hasMailboxVerifier: false, allowMxOnly: true, sendableBefore: 0 })).toBe(false)
    expect(shouldUseMapsMxBridge({ hasMailboxVerifier: false, allowMxOnly: false, sendableBefore: 12 })).toBe(false)
  })

  it('only Maps / MSP-hub sources qualify', () => {
    expect(isMapsSourced('google_maps')).toBe(true)
    expect(isMapsSourced('mymsphub')).toBe(true)
    expect(isMapsSourced('ai_discovery')).toBe(false)
  })
})

describe('sendable buffer', () => {
  it('keeps a 3-day buffer above the daily cap', () => {
    expect(SANITIZE_BUFFER_DAYS).toBe(3)
    expect(sendablePoolTarget(50)).toBe(150)
  })
})

describe('refillSendablePool fail-closed vs QEV', () => {
  it('empty MEV + no QEV + leftover sanitized pool promotes 0 and sets verifierAlert', async () => {
    process.env.MYEMAILVERIFIER_API_KEY = ''
    const sql = fakeSql([
      { match: /ALTER TABLE/, rows: [] },
      { match: /sanitized_at IS NOT NULL AND touch1_sent_at IS NULL/, rows: [{ n: 12 }] },
    ])
    const r = await refillSendablePool(sql, new Date('2026-09-17T07:00:00Z'))
    expect(r.promoted).toBe(0)
    expect(r.verifierAlert).toBe(true)
    expect(r.verifyMode).toBe('none')
    expect(r.reason).toMatch(/QEV_API_KEY/)
    expect(r.reason).toMatch(/Do not set REFILL_ALLOW_MX_ONLY=1/)
  })

  it('QEV keyed + valid verdict promotes a candidate', async () => {
    process.env.QEV_API_KEY = 'qk_test'
    vi.mocked(verifyViaService).mockResolvedValue({
      status: 'valid',
      catchAll: false,
      isRole: false,
      reason: 'valid',
      reached: true,
      remainingCredits: 900,
    })
    const sql = fakeSql([
      { match: /ALTER TABLE/, rows: [] },
      { match: /sanitized_at IS NOT NULL AND touch1_sent_at IS NULL/, rows: [{ n: 0 }] },
      {
        match: /refill_checked_at IS NULL/,
        rows: [{ id: 'lead-1', email: 'pat@msp.example', source: 'google_maps' }],
      },
    ])
    const r = await refillSendablePool(sql, new Date('2026-09-17T07:00:00Z'))
    expect(r.verifyMode).toBe('qev')
    expect(r.verifier.qev).toBe(true)
    expect(r.promoted).toBe(1)
    expect(r.promotedLeads[0]?.email).toBe('pat@msp.example')
    expect(vi.mocked(verifyViaService)).toHaveBeenCalled()
  })

  it('QEV catch-all does not promote', async () => {
    process.env.QEV_API_KEY = 'qk_test'
    vi.mocked(verifyViaService).mockResolvedValue({
      status: 'risky',
      catchAll: true,
      isRole: false,
      reason: 'accept_all',
      reached: true,
      remainingCredits: 900,
    })
    const sql = fakeSql([
      { match: /ALTER TABLE/, rows: [] },
      { match: /sanitized_at IS NOT NULL AND touch1_sent_at IS NULL/, rows: [{ n: 0 }] },
      {
        match: /refill_checked_at IS NULL/,
        rows: [{ id: 'lead-2', email: 'sam@msp.example', source: 'google_maps' }],
      },
    ])
    const r = await refillSendablePool(sql, new Date('2026-09-17T07:00:00Z'))
    expect(r.promoted).toBe(0)
    expect(r.checked).toBe(1)
  })

  it('maps MX bridge promotes a personal Maps lead when both keys are empty and pool is 0', async () => {
    const sql = fakeSql([
      { match: /ALTER TABLE/, rows: [] },
      { match: /sanitized_at IS NOT NULL AND touch1_sent_at IS NULL/, rows: [{ n: 0 }] },
      {
        match: /COALESCE\(source/,
        rows: [{ id: 'lead-3', email: 'jordan@msp.example', source: 'google_maps' }],
      },
    ])
    const r = await refillSendablePool(sql, new Date('2026-09-17T07:00:00Z'))
    expect(r.verifyMode).toBe('maps_mx_bridge')
    expect(r.promoted).toBe(1)
    expect(r.promotedLeads[0]?.verdict).toBe('mx_ok')
  })

  it('maps MX bridge never promotes an org inbox', async () => {
    const sql = fakeSql([
      { match: /ALTER TABLE/, rows: [] },
      { match: /sanitized_at IS NOT NULL AND touch1_sent_at IS NULL/, rows: [{ n: 0 }] },
      {
        match: /COALESCE\(source/,
        rows: [{ id: 'lead-4', email: 'info@msp.example', source: 'google_maps' }],
      },
    ])
    const r = await refillSendablePool(sql, new Date('2026-09-17T07:00:00Z'))
    expect(r.verifyMode).toBe('maps_mx_bridge')
    expect(r.promoted).toBe(0)
    expect(r.skippedOrgInbox).toBe(1)
  })
})

describe('hourly refill cron', () => {
  it('vercel.json runs sanitize-refill hourly, not once at 06:30', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const hit = vercel.crons.find((c: { path: string }) => c.path === '/api/os/sanitize-refill')
    expect(hit.schedule).toBe('30 * * * *')
  })
})
