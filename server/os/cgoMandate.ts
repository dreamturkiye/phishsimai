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

export type WarmPoolFacts = {
  replied: number
  engaged: number
  sendable: number
  eligible: number
  cooldown: number
  exhausted: number
  suppressed: number
  autoReplyPending: number
}

export type RevenueDiagnosis = {
  crisis: boolean
  bottlenecks: string[]
  line: string
  nextActions: string[]
}

export type T1DiagnosisFacts = {
  daysSinceLastT1?: number | null
  sanitizedEligible?: number | null
  unsanitizedEligible?: number | null
  pauseNewTouch1?: boolean | null
  verifier?: { mev: boolean; qev: boolean; any: boolean } | null
  warmCtaToTrue?: { ctaSent: number; trueTrials: number } | null
}

/**
 * Name WHY we are at $0 MRR / 1 TRUE trial. Live 2026-09-14:
 * 15 replied, 14 engaged, 14 auto_reply drafts, conversion sent:0.
 * "No warm sendable leads / wait for replies" is a lie when replies exist.
 *
 * Live miss 2026-09-12→17: last T1 dead 5d, sanitizedEligible=0, pauseNewTouch1,
 * verifier empty/missing QEV — that TOF death was invisible here, so Janet never
 * queued Marcus. T1/sanitize/pause/verifier/warm CTA→TRUE=0 must be named.
 */
