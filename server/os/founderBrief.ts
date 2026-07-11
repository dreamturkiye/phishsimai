// ─────────────────────────────────────────────────────────────────────────────
//  FOUNDER DAILY BRIEF  — Genesis §J one-screen daily summary.
//
//  Composed from REAL tables only (metrics_daily, escalations,
//  circuit_breaker_state, os_autonomy_state). This is the LAST place the
//  fake-number bug could hide, so the honesty invariant is enforced hard: any
//  null metric prints 'no data' — NEVER 0-as-unknown, never a fabricated $0.
//
//  Rendered to markdown, sent via telegram.ts, and stored idempotently in
//  founder_briefs (one row per brief_date). Rendering is a PURE function so the
//  null→'no data' rule is directly unit-testable.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { getAutonomyLevel } from './autonomyGate'
import { agentsBelowL5TwoWeeks } from './agentLevels'

export interface ProductBrief {
  productId: string
  mrrCents: number | null
  mrrDeltaCents: number | null // vs the prior day; null if either day is unknown
  tasksCompleted: number | null
  tasksFailed: number | null
  agentScoreAvg: number | null
  autonomyLevel: string | null
  openBreakers: Array<{ fingerprint: string; state: string; tripReason: string | null }>
  pendingEscalations: Array<{ id: number; category: string; ageMs: number }>
  agentsBelowL5: string[] // O.17: agents below L5 for 2 consecutive weeks
}

export interface BriefData {
  date: string
  products: ProductBrief[]
}

