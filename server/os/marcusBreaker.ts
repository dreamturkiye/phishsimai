// ─────────────────────────────────────────────────────────────────────────────
//  MARCUS ⟷ CIRCUIT BREAKER WIRING
//
//  circuitBreaker.ts (the M.1 guardrail) exists, but Marcus's execution path never
//  called it. This closes that gap: before Marcus ISSUES or EXECUTES an architect
//  task, and before any generated change is applied, it must pass the breaker.
//
//  One circuit represents Marcus's architect execution (fingerprint below):
//   • OPEN  → Marcus neither issues nor executes; the action is parked + escalated.
//   • 3 consecutive failures → OPEN (then cooldown 6h → doubling → 48h cap).
//   • A destructive diff (>10 files or >500 net lines outside generated/) trips it
//     straight to OPEN and the change is DISCARDED, never applied.
//
//  This is WIRING ONLY. It does NOT re-enable Marcus and does NOT change the
//  autonomy level — every issue path still sits behind the autonomy gate (manual
//  denies before the breaker is even consulted). It makes a future turn-on SAFE.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getBreakerState, recordTaskOutcome, checkDiffSafety, primaryFingerprint,
  makeSqlBreakerDeps, type BreakerDeps, type DiffFile, type DiffVerdict,
} from './circuitBreaker'
import { sendTelegram } from './telegram'
import { COMPANY_ID } from './version'

// The single Marcus architect circuit. Consecutive failures / destructive diffs
// open THIS fingerprint; while it's open, Marcus is halted.
export const MARCUS_TASK_ID = 'marcus:architect'
export function marcusFingerprint(productId: string = COMPANY_ID): string {
  return primaryFingerprint(productId, MARCUS_TASK_ID)
}

export type Notify = (text: string) => Promise<unknown>

// Gate before ISSUING or EXECUTING any architect task. Returns true if Marcus may
// act (breaker closed or half_open probe). If OPEN → escalate via Telegram, log,
// and return false so the caller parks the action.
export async function guardMarcusAllowed(
  deps: BreakerDeps,
  action: string,
  productId: string = COMPANY_ID,
  notify: Notify = sendTelegram,
): Promise<boolean> {
  const s = await getBreakerState(deps, marcusFingerprint(productId))
  if (s.canAttempt) return true // closed, or half_open (the single cooldown probe)
  const resumeAt = s.halfOpenDueAt ? new Date(s.halfOpenDueAt).toISOString() : 'unknown'
  console.warn(`[marcus-breaker] OPEN — "${action}" parked. trip=${s.tripReason} resumeAt=${resumeAt}`)
  await notify(
    `🔴 <b>MARCUS BLOCKED — circuit breaker OPEN</b>\n` +
    `Parked: ${action}\nTrip reason: ${s.tripReason ?? '?'}\nResume after: ${resumeAt}\n` +
    `Last error: ${(s.lastError ?? '').slice(0, 300)}`,
  ).catch(() => {})
  return false
}

// Destructive-diff tripwire IN Marcus's execution path. Runs the safety check; an
// unsafe diff trips the breaker OPEN and returns verdict 'reject' — the caller MUST
// discard the change and never apply it.
export async function guardMarcusDiff(
  deps: BreakerDeps,
  diff: DiffFile[] | string,
  productId: string = COMPANY_ID,
  notify: Notify = sendTelegram,
): Promise<DiffVerdict> {
  const v = await checkDiffSafety(deps, marcusFingerprint(productId), productId, diff)
  if (v.verdict === 'reject') {
    console.warn(`[marcus-breaker] destructive diff REFUSED: ${v.reason} (${v.analysis.filesDeletedOutside} files / net ${v.analysis.netLinesOutside} lines)`)
    await notify(
      `🔴 <b>MARCUS DESTRUCTIVE DIFF REFUSED</b>\n` +
      `${v.analysis.filesDeletedOutside} files deleted / net ${v.analysis.netLinesOutside} lines outside generated/.\n` +
      `Breaker OPEN — change DISCARDED, not applied. Reason: ${v.reason}`,
    ).catch(() => {})
  }
  return v
}

// Record a Marcus execution outcome. success → closed (counter reset); a 3rd
// consecutive failure → OPEN, after which guardMarcusAllowed halts Marcus.
export async function recordMarcusOutcome(
  deps: BreakerDeps,
  success: boolean,
  error?: unknown,
  productId: string = COMPANY_ID,
) {
  return recordTaskOutcome(deps, productId, MARCUS_TASK_ID, success, error)
}

// Represent a Marcus code-gen file set as a diff for the safety check: a file
// written EMPTY is treated as a deletion; otherwise as an addition of its lines.
// Lets the destructive-diff tripwire evaluate the generated change before apply.
export function fileSetToDiff(files: Record<string, string>): DiffFile[] {
  return Object.entries(files).map(([path, content]) => {
    const body = content ?? ''
    const empty = body.trim() === ''
    return { path, deleted: empty, added: empty ? 0 : body.split('\n').length, removed: 0 }
  })
}

export function makeMarcusBreakerDeps(): BreakerDeps {
  return makeSqlBreakerDeps()
}
