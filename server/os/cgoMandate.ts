import type { AgentId, WorkerAgentId } from '@kaan/os-core'

export type TrialFacts = {
  liveProductTrials: number
  crmTrials: number
  /** Live paying orgs (plan ≠ free), excluding internal/test. null = unmeasured. */
  payingCustomers?: number | null
  /** Canary/test/walkthrough/Adeo raw live trials that were excluded. */
  excludedNonCustomerTrials?: number
  /** Raw plan=free + future planExpiresAt, before true-trial exclusion. */
  rawLiveTrials?: number
}

export type WeeklyGoals = {
  week: number
  leadsTarget: number
  emailsSentTarget: number
  repliesTarget: number
  trialsTarget: number
  revenueTarget: number
}

export type CrisisTask = {
  agentId: WorkerAgentId
  title: string
  description: string
  priority: 'high'
}

export const TRIAL_SPRINT_TARGET = 20
/** Owner 2026-09-14: 4–5 paying customers. Gate fires below 4; stretch is 5. */
export const PAYING_SPRINT_TARGET = 4
export const PAYING_STRETCH_TARGET = 5

/** Aggressive CGO targets. Founder sprint: 20 verified 30-day trials now — sandbagging is forbidden. */
export const GOALS_BY_WEEK: WeeklyGoals[] = [
  { week: 1, leadsTarget: 200, emailsSentTarget: 250, repliesTarget: 25, trialsTarget: TRIAL_SPRINT_TARGET, revenueTarget: 149 },
  { week: 2, leadsTarget: 250, emailsSentTarget: 300, repliesTarget: 35, trialsTarget: TRIAL_SPRINT_TARGET, revenueTarget: 299 },
  { week: 3, leadsTarget: 300, emailsSentTarget: 350, repliesTarget: 45, trialsTarget: 30, revenueTarget: 749 },
  { week: 4, leadsTarget: 350, emailsSentTarget: 400, repliesTarget: 55, trialsTarget: 40, revenueTarget: 1499 },
]

export const CGO_NORTH_STAR =
  'Paid MRR and NRR from a verified 30-day no-card trial. Sends, standups, and ONLINE are not results.'

export function goalsForWeek(weekNum: number): WeeklyGoals {
  const week = Math.max(1, Math.floor(weekNum) || 1)
  return GOALS_BY_WEEK[Math.min(week - 1, GOALS_BY_WEEK.length - 1)]
}

/** Live product trials are orgs on the 30-day entitlement, excluding internal/test admins. */
export function verifiedTrialCount(facts: TrialFacts): number {
  const live = Math.max(0, Number(facts.liveProductTrials) || 0)
  const crm = Math.max(0, Number(facts.crmTrials) || 0)
  return Math.max(live, crm)
}

export function isTrialCrisis(facts: TrialFacts): boolean {
  return verifiedTrialCount(facts) < TRIAL_SPRINT_TARGET
}

/** Paying count, or null when the instrument did not measure. Unmeasured is not zero. */
export function payingCount(facts: TrialFacts): number | null {
  if (facts.payingCustomers == null) return null
  return Math.max(0, Number(facts.payingCustomers) || 0)
}

/**
 * Paying customers below the owner floor. Unmeasured is not a crisis trigger.
 * True-trial drought (1 Grey Box, 0 paid) is BOTH a trial crisis and a paying crisis.
 */
export function isPaidConversionCrisis(facts: TrialFacts): boolean {
  const paying = payingCount(facts)
  if (paying === null) return false
  return paying < PAYING_SPRINT_TARGET
}

export function isOperatingCrisis(facts: TrialFacts): boolean {
  return isTrialCrisis(facts) || isPaidConversionCrisis(facts)
}

/** Conversion-critical titles: send, CTA, trial start, upgrade, paid. */
export function isConversionBoundTitle(title: string, description = ''): boolean {
  return /\b(convert|warm cta|trial[- ]?(starts?|nudges?|ctas?|orgs?)|upgrade|paid mrr|paying|stripe|send evidence|nurture|follow-?up existing|trial.?to.?paid)\b/i
    .test(`${title} ${description}`)
}