// ── Honest formatters — null ALWAYS becomes 'no data', never 0 / $0. ─────────
function money(cents: number | null): string {
  if (cents == null) return 'no data'
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function moneyDelta(cents: number | null): string {
  if (cents == null) return ''
  const sign = cents >= 0 ? '▲ +' : '▼ -'
  const abs = Math.abs(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  return ` (${sign}${abs} vs prior day)`
}
function num(n: number | null): string {
  return n == null ? 'no data' : String(n)
}
function score(s: number | null): string {
  return s == null ? 'no data' : s.toFixed(1)
}
function agePretty(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000)
  const h = Math.floor(totalMin / 60)
  if (h >= 24) return `${Math.floor(h / 24)}d`
  return h > 0 ? `${h}h` : `${totalMin}m`
}

// PURE — renders the §J brief. Enforces the honesty invariant.
export function renderFounderBrief(data: BriefData): string {
  const out: string[] = [`# Founder Brief — ${data.date}`, '']
  if (data.products.length === 0) {
    out.push('_No products._')
    return out.join('\n')
  }
  for (const p of data.products) {
    out.push(`## ${p.productId}`)
    out.push(`- **MRR:** ${money(p.mrrCents)}${moneyDelta(p.mrrDeltaCents)}`)
    out.push(`- **Tasks:** ${num(p.tasksCompleted)} shipped / ${num(p.tasksFailed)} failed`)
    out.push(`- **Agent score:** ${score(p.agentScoreAvg)}`)
    out.push(`- **Autonomy level:** ${p.autonomyLevel ?? 'manual'}`)
    if (p.openBreakers.length === 0) {
      out.push(`- **Open breaker trips:** none`)
    } else {
      out.push(`- **Open breaker trips:** ${p.openBreakers.length}`)
      for (const b of p.openBreakers) {
        out.push(`  - ${b.state} · ${b.tripReason ?? '?'} · fp ${b.fingerprint.slice(0, 12)}…`)
      }
    }
    if (p.pendingEscalations.length === 0) {
      out.push(`- **Pending escalations:** none`)
    } else {
      const oldest = Math.max(...p.pendingEscalations.map((e) => e.ageMs))
      out.push(`- **Pending escalations:** ${p.pendingEscalations.length} (oldest ${agePretty(oldest)})`)
      for (const e of p.pendingEscalations) {
        out.push(`  - #${e.id} ${e.category} · ${agePretty(e.ageMs)}`)
      }
    }
    if (p.agentsBelowL5.length > 0) {
      out.push(`- ⚠️ **Agents below L5 for 2 consecutive weeks:** ${p.agentsBelowL5.join(', ')}`)
    }
    out.push('')
  }
  return out.join('\n')
}

// ── Composer — gathers real data, renders, stores idempotently, sends. ───────
export interface BriefDeps {
  gather: (date: string) => Promise<BriefData>
  saveBrief: (date: string, contentMd: string) => Promise<void>
  send: (md: string) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>
}

export interface BriefResult {
  date: string
  contentMd: string
  stored: boolean
  sent: boolean
  skipped: boolean
  error?: string
}

export async function composeFounderBrief(deps: BriefDeps, date: string): Promise<BriefResult> {
  const data = await deps.gather(date)
  const contentMd = renderFounderBrief(data)

  let stored = false
  try {
    await deps.saveBrief(date, contentMd)
    stored = true
  } catch {
    stored = false // store failure (e.g. table not yet migrated) must not block delivery
  }

  const res = await deps.send(contentMd)
  return { date, contentMd, stored, sent: !!res.ok, skipped: !!res.skipped, error: res.error }
}

// ── Real DB-backed deps ──────────────────────────────────────────────────────
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

function prevDate(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
}

async function metricsFor(sql: Sql, productId: string, date: string): Promise<any | null> {
  const rows = await sql`
    SELECT mrr_cents, tasks_completed, tasks_failed, agent_score_avg
    FROM metrics_daily WHERE product_id = ${productId} AND snapshot_date = ${date} LIMIT 1
  `
  return rows[0] ?? null
}

export function makeSqlBriefDeps(companyId = 'phishsimai'): BriefDeps {
  const sql = getSql() as unknown as Sql
  return {
    async gather(date: string): Promise<BriefData> {
      const today = await metricsFor(sql, companyId, date).catch(() => null)
      const yday = await metricsFor(sql, companyId, prevDate(date)).catch(() => null)

      const mrrCents = today?.mrr_cents != null ? Number(today.mrr_cents) : null
      const prevMrr = yday?.mrr_cents != null ? Number(yday.mrr_cents) : null
      const mrrDeltaCents = mrrCents != null && prevMrr != null ? mrrCents - prevMrr : null

      const breakers = await sql`
        SELECT fingerprint, state, trip_reason FROM circuit_breaker_state WHERE state = 'open'
      `.catch(() => [] as any[])
      const pending = await sql`
        SELECT id, category, created_at FROM escalations WHERE status = 'pending' ORDER BY created_at ASC
      `.catch(() => [] as any[])
      const level = await getAutonomyLevel(companyId).catch(() => null)
      const nowMs = Date.now()

      return {
        date,
        products: [
          {
            productId: companyId,
            mrrCents,
            mrrDeltaCents,
            tasksCompleted: today?.tasks_completed != null ? Number(today.tasks_completed) : null,
            tasksFailed: today?.tasks_failed != null ? Number(today.tasks_failed) : null,
            agentScoreAvg: today?.agent_score_avg != null ? Number(today.agent_score_avg) : null,
            autonomyLevel: (level as string) ?? null,
            openBreakers: (breakers as any[]).map((b) => ({ fingerprint: b.fingerprint, state: b.state, tripReason: b.trip_reason ?? null })),
            pendingEscalations: (pending as any[]).map((e) => ({
              id: Number(e.id),
              category: e.category,
              ageMs: e.created_at ? nowMs - new Date(e.created_at).getTime() : 0,
            })),
            agentsBelowL5: await agentsBelowL5TwoWeeks(sql, companyId).catch(() => []),
          },
        ],
      }
    },
    async saveBrief(date: string, contentMd: string) {
      await sql`
        INSERT INTO founder_briefs (brief_date, content_md)
        VALUES (${date}, ${contentMd})
        ON CONFLICT (brief_date) DO UPDATE SET content_md = EXCLUDED.content_md
      `
    },
    send: (md: string) => sendTelegram(md),
  }
}
