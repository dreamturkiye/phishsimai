import { describe, expect, it } from 'vitest'
import {
  diagnoseRevenueFailure,
  GOALS_BY_WEEK,
  assignmentSkipReason,
  breakerAwareAssignRule,
  conversionDefaultTask,
  droughtIdleAction,
  emptyWarmPoolNextActions,
  employeeExecutePrompt,
  employeeExecutionMandate,
  goalsForWeek,
  isAnalysisOnlyTitle,
  isConversionBoundTitle,
  isOperatingCrisis,
  isPaidConversionCrisis,
  isProspectColdSendTitle,
  isT1Starved,
  isTrialCrisis,
  isWarmPoolExhausted,
  janetCgoMandate,
  operatingCrisisTasks,
  paidConversionCrisisTasks,
  scoreAwareAssignHint,
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

  it('treats 1 TRUE trial and 0 paying as BOTH a trial crisis and a paying crisis', () => {
    const today = { liveProductTrials: 1, crmTrials: 0, payingCustomers: 0 }
    expect(isTrialCrisis(today)).toBe(true)
    expect(isPaidConversionCrisis(today)).toBe(true)
    expect(isOperatingCrisis(today)).toBe(true)
    expect(isPaidConversionCrisis({ liveProductTrials: 20, crmTrials: 0, payingCustomers: 1 })).toBe(true)
    expect(isPaidConversionCrisis({ liveProductTrials: 0, crmTrials: 0, payingCustomers: 0 })).toBe(true)
    expect(isPaidConversionCrisis({ liveProductTrials: 20, crmTrials: 0, payingCustomers: null })).toBe(false)
    expect(isPaidConversionCrisis({ liveProductTrials: 20, crmTrials: 0, payingCustomers: 4 })).toBe(false)
    expect(isPaidConversionCrisis({ liveProductTrials: 20, crmTrials: 0, payingCustomers: 5 })).toBe(false)
  })

  it('names the 2026-09-14 $0 MRR / 1 TRUE / 14 engaged / auto_reply trap as bottlenecks', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1,
      paying: 0,
      rawTrials: 100,
      excluded: 99,
      greyBoxDaysLeft: 10,
      warm: {
        replied: 15, engaged: 14, sendable: 14, eligible: 0,
        cooldown: 0, exhausted: 0, suppressed: 0, autoReplyPending: 14,
      },
    })
    expect(d.crisis).toBe(true)
    expect(d.line).toMatch(/REVENUE FAILURE/)
    expect(d.line).not.toMatch(/all normal/)
    expect(d.bottlenecks.join(' ')).toMatch(/15 replied/)
    expect(d.bottlenecks.join(' ')).toMatch(/auto_reply/)
    expect(d.bottlenecks.join(' ')).toMatch(/Grey Box/)
    expect(d.bottlenecks.join(' ')).toMatch(/canary noise/)
    expect(d.nextActions.join(' ')).toMatch(/convert_warm|Grey Box|91\/92|follow-up/)
  })

  it('eligible=0 + T1 starved → queue Marcus / refill / QEV, not another convert_warm', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1,
      paying: 0,
      warm: {
        replied: 15, engaged: 14, sendable: 14, eligible: 0,
        cooldown: 0, exhausted: 0, suppressed: 0, autoReplyPending: 14,
      },
      t1: {
        daysSinceLastT1: 5,
        sanitizedEligible: 0,
        unsanitizedEligible: 6435,
        pauseNewTouch1: true,
        verifier: { mev: false, qev: false, any: false },
        warmCtaToTrue: { ctaSent: 17, trueTrials: 0 },
      },
    })
    const next = d.nextActions.join(' ')
    expect(next).toMatch(/queue_marcus/)
    expect(next).toMatch(/PS-T1-/)
    expect(next).toMatch(/QEV|sanitize/)
    expect(next).not.toMatch(/convert_warm/)
    expect(d.line).not.toMatch(/Fire convert_warm/)
    expect(d.line).toMatch(/queue_marcus/)
  })

  it('names exhausted 90/91/92 as founder 1:1, not touch 93', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1, paying: 0,
      warm: {
        replied: 15, engaged: 14, sendable: 14, eligible: 0,
        cooldown: 0, exhausted: 14, suppressed: 0, autoReplyPending: 0,
      },
    })
    expect(d.nextActions.join(' ')).toMatch(/founder-review 1:1|founder 1:1/)
    expect(d.nextActions.join(' ')).toMatch(/NOT touch 93/)
    expect(d.nextActions.join(' ')).not.toMatch(/touch 93 mass/)
  })

  it('names parked touch-90 cooldown as the next crisis follow-up, not wait 4 days', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1, paying: 0,
      warm: {
        replied: 15, engaged: 14, sendable: 14, eligible: 0,
        cooldown: 14, exhausted: 0, suppressed: 0, autoReplyPending: 12,
      },
    })
    expect(d.nextActions.join(' ')).toMatch(/91\/92/)
    expect(d.bottlenecks.join(' ')).toMatch(/cooldown=14/)
  })

  it('eligible=0 + exhausted + T1 healthy → LinkedIn / Grey Box / trial path, not convert_warm', () => {
    const warm = {
      replied: 15, engaged: 14, sendable: 14, eligible: 0,
      cooldown: 0, exhausted: 12, suppressed: 2, autoReplyPending: 0,
    }
    expect(isWarmPoolExhausted(warm)).toBe(true)
    expect(isT1Starved({
      daysSinceLastT1: 0.2,
      sanitizedEligible: 400,
      unsanitizedEligible: 6000,
      pauseNewTouch1: false,
      verifier: { mev: true, qev: true, any: true },
    })).toBe(false)
    const d = diagnoseRevenueFailure({
      trueTrials: 1,
      paying: 0,
      warm,
      t1: {
        daysSinceLastT1: 0.2,
        sanitizedEligible: 400,
        unsanitizedEligible: 6000,
        pauseNewTouch1: false,
        verifier: { mev: true, qev: true, any: true },
      },
    })
    const next = d.nextActions.join(' ')
    expect(next).not.toMatch(/convert_warm/)
    expect(next).toMatch(/LinkedIn/)
    expect(next).toMatch(/Grey Box/)
    expect(next).toMatch(/\/trial|Stripe/)
    expect(d.line).not.toMatch(/Fire convert_warm/)
    expect(emptyWarmPoolNextActions().join(' ')).not.toMatch(/convert_warm/)
  })

  it('names Dex combined_daily_cap as a throttle, not PS-T1-STARVE', () => {
    const d = diagnoseRevenueFailure({
      trueTrials: 1,
      paying: 0,
      t1: {
        daysSinceLastT1: 2,
        sanitizedEligible: 150,
        unsanitizedEligible: 6000,
        pauseNewTouch1: false,
        verifier: { mev: true, qev: true, any: true },
        t1StarveReason: 'combined_daily_cap',
      },
    })
    expect(d.line).toMatch(/combined_daily_cap/)
    expect(d.line).toMatch(/wait UTC/)
    expect(d.nextActions.join(' ')).not.toMatch(/queue_marcus/)
    expect(d.nextActions.join(' ')).not.toMatch(/PS-T1-STARVE/)
    expect(isT1Starved({
      sanitizedEligible: 150,
      t1StarveReason: 'combined_daily_cap',
      verifier: { mev: true, qev: true, any: true },
    })).toBe(false)
  })

  it('does not treat canary-inflated 92 as the operating number — 92 TRUE would be paid-only', () => {
    const inflatedWouldHaveBeen = { liveProductTrials: 92, crmTrials: 0, payingCustomers: 0 }
    expect(isTrialCrisis(inflatedWouldHaveBeen)).toBe(false)
    expect(isPaidConversionCrisis(inflatedWouldHaveBeen)).toBe(true)
  })

  it('issues conversion-bound work (not analyze/research/500-cold) in the paid-conversion pack', () => {
    const pack = paidConversionCrisisTasks()
    expect(pack.map((t) => t.agentId)).toEqual(expect.arrayContaining(['mason', 'aria', 'nova', 'vera', 'finn', 'dex']))
    for (const task of pack) {
      expect(isConversionBoundTitle(task.title, task.description)).toBe(true)
      expect(isAnalysisOnlyTitle(task.title, task.description)).toBe(false)
      expect(voidPremiseFor(task.title, task.description)).toBeNull()
    }
    const titles = pack.map((t) => t.title).join('\n')
    expect(titles).toMatch(/Grey Box/)
    expect(titles).not.toMatch(/500\s*(MSP|msp)/)
    expect(titles).not.toMatch(/analyze funnel/i)
    expect(titles).not.toMatch(/research TOF/i)
  })

  it('refuses analysis-only titles that crowded out conversion on 2026-09-14', () => {
    expect(isAnalysisOnlyTitle('Analyze funnel conversion')).toBe(true)
    expect(isAnalysisOnlyTitle('Research TOF beyond email')).toBe(true)
    expect(isAnalysisOnlyTitle('Mason cold outreach 500 MSP')).toBe(true)
    expect(isAnalysisOnlyTitle('Send warm trial CTAs and follow up existing trial orgs today')).toBe(false)
    expect(isConversionBoundTitle('Ship one trial-to-paid experiment with a live upgrade CTA')).toBe(true)
  })

  it('lets the true-trial pack keep Mason/Aria/Nova when both crises apply', () => {
    const both = operatingCrisisTasks({ liveProductTrials: 1, crmTrials: 0, payingCustomers: 0 })
    const mason = both.find((t) => t.agentId === 'mason')
    expect(mason?.title).toMatch(/20 hottest/)
    expect(mason?.title).not.toMatch(/warm trial CTAs/i)
    expect(both.map((t) => t.agentId)).toEqual(expect.arrayContaining(['mason', 'aria', 'nova', 'rex', 'scout', 'dex', 'vera', 'finn', 'marcus']))
  })

  it('issues only the paying pack once TRUE trials are at 20', () => {
    const pack = operatingCrisisTasks({ liveProductTrials: 20, crmTrials: 0, payingCustomers: 0 })
    const mason = pack.find((t) => t.agentId === 'mason')
    expect(mason?.title).toMatch(/Grey Box|warm CTA/i)
    expect(isTrialCrisis({ liveProductTrials: 20, crmTrials: 0, payingCustomers: 0 })).toBe(false)
  })

  it('forces Mason, Aria, Nova, Scout, and Dex conversion work when trials are zero', () => {
    const owners = zeroTrialCrisisTasks().map((t) => t.agentId)
    expect(owners).toEqual(expect.arrayContaining(['mason', 'aria', 'nova', 'rex', 'scout', 'dex', 'marcus']))
    expect(zeroTrialCrisisTasks().every((t) => /trial/i.test(`${t.title} ${t.description}`))).toBe(true)
    for (const task of zeroTrialCrisisTasks()) {
      expect(isConversionBoundTitle(task.title, task.description)).toBe(true)
      expect(isAnalysisOnlyTitle(task.title, task.description)).toBe(false)
      expect(voidPremiseFor(task.title, task.description)).toBeNull()
    }
  })

  it('tells Janet she owns paid MRR and forbids fake trials', () => {
    const mandate = janetCgoMandate()
    expect(mandate).toMatch(/shrewd/)
    expect(mandate).toMatch(/20 TRUE/)
    expect(mandate).toMatch(/cannot fake numbers/)
    expect(mandate).toMatch(/PERMANENT operating crisis/)
    expect(mandate).toMatch(/Grey Box/)
    expect(employeeExecutionMandate()).toMatch(/full-time employee/)
    expect(employeeExecutionMandate()).toMatch(/true trials are below 20/)
  })

  it('makes execute prompts do the work instead of writing an analysis', () => {
    const prompt = employeeExecutePrompt({ title: 'Convert engaged MSPs', description: '30-day no-card trial', priority: 'high' })
    expect(prompt).toMatch(/Do the work now/)
    expect(prompt).toMatch(/convert_warm/)
    expect(prompt).not.toMatch(/What you did \/ your analysis/)
    expect(conversionDefaultTask('mason', 'pipeline', 'Sales')).toMatch(/30-day/)
    expect(employeeExecutionMandate()).not.toMatch(/email customers directly/)
  })

  it('rewrites idle rest to a conversion-bound lane mandate', () => {
    expect(droughtIdleAction('mason')).toBe('convert_warm: hottest')
    expect(isConversionBoundTitle(droughtIdleAction('scout'))).toBe(true)
    expect(isConversionBoundTitle(droughtIdleAction('dex'))).toBe(true)
    expect(isProspectColdSendTitle('Mason cold outreach 500 MSP')).toBe(true)
    expect(isProspectColdSendTitle('Send warm trial CTAs to replied leads')).toBe(false)
  })

  it('does not assign convert_warm as the idle mandate when the warm pool is exhausted', () => {
    const warm = {
      replied: 15, engaged: 14, sendable: 14, eligible: 0,
      cooldown: 0, exhausted: 12, suppressed: 2, autoReplyPending: 0,
    }
    for (const id of ['janet', 'mason', 'aria', 'nova', 'vera'] as const) {
      const action = droughtIdleAction(id, { warm })
      expect(action).not.toMatch(/convert_warm:\s*hottest/)
      expect(action).toMatch(/Do not convert_warm/)
      expect(isConversionBoundTitle(action)).toBe(true)
    }
    expect(droughtIdleAction('mason', { warm })).toMatch(/Grey Box|MSP harvest/)
    expect(droughtIdleAction('aria', { warm })).toMatch(/LinkedIn/)
    expect(droughtIdleAction('nova', { warm })).toMatch(/\/trial|queue_marcus/)
    expect(droughtIdleAction('finn', { warm })).toMatch(/Stripe/)
    expect(droughtIdleAction('rex', { warm })).toMatch(/TRUE-trial/)
    expect(droughtIdleAction('dex', { warm })).toMatch(/sending healthy/)
  })

  it('crisis pack prefers Grey Box / LinkedIn / MSP / trial when warm eligible=0 exhausted', () => {
    const warm = {
      replied: 15, engaged: 14, sendable: 14, eligible: 0,
      cooldown: 0, exhausted: 12, suppressed: 2, autoReplyPending: 0,
    }
    const dual = operatingCrisisTasks({ liveProductTrials: 1, crmTrials: 0, payingCustomers: 0 }, { warm })
    const mason = dual.find((t) => t.agentId === 'mason')
    const aria = dual.find((t) => t.agentId === 'aria')
    expect(mason?.title).not.toMatch(/convert_warm/i)
    expect(mason?.description).toMatch(/do NOT convert_warm/)
    expect(mason?.title).toMatch(/Grey Box|MSP harvest/)
    expect(aria?.title).toMatch(/LinkedIn/)
    expect(aria?.description).toMatch(/do NOT convert_warm/)
    for (const task of dual) {
      expect(isConversionBoundTitle(task.title, task.description)).toBe(true)
      expect(isAnalysisOnlyTitle(task.title, task.description)).toBe(false)
      expect(voidPremiseFor(task.title, task.description)).toBeNull()
    }
    const paid = paidConversionCrisisTasks({ warm })
    const paidMason = paid.find((t) => t.agentId === 'mason')
    expect(paidMason?.title).toMatch(/Grey Box/)
    expect(paidMason?.description).toMatch(/do NOT convert_warm/)
    expect(paidMason?.description).not.toMatch(/Fire convert_warm/)
  })

  it('feeds Dex breaker + reviewed scores into Janet assign (7.10 learning loop, not L5.8)', () => {
    expect(breakerAwareAssignRule(true, false)).toMatch(/conversion-bound/)
    expect(breakerAwareAssignRule(true, true)).toMatch(/TRIPPED/)
    expect(breakerAwareAssignRule(true, true)).not.toMatch(/500-cold/)
    expect(breakerAwareAssignRule(true, false)).toMatch(/queue_marcus/)
    expect(assignmentSkipReason({
      title: 'Mason cold outreach 500 MSP',
      operatingCrisis: true,
      breakerTripped: true,
    })).toBe('breaker_tripped_cold_send')
    expect(assignmentSkipReason({
      title: 'Send warm trial CTAs and follow up existing trial orgs today',
      operatingCrisis: true,
      breakerTripped: true,
    })).toBeNull()
    expect(assignmentSkipReason({
      title: 'Write a blog post',
      operatingCrisis: true,
      breakerTripped: false,
      agentScoreAvg: 3,
    })).toBe('low_score_non_conversion')
    expect(assignmentSkipReason({
      title: 'Write a blog post',
      operatingCrisis: true,
      breakerTripped: false,
      agentScoreAvg: null,
    })).toBeNull()
    expect(scoreAwareAssignHint({})).toBe('')
    expect(scoreAwareAssignHint({ mason: { count: 4, avg: 8.2 }, aria: { count: 2, avg: 3 } })).toMatch(/mason=8.2/)
    expect(scoreAwareAssignHint({ mason: { count: 4, avg: 8.2 } })).not.toMatch(/\b0\b/)
  })
})