export function diagnoseRevenueFailure(input: {
  trueTrials?: number | null
  paying?: number | null
  rawTrials?: number | null
  excluded?: number | null
  greyBoxDaysLeft?: number | null
  warm?: WarmPoolFacts | null
  t1?: T1DiagnosisFacts | null
}): RevenueDiagnosis {
  const bottlenecks: string[] = []
  const nextActions: string[] = []
  const trials = input.trueTrials
  const paying = input.paying
  const crisis =
    (trials != null && trials < TRIAL_SPRINT_TARGET) ||
    (paying != null && paying < PAYING_SPRINT_TARGET)
  if (paying === 0 || (paying != null && paying < PAYING_SPRINT_TARGET)) {
    bottlenecks.push(`paying=${paying ?? 'n/a'} (need ≥${PAYING_SPRINT_TARGET}–${PAYING_STRETCH_TARGET}) — $0 MRR is an L5.7 failure`)
  }
  if (trials != null && trials < TRIAL_SPRINT_TARGET) {
    bottlenecks.push(`TRUE trials=${trials} (need ≥${TRIAL_SPRINT_TARGET})`)
  }
  if ((input.excluded ?? 0) > 0 && (trials ?? 0) <= 1) {
    bottlenecks.push(`canary noise: raw=${input.rawTrials ?? '?'} excluded=${input.excluded} — do not treat raw as trials`)
  }
  const w = input.warm
  if (w) {
    if (w.replied === 0 && w.engaged === 0) {
      bottlenecks.push('TOF empty: 0 replied/engaged — MSP harvest + LinkedIn founder-review (queue + escalate, not draft theater)')
      nextActions.push('Run MSP harvest and advance LinkedIn trial draft (queue or escalate pending review)')
    } else if (w.eligible === 0 && (w.replied > 0 || w.engaged > 0)) {
      bottlenecks.push(
        `${w.replied} replied / ${w.engaged} engaged but eligible=${w.eligible} ` +
        `(suppressed=${w.suppressed}, cooldown=${w.cooldown}, exhausted=${w.exhausted}, auto_reply_drafts=${w.autoReplyPending})`,
      )
      if (w.cooldown >= w.sendable && w.sendable > 0) {
        nextActions.push('Crisis follow-up 91/92 on parked touch-90 leads (Dex rails, same frozen copy)')
      } else {
        nextActions.push('Fire convert_warm on sendable engaged leads; reopen false auto_reply drafts')
      }
    } else if (w.eligible > 0) {
      bottlenecks.push(`${w.eligible} warm sendable leads waiting — convert_warm must send, not report`)
      nextActions.push(`convert_warm the ${w.eligible} eligible replied/engaged leads (Dex rails)`)
    }
    if (w.autoReplyPending > 0) {
      bottlenecks.push(`${w.autoReplyPending} pending_review drafts classified auto_reply — likely misclassified interest`)
    }
  }
  const t1 = input.t1
  if (t1) {
    const days = t1.daysSinceLastT1
    const silent = days == null || days >= 1.5
    const sanitizedDead = t1.sanitizedEligible != null && t1.sanitizedEligible <= 0
    const pauseWrong = !!t1.pauseNewTouch1 && (t1.sanitizedEligible ?? 0) <= 150
    const verifierEmpty = !!t1.verifier && !t1.verifier.any
    const warmZero = !!t1.warmCtaToTrue && t1.warmCtaToTrue.trueTrials === 0
    const nameT1 = crisis || silent || sanitizedDead || pauseWrong || verifierEmpty || warmZero
    if (nameT1) {
      bottlenecks.push(`daysSinceLastT1=${days == null ? 'never' : Number(days).toFixed(1)}`)
      if (t1.sanitizedEligible != null) {
        bottlenecks.push(
          `sanitizedEligible=${t1.sanitizedEligible}` +
            (t1.unsanitizedEligible != null ? ` unsanitized=${t1.unsanitizedEligible}` : ''),
        )
        if (sanitizedDead) {
          bottlenecks.push(
            `T1 sanitize bottleneck: sanitized=0 unsanitized=${t1.unsanitizedEligible ?? '?'} — refill is not promoting`,
          )
          nextActions.unshift('ACTION: queue_marcus: named bug PS-T1-STARVE — restore sanitize refill / check QEV')
        }
      }
      if (t1.pauseNewTouch1) {
        bottlenecks.push('pauseNewTouch1=true')
        if (pauseWrong) {
          nextActions.unshift('ACTION: queue_marcus: named bug PS-T1-PAUSE-LOCK — drip T1 on small quality pool')
        }
      }
      const v = t1.verifier
      if (v) {
        const mode = !v.any ? 'empty' : v.mev && v.qev ? 'mev_qev' : v.qev ? 'qev' : 'mev'
        const missing = [
          !v.qev ? 'missing QEV' : null,
          !v.mev ? 'missing MEV' : null,
        ].filter(Boolean).join(', ')
        bottlenecks.push(`verifierMode=${mode}${missing ? ` (${missing})` : ''}`)
        if (!v.any) {
          nextActions.unshift('ACTION: queue_marcus: named bug PS-T1-QEV-EMPTY — QEV_API_KEY empty on Vercel')
        }
      }
      const wct = t1.warmCtaToTrue
      if (wct && wct.trueTrials === 0) {
        bottlenecks.push(`warm CTA→TRUE=0 (${wct.trueTrials}/${wct.ctaSent})`)
      }
    }
    const t1Dead =
      sanitizedDead || verifierEmpty || (t1.sanitizedEligible != null && t1.sanitizedEligible <= 0)
    if (t1Dead) {
      for (let i = nextActions.length - 1; i >= 0; i--) {
        if (/convert_warm/i.test(nextActions[i])) nextActions.splice(i, 1)
      }
      if (!nextActions.some((a) => /queue_marcus|PS-T1-/i.test(a))) {
        nextActions.unshift('ACTION: queue_marcus: named bug PS-T1-STARVE — refill sanitize / check QEV')
      }
    }
  }
  if (input.greyBoxDaysLeft != null) {
    bottlenecks.push(`Grey Box Consulting has ${input.greyBoxDaysLeft} day(s) left on the only TRUE trial and $0 paid`)
    nextActions.push('Send Grey Box the existing D18/D25 upgrade/checkout nudge (settings?tab=billing)')
  }
  if (!nextActions.length && crisis) {
    nextActions.push('convert_warm hottest', 'nurture Grey Box to paid', 'MSP harvest')
  }
  const t1Now = input.t1
  if (
    t1Now &&
    ((t1Now.sanitizedEligible != null && t1Now.sanitizedEligible <= 0) || (t1Now.verifier && !t1Now.verifier.any))
  ) {
    for (let i = nextActions.length - 1; i >= 0; i--) {
      if (/convert_warm/i.test(nextActions[i])) nextActions.splice(i, 1)
    }
  }
  const line = crisis || bottlenecks.length
    ? `REVENUE FAILURE: ${bottlenecks.join('; ') || '$0 MRR / TRUE-trial drought'}. Never declare healthy. Next: ${nextActions.slice(0, 3).join(' · ')}.`
    : 'Targets held — keep converting.'
  return { crisis: Boolean(crisis || bottlenecks.length), bottlenecks, line, nextActions }
}

/**
 * Named send-path / sanitize bugs. Dual-crisis skip used to treat "touch 1" as
 * forbidden TOF theater, so Nova/Dex could not queue_marcus the actual starve.
 */
export function isSendPathFixTitle(title: string, description = ''): boolean {
  return /\b(sanitiz(e|ed|ation)|qev_env|qev_api|qev|myemailverifier|mailbox verifier|pauseNewTouch1|pause new touch-?1|pause_logic|sanitize_refill|ps-t1-starve|ps-t1-qev|ps-t1-pause|t1 (starve|starved|silent|death|pool)|touch-?1 (starve|pool|sanitiz|refill))\b/i
    .test(`${title} ${description}`)
}

