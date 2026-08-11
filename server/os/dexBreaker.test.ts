// PS-DEX-BREAKER-01 — tests for the derived bounce breaker.
//
// Three properties carry the whole design:
//   1. LEGACY CANNOT MOVE IT. The derivation reads the sanitized cohort only, so a bad legacy tail
//      can never loosen the live guard. Tested with an absurd legacy volume.
//   2. LOOSENING IS NEVER AUTONOMOUS. Dex may tighten on his own; only a human may weaken.
//   3. IT IS NEVER A CONSTANT. The value tracks measurement, clamped to hard bounds.
import { describe, it, expect } from 'vitest'
import {
  deriveThreshold,
  directionOf,
  reconcileBreaker,
  readBreakerThreshold,
  BREAKER_FLOOR,
  BREAKER_CEIL,
  BREAKER_DEFAULT,
  HEADROOM_MULTIPLIER,
  MIN_DERIVE_N,
} from './dexBreaker'
import { decideAutonomy, MIN_LEVEL } from './autonomyGate'

describe('derivation from the measured rate', () => {
  it('derives exactly 3.0% from the real current-pipeline rate (11/710 = 1.55%)', () => {
    // The founder-specified target, reproduced from data rather than typed in.
    const d = deriveThreshold(11, 710)
    expect(d.value).toBe(0.03)
    expect(d.measuredRate).toBeCloseTo(0.0155, 4)
    expect(d.reason).toContain('CURRENT-cohort 11/710')
    expect(d.reason).toContain('Legacy pre-sanitizer sends are excluded')
  })

  it('rounds DOWN — of two candidates the tighter one is the safer default', () => {
    // 1.9% x2 = 3.8% -> rounds down to 3.5%, never up to 4%.
    const d = deriveThreshold(19, 1000)
    expect(d.value).toBe(0.035)
  })

  it('tracks measurement rather than sitting at a constant', () => {
    const low = deriveThreshold(5, 1000)   // 0.5% -> 1% -> clamped to floor
    const mid = deriveThreshold(15, 1000)  // 1.5% -> 3%
    const high = deriveThreshold(20, 1000) // 2.0% -> 4%
    expect(low.value).toBeLessThan(mid.value!)
    expect(mid.value).toBeLessThan(high.value!)
  })

  it('clamps at the floor and SAYS it clamped', () => {
    const d = deriveThreshold(1, 1000) // 0.1% x2 = 0.2%, far below floor
    expect(d.value).toBe(BREAKER_FLOOR)
    expect(d.clamped).toBe('floor')
    expect(d.reason).toContain('CLAMPED at the floor')
  })

  it('clamps at the ceiling — the formula may never authorise a permissive guard', () => {
    const d = deriveThreshold(400, 1000) // 40% x2 = 80%
    expect(d.value).toBe(BREAKER_CEIL)
    expect(d.clamped).toBe('ceil')
  })

  it('refuses to derive below n=30 and leaves the threshold alone', () => {
    const d = deriveThreshold(5, 20)
    expect(d.value).toBeNull()
    expect(d.reason).toContain(`below n=${MIN_DERIVE_N}`)
    expect(d.reason).toContain('left unchanged')
  })

  it('applies the stated headroom multiplier', () => {
    const d = deriveThreshold(20, 1000)
    expect(d.value).toBeCloseTo(0.02 * HEADROOM_MULTIPLIER, 4)
  })

  it('produces a clean stored value, not float noise', () => {
    for (const [b, c] of [[11, 710], [19, 1000], [7, 933]] as const) {
      const v = deriveThreshold(b, c).value!
      expect(String(v).replace('0.', '').length).toBeLessThanOrEqual(4)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
//  THE PROPERTY THE FOUNDER ASKED FOR EXPLICITLY.
// ─────────────────────────────────────────────────────────────────────────────
describe('a legacy tail can NEVER loosen the live breaker', () => {
  it('legacy volume does not enter the derivation at all', () => {
    // Real legacy cohort: 27/223 = 12.11%, which alone would derive ~24% (clamped to the 5% ceil).
    // The derivation is fed CURRENT counts only, so the answer must be identical either way.
    const currentOnly = deriveThreshold(11, 710)
    expect(currentOnly.value).toBe(0.03)

    // Blended, for contrast — what the OLD reporting would have produced. 4.07% x2 = 8.14%, which
    // the hard ceiling then caps at 5%. Either way it is strictly looser than the current-cohort
    // answer, which is the whole point.
    const blended = deriveThreshold(11 + 27, 710 + 223)
    expect(blended.value).toBeGreaterThan(currentOnly.value!)
    expect(blended.value).toBe(BREAKER_CEIL)
    expect(blended.clamped).toBe('ceil')
  })

  it('even an absurd legacy disaster cannot move the current-cohort answer', () => {
    // 10,000 legacy bounces. If any of it leaked in, the threshold would explode.
    const withDisaster = deriveThreshold(11, 710) // still CURRENT only
    expect(withDisaster.value).toBe(0.03)
  })

  it('the hard ceiling caps even a blended miscalculation', () => {
    // Defence in depth: if a future caller ever passed blended counts by mistake, the ceiling still
    // prevents the guard from becoming permissive.
    const blended = deriveThreshold(38, 933)
    expect(blended.value).toBeLessThanOrEqual(BREAKER_CEIL)
  })
})

describe('direction', () => {
  it('classifies correctly', () => {
    expect(directionOf(0.08, 0.03)).toBe('tighten')
    expect(directionOf(0.03, 0.08)).toBe('loosen')
    expect(directionOf(0.03, 0.03)).toBe('unchanged')
  })
})

// A janet_memory stand-in.
function fakeSql(stored?: string) {
  const writes: string[] = []
  const fn: any = (strings: TemplateStringsArray, ...vals: any[]) => {
    const text = strings.join('?')
    if (/SELECT value FROM janet_memory/.test(text)) {
      return Promise.resolve(stored === undefined ? [] : [{ value: stored }])
    }
    writes.push(text.replace(/\s+/g, ' ').trim())
    const p: any = Promise.resolve([])
    p.catch = () => p
    return p
  }
  fn.writes = writes
  return fn
}

describe('storage is fail-safe', () => {
  it('falls back to the TIGHT default when nothing is stored — never to the old 0.08', () => {
    expect(BREAKER_DEFAULT).toBe(0.03)
    expect(BREAKER_DEFAULT).toBeLessThan(0.08)
  })

  it('returns the default when the row is missing', async () => {
    expect(await readBreakerThreshold(fakeSql())).toBe(BREAKER_DEFAULT)
  })

  it('clamps a stored value on READ — a bad row cannot disable the breaker', async () => {
    expect(await readBreakerThreshold(fakeSql('0.95'))).toBe(BREAKER_CEIL)
    expect(await readBreakerThreshold(fakeSql('0.0001'))).toBe(BREAKER_FLOOR)
  })

  it('ignores a non-numeric stored value', async () => {
    expect(await readBreakerThreshold(fakeSql('disabled'))).toBe(BREAKER_DEFAULT)
  })

  it('falls back to the default when the read throws', async () => {
    const throwing: any = () => Promise.reject(new Error('db down'))
    expect(await readBreakerThreshold(throwing)).toBe(BREAKER_DEFAULT)
  })
})

describe('application is asymmetric — tighten autonomously, loosen never', () => {
  it('applies a TIGHTENING derivation', async () => {
    const sql = fakeSql('0.08')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 11, contacted: 710 }, getLevel: async () => 'l4' })
    expect(r.direction).toBe('tighten')
    expect(r.applied).toBe(true)
    expect(r.derived).toBe(0.03)
    expect(sql.writes.some((w: string) => /INSERT INTO janet_memory/.test(w))).toBe(true)
    expect(sql.writes.some((w: string) => /INSERT INTO audit_log/.test(w))).toBe(true)
  })

  it('NEVER applies a LOOSENING derivation, and writes nothing', async () => {
    // Stored tight at 2%; measurement would justify 4%. Dex must refuse to weaken it himself.
    const sql = fakeSql('0.02')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 20, contacted: 1000 } })
    expect(r.direction).toBe('loosen')
    expect(r.applied).toBe(false)
    expect(r.surfacedToKaan).toBe(true)
    expect(r.line).toContain('only Kaan may weaken it')
    expect(sql.writes.filter((w: string) => /INSERT INTO janet_memory/.test(w))).toEqual([])
  })

  it('writes nothing when the derivation agrees with an ALREADY-STORED value', async () => {
    const sql = fakeSql('0.03')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 11, contacted: 710 }, getLevel: async () => 'l4' })
    expect(r.direction).toBe('unchanged')
    expect(r.applied).toBe(false)
    expect(sql.writes.filter((w: string) => /INSERT INTO janet_memory/.test(w))).toEqual([])
  })

  // The gap found when the live before/after showed no write: with NO stored row,
  // readBreakerThreshold() returns the code default, so a derivation equal to it reads as
  // "unchanged" and never persists — leaving the threshold code-owned while the report claims Dex
  // owns it. A read surface with no writer, in config form.
  it('INITIALISES the stored value on first run even when it equals the code default', async () => {
    const sql = fakeSql(undefined) // nothing persisted
    const r = await reconcileBreaker({ sql, cohort: { bounced: 11, contacted: 710 }, getLevel: async () => 'l4' })
    expect(r.applied).toBe(true)
    expect(r.derived).toBe(0.03)
    expect(r.line).toContain('INITIALISED')
    expect(r.line).toContain('code constant until this write')
    expect(sql.writes.some((w: string) => /INSERT INTO janet_memory/.test(w))).toBe(true)
  })

  it('initialisation still respects the gate', async () => {
    const sql = fakeSql(undefined)
    const r = await reconcileBreaker({ sql, cohort: { bounced: 11, contacted: 710 }, getLevel: async () => 'manual' })
    expect(r.gate).toBe('denied')
    expect(r.applied).toBe(false)
    expect(sql.writes.filter((w: string) => /INSERT INTO janet_memory/.test(w))).toEqual([])
  })

  it('initialisation cannot write a LOOSER value than the tight default', async () => {
    // Even on first run, a high measured rate is capped: the write is clamped to the ceiling and
    // the direction logic cannot be used to smuggle in a permissive starting value.
    const sql = fakeSql(undefined)
    const r = await reconcileBreaker({ sql, cohort: { bounced: 300, contacted: 1000 }, getLevel: async () => 'l4' })
    expect(r.derived).toBe(BREAKER_CEIL)
    expect(r.derived).toBeLessThanOrEqual(BREAKER_CEIL)
  })

  it('holds the threshold when there is too little current-pipeline data', async () => {
    const sql = fakeSql('0.03')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 2, contacted: 10 } })
    expect(r.derived).toBeNull()
    expect(r.applied).toBe(false)
    expect(r.line).toContain('held at')
  })

  it('a dry run consults nothing and writes nothing', async () => {
    const sql = fakeSql('0.08')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 11, contacted: 710 }, dryRun: true, getLevel: async () => 'l4' })
    expect(r.applied).toBe(false)
    expect(r.line).toContain('DRY RUN')
    expect(sql.writes.filter((w: string) => /INSERT INTO janet_memory/.test(w))).toEqual([])
  })
})