describe('coded enforcers are wired', () => {
  it('standup issues the crisis pack and no longer forbids conversion on a small funnel', () => {
    const os = readFileSync('server/lib/kaan_os_v4.ts', 'utf8')
    expect(os).toContain('operatingCrisisTasks')
    expect(os).toContain('osHealthHonesty')
    expect(os).toContain('collapseOpenDuplicateTasks')
    expect(os).not.toMatch(/runner only acts on >4h-idle/)
    expect(readFileSync('server/os/routes.ts', 'utf8')).toContain('maybeStartDrill3')
    expect(os).toContain('conversionDefaultTask')
    expect(os).toContain('employeeExecutePrompt')
    expect(os).toContain('janetCgoMandate')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toContain('applyOwnerAutonomyRuling')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toContain('ensureOwnerL57Autonomy')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toMatch(/tickAllAgentRuntimes\(\s*\{\s*maxAgents:\s*5/)
    expect(readFileSync('server/os/routes.ts', 'utf8')).toMatch(/reasonAndAct\(\s*["']janet["']/)
    expect(os).toContain('does NOT forbid converting')
    expect(os).toContain('breakerAwareAssignRule')
    expect(os).toContain('getSequenceHealth')
    expect(os).toContain('scoreAwareAssignHint')
    expect(readFileSync('server/os/heartbeat.ts', 'utf8')).toContain('runCgoConversionShift')
    expect(readFileSync('server/os/heartbeat.ts', 'utf8')).toMatch(/HEARTBEAT_TICK_AGENTS\s*=\s*3/)
    expect(readFileSync('server/os/heartbeat.ts', 'utf8')).toContain('runSequenceDrainTick')
    expect(readFileSync('server/os/routes.ts', 'utf8')).toMatch(/drill3/)
    expect(readFileSync('server/os/posture.ts', 'utf8')).toContain('ensureRunningDrill')
    expect(readFileSync('server/os/posture.ts', 'utf8')).toMatch(/healed missing running drill row/)
    expect(readFileSync('server/os/sequences.ts', 'utf8')).toContain('warmCtaPoolCensus')
    expect(readFileSync('server/os/cgoMandate.ts', 'utf8')).toContain('diagnoseRevenueFailure')
    expect(readFileSync('server/os/watchdog.ts', 'utf8')).toContain('maybeQueueT1Marcus')
    expect(readFileSync('server/os/cgoMandate.ts', 'utf8')).toContain('isSendPathFixTitle')
    expect(os).toContain('convert_warm')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('advanceLinkedInAcquisition')
    expect(readFileSync('server/lib/kaan_os_v4.ts', 'utf8')).toContain('CONVERSION_AGENTS.has')
    expect(readFileSync('server/os/conversionEngine.ts', 'utf8')).toContain('maybeQueueAutonomyBlocker')
    expect(readFileSync('server/_core/oauth.ts', 'utf8')).toContain('startProductTrial')
    expect(readFileSync('server/os/startProductTrial.ts', 'utf8')).toContain('createOrganization')
    expect(os).not.toMatch(/Your team is TEXT-ONLY/)
    expect(readFileSync('vercel.json', 'utf8')).toContain('/api/os/task-runner')
    expect(readFileSync('server/os/sequences.ts', 'utf8')).toMatch(/computeAdaptiveSplit\(\s*'touch1_subject',\s*200,\s*0\.2,\s*'replied'\s*\)/)
    expect(readFileSync('server/os/agents/reason.ts', 'utf8')).toContain('shouldFireConversionShift')
    expect(readFileSync('server/os/agents/reason.ts', 'utf8')).toContain('runCgoConversionShift')
    expect(readFileSync('docs/KAAN_AI_OS_7.10_Architecture.md', 'utf8')).toContain('## O.32')
    expect(readFileSync('docs/KAAN_AI_OS_7.10_Architecture.md', 'utf8')).toContain('7.10.2')
    expect(readFileSync('docs/KAAN_AI_OS_7.10_Architecture.md', 'utf8')).toContain('breakerAwareAssignRule')
    expect(readFileSync('docs/KAAN_AI_OS_7.10_Architecture.md', 'utf8')).toContain('O.32.14')
    expect(readFileSync('docs/KAAN_AI_OS_7.10_Architecture.md', 'utf8')).toContain('O.32.17')
    expect(readFileSync('server/os/cgoMandate.ts', 'utf8')).toContain('isWarmPoolExhausted')
    expect(readFileSync('server/os/cgoMandate.ts', 'utf8')).toContain('invalidateOpenThread')
    expect(readFileSync('server/os/agents/reason.ts', 'utf8')).toContain('isWarmPoolExhausted')
    expect(readFileSync('server/os/agents/reason.ts', 'utf8')).toContain('persistRuntimeLesson')
    expect(os).toContain('HONEST_BLOCKER_SCORE_FLOOR')
    expect(os).not.toMatch(/runner only acts on >4h-idle/)
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
