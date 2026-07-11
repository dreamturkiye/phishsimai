// ─────────────────────────────────────────────────────────────────────────────
//  SENTRY → bug_reports BRIDGE
//
//  Turns a captured production error into a row on the EXISTING self-heal path:
//
//     Sentry capture → bug_reports → runArchitectAgent (diagnose)
//                                  → queueJanetArchitectTask
//                                       └─ AUTONOMY GATE → at 'manual': DENIED,
//                                          bug parked at awaiting_approval,
//                                          diagnosis + proposed fix → Telegram.
//
//  This module adds NO new execution path. It only creates a bug_reports row and
//  hands it to machinery that already exists and is already gated. There is no
//  route from here to a deploy that does not pass through the autonomy gate.
//
//  DEDUP is the whole point: one recurring production bug must not spawn a hundred
//  architect tasks. Dedup is by FINGERPRINT (the normalised error signature that
//  marcus.ts already computes and architect_memory already keys on), and it is done
//  ATOMICALLY in Postgres — a partial unique index on the fingerprint of every
//  non-resolved bug, plus INSERT ... ON CONFLICT DO UPDATE. A check-then-insert
//  would race under a burst of identical errors and create exactly the duplicate
//  storm we are trying to prevent.
//
//  A resolved bug is excluded from the uniqueness predicate on purpose: if a bug we
//  already fixed comes BACK, that is a regression and deserves a fresh row.
//
//  The architect agent is invoked ONLY for a genuinely NEW bug. A repeat occurrence
//  bumps occurrence_count and stops — it does not re-diagnose, re-queue, or re-notify.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { makeErrorSignature } from './marcus'
import { scrubText, scrubUrl } from '../../shared/piiScrub'

// A tagged-template `sql` — injected in tests, real Neon client in production.
export type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>

export interface CapturedError {
  message: string
  stack?: string | null
  route?: string | null // e.g. "/api/os/hq" — the request path, query already stripped
  severity?: 'critical' | 'high' | 'medium' | 'low'
  source?: string // what captured it, e.g. 'sentry:server'
}

export interface BridgeResult {
  bugId: string | null
  fingerprint: string
  duplicate: boolean
  occurrenceCount: number
  diagnosed: boolean
}

// The fingerprint: reuse the EXISTING normaliser (strips URLs and digits, lowercases)
// so it collapses "failed at id 12" and "failed at id 84" onto one bug — and so it
// matches the key architect_memory already uses for known-fix lookup.
export function fingerprintFor(message: string, route?: string | null): string {
  const component = route ? `server:${scrubUrl(route)}` : 'server:unknown'
  return makeErrorSignature(scrubText(message), component)
}

// Additive, idempotent DDL. Matches this codebase's existing convention for the
// bug_reports table (raw SQL, ADD COLUMN IF NOT EXISTS — it is not a drizzle table;
// see conn.ts ensureHqTables and selfHeal.ensureArchitectColumns).
//
// Memoised per process: the DDL is idempotent, but running two ALTER/CREATE INDEX
// statements on every captured error would be pure waste on a hot error path.
let ensured: Promise<void> | null = null

export async function ensureFingerprintColumn(sql: Sql): Promise<void> {
  await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fingerprint TEXT`.catch(() => {})
  // Partial unique index → atomic dedup for every bug that is not yet resolved.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS bug_reports_open_fingerprint_uidx
    ON bug_reports (fingerprint)
    WHERE fingerprint IS NOT NULL AND status <> 'resolved'
  `.catch(() => {})
}

function ensureOnce(sql: Sql): Promise<void> {
  if (!ensured) {
    ensured = ensureFingerprintColumn(sql).catch(() => {
      ensured = null // a failed ensure must be retryable, not cached forever
    })
  }
  return ensured
}

// Reset the memo — tests only.
export function _resetEnsuredForTest(): void {
  ensured = null
}

const MAX_STACK = 4000

