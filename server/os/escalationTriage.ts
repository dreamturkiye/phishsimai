// PS-TRIAGE-01: closes the "agents report, nothing happens" loop (founder-flagged, 2026-08-13).
//
// escalationNotify.ts pings Telegram ONCE per escalation, then the row sits `pending` forever —
// nothing is ever REQUIRED to come back and resolve it. Measured: 3 marcus_dispatch escalations
// sat pending 12-23h with zero action until manually resolved. This is the structural fix: Janet
// TRIAGES every pending escalation daily. For each she either (a) resolves it herself — genuinely
// in her authority, with a stated reason, optionally queuing a real Marcus task — or (b) explicitly
// defers it to the founder, in which case it gets a growing-urgency Telegram alert by day count
// (same doctrine as ScrollFuel's SF-DELIV-16 founder_decision_pending rule) until a human closes
// it. An escalation can no longer just sit silently; it is either resolved or loudly, repeatedly,
// unmissably flagged as YOUR decision to make.
// O.32.8: PhishSim autonomy_change that is already at the L5 floor (raise_refused INSERT
// artifact #202) is auto-deferred as already_at_l5_floor — never founder_required, never louder.
import { getSql } from './conn'
// PS-ESCALATION-STALE-01: reuse the dispatch guard so 'executable?' has ONE definition.
import { dispatchRefusalReason } from '../lib/kaan_os_v4'
import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { queueJanetArchitectTask } from './selfHeal'
import {
  isOperatorOwnedEscalation,
  isAlreadyAtL5FloorAutonomyNoise,
  isCrisisAutoMarcusEscalation,
  isDexThrottleEscalation,
  shouldPageFounderForEscalation,
  ALREADY_AT_L5_FLOOR,
  CRISIS_AUTO_MARCUS,
  DEX_DAILY_THROTTLE,
  type AutonomyNagContext,
} from './escalationTriagePolicy'
import { resolveReadableLevel } from './autonomyGate'

export { isOperatorOwnedEscalation, isAlreadyAtL5FloorAutonomyNoise, ALREADY_AT_L5_FLOOR }

interface PendingEscalation {
  id: number
  category: string
  payload: any
  created_at: string
  status?: string
}

export type LiveAutonomyContext = {
  companyId: string
  liveLevel: string | null
  storedLevel: string | null
  posture: string | null
}

function nagContext(row: PendingEscalation, live?: LiveAutonomyContext): AutonomyNagContext {
  return {
    category: row.category,
    payload: row.payload,
    status: row.status,
    companyId: live?.companyId,
    liveLevel: live?.liveLevel,
    storedLevel: live?.storedLevel,
    posture: live?.posture,
  }
}

async function deferAlreadyAtL5Floor(sql: any, row: PendingEscalation, reason = ALREADY_AT_L5_FLOOR): Promise<boolean> {
  try {
    await sql`UPDATE escalations
      SET status='deferred', resolved_at=NOW(), resolved_via=${reason},
          notified_at = COALESCE(notified_at, NOW()),
          payload = payload || ${JSON.stringify({
            autoResolved: true,
            already_at_l5_floor: true,
            janetTriage: ALREADY_AT_L5_FLOOR,
            janetReasoning: reason,
          })}::jsonb
      WHERE id=${row.id}`
    console.log(`[escalationTriage] auto-resolved #${row.id} (${row.category}): ${reason}`)
    return true
  } catch (e: any) {
    console.error(`[escalationTriage] already_at_l5_floor write failed #${row.id}: ${e?.message}`)
    return false
  }
}

const AGE_DAYS = (createdAt: string) => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))

/**
 * Reviews every pending escalation for companyId. Returns a summary for callers (e.g. the founder
 * brief) to report. Fail-open per item: a triage failure on one row must never block the others or
 * throw — an escalation that can't be triaged just stays pending for tomorrow's pass, same as today.
 */
/**
 * PS-ESCALATION-STALE-01 — close escalations whose cause is provably gone.
 * Deliberately conservative: it resolves ONLY on positive evidence (a breaker that is now closed,
 * or a dispatch payload the dispatch guard would refuse outright). Anything it cannot prove dead
 * is left untouched for Janet and, if she cannot decide, for the founder. Silence is not the goal;
 * an accurate queue is.
 */