/** Conversion-critical titles: send, CTA, trial start, upgrade, paid, send-path fixes. */
export function isConversionBoundTitle(title: string, description = ''): boolean {
  if (isSendPathFixTitle(title, description)) return true
  return /\b(convert|warm cta|trial[- ]?(starts?|nudges?|ctas?|orgs?)|upgrade|paid mrr|paying|stripe|send evidence|nurture|follow-?up existing|trial.?to.?paid)\b/i
    .test(`${title} ${description}`)
}

/** Prospect / first-touch / cold volume — Dex breaker must stand these down. Send-path fixes are not volume. */
export function isProspectColdSendTitle(title: string, description = ''): boolean {
  if (isSendPathFixTitle(title, description)) return false
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
    aria: 'convert_warm: hottest + advance LinkedIn trial draft',
    nova: 'convert_warm: hottest; ACTION: queue_marcus immediately if T1/sanitize/QEV is the named send-path bug',
    vera: 'convert_warm: hottest',
    rex: 'Publish TRUE-trial vs paying integers (canary excluded)',
    scout: 'Drive trial starts from measured MSP segment',
    finn: 'Publish paying vs free-trial integers from Stripe and plan',
    dex: 'Keep sending healthy so trial CTAs land. ACTION: queue_marcus immediately for sanitize refill / QEV empty / pause locking T1 — do not wait for a human',
    marcus: 'Named bug PS-T1-STARVE / QEV empty / pause locks quality pool: restore sanitize refill so TRUE trials can start. Do not write analysis theater.',
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
      ? `ASSIGN only conversion-bound work that does not send around Dex. ${halt} Named T1 starve / sanitize-refill / missing QEV IS conversion-bound — Nova/Dex must ACTION: queue_marcus, do not skip. One open task per agent.`
      : halt
  }
  return operatingCrisis
    ? 'ASSIGN only conversion-bound work (warm CTA, trial nudge, upgrade, Stripe truth, trial start, named T1/sanitize/QEV Marcus ticket). Do NOT assign analyze/research/TOF/500-cold. Named T1 starve / sanitize-refill / missing QEV is NOT TOF theater — queue_marcus now. One open task per agent.'
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
  // Send-path/sanitize/QEV tickets must never be skipped as TOF/cold/analysis during dual crisis.
  if (isSendPathFixTitle(title, description)) return null
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
    'Be persistent and aggressive: same-day follow-up on every warm lead and every true trial org. An employee who reported "nothing completed" failed. Queue Marcus when a code path blocks a trial start or a paid conversion.',
    '$0 MRR and TRUE trials < 20 is a PERMANENT operating crisis, not a yellow flag. Diagnose the bottleneck every cycle (TOF empty vs replied/engaged not getting CTAs vs auto_reply trap vs Grey Box not upgrading vs Dex). Then execute. Never declare health. Analysis theater is a miss.',
    'Convert Grey Box Consulting (the only TRUE trial) to paid via the existing upgrade/checkout path. Do not wait for day-25 if they have ~10 days left.',
    'Be shrewd: work the shortest path. Convert the warmest leads first (replied > engaged > opened). Cut any task that does not produce a trial this week. Do not wait for perfect copy, more research, or another dashboard.',
    'Hold Mason, Aria, and Nova to a daily conversion number. An employee who only reported failed. Follow up the same day. "I delegated" is not a result.',
    'Fill the funnel AND convert every existing reply into the 30-day no-card trial. Multi-channel (LinkedIn founder-review with preview + escalate) executes every crisis tick — not optional, not "already queued today" as a dead end.',
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
    'Only if a named signup/trial-path/send-path bug exists (PS-T1-STARVE, QEV empty, pause locking a quality T1 pool): diagnose it, propose a bounded change, and queue it. Do not open speculative refactors or "Fix Lead Eligibility Checker" clones.',
  mason:
    'Take the 20 hottest external MSPs (replied, then engaged, then opened) and drive each one to a 30-day no-card trial start today. Name each lead and the action. Do not write another sequence analysis.',
  aria:
    'Ship one conversion experiment whose success metric is a live 30-day trial this week, not opens or sends. Lead with the founder-approved lowest-per-seat claim (60¢ / $299/500) — never invent a competitor price, never reopen the failed insurance opener.',
  nova:
    'Inspect the live trial signup AND the T1 send path. Register must stamp planExpiresAt via startProductTrial — a user row without an org is not a trial. If sanitizedEligible=0, QEV/MEV empty, or pauseNewTouch1 locks a quality pool: ACTION: queue_marcus the named send-path bug immediately (do not wait for a human). Name where visitors fail, with a denominator.',
  rex:
    'Reconcile live product trials (plan=free + future planExpiresAt, excluding internal) against CRM trial_at so Janet cannot be told we have trials we do not have.',
  scout:
    'From measured reply/ICP data only, name the MSP segment most likely to start a trial THIS WEEK. If n is too small, say so and name the acquisition fill Mason and Aria must run. Never invent competitor prices.',
  finn:
    'Report live Stripe trialing and paid MRR only. Do not multiply CRM stages by invented prices. If Stripe is NOT CHECKED, say so.',
  vera:
    'If zero paying accounts, write the first-trial onboarding checklist from product truth. Retention theater with no trial is a miss.',
  dex:
    'Keep sending healthy so conversion traffic can land. Report breaker, authentication, and suppression only. If T1 is starved / sanitizedEligible=0 / QEV empty / pauseNewTouch1 locks a small quality pool: ACTION: queue_marcus the named send-path bug immediately — do not wait for a human. Do not classify replies.',
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
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE customer free trials now (canary/test/walkthrough/Adeo excluded). Rank external leads replied > engaged > opened. Work the top 20 with the frozen 30-day no-card trial CTA. Also use MSP harvest + LinkedIn founder-review (queue preview, escalate if pending >6h — do not stop at already-queued-today). Drain stuck sequences (approved T2/T3) before scaling T1. Name each lead, stage, and next action. Do not produce another outreach analysis.`,
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
        `SPRINT: ${TRIAL_SPRINT_TARGET} verified free trials now. Inspect the live signup and first-campaign path. Name where eligible visitors fail to become a trial org, with a denominator. ` +
        `If T1 is starved, sanitizedEligible=0, pauseNewTouch1 locks a quality pool, or QEV/MEV is empty: ACTION: queue_marcus with named bug PS-T1-STARVE / PS-T1-QEV-EMPTY / PS-T1-PAUSE-LOCK immediately. Do not wait for a human. Do not escalate a send-path bug.`,
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
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE trials. Report breaker, authentication, and suppression only. ` +
        `If T1 is starved, sanitizedEligible=0, pauseNewTouch1 locks a quality pool, or QEV/MEV is empty: ACTION: queue_marcus with named bug PS-T1-STARVE / PS-T1-QEV-EMPTY / PS-T1-PAUSE-LOCK immediately — do not wait for a human, do not escalate. Do not classify replies or send around Dex.`,
      priority: 'high',
    },
    {
      agentId: 'marcus',
      title: 'PS-T1-STARVE — restore sanitize refill / QEV so T1 can send',
      description:
        `SPRINT: ${TRIAL_SPRINT_TARGET} TRUE trials blocked at cold T1. Named bug: PS-T1-STARVE / QEV empty / pause locks quality pool. ` +
        `Files: server/os/sanitizeRefill.ts, server/os/touch1Health.ts, server/os/sequenceBacklog.ts shouldPauseTouch1. ` +
        `Queue the verified architect task if watchdog has not. Cancel "Fix Lead Eligibility Checker" clones. ` +
        `Do not raise DAILY_SEND_LIMIT. Do not add touch 93. Do not set REFILL_ALLOW_MX_ONLY=1. Do not write analysis theater.`,
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
      title: 'Convert Grey Box Consulting to paid and fire warm CTAs today',
      description:
        'PAID CONVERSION CRISIS: trials exist and paying is below 4. Fire convert_warm on replied > engaged leads (Dex MX + suppression + bounce breaker). Aggressively nurture Grey Box Consulting (org 11, the only TRUE trial) toward paid via D18/D25 upgrade /settings?tab=billing — leave send evidence. Do not open a 500-lead cold blast. Do not write another sequence analysis. Do not count Signup Canary as a trial.',
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
        'PAID CONVERSION CRISIS: inspect the live billing/upgrade path for an org already on the 30-day trial. Name where trial admins fail to start paid, with a denominator. ' +
        'If T1 is starved, sanitizedEligible=0, pauseNewTouch1 locks a quality pool, or QEV/MEV is empty: ACTION: queue_marcus with that named send-path bug immediately. Do not wait for a human. Do not research TOF channels beyond email.',
      priority: 'high',
    },
    {
      agentId: 'vera',
      title: 'Nurture Grey Box and every TRUE trial toward paid (D14/D18/D25/D30)',
      description:
        'PAID CONVERSION CRISIS: Grey Box Consulting is the only TRUE trial (~10 days left on 2026-09-14) and paying is 0. Run trial nudges (idempotent D14/D18 upgrade/D25/D30) using existing billing checkout copy. Retention theater with no send is a miss. Name orgs nudged and evidence ids.',
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
        'PAID CONVERSION CRISIS: report breaker, authentication, and suppression only. Warm CTA already stands down on a measured trip. ' +
        'If T1 is starved, sanitizedEligible=0, pauseNewTouch1 locks a quality pool, or QEV/MEV is empty: ACTION: queue_marcus with the named send-path bug immediately — do not wait for a human, do not escalate. Do not send around Dex.',
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
      `Named T1 starve / sanitize-refill / missing QEV IS conversion-bound — Nova/Dex ACTION: queue_marcus immediately, do not wait for a human, do not skip as TOF. ` +
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
