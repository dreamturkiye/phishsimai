// ─────────────────────────────────────────────────────────────────────────────
//  CIRCUIT BREAKER + DESTRUCTIVE-DIFF TRIPWIRE + HARD-STOP ENFORCEMENT
//  KAAN AI OS v7 — Section M.1. The guardrail that MUST predate any Marcus
//  re-enable. Marcus is NOT wired to call this yet — this is the guardrail for
//  WHEN he returns, not the re-enable.
//
//  LOGIC ONLY — circuit_breaker_state and escalations already exist (metrics
//  migration). No new migration. Persists to circuit_breaker_state; raises
//  breaker_trip escalations; audits manual closes.
//
//  The state store is injected (BreakerStore) so the whole state machine is
//  unit-testable in-memory. makeSqlBreakerDeps() provides the real DB-backed one.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto'
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { HARD_STOPS } from './autonomyGate'

const HOUR_MS = 3_600_000
const BASE_COOLDOWN_MS = 6 * HOUR_MS
const MAX_COOLDOWN_MS = 48 * HOUR_MS
const TRIP_THRESHOLD = 3

export type BreakerState = 'closed' | 'open' | 'half_open'
export type TripReason = 'consecutive_failures' | 'destructive_diff' | 'deploy_mismatch'

export interface BreakerRow {
  fingerprint: string
  productId: string
  consecutiveFailures: number
  state: BreakerState
  openedAt: number | null // epoch ms
  lastError: string | null // RAW stderr/body/stack — never a generic string
  tripReason: TripReason | null
  escalationId: number | null
  updatedAt: number
}

// ── Fingerprints (M.1) ───────────────────────────────────────────────────────
function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// primary = sha256(product_id + ':' + task_id)
export function primaryFingerprint(productId: string, taskId: string): string {
  return sha256(`${productId}:${taskId}`)
}

// normalized error signature = first stack frame + error class, line/col stripped
// so the SAME rot under different task IDs collapses to one signature.
export function errorSignature(error: unknown): string {
  const err = error as any
  const cls = err?.name || err?.constructor?.name || (err === null ? 'null' : typeof error) || 'Error'
  const stack = typeof err?.stack === 'string' ? err.stack : ''
  const firstFrame = stack.split('\n').map((l: string) => l.trim()).find((l: string) => l.startsWith('at ')) || ''
  const normFrame = firstFrame.replace(/:\d+:\d+\)?/g, ')').replace(/:\d+:\d+/g, '')
  return `${cls}|${normFrame}`.trim()
}

// secondary = sha256(normalized error signature)
export function secondaryFingerprint(error: unknown): string {
  return sha256(errorSignature(error))
}

// Cooldown for a fingerprint that has opened: 6h, doubling per re-open, cap 48h.
// consecutive_failures encodes the open-cycle count (trips at 3; each re-open +1).
export function cooldownMs(consecutiveFailures: number): number {
  const exp = Math.max(0, consecutiveFailures - TRIP_THRESHOLD)
  return Math.min(BASE_COOLDOWN_MS * 2 ** exp, MAX_COOLDOWN_MS)
}

// open → half_open once the cooldown has elapsed (time-derived, not persisted).
export function effectiveState(row: BreakerRow, nowMs: number): BreakerState {
  if (row.state === 'open' && row.openedAt != null && nowMs - row.openedAt >= cooldownMs(row.consecutiveFailures)) {
    return 'half_open'
  }
  return row.state
}

function closedRow(fingerprint: string, productId: string, now: number): BreakerRow {
  return {
    fingerprint, productId, consecutiveFailures: 0, state: 'closed',
    openedAt: null, lastError: null, tripReason: null, escalationId: null, updatedAt: now,
  }
}

// ── Injected store ───────────────────────────────────────────────────────────
export interface Escalation {
  productId: string
  category: 'breaker_trip'
  payload: Record<string, unknown>
}
export interface AuditRow {
  actor: string
  action: string
  target: string
  detail: Record<string, unknown>
}
export interface BreakerStore {
  load(fingerprint: string): Promise<BreakerRow | null>
  save(row: BreakerRow): Promise<void>
  createEscalation(e: Escalation): Promise<number> // returns escalation id
  audit(row: AuditRow): Promise<void>
}
export interface BreakerDeps {
  store: BreakerStore
  now: () => number
}

