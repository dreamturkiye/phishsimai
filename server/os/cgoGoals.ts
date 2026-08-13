import { getSql } from './conn'

/**
 * PS-CGO-OKR-01: Janet's OKR / Goal engine (audit #3). Complements janetStrategy.ts (long-term
 * strategies) with MEASURABLE objectives: each goal has key results with a target, and the CURRENT
 * value is computed from real data on read — so progress is measured, never asserted, and there is
 * no stale cron to maintain. Janet OWNS these (set_goal tool); promotion of nothing here touches
 * live customer surfaces, so no hard-stop applies.
 */

export interface KeyResult {
  name: string
  target: number
  current: number
  unit?: string
  /** optional: a known auto-metric key (see computeMetric). If set, `current` is refreshed on read. */
  metric?: string
}

export interface CgoGoal {
  id: string
  objective: string
  period: string
  keyResults: KeyResult[]
  status: string
  owner: string
  progress: number
}

const DEFAULT_COMPANY = 'phishsimai'

export async function ensureCgoGoalsTable(sql = getSql()): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS cgo_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL DEFAULT 'phishsimai',
    objective TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT 'this quarter',
    key_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    owner TEXT NOT NULL DEFAULT 'janet',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
}

/**
 * Known auto-metrics. Only these keys are auto-refreshed from real data; any other key_result keeps
 * its manually-set `current` (revenue metrics stay manual until the billing schema is wired here).
 */
async function computeMetric(sql: ReturnType<typeof getSql>, metric: string): Promise<number | null> {
  try {
    if (metric === 'leads_touched_7d') {
      const r = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads WHERE touch1_sent_at > now() - interval '7 days'`) as Array<{ n: number }>
      return r[0]?.n ?? 0
    }
    if (metric === 'opens_7d') {
      const r = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads WHERE first_opened_at > now() - interval '7 days'`) as Array<{ n: number }>
      return r[0]?.n ?? 0
    }
    if (metric === 'open_rate_7d') {
      const r = (await sql`SELECT
        count(*) FILTER (WHERE touch1_sent_at > now() - interval '7 days')::int AS sent,
        count(*) FILTER (WHERE first_opened_at > now() - interval '7 days')::int AS opened
        FROM ps_outreach_leads`) as Array<{ sent: number; opened: number }>
      const s = r[0]?.sent ?? 0, o = r[0]?.opened ?? 0
      return s > 0 ? Math.round((o / s) * 100) : 0
    }
    if (metric === 'customers') {
      const r = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads WHERE pipeline_stage = 'customer'`) as Array<{ n: number }>
      return r[0]?.n ?? 0
    }
    return null // unknown metric -> manual
  } catch {
    return null
  }
}

export async function setGoal(
  opts: { objective: string; keyResults: KeyResult[]; period?: string; companyId?: string },
): Promise<string | null> {
  const sql = getSql()
  await ensureCgoGoalsTable(sql)
  const rows = (await sql`
    INSERT INTO cgo_goals (company_id, objective, period, key_results, status, owner)
    VALUES (
      ${opts.companyId ?? DEFAULT_COMPANY},
      ${opts.objective.slice(0, 400)},
      ${opts.period ?? 'this quarter'},
      ${JSON.stringify(opts.keyResults ?? [])}::jsonb,
      'active', 'janet'
    ) RETURNING id`) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

export async function archiveGoal(id: string, companyId = DEFAULT_COMPANY): Promise<void> {
  const sql = getSql()
  await sql`UPDATE cgo_goals SET status='archived', updated_at=NOW() WHERE id=${id}::uuid AND company_id=${companyId}`.catch(() => {})
}

/** Active goals with each key result's current value refreshed from real data, plus a progress %. */
export async function getGoalsWithProgress(companyId = DEFAULT_COMPANY): Promise<CgoGoal[]> {
  const sql = getSql()
  await ensureCgoGoalsTable(sql)
  const rows = (await sql`
    SELECT id, objective, period, key_results, status, owner
    FROM cgo_goals WHERE company_id=${companyId} AND status='active'
    ORDER BY created_at DESC LIMIT 10`) as Array<any>
  const out: CgoGoal[] = []
  for (const r of rows) {
    const krs: KeyResult[] = Array.isArray(r.key_results) ? r.key_results : []
    for (const kr of krs) {
      if (kr.metric) {
        const v = await computeMetric(sql, kr.metric)
        if (v !== null) kr.current = v
      }
    }
    const progress = krs.length
      ? Math.round(
          (krs.reduce((a, kr) => a + (kr.target > 0 ? Math.min(1, (Number(kr.current) || 0) / kr.target) : 0), 0) / krs.length) * 100,
        )
      : 0
    out.push({ id: r.id, objective: r.objective, period: r.period, keyResults: krs, status: r.status, owner: r.owner, progress })
  }
  return out
}