async function autoResolveStale(sql: any, rows: PendingEscalation[], live?: LiveAutonomyContext): Promise<Set<number>> {
  const done = new Set<number>()
  for (const row of rows) {
    const payload: any = row.payload || {}
    let reason: string | null = null

    if (isAlreadyAtL5FloorAutonomyNoise(nagContext(row, live))) {
      if (await deferAlreadyAtL5Floor(sql, row)) done.add(row.id)
      continue
    }

    if (isDexThrottleEscalation(row)) {
      try {
        await sql`UPDATE escalations
          SET status='deferred', resolved_at=NOW(), resolved_via=${DEX_DAILY_THROTTLE},
              payload = payload || ${JSON.stringify({
                autoResolved: true,
                dex_daily_throttle: true,
                janetTriage: DEX_DAILY_THROTTLE,
                janetReasoning: 'Dex combined/new-touch daily cap — wait UTC midnight. Not a founder gate. Do not raise caps.',
              })}::jsonb
          WHERE id=${row.id}`
        console.log(`[escalationTriage] auto-resolved #${row.id} (${row.category}): ${DEX_DAILY_THROTTLE}`)
        done.add(row.id)
      } catch (e: any) {
        console.error(`[escalationTriage] dex_daily_throttle write failed #${row.id}: ${e?.message}`)
      }
      continue
    }

    if (isCrisisAutoMarcusEscalation(row)) {
      try {
        const { maybeQueueT1Marcus } = await import('./t1MarcusHandoff')
        await maybeQueueT1Marcus({ sql }).catch(() => null)
        await sql`UPDATE escalations
          SET status='approved', resolved_at=NOW(), resolved_via=${CRISIS_AUTO_MARCUS},
              payload = payload || ${JSON.stringify({
                autoResolved: true,
                crisis_auto_marcus: true,
                janetTriage: CRISIS_AUTO_MARCUS,
                janetReasoning: 'Send-path T1/sanitize/QEV is Marcus-owned under standing crisis — queued named bug, no founder gate',
              })}::jsonb
          WHERE id=${row.id}`
        console.log(`[escalationTriage] auto-resolved #${row.id} (${row.category}): ${CRISIS_AUTO_MARCUS}`)
        done.add(row.id)
      } catch (e: any) {
        console.error(`[escalationTriage] crisis_auto_marcus write failed #${row.id}: ${e?.message}`)
      }
      continue
    }

    if (row.category === 'breaker_trip' && payload.fingerprint) {
      try {
        const b = (await sql`SELECT state FROM circuit_breaker_state WHERE fingerprint=${payload.fingerprint} LIMIT 1`) as any[]
        if (b[0]?.state === 'closed') {
          reason = `breaker ${String(payload.fingerprint).slice(0, 10)} is closed — the trip that raised this was resolved`
        }
      } catch { /* if we cannot check, leave it pending */ }
    }

    if (!reason && isOperatorOwnedEscalation(row)) {
      reason = /protected path/i.test(String(payload.last_error || ''))
        ? 'protected-path preflight — Marcus cannot dispatch this; a human PR is the only close, not a founder legal decision'
        : 'stale Grok format-mismatch breaker — known-fixed LLM refusal, not a founder spend/legal decision'
      if (payload.fingerprint) {
        await sql`
          UPDATE circuit_breaker_state
          SET state='closed', consecutive_failures=0, trip_reason=NULL, updated_at=NOW()
          WHERE fingerprint=${payload.fingerprint} AND state='open'
        `.catch(() => {})
      }
    }

    if (!reason && row.category === 'marcus_dispatch' && typeof payload.task === 'string') {
      const refusal = dispatchRefusalReason(payload.task)
      if (refusal) {
        reason = `dispatch is not executable (${refusal}) — nothing to approve; the agent must resend it intact`
      }
    }

    if (reason) {
      // PS-ESCALATION-STALE-02 (QA 2026-09-06): the write below used status='resolved', but the
      // escalations_status_check constraint only allows pending/approved/rejected/deferred — so
      // every auto-resolve since 2026-08-18 threw and was swallowed by the .catch(). That is why
      // stale marcus_dispatch escalations kept accumulating (10 found live on 2026-09-06) despite
      // this triage running daily. 'deferred' is the valid terminal status for "closed, no founder
      // action needed"; the resolved_at/resolved_via audit columns still record the evidence.
      await sql`UPDATE escalations
        SET status='deferred', resolved_at=NOW(), resolved_via='auto_stale',
            payload = payload || ${JSON.stringify({ autoResolved: true })}::jsonb
        WHERE id=${row.id}`.catch((e: any) => { console.error(`[escalationTriage] auto-resolve write failed #${row.id}: ${e?.message}`) })
      console.log(`[escalationTriage] auto-resolved #${row.id} (${row.category}): ${reason}`)
      done.add(row.id)
    }
  }
  return done
}

