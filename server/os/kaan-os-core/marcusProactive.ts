import type { SqlLike } from './selfLearning'

export type ProactiveScanResult = {
  ok: boolean
  suggestions: string[]
  tasksQueued: string[]
}

const OPTIMIZATION_TASKS = [
  'PROACTIVE OPTIMIZE: Audit lib/os/ and lib/kaan-os-core/ for duplicate logic — consolidate shared helpers without behavior change.',
  'PROACTIVE OPTIMIZE: Review API routes for N+1 DB queries and add missing indexes on hot tables (agent_tasks, architect_tasks).',
  'PROACTIVE OPTIMIZE: Run dependency audit — upgrade patch-level security fixes on next dev branch.',
  'PROACTIVE OPTIMIZE: Improve error telemetry coverage — ensure all /api/os routes log structured errors to bug_reports.',
  'PROACTIVE OPTIMIZE: Refactor HQ dashboard data fetching to use live API metrics instead of hardcoded placeholders.',
]

async function countArchitectQueue(
  sql: SqlLike,
  architectTable: 'architect_tasks' | 'os_architect_tasks',
): Promise<{ stuck: number; running: number; queued: number }> {
  try {
    if (architectTable === 'os_architect_tasks') {
      const rows = await sql`
        SELECT
          (SELECT count(*)::int FROM os_architect_tasks WHERE status IN ('queued','pending') AND created_at < NOW() - INTERVAL '5 minutes') AS stuck,
          (SELECT count(*)::int FROM os_architect_tasks WHERE status = 'running') AS running,
          (SELECT count(*)::int FROM os_architect_tasks WHERE status IN ('queued','pending')) AS queued
      `
      const r = (rows as any[])[0]
      return { stuck: Number(r?.stuck || 0), running: Number(r?.running || 0), queued: Number(r?.queued || 0) }
    }
    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM architect_tasks WHERE status IN ('queued','pending') AND created_at < NOW() - INTERVAL '5 minutes') AS stuck,
        (SELECT count(*)::int FROM architect_tasks WHERE status = 'running') AS running,
        (SELECT count(*)::int FROM architect_tasks WHERE status IN ('queued','pending')) AS queued
    `
    const r = (rows as any[])[0]
    return { stuck: Number(r?.stuck || 0), running: Number(r?.running || 0), queued: Number(r?.queued || 0) }
  } catch {
    return { stuck: 0, running: 0, queued: 0 }
  }
}

/** Marcus L5 — proactive maintenance + aggressive code optimization (not just bugs) */
export async function runMarcusProactiveScan(
  sql: SqlLike,
  companyId: string,
  architectTable: 'architect_tasks' | 'os_architect_tasks' = 'architect_tasks',
  queueTask?: (task: string, notes: string) => Promise<string | null>,
): Promise<ProactiveScanResult> {
  const suggestions: string[] = []
  const tasksQueued: string[] = []

  const { stuck, running, queued } = await countArchitectQueue(sql, architectTable)

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
      `Marcus proactive: ${highConfPatterns} high-confidence patterns — run skill_library consolidation`,
    )
  }

  if (queueTask && queued === 0 && running === 0 && stuck === 0) {
    const recentOpt = architectTable === 'os_architect_tasks'
      ? await sql`
          SELECT count(*)::int AS n FROM os_architect_tasks
          WHERE task ILIKE '%PROACTIVE OPTIMIZE%' AND created_at > NOW() - INTERVAL '3 days'
        `.catch(() => [{ n: 0 }])
      : await sql`
          SELECT count(*)::int AS n FROM architect_tasks
          WHERE task ILIKE '%PROACTIVE OPTIMIZE%' AND created_at > NOW() - INTERVAL '3 days'
        `.catch(() => [{ n: 0 }])
    const recentCount = Number((recentOpt as any[])[0]?.n || 0)
    if (recentCount === 0) {
      const task = OPTIMIZATION_TASKS[Math.floor(Math.random() * OPTIMIZATION_TASKS.length)]
      const id = await queueTask(task, `Marcus L5 proactive optimization (${companyId})`)
      if (id) {
        tasksQueued.push(task.slice(0, 80))
        suggestions.push(`Marcus queued optimization: ${task.slice(0, 100)}`)
      }
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('Marcus proactive: pipeline healthy — no preventive action required')
  }

  return { ok: stuck === 0, suggestions, tasksQueued }
}

export const MARCUS_PROACTIVE_SYSTEM_ADDENDUM = `
L5 PROACTIVE MARCUS:
- When queue is idle, proactively queue code quality and optimization tasks (not just bug fixes).
- Run dependency, auth-path, and performance scans before incidents occur.
- Never auto-deploy without QA gate — dev branch only.
`.trim()
