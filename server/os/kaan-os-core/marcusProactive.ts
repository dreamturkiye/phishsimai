import type { SqlLike } from './selfLearning'

export type ProactiveScanResult = {
  ok: boolean
  suggestions: string[]
  tasksQueued: string[]
}

/** Marcus L5 proactive maintenance — scans queue health and suggests preventive tasks */
export async function runMarcusProactiveScan(
  sql: SqlLike,
  companyId: string,
  architectTable: 'architect_tasks' | 'os_architect_tasks' = 'architect_tasks',
): Promise<ProactiveScanResult> {
  const suggestions: string[] = []
  const tasksQueued: string[] = []

  let stuck = 0
  let running = 0
  try {
    if (architectTable === 'os_architect_tasks') {
      const rows = await sql`
        SELECT
          (SELECT count(*)::int FROM os_architect_tasks WHERE status IN ('queued','pending') AND created_at < NOW() - INTERVAL '5 minutes') AS stuck,
          (SELECT count(*)::int FROM os_architect_tasks WHERE status = 'running') AS running
      `
      const r = (rows as any[])[0]
      stuck = Number(r?.stuck || 0)
      running = Number(r?.running || 0)
    } else {
      const rows = await sql`
        SELECT
          (SELECT count(*)::int FROM architect_tasks WHERE status IN ('queued','pending') AND created_at < NOW() - INTERVAL '5 minutes') AS stuck,
          (SELECT count(*)::int FROM architect_tasks WHERE status = 'running') AS running
      `
      const r = (rows as any[])[0]
      stuck = Number(r?.stuck || 0)
      running = Number(r?.running || 0)
    }
  } catch { /* table may not exist */ }

  if (stuck > 0) {
    suggestions.push(`Marcus proactive: ${stuck} task(s) stuck >5m — verify Mac daemon and MARCUS_WAKE_URL`)
  }
  if (running > 2) {
    suggestions.push(`Marcus proactive: ${running} concurrent running tasks — check for duplicate architect loops`)
  }

  const memRows = await sql`
    SELECT count(*)::int AS n FROM architect_memory WHERE confidence > 0.85 AND times_applied > 2
  `.catch(() => [{ n: 0 }])
  const highConfPatterns = Number((memRows as any[])[0]?.n || 0)
  if (highConfPatterns > 5) {
    suggestions.push(
      `Marcus proactive: ${highConfPatterns} high-confidence patterns in architect_memory — consider skill_library consolidation run`,
    )
  }

  if (suggestions.length === 0) {
    suggestions.push('Marcus proactive: pipeline healthy — no preventive action required')
  }

  return { ok: stuck === 0, suggestions, tasksQueued }
}

export const MARCUS_PROACTIVE_SYSTEM_ADDENDUM = `
L5 PROACTIVE MARCUS:
- Run dependency and auth-path scans when queue is idle.
- Suggest optimizations before bugs become incidents.
- Queue architect tasks for code quality (never auto-deploy without QA gate).
`.trim()