async function loadLiveAutonomyContext(sql: any, companyId: string): Promise<LiveAutonomyContext> {
  const levelRows = (await sql`SELECT level FROM os_autonomy_state WHERE company_id=${companyId} LIMIT 1`.catch(() => [])) as any[]
  const postureRows = (await sql`SELECT posture FROM os_posture_state WHERE product_id=${companyId} LIMIT 1`.catch(() => [])) as any[]
  const stored = levelRows[0]?.level != null ? String(levelRows[0].level) : null
  return {
    companyId,
    storedLevel: stored,
    liveLevel: String(resolveReadableLevel(companyId, stored) ?? 'l5'),
    posture: postureRows[0]?.posture != null ? String(postureRows[0].posture) : null,
  }
}

export async function triageEscalations(companyId: string): Promise<{ reviewed: number; resolved: number; escalatedToFounder: number }> {
  const sql = getSql()
  let rows: PendingEscalation[] = []
  try {
    rows = (await sql`
      SELECT id, category, payload, created_at, status FROM escalations
      WHERE status = 'pending' AND product_id = ${companyId}
      ORDER BY created_at ASC LIMIT 20
    `) as PendingEscalation[]
  } catch {
    return { reviewed: 0, resolved: 0, escalatedToFounder: 0 }
  }
  if (!rows.length) return { reviewed: 0, resolved: 0, escalatedToFounder: 0 }

  const liveCtx = await loadLiveAutonomyContext(sql, companyId)

  // PS-ESCALATION-STALE-01 (2026-08-18): an escalation had no way to become irrelevant. Fixing the
  // underlying fault resolved nothing, so repaired problems kept escalating at the founder daily
  // and LOUDER — on 2026-08-17 he received eight, of which seven were already dead: merge-405s
  // (the daemon was running stale code), Grok format mismatches (max_tokens truncation, fixed),
  // and a truncated DDL that cannot execute at all. Real signal drowns in that. An escalation
  // whose cause is demonstrably gone is now closed automatically, with the evidence recorded.
  const autoResolved = await autoResolveStale(sql, rows, liveCtx)
  const live = rows.filter((r) => !autoResolved.has(r.id))
  if (!live.length) return { reviewed: rows.length, resolved: autoResolved.size, escalatedToFounder: 0 }

  let resolved = autoResolved.size
  let escalatedToFounder = 0

  for (const row of live) {
    const age = AGE_DAYS(row.created_at)
    const ctx = nagContext(row, liveCtx)
    // Already-at-L5 autonomy noise: never janetTriage=founder_required, never re-alert louder.
    if (isAlreadyAtL5FloorAutonomyNoise(ctx)) {
      if (await deferAlreadyAtL5Floor(sql, row)) resolved++
      continue
    }
    // Already flagged founder-decision-required in a prior pass — just re-alert with growing
    // urgency, do not re-spend an LLM call re-litigating the same item every day.
    if (isOperatorOwnedEscalation(row)) {
      const extra = await autoResolveStale(sql, [row], liveCtx)
      if (extra.has(row.id)) {
        resolved++
        continue
      }
    }
    const already = String(row.payload?.janetTriage ?? '')
    if (already === 'founder_required') {
      if (!shouldPageFounderForEscalation(ctx)) {
        if (await deferAlreadyAtL5Floor(sql, row)) resolved++
        continue
      }
      await reAlertFounder(row, age, companyId)
      escalatedToFounder++
      continue
    }

    let decision: { action: 'resolve' | 'founder_required'; reasoning: string; marcus_task?: string } | null = null
    try {
      const r = await llmComplete({
        messages: [
          {
            role: 'system',
            content:
              'You are Janet, CGO. You are triaging a pending escalation raised by an agent or system. ' +
              'Decide: RESOLVE it yourself (only if it is routine, low-stakes, and clearly within your ' +
              'authority as CGO — e.g. a stale/superseded item, a duplicate, a routine autonomy-level bump ' +
              'you already track, a Marcus dispatch you can now safely queue) — OR mark FOUNDER_REQUIRED ' +
              '(pricing, spend, legal, anything ambiguous, anything you are not confident about, anything ' +
              'touching real customers). Default to FOUNDER_REQUIRED when uncertain — a wrongly-resolved ' +
              'item is worse than one more day of asking. Respond ONLY as JSON: ' +
              '{"action":"resolve"|"founder_required","reasoning":"<one sentence>","marcus_task":"<optional, only if action=resolve and this needs a code change>"}',
          },
          {
            role: 'user',
            content: `Category: ${row.category}\nAge: ${age} day(s)\nPayload: ${JSON.stringify(row.payload).slice(0, 800)}`,
          },
        ],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      })
      decision = JSON.parse(r.text || '{}')
    } catch {
      decision = null
    }

    if (decision?.action === 'resolve') {
      try {
        if (decision.marcus_task) {
          await queueJanetArchitectTask({
            task: decision.marcus_task.slice(0, 400),
            source: `janet_triage:escalation_${row.id}`,
            notes: `Auto-triaged from escalation #${row.id} (${row.category}): ${decision.reasoning}`,
          }).catch(() => null)
        }
        await sql`UPDATE escalations SET status='approved', resolved_at=NOW(), resolved_via='janet_triage'
          WHERE id=${row.id}`.catch(() => {})
        resolved++
      } catch { /* leave pending for tomorrow */ }
    } else {
      // FOUNDER_REQUIRED (or triage failed => default to founder-required, never silently drop it).
      // Already-at-L5 autonomy_change is not a founder decision — never stamp founder_required.
      if (isAlreadyAtL5FloorAutonomyNoise(ctx)) {
        if (await deferAlreadyAtL5Floor(sql, row)) resolved++
        continue
      }
      if (isDexThrottleEscalation(row)) {
        try {
          await sql`UPDATE escalations SET status='deferred', resolved_at=NOW(), resolved_via=${DEX_DAILY_THROTTLE},
            payload = payload || ${JSON.stringify({
              autoResolved: true,
              dex_daily_throttle: true,
              janetTriage: DEX_DAILY_THROTTLE,
            })}::jsonb
            WHERE id=${row.id}`
          resolved++
        } catch { /* leave pending */ }
        continue
      }
      if (isCrisisAutoMarcusEscalation(row)) {
        try {
          const { maybeQueueT1Marcus } = await import('./t1MarcusHandoff')
          await maybeQueueT1Marcus({ sql }).catch(() => null)
          await sql`UPDATE escalations SET status='approved', resolved_at=NOW(), resolved_via=${CRISIS_AUTO_MARCUS},
            payload = payload || ${JSON.stringify({
              autoResolved: true,
              crisis_auto_marcus: true,
              janetTriage: CRISIS_AUTO_MARCUS,
            })}::jsonb
            WHERE id=${row.id}`
          resolved++
        } catch { /* leave pending */ }
        continue
      }
      const reasoning = decision?.reasoning || 'Could not be auto-triaged — needs your review.'
      await sql`UPDATE escalations SET payload = payload || ${JSON.stringify({ janetTriage: 'founder_required', janetReasoning: reasoning })}::jsonb
        WHERE id=${row.id}`.catch(() => {})
      await reAlertFounder(row, age, companyId, reasoning)
      escalatedToFounder++
    }
  }

  return { reviewed: rows.length, resolved, escalatedToFounder }
}

async function reAlertFounder(row: PendingEscalation, age: number, companyId: string, reasoning?: string): Promise<void> {
  if (!shouldPageFounderForEscalation({
    category: row.category,
    payload: row.payload,
    status: row.status,
    companyId,
  })) return
  const ageLine = age === 0 ? '(raised today)' : `— **${age} DAY${age === 1 ? '' : 'S'} UNRESOLVED**`
  const why = reasoning || String((row.payload as any)?.janetReasoning ?? '')
  await sendTelegram(
    `🚨 *[${companyId}] FOUNDER DECISION PENDING ${ageLine}*\n` +
    `#${row.id} · ${row.category}\n` +
    `${why ? `Janet: ${why}\n` : ''}` +
    `Payload: ${JSON.stringify(row.payload).slice(0, 300)}\n` +
    'This will keep repeating, growing louder, until you resolve it.',
  ).catch(() => {})
}
