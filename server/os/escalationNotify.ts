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
}

export interface NotifyResult {
  total: number
  sent: number
  skipped: number
  failed: number
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
export function formatEscalation(row: EscalationRow, nowMs: number): string {
  const age = ageStr(row.createdAtMs, nowMs)
  const p = row.payload || {}
  const emoji = row.category === 'breaker_trip' ? '🔴' : '⛔'
  const lines = [
    `${emoji} <b>ESCALATION — ${escapeHtml(row.category)}</b>`,
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

// Deliver every un-notified escalation exactly once. Only marks notified on a
// successful send, so env-unset (skipped) or a transient failure retries later.
export async function deliverPendingEscalations(deps: NotifyDeps): Promise<NotifyResult> {
  const rows = await deps.loadPending()
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const row of rows) {
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
  return { total: rows.length, sent, skipped, failed }
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
  }
}
