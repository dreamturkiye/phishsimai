// ─────────────────────────────────────────────────────────────────────────────
//  ESCALATION → TELEGRAM DELIVERY
//
//  The observability layer: when the system is eventually turned on, every
//  breaker trip / hard-stop lands on the founder's phone in real time. Reads
//  un-notified escalation rows, sends one concise Telegram per row (RAW error
//  for breaker_trip), and stamps notified_at so it NEVER double-sends.
//
//  Uses the existing telegram.ts (sendTelegram) — which returns {skipped:true}
//  and never throws when TELEGRAM_* env is unset, so this is fail-safe by
//  construction. Delivery is idempotent: a row is only marked notified when the
//  send actually succeeds, so an env-unset / failed send is retried next run.
//
//  The store is injected so delivery is unit-testable without a DB/Telegram.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { COMPANY_ID } from './version'
import { shouldPageFounderForEscalation, type AutonomyNagContext } from './escalationTriagePolicy'
import { resolveReadableLevel } from './autonomyGate'

// PS-ESCALATION-COVERAGE-01: the founder early-warning writer. escalation-notify (*/15) delivers
// every un-notified `escalations` row to Telegram, but the ONLY feed used to be circuit-breaker
// trips — so the events that most needed escalating (a hand-written autonomy level, a Marcus
// dispatch, repeated agent failures) were silent or scattered. This routes high-signal events to
// the same founder-alert path. Best-effort: a failed escalation write must NEVER break the caller.
export async function raiseEscalation(
  category: 'autonomy_change' | 'marcus_dispatch' | 'agent_critical' | 'breaker_trip' | string,
  payload: Record<string, any>,
  productId: string = COMPANY_ID,
): Promise<void> {
  try {
    const sql = getSql()
    if (category === 'autonomy_change') {
      let liveLevel: string | null = null
      let storedLevel: string | null = null
      let posture: string | null = null
      try {
        const levelRows = (await sql`SELECT level FROM os_autonomy_state WHERE company_id=${productId} LIMIT 1`) as any[]
        storedLevel = levelRows[0]?.level != null ? String(levelRows[0].level) : null
        liveLevel = String(resolveReadableLevel(productId, storedLevel) ?? '')
        const postureRows = (await sql`SELECT posture FROM os_posture_state WHERE product_id=${productId} LIMIT 1`) as any[]
        posture = postureRows[0]?.posture != null ? String(postureRows[0].posture) : null
      } catch { /* payload-only still catches the INSERT artifact */ }
      const ctx: AutonomyNagContext = {
        category,
        payload,
        companyId: productId,
        liveLevel,
        storedLevel,
        posture,
      }
      if (!shouldPageFounderForEscalation(ctx)) {
        console.log(`[escalation] skip autonomy_change — already_at_l5_floor`)
        return
      }
    }
    await sql`INSERT INTO escalations (product_id, category, payload)
      VALUES (${productId}, ${category}, ${JSON.stringify(payload)}::jsonb)`
  } catch (e: any) {
    console.warn(`[escalation] raiseEscalation(${category}) failed: ${e?.message?.slice(0, 120)}`)
  }
}

export interface EscalationRow {
  id: number
  productId: string
  category: string
  payload: Record<string, any>
  status: string
  createdAtMs: number
}

export interface NotifyDeps {
  loadPending: () => Promise<EscalationRow[]>
  markNotified: (id: number) => Promise<void>
  send: (text: string) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>
  now: () => number
  liveContext?: () => Promise<{ liveLevel?: string | null; storedLevel?: string | null; posture?: string | null; companyId?: string }>
}

