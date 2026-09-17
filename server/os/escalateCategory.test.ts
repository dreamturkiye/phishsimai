import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { escalateCategoryFor, ESCALATION_CATEGORIES } from './escalateCategory'
import { findDuplicateArchitectTask, normalizeArchitectTaskKey } from './selfHeal'
import { isLeadEligibilitySpam } from './t1MarcusHandoff'

describe('escalateCategoryFor — prod CHECK has no founder_decision', () => {
  it('maps Aria-style generic escalate to agent_critical', () => {
    expect(escalateCategoryFor('Need a human call on this reply')).toBe('agent_critical')
    expect(escalateCategoryFor('founder_decision')).toBe('agent_critical')
    expect(escalateCategoryFor('Need a founder decision')).not.toBe('founder_decision' as any)
  })

  it('maps send-path / T1 starve to marcus_dispatch not a void category', () => {
    expect(escalateCategoryFor('PS-T1-STARVE sanitize refill')).toBe('marcus_dispatch')
    expect(escalateCategoryFor('QEV empty, T1 cannot send')).toBe('marcus_dispatch')
  })

  it('keeps true founder lanes', () => {
    expect(escalateCategoryFor('Change list price / billing')).toBe('pricing_billing')
    expect(escalateCategoryFor('Sign a legal contract')).toBe('legal_contract')
    expect(escalateCategoryFor('Capital spend over $500')).toBe('capital_spend')
  })

  it('CHECK-legal set has no founder_decision', () => {
    expect(ESCALATION_CATEGORIES).not.toContain('founder_decision')
    expect(ESCALATION_CATEGORIES).toEqual(expect.arrayContaining([
      'pricing_billing', 'capital_spend', 'legal_contract', 'new_subsidiary',
      'protected_path', 'breaker_trip', 'autonomy_change', 'marcus_dispatch', 'agent_critical',
    ]))
  })
})

describe('architect task 24h normalized dedupe', () => {
  it('collapses Fix Lead Eligibility Checker clones regardless of punctuation', () => {
    expect(normalizeArchitectTaskKey('Fix Lead Eligibility Checker')).toBe(
      normalizeArchitectTaskKey('fix  lead eligibility checker!!!'),
    )
    const open = [
      { id: 'a1', task: 'Fix Lead Eligibility Checker', source: 'agent:marcus' },
    ]
    expect(
      findDuplicateArchitectTask(open, {
        task: 'Fix Lead Eligibility Checker — retry',
        source: 'agent:marcus',
      }),
    ).toBe('a1')
    expect(isLeadEligibilitySpam('Fix Lead Eligibility Checker')).toBe(true)
  })

  it('does not collapse unrelated open work', () => {
    const open = [{ id: 'a1', task: 'Fix Lead Eligibility Checker', source: 'agent:marcus' }]
    expect(
      findDuplicateArchitectTask(open, { task: 'Named bug: PS-T1-STARVE', source: 'agent:dex' }),
    ).toBeNull()
  })

  it('queueJanetArchitectTask runs the 24h normalized title/source check', () => {
    const src = readFileSync('server/os/selfHeal.ts', 'utf8')
    expect(src).toContain('findDuplicateArchitectTask')
    expect(src).toContain("INTERVAL '24 hours'")
    const os = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(os).toContain('escalateCategoryFor')
    expect(os).toContain('source: `agent:${agentId}`')
    expect(os).not.toMatch(/VALUES \(\$\{companyId\}, 'founder_decision'/)
  })
})
