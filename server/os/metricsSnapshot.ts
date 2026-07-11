// ─────────────────────────────────────────────────────────────────────────────
//  metrics_daily snapshot writer — PASSIVE INFRA.
//
//  A daily cron writes ONE row/day into metrics_daily. Nothing reads it to make
//  decisions yet — it just accumulates an honest history.
//
//  HONESTY INVARIANT (Genesis §J — the v6 fake-8.5 bug is why this exists):
//  every value is REAL or NULL. Never 0-as-unknown, never a fabricated number.
//  A genuinely-counted zero IS 0 (e.g. "no active subscriptions" → mrr 0). An
//  uncomputable value IS null (e.g. a source that can't be queried, or a metric
//  with no data mechanism). These are DIFFERENT and are kept different here.
//
//  This module WRITES metrics_daily rows and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'

// Authoritative monthly list price, in cents, per org plan.
// Source: client/src/pages/OrgSettings.tsx PS_PLANS (starter $149, growth $299,
// pro $749, enterprise $1499 / month). 'free' = 0 (excluded from active subs).
// 'unlimited' exists in the org_plan enum but has NO published price → an active
// sub on such a plan makes MRR uncomputable (→ null), never a guessed number.
const PLAN_PRICE_CENTS: Record<string, number> = {
  starter: 14900,
  growth: 29900,
  pro: 74900,
  enterprise: 149900,
}

export interface MetricsRow {
  product_id: string
  snapshot_date: string            // YYYY-MM-DD
  mrr_cents: number | null
  active_subs: number | null
  new_subs: number | null
  churned_subs: number | null
  tasks_completed: number | null
  tasks_failed: number | null
  agent_score_avg: number | null   // ALWAYS null (see below)
  queue_depth: number | null
}

export interface WriteResult {
  written: boolean
  row: MetricsRow
  reason?: string
}

// Any tagged-template SQL executor (neon client, or a fake in tests).
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

