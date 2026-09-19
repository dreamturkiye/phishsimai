/**
 * PS-WATCHDOG-STALL-HEAL-01
 *
 * Watchdog used to Telegram the founder whenever >20 leads were "genuinely stalled"
 * and point them at /api/os/sequence and /api/os/researcher. That is a page for a
 * reclaimable drain. This module auto-reclaims / auto-invokes those same paths
 * (existing Dex caps — no blast, no touch 93) and pages only after the 2nd+
 * consecutive heal failure.
 */
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { reportAgentRun } from './agentHealth'
import { runLeadResearcher } from './agents/leadResearcher'
import { runFullSequence } from './sequences'

export const STALL_THRESHOLD = 20
/** Page founder only on the 2nd+ consecutive failed heal tick. */
export const STALL_HEAL_PAGE_AFTER = 2
export const STALL_HEAL_AGENT = 'watchdog_stall_heal'
/**
 * Watchdog and /api/os/sequence both fire at :00. Invoking sequence when Aria
 * succeeded inside this window would stack two hourly slices — a blast shape.
 * 90m means we only invoke after a missed hourly cron (or a failed last run).
 */
export const SEQUENCE_STALE_MS = 90 * 60 * 1000
export const RESEARCHER_HEAL_BATCH = 4

export type StallCensus = {
  sendStuck: number
  researchStuck: number
}

export type StallHealPlan = {
  invokeSequence: boolean
  invokeResearcher: boolean
  reclaimResearch: boolean
  sequenceQueuedOnDrip: boolean
}

export type AgentTiming = {
  ageMs: number | null
  lastFailed: boolean
}

export type StallHealResult = {
  ok: boolean
  paged: boolean
  consecutiveFailures: number
  actions: string[]
  plan: StallHealPlan
}

export type StallHealDeps = {
  runSequence: () => Promise<{ sent?: number; paused?: boolean; reason?: string }>
  runResearcher: (batchSize: number) => Promise<{ added?: number; enriched?: number; discovered?: number }>
  reclaimResearch: () => Promise<{ researchingReclaimed: number; pendingRetired: number }>
  recordHeal: (ok: boolean, metrics: Record<string, unknown>, error?: string) => Promise<number>
  sendTelegram: (msg: string) => Promise<unknown>
}

export function stalledN(c: StallCensus): number {
  return Number(c.sendStuck || 0) + Number(c.researchStuck || 0)
}

export function stallNeedsHeal(c: StallCensus): boolean {
  return stalledN(c) > STALL_THRESHOLD
}

export function shouldPageStallHeal(consecutiveFailures: number): boolean {
  return consecutiveFailures >= STALL_HEAL_PAGE_AFTER
}

export function agentTimingFromRow(
  row:
    | {
        last_success_at?: string | null
        last_run_at?: string | null
        consecutive_failures?: number | null
      }
    | null
    | undefined,
  nowMs = Date.now(),
): AgentTiming {
  if (!row) return { ageMs: null, lastFailed: true }
  const lastSuccess = row.last_success_at ? new Date(row.last_success_at).getTime() : NaN
  const lastRun = row.last_run_at ? new Date(row.last_run_at).getTime() : NaN
  const ageMs = Number.isFinite(lastSuccess)
    ? nowMs - lastSuccess
    : Number.isFinite(lastRun)
      ? nowMs - lastRun
      : null
  const lastFailed =
    (row.consecutive_failures ?? 0) > 0 &&
    Number.isFinite(lastRun) &&
    (!Number.isFinite(lastSuccess) || lastRun > lastSuccess)
  return { ageMs, lastFailed }
}

export function decideStallHealActions(
  census: StallCensus,
  sequence: AgentTiming,
  _researcher: AgentTiming,
): StallHealPlan {
  if (!stallNeedsHeal(census)) {
    return {
      invokeSequence: false,
      invokeResearcher: false,
      reclaimResearch: false,
      sequenceQueuedOnDrip: false,
    }
  }
  const seqStale = sequence.ageMs == null || sequence.ageMs > SEQUENCE_STALE_MS || sequence.lastFailed
  const needSeq = census.sendStuck > 0
  const needResearch = census.researchStuck > 0
  return {
    invokeSequence: needSeq && seqStale,
    sequenceQueuedOnDrip: needSeq && !seqStale,
    reclaimResearch: needResearch,
    invokeResearcher: needResearch,
  }
}

export async function reclaimHungResearch(sql: any): Promise<{
  researchingReclaimed: number
  pendingRetired: number
}> {
  const hung = await sql`
    UPDATE lead_research_queue
    SET status='pending', updated_at=NOW()
    WHERE created_at < NOW() - INTERVAL '2 days'
      AND status = 'researching'
      AND last_attempt_at < NOW() - INTERVAL '2 days'
    RETURNING id
  `.catch(() => [])
  // Terminalize the belt-and-suspenders pending≥3 rows the researcher will never
  // select again (attempts < 3). Same retirement the researcher applies on miss.
  const retired = await sql`
    UPDATE lead_research_queue
    SET status='unenrichable', updated_at=NOW()
    WHERE created_at < NOW() - INTERVAL '2 days'
      AND status = 'pending'
      AND attempts >= 3
    RETURNING id
  `.catch(() => [])
  return {
    researchingReclaimed: Array.isArray(hung) ? hung.length : 0,
    pendingRetired: Array.isArray(retired) ? retired.length : 0,
  }
}

