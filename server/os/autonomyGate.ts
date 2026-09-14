// ─────────────────────────────────────────────────────────────────────────────
//  AUTONOMY LEVEL GATE  — V7 doctrine, enforced in code.
//
//  memory.ts held autonomy_level as a sentence nothing read. The proactive loops
//  wrote via two INSERT paths (issueTask → agent_tasks, queueJanetArchitectTask →
//  os_architect_tasks) with NO level check. This module is the single choke point
//  those writers must pass through before they insert.
//
//  PhishSim (PS-L57-NO-MANUAL-01) has NO manual operating mode: the founder-set
//  floor is l5. Missing/unknown/below-floor/kill-flag reads hold l5. HARD_STOPS
//  and Dex/CAN-SPAM/geo rails stay denied at every level. Products without a
//  floor keep the historical fail-closed read (null → manual).
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
  | 'execute_architect_task'
  | 'issue_agent_task'
  | 'send_simulation'
  | 'crm_write'
  | 'deliverability_config'
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
  // PS-AUTONOMY-L2-01: issuing an agent task is the LOWEST-risk autonomous action — the executor
  // that drains it produces REVIEWED TEXT (executeTask calls an LLM and stores the result; no
  // send, no code, no spend). It earns its own tier, l2, so the founder can let Janet issue and
  // watch the executor drain WITHOUT also opening code-generation. Queueing/executing an ARCHITECT
  // task (Marcus generating and applying code) stays at l3 — deliberately DEcoupled from issuing.
  // The old design gated both at l3 "so l3 turns both on together"; that coupling was the bug.
  issue_agent_task: 'l2',
  queue_architect_task: 'l3',
  execute_architect_task: 'l3',
  send_simulation: 'l4',
  crm_write: 'l4',
  // PS-DEX-BREAKER-01: Dex re-deriving the bounce breaker. L4 like the other state-changing
  // classes. Note the gate is only half the control — dexBreaker.ts refuses to LOOSEN the
  // threshold at any level, so this permission can only ever make the guard stricter.
  deliverability_config: 'l4',
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
// Pure ladder: null/unknown level → 'manual'; unknown action → deny;
// hard stop → deny regardless of level. Live PhishSim callers must pass the
// floor through resolveReadableLevel — they never feed this 'manual'.
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

// PS-AUTONOMY-FLOOR-01 (2026-08-18) — founder-set floor per product.
//
// PhishSim reached L5 and holds posture 5.7; the founder's standing instruction is that it NEVER
// drops to manual, and climbs to 5.8 on consecutive clean days. Two mechanisms were violating that
// from opposite directions:
//
//   1. This reader failed closed on ANY error. Neon began returning HTTP 402 (data transfer quota
//      exceeded), the SELECT threw, the catch returned null, and null normalises to 'manual' — so
//      an infrastructure hiccup silently collapsed the whole company's autonomy to zero while the
//      gate reported a confident "below_min_level:l3". No demotion was ever decided; the level was
//      simply unreadable. Marcus was handed nothing for a day because a billing quota tripped.
//   2. The demotion ladder could write a level below the floor after a breaker cascade.
//
// Fail-closed is right when the answer is genuinely unknown; it is wrong when it converts a
// transient read failure into a total stop. Hard stops are denied at EVERY level and breakers halt
// work independently, so the floor cannot make anything dangerous — it only prevents a silent
// company-wide halt. A read failure is now loud and holds the floor instead of pretending it means
// manual.
const AUTONOMY_FLOORS: Record<string, AutonomyLevel> = {
  phishsimai: 'l5',
}

export function autonomyFloorFor(companyId: string): AutonomyLevel | null {
  const envKey = `AUTONOMY_FLOOR_${companyId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv && (LEVEL_ORDER as readonly string[]).includes(fromEnv)) return fromEnv as AutonomyLevel
  return AUTONOMY_FLOORS[companyId] ?? null
}

/** Raise a stored/absent level up to the product's floor. Never lowers anything. */
export function applyAutonomyFloor(companyId: string, level: string | null | undefined): string | null | undefined {
  const floor = autonomyFloorFor(companyId)
  if (!floor) return level
  const current = level && (LEVEL_ORDER as readonly string[]).includes(level) ? (level as AutonomyLevel) : null
  if (!current || levelRank(current) < levelRank(floor)) return floor
  return current
}

/**
 * Gate-time level for a floored product (PhishSim = l5).
 *
 * PS-L57-NO-MANUAL-01: a floor product has NO manual operating mode. Missing row, unknown
 * token, kill flag, or stored-below-floor all resolve to the floor. Kill flags and Dex/
 * CAN-SPAM/geo rails remain as safety — they do not collapse issue/send/crm/conversion
 * to 'manual'. Products without a floor keep the historical fail-closed read.
 */
export function resolveReadableLevel(
  companyId: string,
  stored: string | null | undefined,
  _killFlagActive?: boolean | null,
): string | null | undefined {
  const floor = autonomyFloorFor(companyId)
  if (!floor) return stored
  if (stored == null || !(LEVEL_ORDER as readonly string[]).includes(stored)) return floor
  if (levelRank(stored as AutonomyLevel) < levelRank(floor)) return floor
  return stored
}

// Real level reader: os_autonomy_state.level for the company, never below the product's floor.
export const getAutonomyLevel: GetLevel = async (companyId: string) => {
  const floor = autonomyFloorFor(companyId)
  try {
    const sql = getSql()
    const rows = (await sql`
      SELECT level FROM os_autonomy_state WHERE company_id=${companyId} LIMIT 1
    `) as Array<{ level?: string }>
    const stored = rows[0]?.level ?? null
    const effective = resolveReadableLevel(companyId, stored, false)
    if (effective !== stored) {
      console.warn(`[autonomyGate] ${companyId}: stored '${stored}' is not the operative level — ` +
        `holding founder-set floor '${effective}' (no manual operating mode)`)
    }
    return effective
  } catch (e) {
    console.error(`[autonomyGate] ${companyId}: level read FAILED (${String((e as Error)?.message || e).slice(0, 120)}) — ` +
      (floor ? `holding founder-set floor ${floor}` : 'failing closed to manual'))
    return floor
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

// ── Non-throwing check, for hot paths that must DENY QUIETLY. ────────────────
// Same fail-closed decision as assertAutonomyAllows, but returns the decision
// instead of throwing and writes NO audit row. Intended for the architect-task
// poll (hit on a loop by the Marcus daemon) where auditing every denial would
// flood audit_log. A read failure on a floored product holds the floor.
export async function checkAutonomyAllows(
  action: ActionClass | string,
  companyId: string = COMPANY_ID,
  getLevel: GetLevel = getAutonomyLevel,
): Promise<AutonomyDecision> {
  const raw = await getLevel(companyId).catch(() => autonomyFloorFor(companyId) ?? null)
  return decideAutonomy(action, resolveReadableLevel(companyId, raw))
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
  const raw = await getLevel(companyId).catch(() => autonomyFloorFor(companyId) ?? null)
  const decision = decideAutonomy(action, resolveReadableLevel(companyId, raw))
  if (!decision.allowed) {
    await audit({ action, level: decision.effectiveLevel, reason: decision.reason, companyId })
    throw new AutonomyDenied(action, decision.effectiveLevel, decision.reason)
  }
}
