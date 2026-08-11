// ─────────────────────────────────────────────────────────────────────────────
//  PS-REX-RECONCILE-01 — the gated writer behind Rex's suppression findings.
//
//  THE SEPARATION THIS PRESERVES
//    Rex DETECTS; he does not write funnel state. This module is the other half: the only code
//    permitted to correct what he found, and it goes through the crm_write autonomy gate (min L4)
//    before it touches a row. Collapsing the two would give the integrity auditor write access to
//    the thing he audits, which is how an auditor stops being one.
//
//  WHAT IT CORRECTS
//    A. unsubscribed = true while the pipeline stage is still active  → stage forced terminal.
//    B. a suppression row whose lead is not flagged unsubscribed      → flag set to match provider
//                                                                       truth (which then drags the
//                                                                       stage terminal via A).
//
//  ON THE URGENCY, STATED HONESTLY
//    These 27 rows were NOT send-eligible when found. touch2Eligible() (sequences.ts:172) already
//    excludes unsubscribed rows AND checks the suppression table in its SELECT, so the send path
//    blocked every one of them. This is a DATA-CONSISTENCY repair, not an interception — and saying
//    otherwise would be exactly the inflation this org is built to refuse.
//
//    It is still worth doing, for a reason that is not urgency: right now the ONLY thing standing
//    between a suppressed address and a send is one predicate in one function. The touch-3/4/5
//    predicates (sequences.ts:449-469) do NOT consult the suppression table at all. Correcting the
//    data means the send gate is no longer load-bearing on its own.
//
//  IDEMPOTENT BY PREDICATE
//    Both corrections are defined by the condition they eliminate, so a second run finds nothing and
//    writes nothing. Re-running is safe and is how the "0 remaining" proof is produced.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from '../conn'
import { assertAutonomyAllows, isAutonomyDenied } from '../autonomyGate'

const COMPANY = 'phishsimai'

export type AffectedLead = {
  id: string
  email: string
  pipeline_stage: string
  unsubscribed: boolean
  group: 'unsub_active_stage' | 'suppressed_not_flagged'
}

export type ReconcilePlan = {
  unsubActiveStage: AffectedLead[]
  suppressedNotFlagged: AffectedLead[]
  totalDistinct: number
}

/** READ-ONLY. Safe to call at any autonomy level — it is the evidence, not the action. */
export async function planReconciliation(sqlOverride?: any): Promise<ReconcilePlan> {
  const sql = sqlOverride ?? getSql()

  const a = (await sql`
    SELECT id::text AS id, email, pipeline_stage, unsubscribed
    FROM ps_outreach_leads
    WHERE unsubscribed = true AND pipeline_stage NOT IN ('dead','internal_test')
    ORDER BY email`) as any[]

  const b = (await sql`
    SELECT l.id::text AS id, l.email, l.pipeline_stage, l.unsubscribed
    FROM ps_outreach_suppression s
    JOIN ps_outreach_leads l ON lower(l.email) = lower(s.email)
    WHERE l.unsubscribed = false
    ORDER BY l.email`) as any[]

  const unsubActiveStage: AffectedLead[] = a.map((r) => ({ ...r, group: 'unsub_active_stage' as const }))
  const suppressedNotFlagged: AffectedLead[] = b.map((r) => ({ ...r, group: 'suppressed_not_flagged' as const }))
  const ids = new Set([...unsubActiveStage, ...suppressedNotFlagged].map((r) => r.id))

  return { unsubActiveStage, suppressedNotFlagged, totalDistinct: ids.size }
}

export type ReconcileResult = {
  gate: 'allowed' | 'denied' | 'dry_run'
  gateReason: string
  before: ReconcilePlan
  after: ReconcilePlan | null
  stagesForcedTerminal: number
  flagsSetUnsubscribed: number
  remainingEligibleForSend: number | null
  line: string
}

/**
 * How many of the affected addresses the send path would currently pick up.
 *
 * Deliberately re-implements touch2Eligible()'s predicate rather than importing it: the point of
 * this number is to check the DATA against the gate as an independent observer. Importing the same
 * function would make the proof circular — it would agree with itself by construction.
 */
export async function countStillSendEligible(sql: any, emails: string[]): Promise<number> {
  if (!emails.length) return 0
  const r = (await sql`
    SELECT count(*)::int AS n
    FROM ps_outreach_leads l
    WHERE lower(l.email) = ANY(${emails.map((e) => e.toLowerCase())})
      AND l.bounced = false
      AND l.unsubscribed = false
      AND l.pipeline_stage NOT IN ('dead','customer','internal_test')
      AND NOT EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
  `) as any[]
  return Number(r[0]?.n ?? 0)
}

