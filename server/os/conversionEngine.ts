import { learnFromOutcome } from './memory'
import { persistOutcomeTrace } from './outcomeTrace'
import { COMPANY_ID } from './version'
import { sendWarmTrialCtas, type WarmCtaResult } from './sequences'

export type ConversionShiftResult = WarmCtaResult & { lesson: string; success: boolean }

export function conversionLesson(r: WarmCtaResult): { success: boolean; lesson: string } {
  if (r.tripped) {
    return {
      success: false,
      lesson: 'Dex bounce breaker tripped — conversion stood down. Do not send around Dex. Wait for a healthy window, then convert replies first.',
    }
  }
  if (r.reason?.startsWith('autonomy:')) {
    return { success: false, lesson: `Conversion blocked by autonomy gate (${r.reason}). Do not bypass. Escalate to Janet only if L-level is wrong.` }
  }
  if (r.sent > 0) {
    return {
      success: true,
      lesson: `Sent ${r.sent} Dex-gated 30-day trial CTAs to warm leads. Same-day follow-up is the job until a verified trial starts. Blocked=${r.blocked} skipped=${r.skipped}.`,
    }
  }
  if (r.blocked > 0) {
    return {
      success: false,
      lesson: `${r.blocked} warm leads blocked by Dex/MX/suppression and 0 CTAs sent. Convert only sendable replies. Do not invent a trial.`,
    }
  }
  return {
    success: false,
    lesson: 'No warm sendable leads this run. Fill the top of funnel AND wait for replies — activity without a trial is failure.',
  }
}

/** Rank replied > engaged > opened. Used by tests and as the ranking doctrine for the SQL ORDER BY. */
export function rankWarmLeads<T extends { replied?: boolean; pipeline_stage?: string }>(leads: T[]): T[] {
  const score = (l: T) => {
    if (l.replied || l.pipeline_stage === 'engaged') return 0
    if (l.pipeline_stage === 'prospect') return 2
    return 1
  }
  return [...leads].sort((a, b) => score(a) - score(b))
}

/**
 * Janet's conversion tool. Mason/Aria tasks and the task-runner heartbeat call this.
 * Sends go through sequences.ts so Dex SEND_PATHS / assertSendable / MX still apply.
 */
export async function runCgoConversionShift(opts: { emails?: string[]; cap?: number } = {}): Promise<ConversionShiftResult> {
  const raw = await sendWarmTrialCtas({ emails: opts.emails, cap: opts.cap ?? 8 })
  const { success, lesson } = conversionLesson(raw)
  const result: ConversionShiftResult = { ...raw, success, lesson }
  await learnFromOutcome(
    COMPANY_ID,
    'cgo_warm_trial_cta',
    `sent=${raw.sent} blocked=${raw.blocked} skipped=${raw.skipped} tripped=${raw.tripped}`,
    lesson,
  ).catch(() => {})
  await persistOutcomeTrace({
    companyId: COMPANY_ID,
    agentId: 'mason',
    action: 'convert_warm',
    businessOutcome: raw.sent > 0 ? 'trial_cta_sent' : raw.tripped ? 'breaker_tripped' : raw.blocked > 0 ? 'blocked_dex' : 'no_warm_leads',
    liveness: true,
    usefulness: raw.sent > 0 || raw.tripped || Boolean(raw.reason),
    schemaValid: true,
  }).catch(() => {})
  return result
}