// Compute the row. Each field is derived independently and wrapped so a single
// unqueryable source yields null for THAT field (never 0, never a crash).
export async function computeMetricsRow(sql: Sql, companyId: string, snapshotDate: string): Promise<MetricsRow> {
  // ── tasks_completed / tasks_failed — REAL counts from agent_tasks ──────────
  // completed: tasks completed that day (status completed/reviewed, by completed_at).
  // failed: tasks in 'failed' status created that day. The pipeline never sets
  // 'failed' today, so this is a genuine 0 — a real count of a real status, not
  // a placeholder. If the table itself can't be queried, BOTH are null.
  let tasksCompleted: number | null = null
  let tasksFailed: number | null = null
  try {
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE status IN ('completed','reviewed') AND completed_at::date = ${snapshotDate}) AS completed,
        count(*) FILTER (WHERE status = 'failed' AND created_at::date = ${snapshotDate}) AS failed
      FROM agent_tasks
      WHERE company_id = ${companyId}
    `
    tasksCompleted = Number(rows[0].completed)
    tasksFailed = Number(rows[0].failed)
  } catch {
    tasksCompleted = null
    tasksFailed = null
  }

  // ── queue_depth — REAL count of in-flight architect tasks ──────────────────
  let queueDepth: number | null = null
  try {
    const rows = await sql`
      SELECT count(*) AS n FROM os_architect_tasks
      WHERE status IN ('queued','pending','approved','running')
    `
    queueDepth = Number(rows[0].n)
  } catch {
    queueDepth = null
  }

  // ── active_subs + mrr_cents — REAL from organizations × plan price ─────────
  // active sub = an org with a stripeSubscriptionId on a non-free plan.
  //   • no active subs        → mrr 0        (a REAL zero — genuinely no revenue)
  //   • all priced            → mrr = Σ price (real)
  //   • an active sub on an unpriced plan (e.g. 'unlimited') → mrr null (can't
  //     honestly total it; the count still stands in active_subs)
  //   • query fails           → both null
  let activeSubs: number | null = null
  let mrrCents: number | null = null
  try {
    const rows = await sql`
      SELECT plan, count(*)::int AS n
      FROM organizations
      WHERE "stripeSubscriptionId" IS NOT NULL AND plan <> 'free'
      GROUP BY plan
    `
    activeSubs = rows.reduce((a: number, r: any) => a + Number(r.n), 0)
    let cents = 0
    let uncomputable = false
    for (const r of rows) {
      const price = PLAN_PRICE_CENTS[r.plan as string]
      if (price === undefined) { uncomputable = true; break }
      cents += price * Number(r.n)
    }
    mrrCents = uncomputable ? null : cents
  } catch {
    activeSubs = null
    mrrCents = null
  }

  // ── new_subs — REAL: non-free plans activated on the snapshot day ──────────
  let newSubs: number | null = null
  try {
    const rows = await sql`
      SELECT count(*)::int AS n FROM organizations
      WHERE plan <> 'free' AND "planActivatedAt"::date = ${snapshotDate}
    `
    newSubs = Number(rows[0].n)
  } catch {
    newSubs = null
  }

  // ── churned_subs — NULL: the schema has no reliable churn timestamp ────────
  // (cancellation reverts plan→free without stamping a date), so churn on a
  // given day is not honestly computable. NULL, not 0.
  const churnedSubs: number | null = null

  // ── agent_score_avg — ALWAYS NULL ──────────────────────────────────────────
  // Stays null until agent_performance has >= 20 graded rows (it currently has
  // 0). Do NOT compute or fabricate this — a made-up average is exactly the
  // v6 fake-8.5 bug this batch exists to prevent.
  const agentScoreAvg: number | null = null

  return {
    product_id: companyId,
    snapshot_date: snapshotDate,
    mrr_cents: mrrCents,
    active_subs: activeSubs,
    new_subs: newSubs,
    churned_subs: churnedSubs,
    tasks_completed: tasksCompleted,
    tasks_failed: tasksFailed,
    agent_score_avg: agentScoreAvg,
    queue_depth: queueDepth,
  }
}

// Write (upsert) one metrics_daily row for the day. Idempotent on
// (product_id, snapshot_date) — re-running the same day overwrites, never
// duplicates. Writes metrics_daily and nothing else.
export async function writeMetricsSnapshot(
  companyId = 'phishsimai',
  snapshotDate: string = yesterdayUtc(),
  sqlOverride?: Sql,
): Promise<WriteResult> {
  const sql = sqlOverride ?? (getSql() as unknown as Sql)
  const row = await computeMetricsRow(sql, companyId, snapshotDate)

  // Honesty guard: tasks_completed/tasks_failed are NOT NULL in the deployed
  // schema. If they're null (agent_tasks genuinely unqueryable), we REFUSE to
  // write a fabricated 0 — skip the row rather than record a fake zero.
  if (row.tasks_completed === null || row.tasks_failed === null) {
    return { written: false, row, reason: 'tasks_uncomputable' }
  }

  await sql`
    INSERT INTO metrics_daily
      (product_id, snapshot_date, mrr_cents, active_subs, new_subs, churned_subs,
       tasks_completed, tasks_failed, agent_score_avg, queue_depth)
    VALUES
      (${row.product_id}, ${snapshotDate}, ${row.mrr_cents}, ${row.active_subs}, ${row.new_subs}, ${row.churned_subs},
       ${row.tasks_completed}, ${row.tasks_failed}, ${row.agent_score_avg}, ${row.queue_depth})
    ON CONFLICT (product_id, snapshot_date) DO UPDATE SET
      mrr_cents = EXCLUDED.mrr_cents,
      active_subs = EXCLUDED.active_subs,
      new_subs = EXCLUDED.new_subs,
      churned_subs = EXCLUDED.churned_subs,
      tasks_completed = EXCLUDED.tasks_completed,
      tasks_failed = EXCLUDED.tasks_failed,
      agent_score_avg = EXCLUDED.agent_score_avg,
      queue_depth = EXCLUDED.queue_depth
  `
  return { written: true, row }
}