export interface NotifyResult {
  total: number
  sent: number
  skipped: number
  failed: number
  suppressed: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function ageStr(createdMs: number, nowMs: number): string {
  const ms = Math.max(0, nowMs - createdMs)
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h ago`
  }
  return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`
}

// PURE — one concise HTML message per escalation. breaker_trip carries the RAW
// underlying error; hard-stop categories summarize the payload.
const FAULT_CATEGORIES = new Set(['breaker_trip', 'agent_critical', 'protected_path'])

export function formatEscalation(row: EscalationRow, nowMs: number): string {
  const age = ageStr(row.createdAtMs, nowMs)
  const p = row.payload || {}
  const isFault = FAULT_CATEGORIES.has(row.category)
  const emoji = row.category === 'breaker_trip' ? '🔴' : isFault ? '⛔' : '📋'
  const headline = isFault ? 'ESCALATION' : 'UPDATE'
  const lines = [
    `${emoji} <b>${headline} — ${escapeHtml(row.category)}</b>`,
    `Product: ${escapeHtml(row.productId)} | Age: ${age} | Status: ${escapeHtml(row.status)}`,
  ]
  if (row.category === 'breaker_trip') {
    lines.push(`Trip: ${escapeHtml(String(p.trip_reason ?? '?'))} | fp: ${escapeHtml(String(p.fingerprint ?? '').slice(0, 12))}…`)
    if (p.files_deleted != null) {
      lines.push(`Destructive diff refused: ${p.files_deleted} files / net ${p.net_lines} lines`)
    }
    if (p.last_error != null) {
      // RAW underlying error — never a generic string.
      lines.push(`Raw error:\n<pre>${escapeHtml(String(p.last_error).slice(0, 1200))}</pre>`)
    }
  } else {
    lines.push(`Detail: ${escapeHtml(JSON.stringify(p).slice(0, 900))}`)
  }
  return lines.join('\n')
}

// Deliver every un-notified pending escalation that should page the founder.
// Already-resolved and already-at-L5 autonomy_change are stamped notified without a send
// so */15 cannot grow louder. Env-unset / send failure still retries real pages.
export async function deliverPendingEscalations(deps: NotifyDeps): Promise<NotifyResult> {
  const rows = await deps.loadPending()
  let sent = 0
  let skipped = 0
  let failed = 0
  let suppressed = 0
  const emptyLive: { liveLevel?: string | null; storedLevel?: string | null; posture?: string | null; companyId?: string } = {}
  const live = deps.liveContext ? await deps.liveContext().catch(() => emptyLive) : emptyLive
  for (const row of rows) {
    const page = shouldPageFounderForEscalation({
      category: row.category,
      payload: row.payload,
      status: row.status,
      companyId: live.companyId || row.productId,
      liveLevel: live.liveLevel,
      storedLevel: live.storedLevel,
      posture: live.posture,
    })
    if (!page) {
      // Already resolved, or already-at-L5 autonomy noise: stamp notified so */15 cannot grow louder.
      await deps.markNotified(row.id)
      suppressed += 1
      continue
    }
    const text = formatEscalation(row, deps.now())
    const res = await deps.send(text)
    if (res.ok) {
      await deps.markNotified(row.id)
      sent += 1
    } else if (res.skipped) {
      skipped += 1 // Telegram env unset — leave notified_at null, retry next run
    } else {
      failed += 1 // send error — leave for retry
    }
  }
  return { total: rows.length, sent, skipped, failed, suppressed }
}

// ── Real DB-backed deps ──────────────────────────────────────────────────────
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

export function makeSqlNotifyDeps(): NotifyDeps {
  const sql = getSql() as unknown as Sql
  return {
    async loadPending() {
      const rows = await sql`
        SELECT id, product_id, category, payload, status, created_at
        FROM escalations
        WHERE notified_at IS NULL
        ORDER BY created_at ASC
        LIMIT 50
      `
      return rows.map((r: any) => ({
        id: Number(r.id),
        productId: r.product_id,
        category: r.category,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
        status: r.status,
        createdAtMs: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      }))
    },
    async markNotified(id: number) {
      await sql`UPDATE escalations SET notified_at = NOW() WHERE id = ${id}`
    },
    send: (text: string) => sendTelegram(text),
    now: () => Date.now(),
    async liveContext() {
      const levelRows = (await sql`SELECT level FROM os_autonomy_state WHERE company_id=${COMPANY_ID} LIMIT 1`.catch(() => [])) as any[]
      const stored = levelRows[0]?.level != null ? String(levelRows[0].level) : null
      const postureRows = (await sql`SELECT posture FROM os_posture_state WHERE product_id=${COMPANY_ID} LIMIT 1`.catch(() => [])) as any[]
      return {
        companyId: COMPANY_ID,
        storedLevel: stored,
        liveLevel: String(resolveReadableLevel(COMPANY_ID, stored) ?? ''),
        posture: postureRows[0]?.posture != null ? String(postureRows[0].posture) : null,
      }
    },
  }
}
