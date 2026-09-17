import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ALREADY_AT_L5_FLOOR,
  isAlreadyAtL5FloorAutonomyNoise,
  shouldPageFounderForEscalation,
  isOperatorOwnedEscalation,
  isCrisisAutoMarcusEscalation,
} from './escalationTriagePolicy'

const insertArtifact = {
  category: 'autonomy_change',
  companyId: 'phishsimai',
  payload: {
    outcome: 'raise_refused',
    from: '(insert)',
    attempted: 'l5',
    effective: 'manual',
  },
}

describe('already-at-L5 autonomy_change is founder noise, not a nag', () => {
  it('#202 insert artifact: raise_refused→manual while attempted l5 is already_at_l5_floor', () => {
    expect(isAlreadyAtL5FloorAutonomyNoise(insertArtifact)).toBe(true)
    expect(shouldPageFounderForEscalation(insertArtifact)).toBe(false)
  })

  it('live/stored already l5 and attempted at or below floor is noise', () => {
    expect(isAlreadyAtL5FloorAutonomyNoise({
      category: 'autonomy_change',
      companyId: 'phishsimai',
      liveLevel: 'l5',
      storedLevel: 'l5',
      payload: { outcome: 'raise_refused', from: 'l5', attempted: 'l5', effective: 'l5' },
    })).toBe(true)
    expect(isAlreadyAtL5FloorAutonomyNoise({
      category: 'autonomy_change',
      liveLevel: 'l5',
      payload: { outcome: 'raise_authorized', attempted: 'l4', effective: 'l5' },
    })).toBe(true)
  })

  it('raise_refused still floors to l5 via resolveReadableLevel (stored manual)', () => {
    expect(isAlreadyAtL5FloorAutonomyNoise({
      category: 'autonomy_change',
      storedLevel: 'manual',
      payload: { outcome: 'raise_refused', attempted: 'l2', effective: 'manual' },
    })).toBe(true)
  })

  it('posture drill_3 / l5_7 / higher suppresses raise noise and never founder_required', () => {
    for (const posture of ['l5_7', 'drill_3', 'drill_7', 'drill_15', 'l5_8']) {
      expect(isAlreadyAtL5FloorAutonomyNoise({
        category: 'autonomy_change',
        posture,
        payload: { outcome: 'raise_refused', attempted: 'l5', effective: 'manual' },
      }), posture).toBe(true)
    }
  })

  it('already-resolved autonomy_change is not re-paged', () => {
    expect(shouldPageFounderForEscalation({
      category: 'autonomy_change',
      status: 'approved',
      payload: insertArtifact.payload,
    })).toBe(false)
    expect(shouldPageFounderForEscalation({
      category: 'autonomy_change',
      status: 'deferred',
      payload: { janetTriage: ALREADY_AT_L5_FLOOR },
    })).toBe(false)
  })

  it('stamped already_at_l5_floor is never a growing-urgency re-alert', () => {
    expect(shouldPageFounderForEscalation({
      category: 'autonomy_change',
      status: 'pending',
      payload: { already_at_l5_floor: true, janetTriage: 'founder_required' },
    })).toBe(false)
  })

  it('does not swallow breaker_trip, protected_path, spend, or hard-stop categories', () => {
    for (const category of ['breaker_trip', 'protected_path', 'capital_spend', 'pricing_billing', 'agent_critical']) {
      expect(isAlreadyAtL5FloorAutonomyNoise({
        category,
        liveLevel: 'l5',
        posture: 'drill_3',
        payload: { outcome: 'raise_refused' },
      }), category).toBe(false)
      expect(shouldPageFounderForEscalation({
        category,
        status: 'pending',
        liveLevel: 'l5',
        posture: 'drill_3',
        payload: { last_error: 'consecutive_failures' },
      }), category).toBe(true)
    }
  })

  it('drop / row_deleted stay visible (tamper), operator-owned protected-path stays owned', () => {
    expect(isAlreadyAtL5FloorAutonomyNoise({
      category: 'autonomy_change',
      liveLevel: 'l5',
      posture: 'drill_3',
      payload: { outcome: 'drop', from: 'l5', attempted: 'l4', effective: 'l4' },
    })).toBe(false)
    expect(shouldPageFounderForEscalation({
      category: 'autonomy_change',
      status: 'pending',
      payload: { outcome: 'row_deleted', attempted: '(deleted)' },
    })).toBe(true)
    expect(isOperatorOwnedEscalation({
      category: 'breaker_trip',
      payload: { last_error: 'PRE-FLIGHT REFUSED: task names protected path(s) server/os/routes.ts' },
    })).toBe(true)
  })

  it('other products are not silenced by the PhishSim L5 floor', () => {
    expect(isAlreadyAtL5FloorAutonomyNoise({
      category: 'autonomy_change',
      companyId: 'scrollfuel',
      payload: insertArtifact.payload,
    })).toBe(false)
  })
})

