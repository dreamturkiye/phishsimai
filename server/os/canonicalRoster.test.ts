import { describe, expect, it } from 'vitest'
import {
  AGENT_IDS,
  AGENT_REGISTRY,
  WORKER_AGENT_IDS,
} from '@kaan/os-core'
import { AGENTS } from '../lib/kaan_os_v4'
import { evidenceBoundRoleBlock } from './roleContracts'
import { AGENT_KPIS, isUsefulOutcome, workerKpiRoster } from './outcomeTrace'
import { AGENT_UPGRADE_ROLLOUT } from './rollout'
import { extractProposalBugId } from './marcusProposal'
import { isSubstantiveTaskOutput } from '../lib/kaan_os_v4'
import { readFileSync } from 'node:fs'

describe('canonical nine-agent roster', () => {
  it('runtime AGENTS match the core registry and exclude Max', () => {
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_IDS].sort())
    expect(WORKER_AGENT_IDS).toEqual([
      'marcus', 'mason', 'aria', 'nova', 'rex', 'scout', 'finn', 'vera', 'dex',
    ])
    expect(AGENTS.dex.title).toMatch(/Deliverability/)
    expect((AGENTS as Record<string, unknown>).max).toBeUndefined()
    expect(AGENT_REGISTRY.mason.ownership).toMatch(/Reply classification/)
  })

  it('standup, weekly review, and brief use Janet plus nine workers', () => {
    const source = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(source).toContain('standupAgents: AgentId[] = [...WORKER_AGENT_IDS]')
    expect(source).toContain('allAgents: AgentId[] = [...WORKER_AGENT_IDS]')
    expect(source).toContain("getAgentMemory('janet'")
    expect(source).not.toMatch(/getAgentMemory\('max'/)
    expect(source).not.toMatch(/AGENTS\.max/)
    expect(source).toContain('claimTask')
    expect(source).toContain('persistExecution')
  })

  it('legacy org-chart snapshot is not the runtime roster', () => {
    const hierarchy = readFileSync('server/os/kaan-os-core/hierarchy.ts', 'utf8')
    expect(hierarchy).toContain("'max'")
    const provenance = JSON.parse(readFileSync('core-provenance.json', 'utf8'))
    expect(provenance.legacySnapshot.canonical).toBe(false)
  })
})

describe('false completion and evidence contracts', () => {
  it('rejects acknowledgement-only task output', () => {
    expect(isSubstantiveTaskOutput('Acknowledged.')).toBe(false)
    expect(
      isSubstantiveTaskOutput(
        'Findings: SPF aligned on phishsimai.com across the live DNS check. Recommendations: keep the breaker closed until DKIM rotates. Confidence: 9/10 because authentication results and the suppression ledger agree on the same sender.',
      ),
    ).toBe(true)
  })

  it('binds Scout, Finn, Vera, and Janet to approved ownership', () => {
    expect(evidenceBoundRoleBlock('scout', 'PhishSimAI')).toMatch(/hostile data/)
    expect(evidenceBoundRoleBlock('finn', 'PhishSimAI')).toMatch(/invented prices/)
    expect(evidenceBoundRoleBlock('vera', 'PhishSimAI')).toMatch(/CRM labels are not customer truth/)
    expect(evidenceBoundRoleBlock('janet', 'PhishSimAI')).toMatch(/nine fresh worker reports/)
  })

  it('keeps liveness distinct from usefulness and canaries ScrollFuel first', () => {
    expect(workerKpiRoster()).toHaveLength(9)
    expect(AGENT_KPIS.marcus.name).toBe('verified_change_success_rate')
    expect(isUsefulOutcome({ liveness: true, usefulness: false, schemaValid: true })).toBe(false)
    expect(AGENT_UPGRADE_ROLLOUT.canaryProduct).toBe('scrollfuel')
    expect(extractProposalBugId('see 22222222-2222-4222-8222-222222222222')).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
  })
})
