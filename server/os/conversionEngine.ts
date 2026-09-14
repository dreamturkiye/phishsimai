import { learnFromOutcome, rememberFact } from './memory'
import { persistOutcomeTrace } from './outcomeTrace'
import { COMPANY_ID } from './version'
import { sendWarmTrialCtas, type WarmCtaResult, type WarmPoolCensus, EMPTY_WARM_POOL } from './sequences'
import { diagnoseRevenueFailure } from './cgoMandate'

export type ConversionShiftResult = WarmCtaResult & {
  lesson: string
  success: boolean
  trialNudges?: { scanned: number; sent: number }
  linkedinDraft?: { queued: boolean; reason: string }
}

export function conversionLesson(
  r: WarmCtaResult,
  nudges?: { sent: number; scanned?: number },
  draft?: { queued: boolean; reason: string },
  pool?: WarmPoolCensus,
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
  const draftNote = draft?.queued ? ' Queued one LinkedIn trial CTA for founder review (not published).' : ''
  if (r.sent > 0) {
    const extra = nudgeSent > 0 ? ` Also sent ${nudgeSent} trial-org nudge(s).` : ''
    return {
      success: true,
      lesson: `Sent ${r.sent} Dex-gated 30-day trial CTAs to warm leads. Same-day follow-up is the job until a verified trial starts. Blocked=${r.blocked} skipped=${r.skipped}.${extra}${draftNote}`,
    }
  }
  if (nudgeSent > 0) {
    return {
      success: true,
      lesson: `No new warm CTAs this run. Sent ${nudgeSent} trial nudge(s) to existing TRUE free-trial orgs (D14/D18/D25/D30). Convert remaining trials to paid.${draftNote}`,
    }
  }
  if (r.blocked > 0) {
    return {
      success: false,
      lesson: `${r.blocked} warm leads blocked by Dex/MX/suppression and 0 CTAs sent. Convert only sendable replies. Do not invent a trial.${draftNote}`,
    }
  }
  const p = pool || r.pool
  if (p && (p.replied > 0 || p.engaged > 0)) {
    return {
      success: false,
      lesson:
        `REVENUE BLOCKER: ${p.replied} replied / ${p.engaged} engaged exist but 0 CTAs sent ` +
        `(eligible=${p.eligible}, suppressed=${p.suppressed}, cooldown=${p.cooldown}, exhausted=${p.exhausted}, ` +
        `auto_reply_drafts=${p.autoReplyPending}). Do not wait for more TOF. Reopen misclassified replies, ` +
        `follow up Grey Box to paid, fire convert_warm on sendable engaged leads.` +
        draftNote,
    }
  }
  return {
    success: false,
    lesson: 'No warm sendable leads this run. Fill the top of funnel via MSP harvest + founder-review social drafts AND wait for replies — activity without a TRUE trial is failure.' + draftNote,
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
 * Also queues one founder-review LinkedIn draft/day (publish stays lockout-blocked).
 */
export async function runCgoConversionShift(opts: { emails?: string[]; cap?: number } = {}): Promise<ConversionShiftResult> {
  try {
    const { getSql } = await import('./conn')
    const { reopenFalseAutoReplies } = await import('./agents/salesReplies')
    await reopenFalseAutoReplies(getSql()).catch(() => 0)
  } catch { /* reopen is additive */ }
  const raw = await sendWarmTrialCtas({ emails: opts.emails, cap: opts.cap ?? 8 })
  let trialNudges = { scanned: 0, sent: 0 }
  try {
    const { runTrialNudges } = await import('./trialNudges')
    const n = await runTrialNudges()
    trialNudges = { scanned: n.scanned, sent: n.sent.length }
  } catch {
    // Nudges are additive; a nudge failure must not hide a warm CTA that already sent.
  }
  let linkedinDraft = { queued: false, reason: 'not attempted' }
  try {
    const { queueFounderReviewTrialDraft } = await import('./trialAcquisitionChannels')
    linkedinDraft = await queueFounderReviewTrialDraft()
  } catch (e: any) {
    linkedinDraft = { queued: false, reason: String(e?.message || e).slice(0, 160) }
  }
  const pool = raw.pool || EMPTY_WARM_POOL
  const { success, lesson } = conversionLesson(raw, trialNudges, linkedinDraft, pool)
  if (raw.reason?.startsWith('autonomy:')) {
    await maybeQueueAutonomyBlocker(raw.reason).catch(() => {})
  }
  const diagnosis = diagnoseRevenueFailure({
    trueTrials: null,
    paying: null,
    warm: pool,
  })
  await rememberFact({
    company_id: COMPANY_ID,
    type: 'operating',
    key: 'revenue_diagnosis',
    value: JSON.stringify({ lesson, diagnosis: diagnosis.line, bottlenecks: diagnosis.bottlenecks, pool, ts: new Date().toISOString() }).slice(0, 1800),
    confidence: 0.9,
    source: 'conversion_engine',
  }).catch(() => {})
  const result: ConversionShiftResult = { ...raw, success, lesson, trialNudges, linkedinDraft }
  await learnFromOutcome(
    COMPANY_ID,
    'cgo_warm_trial_cta',
    `sent=${raw.sent} blocked=${raw.blocked} skipped=${raw.skipped} tripped=${raw.tripped} trial_nudges=${trialNudges.sent} linkedin_draft=${linkedinDraft.queued} eligible=${pool.eligible} replied=${pool.replied} engaged=${pool.engaged}`,
    lesson,
  ).catch(() => {})
  await persistOutcomeTrace({
    companyId: COMPANY_ID,
    agentId: 'mason',
    action: 'convert_warm',
    businessOutcome: raw.sent > 0 ? 'trial_cta_sent' : trialNudges.sent > 0 ? 'trial_nudge_sent' : raw.tripped ? 'breaker_tripped' : raw.blocked > 0 ? 'blocked_dex' : 'no_warm_leads',
    liveness: true,
    usefulness: raw.sent > 0 || trialNudges.sent > 0 || raw.tripped || Boolean(raw.reason) || linkedinDraft.queued || pool.replied > 0,
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