describe('send-path marcus_dispatch is not a founder gate under standing crisis', () => {
  it('auto-approves PS-T1 / sanitize / QEV escalations and does not page the founder', () => {
    const t1 = {
      category: 'marcus_dispatch',
      payload: { task: 'Named bug: PS-T1-STARVE — restore sanitize refill', source: 'agent:dex' },
    }
    expect(isCrisisAutoMarcusEscalation(t1)).toBe(true)
    expect(shouldPageFounderForEscalation(t1)).toBe(false)
    expect(isOperatorOwnedEscalation(t1)).toBe(true)
    expect(isCrisisAutoMarcusEscalation({
      category: 'marcus_dispatch',
      payload: { task: 'QEV_API_KEY empty — mailbox verifier' },
    })).toBe(true)
    expect(isCrisisAutoMarcusEscalation({
      category: 'pricing_billing',
      payload: { task: 'PS-T1-STARVE' },
    })).toBe(false)
    expect(shouldPageFounderForEscalation({
      category: 'marcus_dispatch',
      payload: { task: 'Unrelated architect dispatch about fonts' },
    })).toBe(true)
    const triage = readFileSync('server/os/escalationTriage.ts', 'utf8')
    expect(triage).toContain('CRISIS_AUTO_MARCUS')
    expect(triage).toContain('maybeQueueT1Marcus')
  })
})

describe('raise / triage / notify / brief all consult the L5 floor policy', () => {
  it('does not mark founder_required or re-alert louder for already-at-L5 autonomy_change', () => {
    const triage = readFileSync('server/os/escalationTriage.ts', 'utf8')
    expect(triage).toContain('isAlreadyAtL5FloorAutonomyNoise')
    expect(triage).toContain('ALREADY_AT_L5_FLOOR')
    expect(triage).toContain("resolved_via=${reason}")
    expect(triage).toContain('shouldPageFounderForEscalation')
    const founderRequired = triage.indexOf("janetTriage: 'founder_required'")
    const floorGuard = triage.lastIndexOf('isAlreadyAtL5FloorAutonomyNoise(ctx)', founderRequired)
    expect(floorGuard).toBeGreaterThan(-1)
    expect(founderRequired).toBeGreaterThan(floorGuard)
  })

  it('raiseEscalation and deliverPending skip already-at-L5 autonomy_change', () => {
    const notify = readFileSync('server/os/escalationNotify.ts', 'utf8')
    expect(notify).toContain('shouldPageFounderForEscalation')
    expect(notify).toContain('skip autonomy_change — already_at_l5_floor')
    expect(notify).toContain('suppressed')
    expect(notify).toContain('markNotified')
  })

  it('founder brief does not list raise-noise autonomy_change as pending', () => {
    const brief = readFileSync('server/os/founderBrief.ts', 'utf8')
    expect(brief).toContain('shouldPageFounderForEscalation')
  })

  it('migration closes pending raise_refused nags and stops INSERT rewrite to manual', () => {
    const sql = readFileSync('drizzle/pg/0035_autonomy_floor_no_nag.sql', 'utf8')
    expect(sql).toContain("outcome := 'insert'")
    expect(sql).toContain("NEW.company_id = 'phishsimai'")
    expect(sql).toContain("resolved_via = 'already_at_l5_floor'")
    expect(sql).toContain("payload->>'outcome'")
  })
})
