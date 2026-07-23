// PS-AUTONOMY-BRIDGE-01 — the pure promotion decision. These prove the l4 failure mode
// (promote on zero clean days) cannot recur, that promotion is one-rung-per-cycle, that the
// floor (L1=manual) and cap (l5) hold, and that a breaker trip demotes.
import { describe, it, expect } from 'vitest'
import { decidePromotion, CLEAN_DAYS_PER_RUNG, AUTONOMY_FLOOR, runAutonomyPromotion } from './autonomyPromotion'
import { CRITERIA_VERSION } from './posture'

const base = { breakerOpen: false, trust: 0 }

// ── A fake tagged-template SQL that answers by matching the query text. Each table is a plain
// array so a test can state exactly which rows exist and assert on what got written. ──
type FakeDb = {
  level?: string
  trust?: number
  storedStreak?: number
  storedCriteria?: number | null
  baseline?: string | null
  cleanDays?: Array<{ day: string; clean: boolean; criteria_version: number }>
  lastGrantAt?: string | null
  breakerOpen?: boolean
}
function fakeSql(db: FakeDb) {
  const writes: string[] = []
  const sql = async (strings: TemplateStringsArray, ...vals: any[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^UPDATE os_autonomy_state/i.test(q)) { writes.push(q + ' :: ' + JSON.stringify(vals)); return [] }
    if (/^INSERT INTO autonomy_grants/i.test(q)) { writes.push(q + ' :: ' + JSON.stringify(vals)); return [] }
    if (/FROM os_posture_state/i.test(q)) return db.baseline === null ? [] : [{ product_id: 'p', posture: 'pre_l5_7', baseline_from: db.baseline ?? '2026-07-23', entered_at: '', declared_by: null, notes: null }]
    if (/FROM os_autonomy_state/i.test(q)) return [{ level: db.level ?? 'l5', trust: db.trust ?? 0.8, clean_day_streak: db.storedStreak ?? 0, clean_day_streak_criteria: db.storedCriteria === undefined ? 1 : db.storedCriteria }]
    if (/FROM autonomy_grants/i.test(q)) return db.lastGrantAt ? [{ created_at: db.lastGrantAt }] : []
    if (/FROM circuit_breaker_state/i.test(q)) return db.breakerOpen ? [{ n: 1 }] : []
    if (/FROM autonomy_clean_days/i.test(q)) {
      // Honour the filters the query actually carries — that is the behaviour under test.
      const wantsCriteria = /criteria_version >= /.test(q)
      const wantsBaseline = /day >= /.test(q)
      const baseline = db.baseline ?? '2026-07-23'
      return (db.cleanDays ?? [])
        .filter((r) => !wantsCriteria || r.criteria_version >= CRITERIA_VERSION)
        .filter((r) => !wantsBaseline || r.day >= baseline)
        .sort((a, b) => (a.day < b.day ? 1 : -1))
        .map((r) => ({ ...r, violations: [] }))
    }
    return []
  }
  return { sql: sql as any, writes }
}

describe('decidePromotion (pure)', () => {
  it('(a) at the floor with 0 clean days → HOLD (the l4 failure mode cannot happen)', () => {
    const d = decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: 0 })
    expect(d.action).toBe('hold')
    expect(d.to).toBe('manual')
    expect(d.reason).toBe(`building_0_of_${CLEAN_DAYS_PER_RUNG}_clean_days`)
  })

  // Was hard-coded to 4, from when a rung cost 5 clean days. PS-AUTONOMY-RATE-01 made it 1 on
  // 2026-07-20 and this assertion was left behind, failing on main ever since. Pin it to the
  // constant so the boundary is tested at whatever the rate happens to be.
  it('holds one clean day short of the requirement', () => {
    expect(decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: CLEAN_DAYS_PER_RUNG - 1 }).action).toBe('hold')
    expect(decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: CLEAN_DAYS_PER_RUNG }).action).toBe('promote')
  })

  it('(b) manual + a fresh 5-clean-day cycle → PROMOTE exactly one rung (manual→l2)', () => {
    const d = decidePromotion({ ...base, level: 'manual', cleanSinceLastGrant: 5 })
    expect(d.action).toBe('promote')
    expect(d.to).toBe('l2')
    expect(d.reason).toBe('earned_5_clean_days')
  })

  it('promotes only ONE rung even with a huge streak (l2→l3, never l2→l4)', () => {
    const d = decidePromotion({ ...base, level: 'l2', cleanSinceLastGrant: 40 })
    expect(d.action).toBe('promote')
    expect(d.to).toBe('l3')
  })

  it('no over-promotion: right after a grant the cycle resets to 0 → HOLD', () => {
    // runAutonomyPromotion writes a grant, so the next computed cleanSinceLastGrant is 0.
    expect(decidePromotion({ ...base, level: 'l2', cleanSinceLastGrant: 0 }).action).toBe('hold')
  })

  it('cap holds: at l5 with a full cycle → HOLD (no promotion above l5)', () => {
    const d = decidePromotion({ ...base, level: 'l5', cleanSinceLastGrant: 99 })
    expect(d.action).toBe('hold')
    expect(d.reason).toBe('at_cap_l5')
  })

  it('breaker trip → DEMOTE one rung', () => {
    const d = decidePromotion({ ...base, breakerOpen: true, level: 'l3', cleanSinceLastGrant: 99 })
    expect(d.action).toBe('demote')
    expect(d.to).toBe('l2')
  })

  it('a breaker trip beats any clean streak (safety wins over promotion)', () => {
    expect(decidePromotion({ ...base, breakerOpen: true, level: 'l4', cleanSinceLastGrant: 100 }).action).toBe('demote')
  })

  it('floor holds: breaker open at the floor → HOLD, never demote below manual', () => {
    const d = decidePromotion({ ...base, breakerOpen: true, level: AUTONOMY_FLOOR, cleanSinceLastGrant: 0 })
    expect(d.action).toBe('hold')
    expect(d.to).toBe('manual')
  })

  it('walks the whole ladder one rung at a time, capping at l5', () => {
    const path: string[] = []
    let level: any = 'manual'
    for (let i = 0; i < 8; i++) {
      const d = decidePromotion({ ...base, level, cleanSinceLastGrant: 5 })
      if (d.action !== 'promote') break
      path.push(d.to)
      level = d.to
    }
    expect(path).toEqual(['l2', 'l3', 'l4', 'l5'])
  })
})

