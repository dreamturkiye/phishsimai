import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  escalateCategoryFor,
  escalateShouldQueueMarcus,
  ESCALATION_CATEGORIES,
  PROD_ESCALATION_CHECK,
} from './escalateCategory'
import { findDuplicateArchitectTask, normalizeArchitectTaskKey } from './selfHeal'
import { isLeadEligibilitySpam, isNamedT1MarcusTask, supersedeLeadEligibilitySpam } from './t1MarcusHandoff'

const PROD_CHECK = [
  'pricing_billing', 'capital_spend', 'legal_contract', 'new_subsidiary', 'protected_path',
  'breaker_trip', 'autonomy_change', 'marcus_dispatch', 'agent_critical',
] as const

describe('escalateCategoryFor — prod CHECK has no founder_decision', () => {
  it('maps Aria-style generic escalate to agent_critical', () => {
    expect(escalateCategoryFor('Need a human call on this reply')).toBe('agent_critical')
    expect(escalateCategoryFor('founder_decision')).toBe('agent_critical')
    expect(escalateCategoryFor('Need a founder decision')).not.toBe('founder_decision' as any)
    expect(escalateShouldQueueMarcus('agent_critical')).toBe(false)
  })

  it('maps send-path / T1 starve to marcus_dispatch and prefers queue_marcus', () => {
    expect(escalateCategoryFor('PS-T1-STARVE sanitize refill')).toBe('marcus_dispatch')
    expect(escalateCategoryFor('QEV empty, T1 cannot send')).toBe('marcus_dispatch')
    expect(escalateShouldQueueMarcus('marcus_dispatch')).toBe(true)
    expect(escalateShouldQueueMarcus('pricing_billing')).toBe(false)
  })

  it('keeps true founder lanes', () => {
    expect(escalateCategoryFor('Change list price / billing')).toBe('pricing_billing')
    expect(escalateCategoryFor('Sign a legal contract')).toBe('legal_contract')
    expect(escalateCategoryFor('Capital spend over $500')).toBe('capital_spend')
  })

  it('CHECK-legal set matches prod 0010 exactly — no founder_decision', () => {
    expect(ESCALATION_CATEGORIES).not.toContain('founder_decision')
    expect([...ESCALATION_CATEGORIES].sort()).toEqual([...PROD_CHECK].sort())
    expect([...PROD_ESCALATION_CHECK].sort()).toEqual([...PROD_CHECK].sort())
    const mig = readFileSync('drizzle/pg/0010_autonomy_escalation.sql', 'utf8')
    expect(mig).toContain("category = ANY (ARRAY[")
    for (const c of PROD_CHECK) expect(mig).toContain(`'${c}'`)
    expect(mig).not.toContain('founder_decision')
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

  it('queueJanetArchitectTask runs the 24h normalized title/source check and cancels the clone storm', () => {
    const src = readFileSync('server/os/selfHeal.ts', 'utf8')
    expect(src).toContain('findDuplicateArchitectTask')
    expect(src).toContain("INTERVAL '24 hours'")
    expect(src).toContain('supersedeLeadEligibilitySpam')
    expect(src).toContain('keepArchitectTask')
    const os = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(os).toContain('escalateCategoryFor')
    expect(os).toContain('escalateShouldQueueMarcus')
    expect(os).toContain('source: `agent:${agentId}`')
    expect(os).not.toMatch(/VALUES \(\$\{companyId\}, 'founder_decision'/)
    expect(os).toMatch(/send-path escalate routed to Marcus/)
  })

  it('supersede cancels every Lead Eligibility Checker clone, not a 200-row sample', async () => {
    expect(isNamedT1MarcusTask('Named bug: PS-T1-STARVE — restore sanitize')).toBe(true)
    const queries: string[] = []
    const sql = (strings: TemplateStringsArray) => {
      queries.push(strings.join(' ? '))
      return Promise.resolve([{ id: 'z1' }, { id: 'z2' }])
    }
    const n = await supersedeLeadEligibilitySpam(sql, 'keep-t1')
    expect(n).toBe(2)
    expect(queries.join('\n')).toMatch(/lead eligibility checker/i)
    expect(queries.join('\n')).toMatch(/cancelled/)
    expect(queries.join('\n')).not.toMatch(/LIMIT 200/)
  })
})
