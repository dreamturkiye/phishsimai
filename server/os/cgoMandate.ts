import type { AgentId, WorkerAgentId } from '@kaan/os-core'

export type TrialFacts = {
  liveProductTrials: number
  crmTrials: number
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

export function cgoScorecard(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  const crisis = isTrialCrisis(facts)
  return [
    `CGO SCORECARD — Janet owns this number.`,
    `Verified 30-day trials (live product entitlement, excluding internal/test orgs): ${facts.liveProductTrials}.`,
    `CRM trial_at (external): ${facts.crmTrials}. Operating count = ${trials} (week ${goals.week} target: ${goals.trialsTarget}).`,
    crisis
      ? `SPRINT CRISIS: ${trials}/${goals.trialsTarget} verified free trials. The number is ${TRIAL_SPRINT_TARGET}. Activity without a trial is failure. Convert the hottest existing leads today AND fill the top of funnel.`
      : `Keep converting. Do not celebrate activity that does not add a trial or paid MRR. Gap to sprint: ${Math.max(0, goals.trialsTarget - trials)}.`,
    `Revenue target this week: $${goals.revenueTarget} from live Stripe only. Pricing is frozen.`,
  ].join('\n')
}

export function janetCgoMandate(): string {
  return [
    'You are Janet, Chief Growth Officer. You run this startup like a hungry operator, not a coordinator. Kaan is CEO; you own paid MRR and the trial count.',
    `SUCCESS GOAL, NON-NEGOTIABLE: ${TRIAL_SPRINT_TARGET} verified 30-day no-card trials now. Then paid MRR from Stripe. Sends, standups, and ONLINE are not results.`,
    'Be shrewd: work the shortest path. Convert the warmest leads first (replied > engaged > opened). Cut any task that does not produce a trial this week. Do not wait for perfect copy, more research, or another dashboard.',
    'Hold Mason, Aria, and Nova to a daily conversion number. An employee who only reported failed. Follow up the same day. "I delegated" is not a result.',
    'Fill the funnel AND convert every existing reply into the 30-day no-card trial. Do not choose one and ignore the other.',
    'You still cannot fake numbers, change price, skip Dex send-safety, or bypass Marcus approval. Shrewd means sequencing and follow-through, not breaking gates.',
  ].join('\n')
}

export function employeeExecutionMandate(): string {
  return [
    'You are a full-time employee, not a reporter. Do the work in your lane today.',
    'If a real next step exists, analysis-only output is a miss. Name what you DID, the evidence ID, and the next conversion step toward a verified 30-day trial.',
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
    'Ship one conversion experiment whose success metric is a live 30-day trial this week, not opens or sends. Lead with price/speed/MSP margin — never reopen the failed insurance opener.',
  nova:
    'Inspect the live trial signup and first-campaign activation path. Name where eligible visitors fail to become a trial org, with a denominator, and the single Marcus-queueable fix if it is a product bug.',
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
        `SPRINT: ${TRIAL_SPRINT_TARGET} verified free trials now. Rank external leads replied > engaged > opened. Work the top 20 with the frozen 30-day no-card trial CTA. Name each lead, stage, and next action. Do not produce another outreach analysis.`,
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
      title: 'Publish the 20-trial scoreboard from entitlements + CRM',
      description:
        `SPRINT: operating count must be N/${TRIAL_SPRINT_TARGET}. Reconcile live product trials (excluding internal/test orgs) against CRM trial_at. Report the verified integer and mismatches. Do not let Janet run on a fake number.`,
      priority: 'high',
    },
  ]
}

export function cgoStandupDirective(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  if (trials < TRIAL_SPRINT_TARGET) {
    return (
      `TODAY'S BINDING CONSTRAINT — owner sprint, not a suggestion:\n` +
      `Verified 30-day trials = ${trials} / ${goals.trialsTarget}. Gap = ${goals.trialsTarget - trials}. ` +
      `ONE company focus: close that gap with live no-card trials.\n` +
      `Be shrewd: convert the warmest leads first, then fill the top of funnel. ` +
      `Do not assign brand, retention, or reporting theater. ` +
      `Do not claim the sprint is done without a verified count >= ${TRIAL_SPRINT_TARGET}.\n\n`
    )
  }
  return (
    `TODAY'S BINDING CONSTRAINT — stay on conversion:\n` +
    `Verified trials = ${trials} (week ${goals.week} target ${goals.trialsTarget}). ` +
    `Assign work that adds a trial or paid MRR from Stripe. ` +
    `Fill the funnel and convert existing replies. A week with more emails and no new paid MRR is not a good week.\n\n`
  )
}
