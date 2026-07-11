// ─────────────────────────────────────────────────────────────────────────────
//  AUTONOMY LEVEL GATE  — V7 doctrine, enforced in code.
//
//  memory.ts held autonomy_level as a sentence nothing read. The proactive loops
//  wrote via two INSERT paths (issueTask → agent_tasks, queueJanetArchitectTask →
//  os_architect_tasks) with NO level check. This module is the single choke point
//  those writers must pass through before they insert.
//
//  Default posture is 'manual': every autonomous action is DENIED. Levels are
//  EARNED (trust + clean-day streak), never granted — the seed row is 'manual'.
//  HARD_STOPS can never be auto-approved, at any level, ever.
//
//  Design: the DECISION (decideAutonomy) is pure and DB-free — fully unit
//  testable. assertAutonomyAllows layers the two side effects (read level, write
//  an audit row on deny) around it via injectable functions, so it too is
//  testable without a live database.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { COMPANY_ID } from './version'

// The classes of autonomous action the OS can attempt.
export type ActionClass =
  | 'queue_architect_task'
  | 'issue_agent_task'
  | 'send_simulation'
  | 'crm_write'
  | 'deploy'
  | 'spend'

// Earned autonomy tiers, lowest → highest. 'manual' permits nothing autonomous.
export type AutonomyLevel = 'manual' | 'l2' | 'l3' | 'l4' | 'l5'
export const LEVEL_ORDER: readonly AutonomyLevel[] = ['manual', 'l2', 'l3', 'l4', 'l5'] as const

// Un-auto-approvable at EVERY level, including l5. A human must always do these.
export const HARD_STOPS = [
  'adjust_pricing',
  'create_campaign_pricing',
  'run_ab_test',
  'capital_spend',
  'legal_contract',
  'new_subsidiary',
  'protected_path',
] as const

// Minimum EARNED level at which each action class may run autonomously.
// An action class absent from this map is fail-closed (denied) at every level —
// e.g. 'spend' is never auto-approved here; real money stays manual.
export const MIN_LEVEL: Partial<Record<ActionClass, AutonomyLevel>> = {
  queue_architect_task: 'l3',
  issue_agent_task: 'l3',
  send_simulation: 'l4',
  crm_write: 'l4',
  deploy: 'l5',
}

function levelRank(l: AutonomyLevel): number {
  const i = LEVEL_ORDER.indexOf(l)
  return i < 0 ? 0 : i // unknown → treat as 'manual' rank (fail closed)
}

// Typed error thrown on any denial. Callers in autonomous loops catch this and
// no-op; callers on human paths surface it. Duck-typed check survives bundling.
export class AutonomyDenied extends Error {
  readonly action: string
  readonly level: string
  readonly reason: string
  constructor(action: string, level: string, reason: string) {
    super(`autonomy denied: ${action} @ ${level} — ${reason}`)
    this.name = 'AutonomyDenied'
    this.action = action
    this.level = level
    this.reason = reason
  }
}

export function isAutonomyDenied(e: unknown): e is AutonomyDenied {
  return e instanceof AutonomyDenied || (e as any)?.name === 'AutonomyDenied'
}

export interface AutonomyDecision {
  allowed: boolean
  reason: string
  effectiveLevel: AutonomyLevel
}

// ── PURE decision — no I/O, exhaustively unit-testable. ──────────────────────
// Fail-closed everywhere: null/unknown level → 'manual'; unknown action → deny;
// hard stop → deny regardless of level.
export function decideAutonomy(action: string, level: AutonomyLevel | string | null | undefined): AutonomyDecision {
  const effectiveLevel: AutonomyLevel =
    level && (LEVEL_ORDER as readonly string[]).includes(level) ? (level as AutonomyLevel) : 'manual'

  // 1. Hard stops are denied at EVERY level, checked before anything else.
  if ((HARD_STOPS as readonly string[]).includes(action)) {
    return { allowed: false, reason: 'hard_stop', effectiveLevel }
  }

  // 2. Unknown action class → deny (fail closed).
  const min = (MIN_LEVEL as Record<string, AutonomyLevel | undefined>)[action]
  if (!min) {
    return { allowed: false, reason: 'unknown_action', effectiveLevel }
  }

  // 3. Level below the minimum required for this action → deny.
  if (levelRank(effectiveLevel) < levelRank(min)) {
    return { allowed: false, reason: `below_min_level:${min}`, effectiveLevel }
  }

  return { allowed: true, reason: 'allowed', effectiveLevel }
}

// ── Injectable side effects (real implementations below the assert). ─────────
export type GetLevel = (companyId: string) => Promise<AutonomyLevel | string | null | undefined>
export interface DeniedAudit {
  action: string
  level: string
  reason: string
  companyId: string
}
export type AuditSink = (row: DeniedAudit) => Promise<void>

// Real level reader: os_autonomy_state.level for the company. Fail closed —
// missing row / missing table / query error all resolve to null → 'manual'.
export const getAutonomyLevel: GetLevel = async (companyId: string) => {
  try {
    const sql = getSql()
    const rows = (await sql`
      SELECT level FROM os_autonomy_state WHERE company_id=${companyId} LIMIT 1
    `) as Array<{ level?: string }>
    return rows[0]?.level ?? null
  } catch {
    return null
  }
}

// Real audit sink: append-only row in audit_log. Must never throw — an audit
// failure cannot be allowed to convert a denial into a silent allow.
export const auditDeniedToDb: AuditSink = async ({ action, level, reason, companyId }) => {
  try {
    const sql = getSql()
    await sql`
      INSERT INTO audit_log (actor, action, target, detail)
      VALUES ('autonomy_gate', 'denied', ${companyId}, ${JSON.stringify({ action, level, reason })}::jsonb)
    `
  } catch {
    /* swallow — the deny still stands */
  }
}

// ── The choke point. Call BEFORE any autonomous write. ───────────────────────
// Throws AutonomyDenied (after writing an audit row) if the action is a hard
// stop or the earned level is below the minimum. Resolves silently if allowed.
export async function assertAutonomyAllows(
  action: ActionClass | string,
  companyId: string = COMPANY_ID,
  getLevel: GetLevel = getAutonomyLevel,
  audit: AuditSink = auditDeniedToDb,
): Promise<void> {
  const raw = await getLevel(companyId).catch(() => null) // read failure → deny
  const decision = decideAutonomy(action, raw)
  if (!decision.allowed) {
    await audit({ action, level: decision.effectiveLevel, reason: decision.reason, companyId })
    throw new AutonomyDenied(action, decision.effectiveLevel, decision.reason)
  }
}