// Degraded dedup path — used only when the atomic ON CONFLICT upsert is unavailable
// (see the call site). Non-atomic by nature: two concurrent identical errors can both
// miss the SELECT and both insert. That is the accepted cost of not losing the bug.
async function fallbackUpsert(
  sql: Sql,
  b: { message: string; stack: string; route: string; severity: string; source: string; fingerprint: string },
): Promise<any> {
  const existing = await sql`
    SELECT id, occurrence_count FROM bug_reports
    WHERE fingerprint=${b.fingerprint} AND status <> 'resolved'
    ORDER BY last_seen DESC LIMIT 1
  `
  const hit = (existing as any[])[0]
  if (hit?.id) {
    await sql`
      UPDATE bug_reports
      SET occurrence_count = occurrence_count + 1, last_seen = NOW()
      WHERE id=${hit.id}
    `
    return { id: hit.id, occurrence_count: Number(hit.occurrence_count ?? 1) + 1, inserted: false }
  }
  const rows = await sql`
    INSERT INTO bug_reports
      (error_message, stack_trace, component_name, user_action, url_path,
       user_email, browser, severity, status, fingerprint, occurrence_count)
    VALUES
      (${b.message}, ${b.stack || null}, ${b.source}, 'production_error', ${b.route},
       NULL, NULL, ${b.severity}, 'open', ${b.fingerprint}, 1)
    RETURNING id, occurrence_count
  `
  const r = (rows as any[])[0]
  return r?.id ? { id: r.id, occurrence_count: 1, inserted: true } : null
}

// Bridge a captured server error into bug_reports. Returns the row's identity and
// whether it was a duplicate. NEVER throws — a failure to record an error must not
// itself become a second error on the request path.
export async function captureErrorToBugReport(
  input: CapturedError,
  sqlOverride?: Sql,
  runArchitect?: (bugId: string) => Promise<unknown>,
): Promise<BridgeResult> {
  const message = scrubText(input.message).slice(0, 1000) || 'unknown error'
  const stack = scrubText(input.stack ?? '').slice(0, MAX_STACK)
  const route = scrubUrl(input.route ?? '') || 'unknown'
  const fingerprint = fingerprintFor(message, route)
  const severity = input.severity ?? 'high'
  const source = input.source ?? 'sentry:server'

  const fail: BridgeResult = { bugId: null, fingerprint, duplicate: false, occurrenceCount: 0, diagnosed: false }

  try {
    const sql = sqlOverride ?? (getSql() as unknown as Sql)
    await ensureOnce(sql)

    // ATOMIC upsert-or-increment. `xmax = 0` is true only for a freshly INSERTed
    // row, so `inserted` distinguishes a new bug from a repeat occurrence without a
    // second round trip.
    //
    // This depends on the partial unique index existing. If it somehow does not,
    // Postgres raises "no unique or exclusion constraint matching the ON CONFLICT
    // specification" — which, unguarded, would mean we SILENTLY STOP RECORDING BUGS.
    // Degrade to a non-atomic check-then-insert instead: it can race under a burst
    // and produce a duplicate row, which is a far better failure than losing the bug.
    let row: any
    try {
      const rows = await sql`
        INSERT INTO bug_reports
          (error_message, stack_trace, component_name, user_action, url_path,
           user_email, browser, severity, status, fingerprint, occurrence_count)
        VALUES
          (${message}, ${stack || null}, ${source}, 'production_error', ${route},
           NULL, NULL, ${severity}, 'open', ${fingerprint}, 1)
        ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL AND status <> 'resolved'
        DO UPDATE SET
          occurrence_count = bug_reports.occurrence_count + 1,
          last_seen = NOW()
        RETURNING id, occurrence_count, (xmax = 0) AS inserted
      `
      row = (rows as any[])[0]
    } catch (e: any) {
      console.warn(`[sentry-bridge] upsert failed (${e?.message}) — falling back to check-then-insert`)
      row = await fallbackUpsert(sql, { message, stack, route, severity, source, fingerprint })
    }

    if (!row?.id) return fail

    const bugId = String(row.id)
    const inserted = row.inserted === true
    const occurrenceCount = Number(row.occurrence_count ?? 1)

    // Repeat occurrence → count bumped, nothing else. No re-diagnosis, no new task.
    if (!inserted) {
      return { bugId, fingerprint, duplicate: true, occurrenceCount, diagnosed: false }
    }

    // NEW bug → hand to the existing architect agent. It diagnoses, then calls
    // queueJanetArchitectTask, which is gated: at 'manual' it denies, parks the bug
    // at awaiting_approval, and escalates to Telegram. Nothing deploys from here.
    let diagnosed = false
    try {
      const run = runArchitect ?? (async (id: string) => {
        const { runArchitectAgent } = await import('./architectAgent')
        return runArchitectAgent(id)
      })
      await run(bugId)
      diagnosed = true
    } catch (e: any) {
      console.warn(`[sentry-bridge] architect agent failed for bug ${bugId}: ${e?.message}`)
    }

    return { bugId, fingerprint, duplicate: false, occurrenceCount, diagnosed }
  } catch (e: any) {
    console.warn(`[sentry-bridge] failed to record bug: ${e?.message}`)
    return fail
  }
}