/** Prospect / first-touch / cold volume — Dex breaker must stand these down. */
export function isProspectColdSendTitle(title: string, description = ''): boolean {
  return /\b(prospect|cold (email|send|blast|outreach)|touch\s*1|first[- ]touch|sequence send|500\s*(msp|cold))\b/i
    .test(`${title} ${description}`)
}

export function isIdleNone(action: string): boolean {
  return !String(action || '').trim() || /^none$/i.test(String(action).trim())
}

/** Lane mandate when an agent would rest during an operating crisis. */
export function droughtIdleAction(agentId: string): string {
  const map: Record<string, string> = {
    janet: 'convert_warm: hottest',
    mason: 'convert_warm: hottest',
    aria: 'convert_warm: hottest',
    nova: 'convert_warm: hottest',
    vera: 'convert_warm: hottest',
    rex: 'Publish TRUE-trial vs paying integers (canary excluded)',
    scout: 'Drive trial starts from measured MSP segment',
    finn: 'Publish paying vs free-trial integers from Stripe and plan',
    dex: 'Keep sending healthy so trial CTAs land',
    marcus: 'Queue Marcus only for a named signup/trial-start/upgrade bug',
  }
  return map[agentId] || 'convert_warm: hottest'
}

/**
 * 7.10 §H / L5.7-safe: Dex breaker feeds task selection.
 * Measured trip → no prospect/cold assigns. Unmeasured is not treated as tripped here
 * (warm CTA already fail-closes on !measured in sequences.ts).
 */
export function breakerAwareAssignRule(operatingCrisis: boolean, breakerTripped: boolean): string {
  if (breakerTripped) {
    const halt =
      'Bounce breaker is TRIPPED — Dex owns the halt. Do NOT assign prospect/cold/touch-1 sends. ' +
      'Warm CTA on replied/engaged already stands down on a measured trip. Assign trial nudge, upgrade, Stripe truth, Dex health, or a named Marcus send-path fix only.'
    return operatingCrisis
      ? `ASSIGN only conversion-bound work that does not send around Dex. ${halt} One open task per agent.`
      : halt
  }
  return operatingCrisis
    ? 'ASSIGN only conversion-bound work (warm CTA, trial nudge, upgrade, Stripe truth, trial start). Do NOT assign analyze/research/TOF/500-cold. One open task per agent.'
    : 'Issue 1-3 conversion-critical task assignments.'
}

export type AgentScoreHint = { count: number; avg: number }

/** Unmeasured scores are omitted — never printed as 0. */
export function scoreAwareAssignHint(scores: Record<string, AgentScoreHint>): string {
  const entries = Object.entries(scores).filter(([, v]) => v.count > 0 && Number.isFinite(v.avg))
  if (entries.length === 0) return ''
  const line = entries
    .sort((a, b) => b[1].avg - a[1].avg)
    .map(([id, v]) => `${id}=${v.avg}(n=${v.count})`)
    .join(', ')
  return (
    `Reviewed-task scores (real; unmeasured omitted): ${line}. ` +
    `Prefer higher scorers for conversion-bound work. Do not assign analysis/volume theater to avg<5.\n`
  )
}

export function assignmentSkipReason(opts: {
  title: string
  description?: string
  operatingCrisis: boolean
  breakerTripped: boolean
  agentScoreAvg?: number | null
}): 'analysis_only' | 'breaker_tripped_cold_send' | 'low_score_non_conversion' | null {
  const { title, description = '', operatingCrisis, breakerTripped, agentScoreAvg } = opts
  if (breakerTripped && isProspectColdSendTitle(title, description)) return 'breaker_tripped_cold_send'
  if (operatingCrisis && isAnalysisOnlyTitle(title, description)) return 'analysis_only'
  if (isConversionBoundTitle(title, description)) return null
  if (operatingCrisis && agentScoreAvg != null && agentScoreAvg < 5) return 'low_score_non_conversion'
  return null
}

/**
 * Analysis/research/volume theater. Conversion-bound wording always wins, so
 * "analyze the upgrade CTA send path" still counts as conversion work.
 */
export function isAnalysisOnlyTitle(title: string, description = ''): boolean {
  if (isConversionBoundTitle(title, description)) return false
  return /\b(analy[sz]e|analys[ie]s|research|investigate|audit (the )?funnel|tof beyond|coverage|500\s*(msp|cold)|cold outreach)\b/i
    .test(`${title} ${description}`)
}

