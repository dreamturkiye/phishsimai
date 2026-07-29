// ─────────────────────────────────────────────────────────────────────────────
//  PS-POSTURE-01 — the L5.7 → L5.8 posture tracker.
//
//  The properties that matter are the ones that keep it honest:
//    · unmeasured blocks, exactly like a violation (never a silent pass)
//    · a streak counts only days judged under the CURRENT criteria, at/after baseline
//    · graduation refuses unless already earned, and refuses an anonymous declarer
//    · a posture the spec measures across products blocks when a product is unreadable
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  computeDayCounters, currentStreak, evaluatePosture, declarePosture, postureLine,
  POSTURE_LABEL, L5_7_CLEAN_DAYS, DRILL_DAYS, CRITERIA_VERSION, handledTrips,
} from './posture'

/** Minimal tagged-template SQL stub: matches on a fragment of the query text. */
function fakeSql(routes: { match: RegExp; rows: any[] | (() => never) }[]) {
  const calls: string[] = []
  const fn = (async (strings: TemplateStringsArray, ...vals: any[]) => {
    const q = strings.join(' ? ').replace(/\s+/g, ' ')
    calls.push(q)
    for (const r of routes) {
      if (r.match.test(q)) { if (typeof r.rows === 'function') r.rows(); return r.rows as any[] }
    }
    return []
  }) as any
  fn.calls = calls
  return fn
}