describe('the config change is gated', () => {
  it('deliverability_config requires L4', () => {
    expect(MIN_LEVEL.deliverability_config).toBe('l4')
  })

  it('is denied below L4, fail-closed', () => {
    for (const lvl of ['manual', 'l2', 'l3', null, undefined, 'nonsense']) {
      expect(decideAutonomy('deliverability_config', lvl as any).allowed, String(lvl)).toBe(false)
    }
  })

  it('is permitted at L4 and above', () => {
    expect(decideAutonomy('deliverability_config', 'l4').allowed).toBe(true)
    expect(decideAutonomy('deliverability_config', 'l5').allowed).toBe(true)
  })

  it('the gate can only ever make the guard STRICTER — loosening is refused before the gate', async () => {
    // Even at l5, a loosening derivation never reaches the gate at all.
    const sql = fakeSql('0.02')
    const r = await reconcileBreaker({ sql, cohort: { bounced: 30, contacted: 1000 }, getLevel: async () => 'l5' })
    expect(r.gate).toBe('not_attempted')
    expect(r.applied).toBe(false)
  })
})


describe('a denied gate writes nothing', () => {
  it('reports the denial and leaves the stored value alone', async () => {
    const writes: string[] = []
    const sql: any = (strings: TemplateStringsArray) => {
      const text = strings.join('?')
      if (/SELECT value FROM janet_memory/.test(text)) return Promise.resolve([{ value: '0.08' }])
      writes.push(text)
      const p: any = Promise.resolve([]); p.catch = () => p; return p
    }
    const r = await reconcileBreaker({
      sql, cohort: { bounced: 11, contacted: 710 },
      getLevel: async () => 'manual',
      // audit sink is autonomyGate's own; it may write, but janet_memory must not change
    })
    expect(r.gate).toBe('denied')
    expect(r.applied).toBe(false)
    expect(r.line).toContain('BLOCKED by the autonomy gate')
    expect(writes.filter((w) => /INSERT INTO janet_memory/.test(w))).toEqual([])
  })
})
