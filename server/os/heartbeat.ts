import { getSql } from './conn'
import { reportAgentRun } from './agentHealth'
import { sequenceEngineCheck } from './sequenceBacklog'

/**
 * Heartbeat is the hourly liveness cron. Production verify (2026-09-14) timed out
 * waiting for 10 sequential LLM ticks + a full conversion shift. Task-runner already
 * converts every 10 minutes and ticks 5 agents, so this cron stays small and returns.
 *
 * Conversion stays (cap 3) so an hourly pass still happens if task-runner missed;
 * ticks are capped + time-budgeted. Cursor only advances for agents actually ticked.
 * Sequence drain runs first (T2 ≤2 + T3/T4 + stale) so unsent>5d trends down.
 * T2 is capped at 2 because SEND_SPACING_MS=10s; the dedicated sequence-touch2 cron owns the 10/run batch.
 */
export const HEARTBEAT_TICK_AGENTS = 3
export const HEARTBEAT_TICK_BUDGET_MS = 25_000
export const HEARTBEAT_CONVERSION_CAP = 3
export const HEARTBEAT_CONVERSION_BUDGET_MS = 12_000
export const HEARTBEAT_DRAIN_FOLLOWUP_CAP = 8
/** Small T2 slice on heartbeat (10s spacing) so T1-no-T2 actually drains hourly. sequence-touch2 still owns the 10/run cadence. */
export const HEARTBEAT_TOUCH2_MAX = 2

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

  const { runSequenceDrainTick } = await import('./sequences')
  const drain = await runSequenceDrainTick({
    includeTouch2: true,
    touch2MaxSends: HEARTBEAT_TOUCH2_MAX,
    followUpCap: HEARTBEAT_DRAIN_FOLLOWUP_CAP,
  }).catch((e: any) => ({
    sent: 0, t2: 0, t3: 0, t4: 0, staleMarked: 0, skipped: 0, blocked: 0,
    tripped: false, pauseNewTouch1: false,
    backlog: {
      rawUnsentTouch2Over5d: 0, drainableOverdue: 0, waitingTouch2: 0,
      waitingTouch3SkipT2: 0, waitingTouch3AfterT2: 0, waitingTouch4: 0,
      staleSilent: 0, geoOrSuppressed: 0,
    },
    reason: String(e?.message || e).slice(0, 160),
  }))

  const seq = sequenceEngineCheck({
    drainableOverdue: drain.backlog.drainableOverdue,
    rawUnsentTouch2Over5d: drain.backlog.rawUnsentTouch2Over5d,
    drainSent: drain.sent,
    staleMarked: drain.staleMarked,
    tripped: drain.tripped,
  })
  checks.push({ name: 'sequence_engine', ok: seq.ok, detail: seq.detail })
  if (!seq.ok) healthy = false

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
        executed: false,
        queued: false,
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

  await reportAgentRun('heartbeat', healthy, { checks, drain: seq.detail }, healthy ? undefined : 'heartbeat unhealthy', 'phishsimai')
  return {
    company: 'phishsimai',
    timestamp: new Date().toISOString(),
    checks,
    healthy,
    drain,
    conversion,
    runtime,
    issues: checks.filter(c => !c.ok).map(c => c.name),
  }
}
