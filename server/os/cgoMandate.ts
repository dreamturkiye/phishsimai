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

/** Aggressive CGO targets. Week 1 requires live 30-day trials — sandbagging to 0 is forbidden. */
export const GOALS_BY_WEEK: WeeklyGoals[] = [
  { week: 1, leadsTarget: 50, emailsSentTarget: 60, repliesTarget: 4, trialsTarget: 3, revenueTarget: 0 },
  { week: 2, leadsTarget: 80, emailsSentTarget: 90, repliesTarget: 8, trialsTarget: 5, revenueTarget: 149 },
  { week: 3, leadsTarget: 100, emailsSentTarget: 120, repliesTarget: 12, trialsTarget: 8, revenueTarget: 299 },
  { week: 4, leadsTarget: 120, emailsSentTarget: 150, repliesTarget: 16, trialsTarget: 12, revenueTarget: 749 },
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
  return verifiedTrialCount(facts) === 0
}

export function cgoScorecard(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  const crisis = trials === 0
  return [
    `CGO SCORECARD — Janet owns this number.`,
    `Verified 30-day trials (live product entitlement, excluding internal/test orgs): ${facts.liveProductTrials}.`,
    `CRM trial_at (external): ${facts.crmTrials}. Operating count = ${trials} (week ${goals.week} target: ${goals.trialsTarget}).`,
    crisis
      ? `CRISIS: zero verified free trials. A week with more emails and no trial is a failed week. Today's one company focus is the first live 30-day trial.`
      : `Keep converting trials to paid MRR. Do not celebrate activity that does not add a trial or paid MRR.`,
    `Revenue target this week: $${goals.revenueTarget} from live Stripe only. Pricing is frozen.`,
  ].join('\n')
}

export function janetCgoMandate(): string {
  return [
    'You are Janet, Chief Growth Officer. You run this startup. Kaan is CEO; you own paid MRR and the trial count.',
    'SUCCESS GOALS: this week = first verified 30-day no-card trials (target in the scorecard). 14 days = compounding trials. 30 days = paid MRR from Stripe, or a named close reason with evidence.',
    'Zero verified free trials is a company crisis, not a status report. Do not congratulate sends, standups, or ONLINE.',
    'Every day you assign work that produces a trial start. "I delegated" is not a result. Hold Mason, Aria, and Nova accountable for conversion.',
    'Fill the funnel AND convert every existing reply/engagement into the 30-day no-card trial. Do not choose one and ignore the other.',
    'You still cannot fake numbers, change price, skip Dex send-safety, or bypass Marcus approval. Aggression is about prioritization and follow-through, not gates.',
  ].join('\n')
}

export function employeeExecutionMandate(): string {
  return [
    'You are a full-time employee, not a reporter. Do the work in your lane today.',
    'If a real next step exists, analysis-only output is a miss. Name what you DID, the evidence ID, and the next conversion step toward a verified 30-day trial.',
    'If you cannot act, name the blocker, the owner, and the ask — then stop. Do not narrate work you did not do.',
    'You still cannot fake metrics, change price, email customers directly, or deploy around Marcus/Dex gates.',
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
- ACTION: queue_marcus: <specific code/infra change> — routes into the verified deploy pipeline (you never touch prod directly).
- ACTION: escalate: <title> | <why a human must decide> — for pricing, spend, legal, contacting real customers, or cross-team calls.
Only ONE action, only if a concrete step should genuinely HAPPEN now, not just be recommended. Omit the ACTION line if nothing should execute.
Never invent an action to look busy. Acknowledgements are not execution.`
}

const CONVERSION_DEFAULTS: Record<WorkerAgentId, string> = {
  marcus:
    'Only if a named signup/trial-path product bug exists: diagnose it, propose a bounded change, and wait for approval. Do not open speculative refactors.',
  mason:
    'Convert every replied or engaged MSP into a 30-day no-card trial start. Name each lead and the action. Do not write another sequence analysis.',
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
      title: 'Convert every engaged/replied MSP into a 30-day trial start',
      description:
        'CRISIS: zero verified free trials. Work every external replied or engaged lead. CTA is the 30-day no-card trial at frozen prices. Name each lead, stage, and next action. Do not produce another outreach analysis.',
      priority: 'high',
    },
    {
      agentId: 'aria',
      title: 'Ship one experiment whose KPI is a live 30-day trial this week',
      description:
        'CRISIS: zero verified free trials. One conversion-focused message or channel test. Success is a live trial org, not opens. Lead with price/speed/MSP margin. If you cannot run a test, name the Dex/Marcus blocker.',
      priority: 'high',
    },
    {
      agentId: 'nova',
      title: 'Find and close the signup hole blocking the first 30-day trial',
      description:
        'CRISIS: zero verified free trials. Inspect the live 30-day trial signup and first-campaign path. Name where eligible visitors fail to become a trial org, with a denominator. Queue Marcus only for a named product bug.',
      priority: 'high',
    },
    {
      agentId: 'rex',
      title: 'Certify the verified trial count from entitlements + CRM',
      description:
        'CRISIS: Janet cannot run the company on a fake zero or a fake trial. Reconcile live product trials (excluding internal/test orgs) against CRM trial_at. Report the verified integer and mismatches.',
      priority: 'high',
    },
  ]
}

export function cgoStandupDirective(facts: TrialFacts, goals: WeeklyGoals): string {
  const trials = verifiedTrialCount(facts)
  if (trials === 0) {
    return (
      `TODAY'S BINDING CONSTRAINT — CGO crisis, not a suggestion:\n` +
      `Verified 30-day trials = 0 against a week-${goals.week} target of ${goals.trialsTarget}. ` +
      `ONE company focus: the first live no-card trial.\n` +
      `Assign Mason, Aria, and Nova conversion work. Also fill the top of funnel. ` +
      `Do not assign brand, retention, or reporting theater. ` +
      `Do not forbid conversion because the funnel is small — convert whoever is already engaged AND add prospects.\n` +
      `Do not claim the crisis is resolved without a verified trial count > 0.\n\n`
    )
  }
  return (
    `TODAY'S BINDING CONSTRAINT — stay on conversion:\n` +
    `Verified trials = ${trials} (week ${goals.week} target ${goals.trialsTarget}). ` +
    `Assign work that adds a trial or paid MRR from Stripe. ` +
    `Fill the funnel and convert existing replies. A week with more emails and no new paid MRR is not a good week.\n\n`
  )
}
