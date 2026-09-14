import { getSql } from './conn'
import { reportAgentRun } from './agentHealth'

/**
 * Heartbeat is the hourly liveness cron. Production verify (2026-09-14) timed out
 * waiting for 10 sequential LLM ticks + a full conversion shift. Task-runner already
 * converts every 10 minutes and ticks 5 agents, so this cron stays small and returns.
 *
 * Conversion stays (cap 3) so an hourly pass still happens if task-runner missed;
 * ticks are capped + time-budgeted. Cursor only advances for agents actually ticked.
 */
export const HEARTBEAT_TICK_AGENTS = 3
export const HEARTBEAT_TICK_BUDGET_MS = 25_000
export const HEARTBEAT_CONVERSION_CAP = 3
export const HEARTBEAT_CONVERSION_BUDGET_MS = 12_000

async function withBudget<T>(ms: number, fn: () => Promise<T>, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const value = await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          resolve(fallback)
        }, ms)
      }),
    ])
    return { value, timedOut }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runHeartbeat() {
  const sql = getSql()
  const checks: { name: string; ok: boolean; detail: string }[] = []
  let healthy = true

  try {
    const rows = await sql`SELECT count(*) as n FROM ps_outreach_leads`
    checks.push({ name: 'db_connection', ok: true, detail: rows[0].n + ' leads' })
  } catch (e: any) {
    checks.push({ name: 'db_connection', ok: false, detail: e.message })
    healthy = false
  }

  try {
    const rows = await sql`SELECT count(*) as n FROM ps_outreach_leads
      WHERE touch1_sent_at IS NOT NULL
      AND touch2_sent_at IS NULL
      AND touch1_sent_at < NOW() - INTERVAL '5 days'
      AND replied = false AND bounced = false AND unsubscribed = false
      AND pipeline_stage NOT IN ('dead','customer')`
    const stalled = Number(rows[0].n)
    checks.push({ name: 'sequence_engine', ok: stalled < 10, detail: stalled + ' leads unsent >5d' })
    if (stalled >= 10) healthy = false
  } catch (e: any) {
    checks.push({ name: 'sequence_engine', ok: false, detail: e.message })
  }

  // Parallel: sequential conversion-then-10-ticks is what timed out live verify.
  // Promise.race does NOT abort an in-flight LLM; ticks-not-started is the timeout win.
  const { runCgoConversionShift } = await import('./conversionEngine')
  const { tickAllAgentRuntimes } = await import('./agentRuntimeTick')
  const [conversionRace, runtime] = await Promise.all([
    withBudget(
      HEARTBEAT_CONVERSION_BUDGET_MS,
      () => runCgoConversionShift({ cap: HEARTBEAT_CONVERSION_CAP }),
      {
        sent: 0,
        blocked: 0,
        skipped: 0,
        tripped: false,
        results: [],
        success: false,
        reason: 'heartbeat conversion budget exceeded',
        lesson: 'heartbeat conversion budget exceeded — task-runner still converts every 10 minutes',
      },
    ),
    tickAllAgentRuntimes({
      maxAgents: HEARTBEAT_TICK_AGENTS,
      budgetMs: HEARTBEAT_TICK_BUDGET_MS,
      companyId: 'phishsimai',
    }).catch((e: any) => ({
      ticked: [] as string[],
      results: [],
      budgetHit: false,
      error: String(e?.message || e).slice(0, 160),
    })),
  ])
  const conversion = {
    ...conversionRace.value,
    timedOut: conversionRace.timedOut,
  }

  await reportAgentRun('heartbeat', healthy, { checks }, healthy ? undefined : 'heartbeat unhealthy', 'phishsimai')
  return {
    company: 'phishsimai',
    timestamp: new Date().toISOString(),
    checks,
    healthy,
    conversion,
    runtime,
    issues: checks.filter(c => !c.ok).map(c => c.name),
  }
}