// ── PS-AUTONOMY-CRITERIA-01 — both ladders judge by the same rigor. ──
describe('runAutonomyPromotion — criteria + baseline alignment', () => {
  const v1Days = [
    { day: '2026-07-18', clean: true, criteria_version: 1 }, // the unearned-l4 incident day
    { day: '2026-07-19', clean: true, criteria_version: 1 },
    { day: '2026-07-20', clean: true, criteria_version: 1 },
    { day: '2026-07-21', clean: true, criteria_version: 1 },
    { day: '2026-07-22', clean: true, criteria_version: 1 },
  ]

  it('does NOT count v1 rows — five v1 clean days buy zero rungs', async () => {
    const { sql, writes } = fakeSql({ level: 'manual', baseline: '2026-07-23', cleanDays: v1Days })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.cleanSinceLastGrant).toBe(0)
    expect(r.action).toBe('hold')
    expect(r.to).toBe('manual')
    expect(writes.some((w) => /autonomy_grants/.test(w))).toBe(false)
  })

  it('does NOT count v2 rows from BEFORE the baseline', async () => {
    const { sql } = fakeSql({
      level: 'manual', baseline: '2026-07-23',
      cleanDays: [{ day: '2026-07-22', clean: true, criteria_version: 2 }],
    })
    expect((await runAutonomyPromotion('phishsimai', sql)).cleanSinceLastGrant).toBe(0)
  })

  it('DOES count v2 rows at/after the baseline — the ladder still works', async () => {
    const { sql } = fakeSql({
      level: 'manual', baseline: '2026-07-23',
      cleanDays: [
        { day: '2026-07-23', clean: true, criteria_version: 2 },
        { day: '2026-07-24', clean: true, criteria_version: 2 },
      ],
    })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.cleanSinceLastGrant).toBe(2)
    expect(r.action).toBe('promote')
  })

  // The founder's condition: the fix governs FUTURE promotions and must never re-litigate a past one.
  it('NEVER demotes an already-earned level when filtering drops the streak to 0', async () => {
    const { sql, writes } = fakeSql({ level: 'l5', storedStreak: 5, storedCriteria: 1, baseline: '2026-07-23', cleanDays: v1Days })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.action).toBe('hold')
    expect(r.from).toBe('l5')
    expect(r.to).toBe('l5')
    expect(r.reason).toBe('at_cap_l5')
    // No level write of any kind, at any rung.
    expect(writes.some((w) => /SET level=/.test(w))).toBe(false)
  })

  it('an unreadable baseline fails CLOSED — holds, never promotes, never demotes', async () => {
    const { sql, writes } = fakeSql({ level: 'l4', baseline: null, cleanDays: v1Days })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.cleanSinceLastGrant).toBe(0)
    expect(r.action).toBe('hold')
    expect(r.to).toBe('l4')
    expect(writes.some((w) => /SET level=/.test(w))).toBe(false)
  })

  it('a breaker trip still demotes — the safety path is untouched by the filter', async () => {
    const { sql } = fakeSql({ level: 'l5', baseline: '2026-07-23', cleanDays: [], breakerOpen: true })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.action).toBe('demote')
    expect(r.to).toBe('l4')
  })

  it('stamps the criteria version on the streak it stores, and syncs a stale one on hold', async () => {
    const { sql, writes } = fakeSql({ level: 'l5', storedStreak: 5, storedCriteria: 1, baseline: '2026-07-23', cleanDays: v1Days })
    const r = await runAutonomyPromotion('phishsimai', sql)
    expect(r.cleanStreak).toBe(0)
    expect(r.cleanStreakCriteria).toBe(CRITERIA_VERSION)
    // The stale v1 5 is corrected to a labelled v2 0 — and the statement touches no other column.
    const sync = writes.find((w) => /UPDATE os_autonomy_state/.test(w))
    expect(sync).toBeDefined()
    expect(sync).not.toMatch(/level=/)
    expect(sync).not.toMatch(/trust=/)
    expect(JSON.parse(sync!.split(' :: ')[1])).toEqual([0, CRITERIA_VERSION, 'phishsimai'])
  })

  it('writes nothing when the stored streak is already correct and labelled', async () => {
    const { sql, writes } = fakeSql({ level: 'l5', storedStreak: 0, storedCriteria: CRITERIA_VERSION, baseline: '2026-07-23', cleanDays: v1Days })
    await runAutonomyPromotion('phishsimai', sql)
    expect(writes).toHaveLength(0)
  })
})
