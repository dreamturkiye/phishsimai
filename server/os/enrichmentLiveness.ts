// PS-ENRICH-LIVENESS-01 (2026-07-25) — "the enricher can't silently stall" alarm.
//
// WHAT A STALL ACTUALLY LOOKS LIKE, and why the obvious check misses it.
//
// The queue's `created_at` is written by the HARVESTERS (mspHubHarvest, mapsDiscovery) when they
// INSERT a domain. `last_attempt_at` is written ONLY by the researcher, on every row it touches.
// Those are different agents. Watching `created_at` therefore proves the HARVESTER is alive and
// says nothing about enrichment — if the researcher died completely, harvested rows would keep
// arriving and every liveness check keyed on `created_at` would stay green indefinitely.
//
// This cost a real misdiagnosis on 2026-07-25: `max(created_at)` among status='enriched' rows read
// 07-23, which was reported as "enrichment stalled for 2 days". It had not stalled. The queue is
// FIFO (ORDER BY created_at ASC), so rows queued on 07-24/07-25 were simply still behind the
// backlog. Measured on `last_attempt_at`, the researcher had processed 155 rows that same day.
//
// So a genuine stall is: THE RESEARCHER TOUCHED NOTHING, WHILE THERE WAS WORK IT COULD HAVE
// TOUCHED. Both halves matter — an idle researcher with an empty selectable queue is correct
// behaviour, not a fault, and must stay silent.
import { getSql } from './conn'
import { sendTelegram } from './telegram'

/** Mirrors the researcher's own selector — a row it cannot select is not work it is neglecting. */
const MAX_RESEARCH_ATTEMPTS = 3

export interface EnrichmentLiveness {
  ok: boolean
  stalled: boolean
  lastAttemptAt: string | null
  hoursSinceAttempt: number | null
  selectableBacklog: number
  processedLast24h: number
  reason: string
}

export async function checkEnrichmentLiveness(
  sql = getSql(),
  maxIdleHours = 6, // researcher runs every 30 min; 6h of total silence is far outside normal
): Promise<EnrichmentLiveness> {
  const rows = (await sql`
    SELECT
      max(last_attempt_at) AS last_attempt,
      count(*) FILTER (
        WHERE status = 'pending' AND attempts < ${MAX_RESEARCH_ATTEMPTS}
      )::int AS selectable,
      count(*) FILTER (
        WHERE last_attempt_at > now() - interval '24 hours'
      )::int AS processed_24h
    FROM lead_research_queue`.catch(() => [])) as Array<{
      last_attempt: string | null; selectable: number; processed_24h: number
    }>

  const r = rows[0]
  const lastAttemptAt = r?.last_attempt ?? null
  const selectableBacklog = Number(r?.selectable ?? 0)
  const processedLast24h = Number(r?.processed_24h ?? 0)
  const hoursSinceAttempt = lastAttemptAt
    ? (Date.now() - new Date(lastAttemptAt).getTime()) / 3_600_000
    : null

  // No work available => idleness is correct. Never alarm on a drained queue.
  if (selectableBacklog === 0) {
    return {
      ok: true, stalled: false, lastAttemptAt, hoursSinceAttempt, selectableBacklog, processedLast24h,
      reason: 'no selectable backlog — idle is correct',
    }
  }

  // Work exists but the researcher has never run at all.
  if (hoursSinceAttempt === null) {
    return {
      ok: false, stalled: true, lastAttemptAt, hoursSinceAttempt, selectableBacklog, processedLast24h,
      reason: `${selectableBacklog} selectable rows but the researcher has NEVER touched this queue`,
    }
  }

  const stalled = hoursSinceAttempt > maxIdleHours
  return {
    ok: !stalled,
    stalled,
    lastAttemptAt,
    hoursSinceAttempt,
    selectableBacklog,
    processedLast24h,
    reason: stalled
      ? `${selectableBacklog} rows selectable but nothing touched in ${hoursSinceAttempt.toFixed(1)}h`
      : `healthy — ${processedLast24h} rows processed in 24h, backlog ${selectableBacklog}`,
  }
}

/** Alarms only on a genuine stall. Silent when healthy or legitimately idle. */
export async function alertOnEnrichmentStall(sql = getSql(), maxIdleHours = 6): Promise<EnrichmentLiveness> {
  const v = await checkEnrichmentLiveness(sql, maxIdleHours)
  if (v.stalled) {
    await sendTelegram(
      `🚨 <b>ENRICHER STALLED</b> — ${v.reason}\n` +
      `Selectable backlog: ${v.selectableBacklog} · processed in last 24h: ${v.processedLast24h}\n` +
      `Last attempt: ${v.lastAttemptAt ?? 'never'}\n` +
      `The harvester keeps filling the queue regardless, so this will NOT show up as a missing-rows alert.`,
    ).catch(() => {})
  }
  return v
}