describe('computeDayCounters — unmeasured is not clean', () => {
  it('counts a clean day when every probe returns zero, metrics exist, and the deploy target is verified', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      // PS-DEPLOY-VERIFY-01: a clean day now also requires a deploy-target verification for the
      // day. The mismatch counter (match=false) is 0, and the presence check finds a row.
      { match: /deploy_verifications.*match=false/, rows: [{ n: 0 }] },
      { match: /deploy_verifications/, rows: [{ n: 1 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    const v = await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(true)
    expect(v.violations).toEqual([])
    expect(v.unmeasured).toEqual([])
  })

  it('BLOCKS the day when a probe throws — silence is not a pass', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      { match: /circuit_breaker_state/, rows: (() => { throw new Error('relation does not exist') }) as any },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    const v = await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(false)
    expect(v.violations).toEqual([]) // nothing was VIOLATED...
    expect(v.unmeasured.join()).toMatch(/open_breakers/) // ...it just could not be seen
  })

  it('BLOCKS the day when the metrics snapshot is missing', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 0 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    const v = await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(false)
    expect(v.unmeasured.join()).toMatch(/no metrics_daily snapshot/)
  })

  it('flags an ungranted level change — the 07-18 incident signature', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      { match: /raise_refused/, rows: [{ n: 1 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    const v = await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    expect(v.clean).toBe(false)
    expect(v.counters.ungranted_level_changes).toBe(1)
    expect(v.violations.join()).toMatch(/ungranted autonomy level change/)
  })

  it('flags a hard-stop violation loudly', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      { match: /hard_stop/, rows: [{ n: 2 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    const v = await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    expect(v.violations.join()).toMatch(/HARD-STOP VIOLATION/)
  })
})

describe('computeDayCounters — every probe is scoped to THIS product', () => {
  // PS-SCOPE-01. The clean-day verdict gates L5.7. An unscoped probe lets a sibling product's
  // failure break PhishSim's streak with no visible cause — the failure would be real, just
  // somebody else's. ep-purple-surf holds four company_ids in these same tables, so this is one
  // connection-string mistake away from being live rather than theoretical.
  it('filters agent_tasks by company_id, like the breaker probe filters product_id', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      { match: /deploy_verifications.*match=false/, rows: [{ n: 0 }] },
      { match: /deploy_verifications/, rows: [{ n: 1 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    const failedProbe = sql.calls.find((q: string) => /FROM agent_tasks WHERE status='failed'/.test(q))
    expect(failedProbe, 'the failed_actions probe must run').toBeTruthy()
    expect(failedProbe).toMatch(/company_id\s*=/)
  })

  it('no probe reads a tenant table unscoped', async () => {
    const sql = fakeSql([
      { match: /metrics_daily/, rows: [{ n: 1 }] },
      { match: /deploy_verifications.*match=false/, rows: [{ n: 0 }] },
      { match: /deploy_verifications/, rows: [{ n: 1 }] },
      { match: /count/, rows: [{ n: 0 }] },
    ])
    await computeDayCounters(sql, 'phishsimai', '2026-07-24')
    for (const q of sql.calls as string[]) {
      // agent_tasks and circuit_breaker_state both carry a scope column — neither may be read bare.
      if (/FROM (agent_tasks|circuit_breaker_state)\b/.test(q)) {
        expect(q, `unscoped read: ${q.slice(0, 90)}`).toMatch(/company_id\s*=|product_id\s*=/)
      }
    }
  })
})

describe('currentStreak — only days the current criteria judged', () => {
  const rows = (days: [string, boolean][]) => days.map(([day, clean]) => ({ day, clean }))

  it('counts consecutive clean days back from the newest', async () => {
    const sql = fakeSql([{ match: /autonomy_clean_days/, rows: rows([
      ['2026-07-27', true], ['2026-07-26', true], ['2026-07-25', true], ['2026-07-24', false],
    ]) }])
    expect((await currentStreak(sql, 'p', '2026-07-01')).streak).toBe(3)
  })

  it('breaks the streak on a GAP — a missing day is not a clean day', async () => {
    const sql = fakeSql([{ match: /autonomy_clean_days/, rows: rows([
      ['2026-07-27', true], ['2026-07-26', true], ['2026-07-24', true], // 07-25 never judged
    ]) }])
    expect((await currentStreak(sql, 'p', '2026-07-01')).streak).toBe(2)
  })

  it('asks only for rows at/after baseline and at the current criteria version', async () => {
    const sql = fakeSql([{ match: /autonomy_clean_days/, rows: [] }])
    await currentStreak(sql, 'p', '2026-07-23')
    expect(sql.calls[0]).toMatch(/criteria_version >=/)
    expect(sql.calls[0]).toMatch(/day >=/)
    expect(CRITERIA_VERSION).toBeGreaterThan(1)
  })
})

describe('evaluatePosture — pre-L5.7 gate', () => {
  const base = (streakRows: any[], trips: number) => fakeSql([
    { match: /os_posture_state/, rows: [{ product_id: 'p', posture: 'pre_l5_7', entered_at: '', declared_by: null, baseline_from: '2026-07-23', notes: null }] },
    { match: /autonomy_clean_days/, rows: streakRows },
    { match: /circuit_breaker_state/, rows: [{ n: trips }] },
  ])

  it('blocks with both criteria shown while building', async () => {
    const ev = await evaluatePosture(base([{ day: '2026-07-24', clean: true }], 0), 'p')
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers).toEqual([
      `1/${L5_7_CLEAN_DAYS} consecutive clean days`,
      '0/1 breaker trip handled cleanly (inject one per spec Section A)',
    ])
  })

  it('still blocks at 5 clean days with no handled breaker trip — spec requires both', async () => {
    const days = ['2026-07-27', '2026-07-26', '2026-07-25', '2026-07-24', '2026-07-23'].map(day => ({ day, clean: true }))
    const ev = await evaluatePosture(base(days, 0), 'p')
    expect(ev.streak).toBe(5)
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers.join()).toMatch(/breaker trip handled/)
  })

  it('becomes eligible only when BOTH criteria are met', async () => {
    const days = ['2026-07-27', '2026-07-26', '2026-07-25', '2026-07-24', '2026-07-23'].map(day => ({ day, clean: true }))
    const ev = await evaluatePosture(base(days, 1), 'p')
    expect(ev.eligibleFor).toBe('l5_7')
    expect(ev.blockers).toEqual([])
    expect(ev.nextStep).toMatch(/ELIGIBLE for L5.7/)
  })
})

describe('declarePosture — declared, never auto-promoted', () => {
  const eligible = () => fakeSql([
    { match: /os_posture_state/, rows: [{ product_id: 'p', posture: 'pre_l5_7', entered_at: '', declared_by: null, baseline_from: '2026-07-23', notes: null }] },
    { match: /autonomy_clean_days/, rows: ['2026-07-27', '2026-07-26', '2026-07-25', '2026-07-24', '2026-07-23'].map(day => ({ day, clean: true })) },
    { match: /circuit_breaker_state/, rows: [{ n: 1 }] },
  ])

  it('refuses an anonymous declarer', async () => {
    const r = await declarePosture(eligible(), 'p', 'l5_7', '  ')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/declared_by is required/)
  })

  it('refuses a posture that has not been earned', async () => {
    const notYet = fakeSql([
      { match: /os_posture_state/, rows: [{ product_id: 'p', posture: 'pre_l5_7', entered_at: '', declared_by: null, baseline_from: '2026-07-23', notes: null }] },
      { match: /autonomy_clean_days/, rows: [{ day: '2026-07-24', clean: true }] },
      { match: /circuit_breaker_state/, rows: [{ n: 0 }] },
    ])
    const r = await declarePosture(notYet, 'p', 'l5_7', 'kaan')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not eligible/)
  })

  it('refuses skipping a rung even when eligible for the next one', async () => {
    const r = await declarePosture(eligible(), 'p', 'l5_8', 'kaan')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/eligible for l5_7, not l5_8/)
  })

  it('accepts a named declarer for an earned posture', async () => {
    const r = await declarePosture(eligible(), 'p', 'l5_7', 'kaan')
    expect(r.ok).toBe(true)
    expect(r.from).toBe('pre_l5_7')
    expect(r.to).toBe('l5_7')
  })
})

describe('evaluatePosture — portfolio scope: a missed push must BLOCK, never pass', () => {
  // PS-POSTURE-03. Under a one-row-per-product-per-day rollup, absence is the only signal that a
  // product stopped reporting. So absence has to block exactly like a violation does.
  const drill15 = (portfolioRows: any[]) => fakeSql([
    { match: /os_posture_state/, rows: [{ product_id: 'phishsimai', posture: 'drill_15', entered_at: '', declared_by: 'kaan', baseline_from: '2026-07-23', notes: null }] },
    { match: /os_posture_drills/, rows: [{ id: 1, kind: 15, started_on: '2026-07-23', ends_on: '2026-08-07', status: 'running' }] },
    { match: /hard_stop_violations/, rows: [{ n: 0 }] },
    { match: /clean_days/, rows: portfolioRows },                       // portfolio probe
    { match: /autonomy_clean_days.*criteria_version/, rows: [{ n: 15 }] }, // local drill days
  ])

  it('blocks when a product reported NOTHING in the window', async () => {
    const ev = await evaluatePosture(drill15([{ clean_days: 0, reported_days: 0 }]), 'phishsimai')
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers.join()).toMatch(/'scrollfuel' reported nothing in this window/)
  })

  it('blocks a PARTIALLY reporting product — 12/15 days is not a pass', async () => {
    const ev = await evaluatePosture(drill15([{ clean_days: 12, reported_days: 12 }]), 'phishsimai')
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers.join()).toMatch(/reported only 12\/15 days — 3 missing day\(s\) are UNMEASURED, not clean/)
  })

  it('blocks a fully-reporting product that had a dirty day', async () => {
    const ev = await evaluatePosture(drill15([{ clean_days: 14, reported_days: 15 }]), 'phishsimai')
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers.join()).toMatch(/'scrollfuel' has 14\/15 clean days/)
  })

  it('still blocks on the untracked self-originated-improvements criterion when all else passes', async () => {
    const ev = await evaluatePosture(drill15([{ clean_days: 15, reported_days: 15 }]), 'phishsimai')
    expect(ev.eligibleFor).toBeNull()
    expect(ev.blockers.join()).not.toMatch(/scrollfuel/)
    expect(ev.blockers.join()).toMatch(/self-originated improvements/)
  })
})

