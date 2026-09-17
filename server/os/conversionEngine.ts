import { learnFromOutcome, rememberFact } from './memory'
import { persistOutcomeTrace } from './outcomeTrace'
import { COMPANY_ID } from './version'
import { sendWarmTrialCtas, type WarmCtaResult, type WarmPoolCensus, EMPTY_WARM_POOL } from './sequences'
import { diagnoseRevenueFailure, isWarmPoolExhausted } from './cgoMandate'
import { formatWarmCtaTrialRate, type WarmCtaTrialRate } from './warmCloseMetrics'
import { linkedInFunnelLine, type LinkedInAcquisitionResult } from './trialAcquisitionChannels'
import type { GreyBoxPaidNudgeResult } from './trialNudges'

export type ConversionShiftResult = WarmCtaResult & {
  lesson: string
  success: boolean
  executed: boolean
  queued: boolean
  trialNudges?: { scanned: number; sent: number }
  linkedinDraft?: { queued: boolean; reason: string; escalated?: boolean }
  greyBox?: GreyBoxPaidNudgeResult
  warmCtaTrialRate?: WarmCtaTrialRate
}

export function conversionLesson(
  r: WarmCtaResult,
  nudges?: { sent: number; scanned?: number },
  draft?: { queued: boolean; reason: string; escalated?: boolean },
  pool?: WarmPoolCensus,
  extra?: { greyBox?: GreyBoxPaidNudgeResult; warmRate?: WarmCtaTrialRate; t1Starved?: boolean },
): { success: boolean; lesson: string } {
  if (r.tripped) {
    return {
      success: false,
      lesson: 'Dex bounce breaker tripped — conversion stood down. Do not send around Dex. Wait for a healthy window, then convert replies first.',
    }
  }
  if (r.reason?.startsWith('autonomy:')) {
    return { success: false, lesson: `Conversion blocked by autonomy gate (${r.reason}). Do not bypass. Escalate to Janet only if L-level is wrong.` }
  }
  const nudgeSent = Math.max(0, Number(nudges?.sent) || 0)
  const draftNote = draft?.queued
    ? ` Queued one LinkedIn trial CTA for founder review (${draft.reason}).`
    : draft?.escalated
      ? ` LinkedIn: ${draft.reason}.`
      : draft?.reason
        ? ` LinkedIn: ${draft.reason}.`
        : ''
  const greyNote = extra?.greyBox?.sent
    ? ` Grey Box paid nudge sent (${extra.greyBox.reason}).`
    : extra?.greyBox?.reason
      ? ` Grey Box: ${extra.greyBox.reason}.`
      : ''
  const rateNote = extra?.warmRate ? ` ${formatWarmCtaTrialRate(extra.warmRate)}.` : ''
  if (r.sent > 0) {
    const extraNudge = nudgeSent > 0 ? ` Also sent ${nudgeSent} trial-org nudge(s).` : ''
    return {
      success: true,
      lesson: `Sent ${r.sent} Dex-gated 30-day trial CTAs to warm leads. Same-day follow-up is the job until a verified trial starts. Blocked=${r.blocked} skipped=${r.skipped}.${extraNudge}${draftNote}${greyNote}${rateNote}`,
    }
  }
  if (nudgeSent > 0 || extra?.greyBox?.sent) {
    return {
      success: true,
      lesson: `No new warm CTAs this run. Sent ${nudgeSent} trial nudge(s) to existing TRUE free-trial orgs (activation / D14/D18/D25/D30). Convert remaining trials to paid.${draftNote}${greyNote}${rateNote}`,
    }
  }
  if (r.blocked > 0) {
    return {
      success: false,
      lesson: `${r.blocked} warm leads blocked by Dex/MX/suppression and 0 CTAs sent. Convert only sendable replies. Do not invent a trial.${draftNote}${greyNote}${rateNote}`,
    }
  }
  const p = pool || r.pool
  if (extra?.t1Starved && (!p || p.eligible === 0)) {
    return {
      success: false,
      lesson:
        'T1 starved / sanitizedEligible=0. Do not convert_warm an empty pool. ' +
        'ACTION: queue_marcus named bug PS-T1-STARVE — refill sanitize / check QEV. ' +
        'Do not raise DAILY_SEND_LIMIT or set REFILL_ALLOW_MX_ONLY=1.' +
        draftNote + greyNote + rateNote,
    }
  }
  if (p && (p.replied > 0 || p.engaged > 0)) {
    const next =
      p.eligible === 0
        ? isWarmPoolExhausted(p)
          ? 'Do not convert_warm an exhausted 90/91/92 pool. Advance LinkedIn founder-review, nurture Grey Box to paid, inspect /trial path. Keep Dex rails.'
          : p.cooldown >= p.sendable && p.sendable > 0
            ? 'Crisis follow-up 91/92 on parked touch-90 (Dex rails). Also LinkedIn founder-review and Grey Box nurture — do not wait for more TOF.'
            : 'Do not convert_warm an empty pool. Advance LinkedIn founder-review, nurture Grey Box to paid, inspect /trial path.'
        : 'Reopen misclassified replies, follow up Grey Box to paid, fire convert_warm on sendable engaged leads.'
    return {
      success: false,
      lesson:
        `REVENUE BLOCKER: ${p.replied} replied / ${p.engaged} engaged exist but 0 CTAs sent ` +
        `(eligible=${p.eligible}, suppressed=${p.suppressed}, cooldown=${p.cooldown}, exhausted=${p.exhausted}, ` +
        `auto_reply_drafts=${p.autoReplyPending}). ${next}` +
        draftNote + greyNote + rateNote,
    }
  }
  return {
    success: false,
    lesson: 'No warm sendable leads this run. Fill the top of funnel via MSP harvest + founder-review social drafts AND wait for replies — activity without a TRUE trial is failure.' + draftNote + greyNote + rateNote,
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

export function conversionQueued(opts: {
  sent: number
  eligible?: number
  nudgeSent?: number
  greyBoxSent?: boolean
  linkedinQueued?: boolean
  linkedinEscalated?: boolean
}): boolean {
  return (
    opts.sent > 0 ||
    (opts.eligible ?? 0) > 0 ||
    (opts.nudgeSent ?? 0) > 0 ||
    !!opts.greyBoxSent ||
    !!opts.linkedinQueued ||
    !!opts.linkedinEscalated
  )
}

/**
 * Janet's conversion tool. Mason/Aria tasks and the task-runner heartbeat call this.
 * Sends go through sequences.ts so Dex SEND_PATHS / assertSendable / MX still apply.
 * Multi-channel (LinkedIn advance) runs every crisis tick — not optional.
 */
export async function runCgoConversionShift(opts: { emails?: string[]; cap?: number } = {}): Promise<ConversionShiftResult> {
  let reopenedAutoReplies = 0
  try {
    const { getSql } = await import('./conn')
    const { reopenFalseAutoReplies } = await import('./agents/salesReplies')
    reopenedAutoReplies = await reopenFalseAutoReplies(getSql(), { crisis: true })
    if (reopenedAutoReplies > 0) {
      console.log(`[conversion] reopened ${reopenedAutoReplies} false auto_reply drafts before convert_warm`)
    }
  } catch (e) {
    console.warn('[conversion] reopenFalseAutoReplies failed:', String((e as Error)?.message || e).slice(0, 160))
  }
  const raw = await sendWarmTrialCtas({ emails: opts.emails, cap: opts.cap ?? 8 })
  raw.reopenedAutoReplies = reopenedAutoReplies
  let trialNudges = { scanned: 0, sent: 0 }
  let greyBox: GreyBoxPaidNudgeResult | undefined
  try {
    const { runTrialNudges } = await import('./trialNudges')
    const n = await runTrialNudges()
    trialNudges = { scanned: n.scanned, sent: n.sent.length }
    if (n.greyBox) greyBox = n.greyBox
  } catch {
    // Nudges are additive; a nudge failure must not hide a warm CTA that already sent.
  }
  if (!greyBox) {
    try {
      const { runGreyBoxPaidNudge } = await import('./trialNudges')
      greyBox = await runGreyBoxPaidNudge()
    } catch (e: any) {
      greyBox = { attempted: false, sent: false, reason: String(e?.message || e).slice(0, 160) }
    }
  }
  let linkedinDraft: LinkedInAcquisitionResult = {
    queued: false,
    escalated: false,
    reason: 'not attempted',
    funnel: { pendingReview: 0, queued: 0, approved: 0, posted: 0, oldestPendingHours: null },
  }
  try {
    const { advanceLinkedInAcquisition } = await import('./trialAcquisitionChannels')
    linkedinDraft = await advanceLinkedInAcquisition()
  } catch (e: any) {
    linkedinDraft = {
      queued: false,
      escalated: false,
      reason: String(e?.message || e).slice(0, 160),
      funnel: { pendingReview: 0, queued: 0, approved: 0, posted: 0, oldestPendingHours: null },
    }
  }
  let warmCtaTrialRate: WarmCtaTrialRate | undefined
  try {
    const { measureWarmCtaToTrial } = await import('./warmCloseMetrics')
    warmCtaTrialRate = await measureWarmCtaToTrial()
  } catch {
    warmCtaTrialRate = undefined
  }
  const pool = raw.pool || EMPTY_WARM_POOL
  let t1Starved = false
  try {
    const { loadT1Scoreboard } = await import('./t1MarcusHandoff')
    const board = await loadT1Scoreboard((await import('./conn')).getSql())
    t1Starved = board.sanitizedEligible <= 0 || board.starvationAlert || !board.verifier.any
  } catch {
    t1Starved = false
  }
  const { success, lesson } = conversionLesson(raw, trialNudges, linkedinDraft, pool, {
    greyBox, warmRate: warmCtaTrialRate, t1Starved,
  })
  const executed = raw.sent > 0 || trialNudges.sent > 0 || !!greyBox?.sent
  const queued = conversionQueued({
    sent: raw.sent,
    eligible: pool.eligible,
    nudgeSent: trialNudges.sent,
    greyBoxSent: greyBox?.sent,
    linkedinQueued: linkedinDraft.queued,
    linkedinEscalated: linkedinDraft.escalated,
  })
  if (raw.reason?.startsWith('autonomy:')) {
    await maybeQueueAutonomyBlocker(raw.reason).catch(() => {})
  }
  const diagnosis = diagnoseRevenueFailure({
    trueTrials: null,
    paying: null,
    warm: pool,
  })
  try {
    const { maybeQueueT1Marcus, diagnoseFromT1Scoreboard, loadT1Scoreboard } = await import('./t1MarcusHandoff')
    const board = await loadT1Scoreboard((await import('./conn')).getSql()).catch(() => null)
    if (board) {
      const named = diagnoseFromT1Scoreboard({ ...board, warm: pool })
      diagnosis.line = named.line
      diagnosis.bottlenecks = named.bottlenecks
      diagnosis.nextActions = named.nextActions
      diagnosis.crisis = named.crisis
    }
    await maybeQueueT1Marcus().catch(() => {})
  } catch {
    // T1 handoff is additive; warm diagnosis must still persist.
  }
  await rememberFact({
    company_id: COMPANY_ID,
    type: 'operating',
    key: 'revenue_diagnosis',
    value: JSON.stringify({
      lesson,
      diagnosis: diagnosis.line,
      bottlenecks: diagnosis.bottlenecks,
      pool,
      linkedin: linkedInFunnelLine(linkedinDraft.funnel),
      greyBox,
      warmCtaTrialRate,
      ts: new Date().toISOString(),
    }).slice(0, 1800),
    confidence: 0.9,
    source: 'conversion_engine',
  }).catch(() => {})
  const result: ConversionShiftResult = {
    ...raw,
    success,
    executed,
    queued,
    lesson,
    trialNudges,
    linkedinDraft,
    greyBox,
    warmCtaTrialRate,
  }
  await learnFromOutcome(
    COMPANY_ID,
    'cgo_warm_trial_cta',
    `sent=${raw.sent} blocked=${raw.blocked} skipped=${raw.skipped} tripped=${raw.tripped} trial_nudges=${trialNudges.sent} linkedin_draft=${linkedinDraft.queued} linkedin_escalated=${linkedinDraft.escalated} greybox=${greyBox?.sent} eligible=${pool.eligible} replied=${pool.replied} engaged=${pool.engaged}`,
    lesson,
  ).catch(() => {})
  await persistOutcomeTrace({
    companyId: COMPANY_ID,
    agentId: 'mason',
    action: 'convert_warm',
    businessOutcome: raw.sent > 0 ? 'trial_cta_sent' : trialNudges.sent > 0 || greyBox?.sent ? 'trial_nudge_sent' : raw.tripped ? 'breaker_tripped' : raw.blocked > 0 ? 'blocked_dex' : 'no_warm_leads',
    liveness: true,
    usefulness: raw.sent > 0 || trialNudges.sent > 0 || raw.tripped || Boolean(raw.reason) || linkedinDraft.queued || linkedinDraft.escalated || pool.replied > 0 || !!greyBox?.sent,
    schemaValid: true,
  }).catch(() => {})
  return result
}

const AUTONOMY_MARCUS_DAY_KEY = 'conversion_autonomy_marcus_day'

/** Once per UTC day: named-file Marcus task when convert_warm is denied by the gate. Not Dex. */
async function maybeQueueAutonomyBlocker(reason: string): Promise<void> {
  const { getSql } = await import('./conn')
  const sql = getSql()
  const day = new Date().toISOString().slice(0, 10)
  const prior = (await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${COMPANY_ID} AND type='operating' AND key=${AUTONOMY_MARCUS_DAY_KEY}
    LIMIT 1
  `.catch(() => [])) as Array<{ value?: string }>
  if (String(prior[0]?.value || '') === day) return
  const { queueJanetArchitectTask } = await import('./selfHeal')
  const id = await queueJanetArchitectTask({
    task:
      'Restore PhishSim convert_warm / send_simulation at the L5 floor. convert_warm was denied by the autonomy gate. Named files: server/os/autonomyGate.ts, server/os/ownerRuling.ts. Do not lower the floor. Do not change Dex rails or price.',
    source: 'agent:mason',
    notes: String(reason || '').slice(0, 500),
    notify: false,
  }).catch(() => null)
  if (!id) return
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${COMPANY_ID}, 'operating', ${AUTONOMY_MARCUS_DAY_KEY}, ${day}, 1, 'conversion_engine')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `.catch(() => {})
}