// ── State machine (per fingerprint) ──────────────────────────────────────────
// Applies one outcome to one fingerprint and returns the resulting row.
export async function applyOutcome(
  deps: BreakerDeps,
  fingerprint: string,
  productId: string,
  success: boolean,
  errorRaw?: string | null,
): Promise<BreakerRow> {
  const now = deps.now()
  const row = (await deps.store.load(fingerprint)) ?? closedRow(fingerprint, productId, now)
  const eff = effectiveState(row, now)

  // SUCCESS anywhere (incl. a half_open probe) → closed, counter reset.
  if (success) {
    const next: BreakerRow = { ...row, state: 'closed', consecutiveFailures: 0, openedAt: null, tripReason: null, updatedAt: now }
    await deps.store.save(next)
    return next
  }

  const raw = errorRaw && errorRaw.length > 0 ? errorRaw : '(no error text captured)'

  // Failure while genuinely OPEN (retries should have been blocked) — stay open,
  // keep the cooldown clock, just refresh the raw error.
  if (eff === 'open') {
    const next: BreakerRow = { ...row, lastError: raw, updatedAt: now }
    await deps.store.save(next)
    return next
  }

  const cf = row.consecutiveFailures + 1

  // Still accumulating under the threshold → stays closed.
  if (eff === 'closed' && cf < TRIP_THRESHOLD) {
    const next: BreakerRow = { ...row, state: 'closed', consecutiveFailures: cf, lastError: raw, updatedAt: now }
    await deps.store.save(next)
    return next
  }

  // TRIP (closed→open at the threshold) or RE-TRIP (half_open probe failed).
  const isReTrip = eff === 'half_open'
  const next: BreakerRow = {
    ...row,
    state: 'open',
    consecutiveFailures: cf, // re-opens push cf past 3 → cooldown doubles
    openedAt: now, // reset the cooldown clock
    lastError: raw, // RAW underlying error, never a generic string
    tripReason: 'consecutive_failures',
    updatedAt: now,
  }
  // Escalate on the FIRST trip only (not on every re-open) to avoid spam.
  if (!isReTrip) {
    next.escalationId = await deps.store.createEscalation({
      productId,
      category: 'breaker_trip',
      payload: {
        fingerprint,
        trip_reason: 'consecutive_failures',
        consecutive_failures: cf,
        last_error: raw,
      },
    })
  }
  await deps.store.save(next)
  return next
}

// Record a task outcome. On failure the SAME error also accumulates on the
// secondary (error-class) fingerprint, so the same rot across different task IDs
// converges on one trip. Returns the primary row (+ secondary row on failure).
export async function recordTaskOutcome(
  deps: BreakerDeps,
  productId: string,
  taskId: string,
  success: boolean,
  error?: unknown,
  errorRaw?: string | null,
): Promise<{ primary: BreakerRow; secondary?: BreakerRow }> {
  const primaryFp = primaryFingerprint(productId, taskId)
  const raw = errorRaw ?? (error != null ? String((error as any)?.stack || (error as any)?.message || error) : null)
  const primary = await applyOutcome(deps, primaryFp, productId, success, raw)
  if (success || error == null) return { primary }
  const secondaryFp = secondaryFingerprint(error)
  const secondary = await applyOutcome(deps, secondaryFp, productId, false, raw)
  return { primary, secondary }
}

// Read-only state (for a future Marcus client to check before touching a task).
export async function getBreakerState(deps: BreakerDeps, fingerprint: string): Promise<{
  fingerprint: string
  state: BreakerState
  persistedState: BreakerState
  consecutiveFailures: number
  canAttempt: boolean
  cooldownMs: number | null
  halfOpenDueAt: number | null
  lastError: string | null
  tripReason: TripReason | null
  escalationId: number | null
}> {
  const now = deps.now()
  const row = await deps.store.load(fingerprint)
  if (!row) {
    return {
      fingerprint, state: 'closed', persistedState: 'closed', consecutiveFailures: 0,
      canAttempt: true, cooldownMs: null, halfOpenDueAt: null, lastError: null, tripReason: null, escalationId: null,
    }
  }
  const eff = effectiveState(row, now)
  const cd = row.state === 'open' ? cooldownMs(row.consecutiveFailures) : null
  return {
    fingerprint,
    state: eff,
    persistedState: row.state,
    consecutiveFailures: row.consecutiveFailures,
    canAttempt: eff !== 'open', // open blocks; half_open permits exactly the probe
    cooldownMs: cd,
    halfOpenDueAt: row.state === 'open' && row.openedAt != null ? row.openedAt + (cd as number) : null,
    lastError: row.lastError,
    tripReason: row.tripReason,
    escalationId: row.escalationId,
  }
}