describe('evaluatePosture — the streak is COMPUTED LIVE, never read from a stored column', () => {
  // os_autonomy_state.clean_day_streak is a SECOND, stored streak, written by the promotion job.
  // On 2026-07-26 it happened to agree with the live value (both 3), which is exactly how a
  // lagging display goes unnoticed. The posture line must never source the number from there:
  // that column is only written when the promotion job runs, so a missed run would freeze the
  // gate's headline number while the real streak moved. Pin the source, not the coincidence.
  it('reads autonomy_clean_days and never touches os_autonomy_state', async () => {
    const sql = fakeSql([
      { match: /os_posture_state/, rows: [{ product_id: 'phishsimai', posture: 'pre_l5_7', baseline_from: '2026-07-23' }] },
      { match: /autonomy_clean_days/, rows: [
        { day: '2026-07-25', clean: true }, { day: '2026-07-24', clean: true }, { day: '2026-07-23', clean: true },
      ] },
      { match: /escalations/, rows: [{ n: 0 }] },
    ])
    const ev = await evaluatePosture(sql, 'phishsimai')
    expect(ev.streak).toBe(3)
    expect(ev.lastJudgedDay).toBe('2026-07-25')
    // The guarantee: the stored streak column is never consulted.
    expect(sql.calls.some((q: string) => /os_autonomy_state|clean_day_streak/.test(q))).toBe(false)
    expect(sql.calls.some((q: string) => /autonomy_clean_days/.test(q))).toBe(true)
  })

  it('a gap breaks the run — a missing day is not a clean one', async () => {
    const sql = fakeSql([
      { match: /os_posture_state/, rows: [{ product_id: 'phishsimai', posture: 'pre_l5_7', baseline_from: '2026-07-20' }] },
      { match: /autonomy_clean_days/, rows: [
        { day: '2026-07-25', clean: true }, { day: '2026-07-24', clean: true },
        /* 07-23 missing entirely */ { day: '2026-07-22', clean: true },
      ] },
      { match: /escalations/, rows: [{ n: 0 }] },
    ])
    const ev = await evaluatePosture(sql, 'phishsimai')
    expect(ev.streak).toBe(2)
  })
})