export function cgoScorecard(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  const paying = payingCount(facts)
  const trialCrisis = isTrialCrisis(facts)
  const paidCrisis = isPaidConversionCrisis(facts)
  const payingLine = paying === null ? 'Paying customers: NOT CHECKED.' : `Paying customers: ${paying}.`
  return [
    `CGO SCORECARD — Janet owns this number.`,
    `True customer 30-day trials (canary/test/walkthrough/Adeo excluded): ${facts.liveProductTrials}.`,
    facts.rawLiveTrials != null
      ? `Raw live entitlements: ${facts.rawLiveTrials} (excluded non-customer: ${facts.excludedNonCustomerTrials ?? 0}). Never treat raw as the operating number.`
      : null,
    `CRM trial_at (external): ${facts.crmTrials}. Operating TRUE count = ${trials} (week ${goals.week} target: ${goals.trialsTarget} true trials, ${PAYING_SPRINT_TARGET}–${PAYING_STRETCH_TARGET} paying).`,
    payingLine,
    trialCrisis && paidCrisis
      ? `DUAL CRISIS: ${trials}/${TRIAL_SPRINT_TARGET} TRUE trials and ${paying}/${PAYING_SPRINT_TARGET} paying. Fill the funnel with real MSP trials AND convert Grey Box / warm replies to paid. Canary orgs are not trials.`
      : paidCrisis
        ? `PAYING CRISIS: ${paying}/${PAYING_SPRINT_TARGET} paying (stretch ${PAYING_STRETCH_TARGET}). Convert EXISTING true trial orgs and warm replies today.`
        : trialCrisis
          ? `SPRINT CRISIS: ${trials}/${goals.trialsTarget} TRUE free trials. Canary inflation does not count. Convert the hottest existing leads today AND fill the top of funnel.`
          : `Keep converting. Do not celebrate activity that does not add a TRUE trial or paid MRR. Gap to sprint: ${Math.max(0, goals.trialsTarget - trials)} trials, ${Math.max(0, PAYING_SPRINT_TARGET - (paying ?? 0))} paying.`,
    `Revenue target this week: $${goals.revenueTarget} from live Stripe only. Pricing is frozen.`,
  ].filter(Boolean).join('\n')
}

export function janetCgoMandate(): string {
  return [
    'You are Janet, Chief Growth Officer. You run this startup like a hungry operator, not a coordinator. Kaan is CEO; you own paid MRR and the trial count.',
    `SUCCESS GOAL, NON-NEGOTIABLE: ${TRIAL_SPRINT_TARGET} TRUE customer 30-day no-card trials (Signup Canary / test / walkthrough / Adeo excluded) and ${PAYING_SPRINT_TARGET}–${PAYING_STRETCH_TARGET} paying Stripe customers. Keep pushing until both are met. Sends, standups, canary orgs, and ONLINE are not results.`,
    'Be persistent and aggressive: same-day follow-up on every warm lead and every true trial org. An employee who reported "nothing completed" failed. Queue Marcus when a code path blocks a trial start.',
    'Be shrewd: work the shortest path. Convert the warmest leads first (replied > engaged > opened). Cut any task that does not produce a trial this week. Do not wait for perfect copy, more research, or another dashboard.',
    'Hold Mason, Aria, and Nova to a daily conversion number. An employee who only reported failed. Follow up the same day. "I delegated" is not a result.',
    'Fill the funnel AND convert every existing reply into the 30-day no-card trial. Do not choose one and ignore the other.',
    'You still cannot fake numbers, change price, skip Dex send-safety, or bypass Marcus approval. Shrewd means sequencing and follow-through, not breaking gates.',
  ].join('\n')
}

export function employeeExecutionMandate(): string {
  return [
    'You are a full-time employee, not a reporter. Do the work in your lane today. Be persistent: follow up the same day.',
    `If true trials are below ${TRIAL_SPRINT_TARGET} or paying customers below ${PAYING_SPRINT_TARGET}, analysis-only output and idle "nothing completed" are a miss. Name what you DID, the evidence ID, and the next conversion step toward a TRUE 30-day trial or a paid sub.`,
    'If you cannot act, name the blocker, the owner, and the ask — then stop. Do not narrate work you did not do.',
    'You still cannot fake metrics, change price, skip Dex send-safety, or deploy around Marcus. Warm trial CTAs go through ACTION: convert_warm, never a raw send.',
  ].join('\n')
}