export async function readAgentTiming(sql: any, agentName: string, nowMs = Date.now()): Promise<AgentTiming> {
  const rows = await sql`
    SELECT last_success_at, last_run_at, consecutive_failures
    FROM agent_health
    WHERE company_id='phishsimai' AND agent_name=${agentName}
    LIMIT 1
  `.catch(() => [])
  return agentTimingFromRow((rows as any[])[0], nowMs)
}

export async function recordStallHealOutcome(
  ok: boolean,
  metrics: Record<string, unknown>,
  error?: string,
): Promise<number> {
  await reportAgentRun(STALL_HEAL_AGENT, ok, metrics, error).catch(() => {})
  try {
    const sql = getSql()
    const rows = await sql`
      SELECT consecutive_failures FROM agent_health
      WHERE company_id='phishsimai' AND agent_name=${STALL_HEAL_AGENT}
      LIMIT 1
    `
    return Number((rows as any[])[0]?.consecutive_failures ?? (ok ? 0 : 1))
  } catch {
    // Persistence miss must not invent a founder page.
    return ok ? 0 : 1
  }
}

export function stallHealPageMessage(
  census: StallCensus,
  consecutiveFailures: number,
  lastError: string,
): string {
  return (
    `PHISHSIMAI WATCHDOG: stall self-heal failed ${consecutiveFailures} consecutive times — ` +
    `send-stuck ${census.sendStuck}, research-stuck ${census.researchStuck}. ` +
    `Last error: ${lastError.slice(0, 180)}. ` +
    `Sequence/researcher were auto-invoked; founder page is after repeated heal failure only.`
  )
}

export async function healLeadStalls(
  census: StallCensus,
  deps: StallHealDeps,
  sequence: AgentTiming,
  researcher: AgentTiming,
): Promise<StallHealResult> {
  const n = stalledN(census)
  const plan = decideStallHealActions(census, sequence, researcher)
  if (!stallNeedsHeal(census)) {
    return {
      ok: true,
      paged: false,
      consecutiveFailures: 0,
      plan,
      actions: [`Lead stall OK: ${n} genuinely stalled (raw reservoir excluded)`],
    }
  }

  const actions: string[] = []
  const errors: string[] = []

  if (plan.reclaimResearch) {
    try {
      const r = await deps.reclaimResearch()
      actions.push(
        `Research reclaim: hung→pending ${r.researchingReclaimed}, pending≥3→unenrichable ${r.pendingRetired}`,
      )
    } catch (e: any) {
      errors.push('reclaim: ' + String(e?.message || e).slice(0, 120))
    }
  }

  if (plan.invokeSequence) {
    try {
      const r = await deps.runSequence()
      actions.push(
        `Sequence invoked: sent=${r.sent ?? 0} paused=${!!r.paused}` +
          (r.reason ? ` (${String(r.reason).slice(0, 80)})` : ''),
      )
    } catch (e: any) {
      errors.push('sequence: ' + String(e?.message || e).slice(0, 120))
    }
  } else if (plan.sequenceQueuedOnDrip) {
    actions.push(
      `Sequence queued on hourly Dex-capped drip (send-stuck ${census.sendStuck}; last run fresh — no second slice)`,
    )
  }

  if (plan.invokeResearcher) {
    try {
      const r = await deps.runResearcher(RESEARCHER_HEAL_BATCH)
      actions.push(
        `Researcher invoked: added=${r.added ?? 0} enriched=${r.enriched ?? 0} discovered=${r.discovered ?? 0}`,
      )
    } catch (e: any) {
      errors.push('researcher: ' + String(e?.message || e).slice(0, 120))
    }
  }

  const ok = errors.length === 0
  const lastError = errors.join('; ')
  const consecutiveFailures = await deps.recordHeal(
    ok,
    { sendStuck: census.sendStuck, researchStuck: census.researchStuck, invoked: plan },
    lastError || undefined,
  )
  const paged = !ok && shouldPageStallHeal(consecutiveFailures)
  if (paged) {
    await deps.sendTelegram(stallHealPageMessage(census, consecutiveFailures, lastError)).catch(() => {})
    actions.push(`Stall heal PAGE after ${consecutiveFailures} consecutive failures`)
  } else if (ok) {
    actions.push(`Stall heal OK: ${n} (send ${census.sendStuck}, research ${census.researchStuck}) — no founder page`)
  } else {
    actions.push(`Stall heal failed once (${consecutiveFailures}) — no founder page yet`)
  }

  return { ok, paged, consecutiveFailures, actions, plan }
}

export async function healLeadStallsFromWatchdog(census: StallCensus): Promise<StallHealResult> {
  const sql = getSql()
  const [sequence, researcher] = await Promise.all([
    readAgentTiming(sql, 'aria'),
    readAgentTiming(sql, 'researcher'),
  ])
  return healLeadStalls(
    census,
    {
      runSequence: () => runFullSequence(),
      runResearcher: (n) => runLeadResearcher(n),
      reclaimResearch: () => reclaimHungResearch(sql),
      recordHeal: recordStallHealOutcome,
      sendTelegram,
    },
    sequence,
    researcher,
  )
}
