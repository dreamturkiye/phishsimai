import { describe, expect, it } from 'vitest'
import {
  GOALS_BY_WEEK,
  conversionDefaultTask,
  employeeExecutePrompt,
  employeeExecutionMandate,
  goalsForWeek,
  isTrialCrisis,
  janetCgoMandate,
  verifiedTrialCount,
  zeroTrialCrisisTasks,
} from './cgoMandate'
import { evidenceBoundRoleBlock } from './roleContracts'
import { voidPremiseFor } from '../lib/kaan_os_v4'
import { readFileSync } from 'node:fs'

describe('Janet CGO mandate', () => {
  it('requires verified 30-day trials in week 1 instead of sandbagging to zero', () => {
    expect(GOALS_BY_WEEK[0].week).toBe(1)
    expect(GOALS_BY_WEEK[0].trialsTarget).toBeGreaterThanOrEqual(20)
    expect(goalsForWeek(1).trialsTarget).toBe(GOALS_BY_WEEK[0].trialsTarget)
    expect(GOALS_BY_WEEK.every((g) => g.trialsTarget > 0)).toBe(true)
  })

  it('treats fewer than 20 verified trials as a sprint crisis', () => {
    expect(verifiedTrialCount({ liveProductTrials: 0, crmTrials: 0 })).toBe(0)
    expect(isTrialCrisis({ liveProductTrials: 0, crmTrials: 0 })).toBe(true)
    expect(isTrialCrisis({ liveProductTrials: 1, crmTrials: 0 })).toBe(true)
    expect(isTrialCrisis({ liveProductTrials: 19, crmTrials: 19 })).toBe(true)
    expect(isTrialCrisis({ liveProductTrials: 20, crmTrials: 0 })).toBe(false)
  })

  it('forces Mason, Aria, and Nova conversion work when trials are zero', () => {
    const owners = zeroTrialCrisisTasks().map((t) => t.agentId)
    expect(owners).toEqual(expect.arrayContaining(['mason', 'aria', 'nova', 'rex']))
    expect(zeroTrialCrisisTasks().every((t) => /trial/i.test(`${t.title} ${t.description}`))).toBe(true)
    for (const task of zeroTrialCrisisTasks()) {
      expect(voidPremiseFor(task.title, task.description)).toBeNull()
    }
  })

  it('tells Janet she owns paid MRR and forbids fake trials', () => {
    const mandate = janetCgoMandate()
    expect(mandate).toMatch(/shrewd/)
    expect(mandate).toMatch(/20 verified/)
    expect(mandate).toMatch(/cannot fake numbers/)
    expect(employeeExecutionMandate()).toMatch(/full-time employee/)
  })

  it('makes execute prompts do the work instead of writing an analysis', () => {
    const prompt = employeeExecutePrompt({ title: 'Convert engaged MSPs', description: '30-day no-card trial', priority: 'high' })
    expect(prompt).toMatch(/Do the work now/)
    expect(prompt).toMatch(/convert_warm/)
    expect(prompt).not.toMatch(/What you did \/ your analysis/)
    expect(conversionDefaultTask('mason', 'pipeline', 'Sales')).toMatch(/30-day/)
    expect(employeeExecutionMandate()).not.toMatch(/email customers directly/)
  })
})

describe('coded enforcers are wired', () => {
  it('standup issues the crisis pack and no longer forbids conversion on a small funnel', () => {
    const os = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(os).toContain('zeroTrialCrisisTasks')
    expect(os).toContain('conversionDefaultTask')
    expect(os).toContain('employeeExecutePrompt')
    expect(os).toContain('janetCgoMandate')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toContain('applyOwnerAutonomyRuling')
    expect(os).toContain('does NOT forbid converting')
    expect(os).toContain('runCgoConversionShift')
    expect(os).toContain('convert_warm')
    expect(os).toContain('sendWarmTrialCtas')
    expect(readFileSync('server/_core/oauth.ts', 'utf8')).toContain('startProductTrial')
    expect(readFileSync('server/os/startProductTrial.ts', 'utf8')).toContain('createOrganization')
    expect(os).not.toMatch(/Your team is TEXT-ONLY/)
    expect(readFileSync('vercel.json', 'utf8')).toContain('/api/os/task-runner')
    expect(os).not.toMatch(/Do NOT assign conversion/)
    expect(os).not.toMatch(/identify and begin the single highest-impact improvement/)
  })

  it('live report names the crisis enforcer', () => {
    const janet = readFileSync('server/os/janet.ts', 'utf8')
    expect(janet).toMatch(/20 verified free trials NOW/)
    expect(janet).toContain('ownerRuling.ts')
  })

  it('keeps nine-report synthesis and adds the trial-crisis hard stop', () => {
    expect(evidenceBoundRoleBlock('janet', 'PhishSimAI')).toMatch(/nine fresh worker reports/)
    expect(evidenceBoundRoleBlock('janet', 'PhishSimAI')).toMatch(/Zero trials is a crisis/)
    expect(evidenceBoundRoleBlock('mason', 'PhishSimAI')).toMatch(/full-time employee/)
  })
})