describe('postureLine — shows the denominator, not a bare state', () => {
  it('renders progress with what is left', () => {
    const line = postureLine({
      posture: 'pre_l5_7', label: POSTURE_LABEL.pre_l5_7, baselineFrom: '2026-07-23', streak: 2,
      lastJudgedDay: '2026-07-24', needDays: 5, handled: 0, needHandled: 1, eligibleFor: null,
      blockers: ['2/5 consecutive clean days'], nextStep: '', drill: null,
    })
    expect(line).toBe('🎖 Posture: pre-L5.7 · 2/5 clean days · breaker trips 0/1 · next: 5 consecutive clean days (3 to go)')
  })

  it('does not echo the streak fraction back as the next step', () => {
    const line = postureLine({
      posture: 'pre_l5_7', label: POSTURE_LABEL.pre_l5_7, baselineFrom: '2026-07-23', streak: 3,
      lastJudgedDay: '2026-07-25', needDays: 5, handled: 0, needHandled: 1, eligibleFor: null,
      blockers: ['3/5 consecutive clean days', '0/1 breaker trip handled cleanly (inject one per spec Section A)'],
      nextStep: '', drill: null,
    })
    expect(line).toContain('3/5 clean days')
    expect(line).toContain('next: 5 consecutive clean days (2 to go)')
    expect(line).not.toContain('next: 3/5')
  })

  it('once the streak is met, next names the blocker that actually remains', () => {
    const line = postureLine({
      posture: 'pre_l5_7', label: POSTURE_LABEL.pre_l5_7, baselineFrom: '2026-07-23', streak: 5,
      lastJudgedDay: '2026-07-27', needDays: 5, handled: 0, needHandled: 1, eligibleFor: null,
      blockers: ['0/1 breaker trip handled cleanly (inject one per spec Section A)'],
      nextStep: '', drill: null,
    })
    expect(line).toContain('next: 0/1 breaker trip handled cleanly')
  })

  it('announces eligibility rather than advancing', () => {
    const line = postureLine({
      posture: 'pre_l5_7', label: POSTURE_LABEL.pre_l5_7, baselineFrom: '2026-07-23', streak: 5,
      lastJudgedDay: '2026-07-27', needDays: 5, handled: 1, needHandled: 1, eligibleFor: 'l5_7',
      blockers: [], nextStep: '', drill: null,
    })
    expect(line).toMatch(/ELIGIBLE — declare L5.7/)
  })

  it('renders drill progress against the spec-staged length', () => {
    const line = postureLine({
      posture: 'drill_7', label: POSTURE_LABEL.drill_7, baselineFrom: '2026-07-23', streak: 9,
      lastJudgedDay: '2026-08-01', needDays: DRILL_DAYS.drill_7, handled: null, needHandled: 0,
      eligibleFor: null, blockers: ['4/7 clean drill days'], nextStep: '',
      drill: { kind: 7, started_on: '2026-07-29', ends_on: '2026-08-05', daysDone: 4, status: 'running' },
    })
    expect(line).toMatch(/drill day 4\/7/)
  })
})

describe('handledTrips — PS-POSTURE-02, the criterion must be satisfiable', () => {
  // The predicate this replaces was `state='closed' AND opened_at IS NOT NULL`. Closing a breaker
  // nulls opened_at, so a handled trip stopped matching the instant it was handled — the L5.7
  // gate could not be passed by doing the right thing.
  it('counts a tripped-then-closed breaker via its surviving escalation row', async () => {
    const sql = fakeSql([{ match: /escalations/, rows: [{ n: 1 }] }])
    expect(await handledTrips(sql, 'p', '2026-07-01')).toBe(1)
  })

  it('queries the escalation trail, NOT the self-erasing opened_at predicate', async () => {
    const sql = fakeSql([{ match: /escalations/, rows: [{ n: 0 }] }])
    await handledTrips(sql, 'p', '2026-07-01')
    expect(sql.calls[0]).toMatch(/breaker_trip/)
    expect(sql.calls[0]).not.toMatch(/opened_at IS NOT NULL/)
  })

  it('returns null (blocking) when it cannot measure — never a reassuring 0', async () => {
    const sql = fakeSql([{ match: /escalations/, rows: (() => { throw new Error('nope') }) as any }])
    expect(await handledTrips(sql, 'p', '2026-07-01')).toBeNull()
  })
})