// Manual close by Janet/founder, bound to a fix — recorded in audit_log.
export async function manualClose(
  deps: BreakerDeps,
  fingerprint: string,
  who: string,
  why: string,
  fixBinding: string,
): Promise<BreakerRow> {
  const now = deps.now()
  const row = (await deps.store.load(fingerprint)) ?? closedRow(fingerprint, COMPANY_ID, now)
  const next: BreakerRow = { ...row, state: 'closed', consecutiveFailures: 0, openedAt: null, tripReason: null, updatedAt: now }
  await deps.store.save(next)
  await deps.store.audit({
    actor: who,
    action: 'breaker_manual_close',
    target: fingerprint,
    detail: { why, fix: fixBinding, previous_state: row.state, previous_trip_reason: row.tripReason },
  })
  return next
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DESTRUCTIVE-DIFF TRIPWIRE — the generalized 33-asset-delete-loop guard.
//  Not an approval gate — an automatic refusal to self-harm.
// ═══════════════════════════════════════════════════════════════════════════════
export interface DiffFile {
  path: string
  deleted?: boolean
  added?: number // lines added
  removed?: number // lines removed
}
export interface DiffAnalysis {
  filesDeletedOutside: number
  netLinesOutside: number // removed - added, outside generated/ & node_modules
  safe: boolean
  reason?: 'deletes_over_10_files' | 'net_removal_over_500_lines'
  offending: string[]
}

const MAX_FILES_DELETED = 10
const MAX_NET_LINES_REMOVED = 500

// generated artifacts and vendored code are exempt (deleting them is not self-harm).
export function isExcludedPath(path: string): boolean {
  return /(^|\/)node_modules\//.test(path) || /(^|\/)generated\//.test(path)
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  for (const line of diff.split('\n')) {
    const gm = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (gm) {
      if (cur) files.push(cur)
      cur = { path: gm[2], deleted: false, added: 0, removed: 0 }
      continue
    }
    if (!cur) continue
    if (/^deleted file mode/.test(line)) cur.deleted = true
    else if (/^\+\+\+ \/dev\/null/.test(line)) cur.deleted = true
    else if (line.startsWith('+') && !line.startsWith('+++')) cur.added! += 1
    else if (line.startsWith('-') && !line.startsWith('---')) cur.removed! += 1
  }
  if (cur) files.push(cur)
  return files
}

// PURE analysis — no I/O, fully testable.
export function analyzeDiff(diff: DiffFile[] | string): DiffAnalysis {
  const files = typeof diff === 'string' ? parseUnifiedDiff(diff) : diff
  let filesDeletedOutside = 0
  let netLinesOutside = 0
  const offending: string[] = []
  for (const f of files) {
    if (isExcludedPath(f.path)) continue
    if (f.deleted) {
      filesDeletedOutside += 1
      offending.push(f.path)
    }
    netLinesOutside += (f.removed ?? 0) - (f.added ?? 0)
  }
  const safe = filesDeletedOutside <= MAX_FILES_DELETED && netLinesOutside <= MAX_NET_LINES_REMOVED
  const reason = safe
    ? undefined
    : filesDeletedOutside > MAX_FILES_DELETED
      ? 'deletes_over_10_files'
      : 'net_removal_over_500_lines'
  return { filesDeletedOutside, netLinesOutside, safe, reason, offending }
}

export interface DiffVerdict {
  verdict: 'allow' | 'reject'
  applied: false // this function NEVER applies — allow means the caller may apply
  analysis: DiffAnalysis
  reason?: string
}

// Guard BEFORE any apply. Unsafe → fingerprint goes STRAIGHT to open, diff
// DISCARDED (reject), trip_reason='destructive_diff', escalation raised.
export async function checkDiffSafety(
  deps: BreakerDeps,
  fingerprint: string,
  productId: string,
  diff: DiffFile[] | string,
): Promise<DiffVerdict> {
  const analysis = analyzeDiff(diff)
  if (analysis.safe) {
    return { verdict: 'allow', applied: false, analysis }
  }
  const now = deps.now()
  const row = (await deps.store.load(fingerprint)) ?? closedRow(fingerprint, productId, now)
  const escalationId = await deps.store.createEscalation({
    productId,
    category: 'breaker_trip',
    payload: {
      fingerprint,
      trip_reason: 'destructive_diff',
      files_deleted: analysis.filesDeletedOutside,
      net_lines: analysis.netLinesOutside,
      offending: analysis.offending,
    },
  })
  const opened: BreakerRow = {
    ...row,
    state: 'open',
    consecutiveFailures: Math.max(row.consecutiveFailures, TRIP_THRESHOLD),
    openedAt: now,
    lastError: `destructive_diff: deletes ${analysis.filesDeletedOutside} files / net ${analysis.netLinesOutside} lines outside generated`,
    tripReason: 'destructive_diff',
    escalationId,
    updatedAt: now,
  }
  await deps.store.save(opened)
  return { verdict: 'reject', applied: false, analysis, reason: analysis.reason }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HARD-STOP ENFORCEMENT — never auto-approvable; protected paths never touched.
// ═══════════════════════════════════════════════════════════════════════════════
// Protected paths (globs): **/auth/**, **/webhooks/**, **/payment*/**, **/billing/**
const PROTECTED_PATH_RES: RegExp[] = [
  /(^|\/)auth\//,
  /(^|\/)webhooks\//,
  /(^|\/)payment[^/]*\//,
  /(^|\/)billing\//,
]

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATH_RES.some((re) => re.test(path))
}

export class HardStopError extends Error {
  readonly kind: 'action' | 'protected_path'
  readonly detail: string
  constructor(kind: 'action' | 'protected_path', detail: string) {
    super(kind === 'action' ? `hard stop action: ${detail}` : `protected path touched: ${detail}`)
    this.name = 'HardStopError'
    this.kind = kind
    this.detail = detail
  }
}
export function isHardStopError(e: unknown): e is HardStopError {
  return e instanceof HardStopError || (e as any)?.name === 'HardStopError'
}

// Throws if the action is a hard stop (HARD_STOPS — single source of truth from
// autonomyGate) OR any diff path is a protected path.
export function assertNotHardStop(action: string, diffPaths?: string[]): void {
  if ((HARD_STOPS as readonly string[]).includes(action)) {
    throw new HardStopError('action', action)
  }
  if (diffPaths) {
    for (const p of diffPaths) {
      if (isProtectedPath(p)) throw new HardStopError('protected_path', p)
    }
  }
}

// ── Real DB-backed store + deps ──────────────────────────────────────────────
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

function mapDbRow(r: any): BreakerRow {
  return {
    fingerprint: r.fingerprint,
    productId: r.product_id,
    consecutiveFailures: Number(r.consecutive_failures),
    state: r.state,
    openedAt: r.opened_at ? new Date(r.opened_at).getTime() : null,
    lastError: r.last_error ?? null,
    tripReason: r.trip_reason ?? null,
    escalationId: r.escalation_id != null ? Number(r.escalation_id) : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  }
}

export function makeSqlBreakerStore(sql: Sql): BreakerStore {
  return {
    async load(fingerprint) {
      const rows = await sql`SELECT * FROM circuit_breaker_state WHERE fingerprint = ${fingerprint} LIMIT 1`
      return rows[0] ? mapDbRow(rows[0]) : null
    },
    async save(row) {
      const openedAt = row.openedAt != null ? new Date(row.openedAt).toISOString() : null
      await sql`
        INSERT INTO circuit_breaker_state
          (fingerprint, product_id, consecutive_failures, state, opened_at, last_error, trip_reason, escalation_id, updated_at)
        VALUES
          (${row.fingerprint}, ${row.productId}, ${row.consecutiveFailures}, ${row.state}, ${openedAt},
           ${row.lastError}, ${row.tripReason}, ${row.escalationId}, NOW())
        ON CONFLICT (fingerprint) DO UPDATE SET
          consecutive_failures = EXCLUDED.consecutive_failures,
          state = EXCLUDED.state,
          opened_at = EXCLUDED.opened_at,
          last_error = EXCLUDED.last_error,
          trip_reason = EXCLUDED.trip_reason,
          escalation_id = COALESCE(EXCLUDED.escalation_id, circuit_breaker_state.escalation_id),
          updated_at = NOW()
      `
    },
    async createEscalation(e) {
      const rows = await sql`
        INSERT INTO escalations (product_id, category, payload)
        VALUES (${e.productId}, ${e.category}, ${JSON.stringify(e.payload)}::jsonb)
        RETURNING id
      `
      return Number(rows[0].id)
    },
    async audit(a) {
      await sql`
        INSERT INTO audit_log (actor, action, target, detail)
        VALUES (${a.actor}, ${a.action}, ${a.target}, ${JSON.stringify(a.detail)}::jsonb)
      `
    },
  }
}

export function makeSqlBreakerDeps(): BreakerDeps {
  return { store: makeSqlBreakerStore(getSql() as unknown as Sql), now: () => Date.now() }
}