/**
 * Apply the correction, behind the crm_write gate.
 *
 * `dryRun` still consults the gate. A preview that skips the permission check would report "this is
 * what I would do" for an action the system would refuse to perform — which is a lie of a subtle and
 * expensive kind, because it is the version a human reads before approving.
 */
export async function applyReconciliation(
  opts: { sqlOverride?: any; dryRun?: boolean; companyId?: string } = {},
): Promise<ReconcileResult> {
  const sql = opts.sqlOverride ?? getSql()
  const companyId = opts.companyId ?? COMPANY
  const before = await planReconciliation(sql)
  const allEmails = [...before.unsubActiveStage, ...before.suppressedNotFlagged].map((r) => r.email)

  let gate: ReconcileResult['gate'] = 'allowed'
  let gateReason = 'crm_write permitted at the earned autonomy level'
  try {
    await assertAutonomyAllows('crm_write', companyId)
  } catch (e) {
    if (!isAutonomyDenied(e)) throw e
    gate = 'denied'
    gateReason = (e as any).reason ?? 'denied'
  }

  if (gate === 'denied') {
    return {
      gate,
      gateReason,
      before,
      after: null,
      stagesForcedTerminal: 0,
      flagsSetUnsubscribed: 0,
      remainingEligibleForSend: await countStillSendEligible(sql, allEmails).catch(() => null),
      line:
        `Reconciliation BLOCKED by the crm_write gate (${gateReason}). ${before.totalDistinct} lead(s) ` +
        `remain inconsistent. Nothing was written — this is the gate working, not a failure.`,
    }
  }

  if (opts.dryRun) {
    return {
      gate: 'dry_run',
      gateReason: `${gateReason} (dry run — no write attempted)`,
      before,
      after: null,
      stagesForcedTerminal: 0,
      flagsSetUnsubscribed: 0,
      remainingEligibleForSend: await countStillSendEligible(sql, allEmails).catch(() => null),
      line:
        `Reconciliation DRY RUN: would force ${before.unsubActiveStage.length} stage(s) terminal and ` +
        `flag ${before.suppressedNotFlagged.length} lead(s) unsubscribed. No rows written.`,
    }
  }

  // ── B before A. Flagging a suppressed lead unsubscribed CREATES a group-A violation (unsubscribed
  // with an active stage), so doing A first would leave those rows behind for the next run. Ordering
  // it this way lets one pass fully converge.
  const flagged = (await sql`
    UPDATE ps_outreach_leads l
       SET unsubscribed = true, stage_updated_at = NOW()
     WHERE l.unsubscribed = false
       AND EXISTS (SELECT 1 FROM ps_outreach_suppression s WHERE lower(s.email) = lower(l.email))
    RETURNING l.id`) as any[]

  const staged = (await sql`
    UPDATE ps_outreach_leads
       SET pipeline_stage = 'dead', stage_updated_at = NOW()
     WHERE unsubscribed = true AND pipeline_stage NOT IN ('dead','internal_test')
    RETURNING id`) as any[]

  await sql`
    INSERT INTO audit_log (actor, action, target, detail)
    VALUES ('rex_reconcile', 'crm_write', ${companyId}, ${JSON.stringify({
      reason: 'PS-REX-RECONCILE-01 suppression/stage reconciliation',
      flagsSetUnsubscribed: flagged.length,
      stagesForcedTerminal: staged.length,
      emails: allEmails,
    })}::jsonb)`.catch(() => {})

  const after = await planReconciliation(sql)
  const remaining = await countStillSendEligible(sql, allEmails).catch(() => null)

  return {
    gate,
    gateReason,
    before,
    after,
    stagesForcedTerminal: staged.length,
    flagsSetUnsubscribed: flagged.length,
    remainingEligibleForSend: remaining,
    line:
      `Reconciliation APPLIED (crm_write, L4): ${flagged.length} lead(s) flagged unsubscribed to match ` +
      `provider truth, ${staged.length} stage(s) forced terminal. ` +
      `${after.totalDistinct} inconsistent lead(s) remain (target 0). ` +
      `${remaining === null ? 'send-eligibility NOT CHECKED' : `${remaining} of the affected addresses are send-eligible (target 0)`}.`,
  }
}