export function employeeExecutePrompt(task: { title: string; description: string; priority: string }): string {
  return `TASK ASSIGNED BY JANET (CGO):
Title: ${task.title}
Priority: ${String(task.priority || 'medium').toUpperCase()}
Description: ${task.description}

Do the work now. You are a full-time employee. Provide:
1. What you actually did (not what you would do)
2. Specific findings or shipped output, with evidence
3. The next conversion step toward a verified 30-day no-card trial
4. Blockers with owner — or "no blocker"
5. Confidence (0-10) and why the evidence supports it

You may take ONE real action to advance this (under Janet's supervision) by ending with a single line:
- ACTION: convert_warm: <email or "hottest"> — sends the frozen 30-day no-card trial CTA through Dex rails (MX, suppression, bounce breaker). Use this for replied/engaged leads.
- ACTION: queue_marcus: <specific code/infra change> — routes into the verified deploy pipeline (you never touch prod directly).
- ACTION: escalate: <title> | <why a human must decide> — for pricing, spend, legal, or a Dex-blocked send. Do not escalate a send you could convert_warm.
Only ONE action, only if a concrete step should genuinely HAPPEN now, not just be recommended. Omit the ACTION line if nothing should execute.
Never invent an action to look busy. Acknowledgements are not execution. Mason and Aria conversion tasks also fire the coded conversion shift even if you omit ACTION.`
}

const CONVERSION_DEFAULTS: Record<WorkerAgentId, string> = {
  marcus:
    'Only if a named signup/trial-path product bug exists: diagnose it, propose a bounded change, and wait for approval. Do not open speculative refactors.',
  mason:
    'Take the 20 hottest external MSPs (replied, then engaged, then opened) and drive each one to a 30-day no-card trial start today. Name each lead and the action. Do not write another sequence analysis.',
  aria:
    'Ship one conversion experiment whose success metric is a live 30-day trial this week, not opens or sends. Lead with the founder-approved lowest-per-seat claim (60¢ / $299/500) — never invent a competitor price, never reopen the failed insurance opener.',
  nova:
    'Inspect the live trial signup. Register must stamp planExpiresAt via startProductTrial — a user row without an org is not a trial. Name where visitors fail, with a denominator, and the single Marcus-queueable fix if it is a product bug.',
  rex:
    'Reconcile live product trials (plan=free + future planExpiresAt, excluding internal) against CRM trial_at so Janet cannot be told we have trials we do not have.',
  scout:
    'From measured reply/ICP data only, name the MSP segment most likely to start a trial THIS WEEK. If n is too small, say so and name the acquisition fill Mason and Aria must run. Never invent competitor prices.',
  finn:
    'Report live Stripe trialing and paid MRR only. Do not multiply CRM stages by invented prices. If Stripe is NOT CHECKED, say so.',
  vera:
    'If zero paying accounts, write the first-trial onboarding checklist from product truth. Retention theater with no trial is a miss.',
  dex:
    'Keep sending healthy so conversion traffic can land. Report breaker, authentication, and suppression only. Do not classify replies.',
}

export function conversionDefaultTask(agentId: AgentId, domain: string, title: string): string {
  if (agentId === 'janet') {
    return 'Issue conversion-critical work that produces a verified 30-day trial today. Synthesis without assignments is a miss.'
  }
  const owned = CONVERSION_DEFAULTS[agentId as WorkerAgentId]
  return `As ${title}, ${owned} Domain: ${domain}. Use live company data. Start the concrete next step today.`
}

export function researchGroundedConversionTask(
  title: string,
  domain: string,
  researchSummary: string,
  sources: string,
  asOf: string,
): string {
  return `As ${title}: current best practice (verified ${asOf}) — ${researchSummary} Apply this to ${domain} to produce a verified 30-day no-card trial this week, not a report. Sources: ${sources}`
}

export function zeroTrialCrisisTasks(): CrisisTask[] {
  return [
    {
      agentId: 'mason',
      title: 'Drive the 20 hottest MSPs to a 30-day trial start today',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE customer free trials now (canary/test/walkthrough/Adeo excluded). Rank external leads replied > engaged > opened. Work the top 20 with the frozen 30-day no-card trial CTA. Also use MSP harvest + founder-review LinkedIn drafts. Name each lead, stage, and next action. Do not produce another outreach analysis.`,
      priority: 'high',
    },
    {
      agentId: 'aria',
      title: 'Ship one experiment whose KPI is live 30-day trials this week',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} verified free trials now. One conversion-focused message or channel test. Success is a live trial org, not opens. Lead with price/speed/MSP margin. Kill anything that does not ask for the trial in the first screen.`,
      priority: 'high',
    },
    {
      agentId: 'nova',
      title: 'Make the 30-day trial start take under 60 seconds',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} verified free trials now. Inspect the live signup and first-campaign path. Name where eligible visitors fail to become a trial org, with a denominator. Queue Marcus only for a named product bug.`,
      priority: 'high',
    },
    {
      agentId: 'rex',
      title: 'Publish the TRUE-trial vs paying scoreboard from entitlements + CRM',
      description:
        `SPRINT: operating count must be N/${TRIAL_SPRINT_TARGET}. Reconcile live product trials (excluding internal/test orgs) against CRM trial_at. Report the verified integer and mismatches. Do not let Janet run on a fake number.`,
      priority: 'high',
    },
    {
      agentId: 'scout',
      title: 'Drive trial starts from measured MSP segment',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE customer free trials now. From measured reply/ICP data only, name the MSP segment most likely to start a trial THIS WEEK and hand Mason that list for convert_warm / MSP harvest. Do not invent competitor prices. Do not write a TOF research essay.`,
      priority: 'high',
    },
    {
      agentId: 'dex',
      title: 'Keep sending healthy so trial CTAs land',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE trials. Report breaker, authentication, and suppression only. Queue Marcus for a named send-path bug. Do not classify replies or send around Dex.`,
      priority: 'high',
    },
  ]
}

/**
 * 92 trials / $0 MRR pack. Warm CTA + trial-org nurture + upgrade path.
 * Not "analyze funnel", not "research TOF", not "500 MSP cold outreach".
 */
export function paidConversionCrisisTasks(): CrisisTask[] {
  return [
    {
      agentId: 'mason',
      title: 'Send warm trial CTAs and follow up existing trial orgs today',
      description:
        'PAID CONVERSION CRISIS: trials exist and paying is below 4. Fire convert_warm on replied > engaged leads (Dex MX + suppression + bounce breaker). Then nurture existing TRUE free-trial orgs toward paid — leave send evidence (CONVERSION SHIFT sent>0 and/or trial nudge sent). Do not open a 500-lead cold blast. Do not write another sequence analysis. Do not count Signup Canary as a trial.',
      priority: 'high',
    },
    {
      agentId: 'aria',
      title: 'Ship one trial-to-paid experiment with a live upgrade CTA',
      description:
        'PAID CONVERSION CRISIS: the KPI is a paying org from an existing trial, not opens. One experiment: upgrade/pay CTA to trial admins or a warm reply. Success is Stripe paid or a real send of that CTA. Do not stop at a funnel write-up.',
      priority: 'high',
    },
    {
      agentId: 'nova',
      title: 'Make the in-app upgrade path from a live trial take under 60 seconds',
      description:
        'PAID CONVERSION CRISIS: inspect the live billing/upgrade path for an org already on the 30-day trial. Name where trial admins fail to start paid, with a denominator. Queue Marcus only for a named product bug. Do not research TOF channels beyond email.',
      priority: 'high',
    },
    {
      agentId: 'vera',
      title: 'Nurture existing trial orgs toward paid with D14/D25/D30 send evidence',
      description:
        'PAID CONVERSION CRISIS: TRUE trial orgs (canary/test/walkthrough/Adeo excluded) and paying below 4. Run trial nudges (idempotent D14/D25/D30) and first-value follow-up on REAL customer trials only. Retention theater with no send is a miss. Name orgs nudged and evidence ids.',
      priority: 'high',
    },
    {
      agentId: 'finn',
      title: 'Publish paying vs free-trial integers from Stripe and plan',
      description:
        'PAID CONVERSION CRISIS: report live Stripe paying and organizations.plan paid vs free/trial only. Do not invent MRR from CRM stages. If Stripe is NOT CHECKED, say so. This number is how Janet knows whether conversion moved.',
      priority: 'high',
    },
    {
      agentId: 'dex',
      title: 'Keep sending healthy so trial CTAs land',
      description:
        'PAID CONVERSION CRISIS: report breaker, authentication, and suppression only. Warm CTA already stands down on a measured trip. Queue Marcus for a named send-path bug. Do not send around Dex.',
      priority: 'high',
    },
  ]
}

/** True-trial drought takes Mason/Aria/Nova; paying gap adds Vera/Finn. Both can fire. */
export function operatingCrisisTasks(facts: TrialFacts): CrisisTask[] {
  const byAgent = new Map<CrisisTask['agentId'], CrisisTask>()
  if (isTrialCrisis(facts)) {
    for (const t of zeroTrialCrisisTasks()) byAgent.set(t.agentId, t)
  }
  if (isPaidConversionCrisis(facts)) {
    for (const t of paidConversionCrisisTasks()) {
      if (!byAgent.has(t.agentId)) byAgent.set(t.agentId, t)
    }
  }
  return [...byAgent.values()]
}

export function cgoStandupDirective(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  const paying = payingCount(facts)
  const excluded = facts.excludedNonCustomerTrials ?? 0
  const rawNote = facts.rawLiveTrials != null
    ? ` Raw entitlements ${facts.rawLiveTrials} minus ${excluded} canary/test = ${trials} TRUE.`
    : ''
  if (isTrialCrisis(facts) && isPaidConversionCrisis(facts)) {
    return (
      `TODAY'S BINDING CONSTRAINT — dual crisis, not a suggestion:\n` +
      `TRUE trials = ${trials} / ${TRIAL_SPRINT_TARGET}, paying = ${paying ?? 0} / ${PAYING_SPRINT_TARGET} (stretch ${PAYING_STRETCH_TARGET}).${rawNote} ` +
      `Fill the funnel with real MSP trials AND convert existing true trials / warm replies to paid.\n` +
      `ASSIGN conversion-bound work only. Do NOT assign funnel analysis, TOF research, or 500-lead cold volume. ` +
      `Do NOT count Signup Canary, test, walkthrough, or Adeo as trials. An employee who only reported failed.\n\n`
    )
  }
  if (isPaidConversionCrisis(facts)) {
    return (
      `TODAY'S BINDING CONSTRAINT — paying crisis, not a suggestion:\n` +
      `TRUE trials = ${trials}, paying = ${paying ?? 0} / ${PAYING_SPRINT_TARGET} (stretch ${PAYING_STRETCH_TARGET}). ` +
      `Convert EXISTING true trial orgs and warm replies into paid MRR.\n` +
      `ASSIGN only conversion-bound work. Do NOT assign funnel analysis or 500-lead cold volume.\n\n`
    )
  }
  if (trials < TRIAL_SPRINT_TARGET) {
    return (
      `TODAY'S BINDING CONSTRAINT — owner sprint, not a suggestion:\n` +
      `TRUE 30-day trials = ${trials} / ${goals.trialsTarget}.${rawNote} Gap = ${goals.trialsTarget - trials}. ` +
      `ONE company focus: close that gap with live no-card trials from real MSPs.\n` +
      `Be shrewd: convert the warmest leads first, then fill the top of funnel (MSP harvest + warm CTA + founder-review social drafts). ` +
      `Do not claim the sprint is done without a TRUE count >= ${TRIAL_SPRINT_TARGET}.\n\n`
    )
  }
  return (
    `TODAY'S BINDING CONSTRAINT — stay on conversion:\n` +
    `TRUE trials = ${trials} (week ${goals.week} target ${goals.trialsTarget}), paying = ${paying ?? 'NOT CHECKED'} / ${PAYING_SPRINT_TARGET}. ` +
    `Assign work that adds a true trial or paid MRR from Stripe.\n\n`
  )
}
