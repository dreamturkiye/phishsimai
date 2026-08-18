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
import { getSql } from './conn'
// PS-ESCALATION-STALE-01: reuse the dispatch guard so 'executable?' has ONE definition.
import { dispatchRefusalReason } from '../lib/kaan_os_v4'
import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { queueJanetArchitectTask } from './selfHeal'

interface PendingEscalation {
  id: number
  category: string
  payload: any
  created_at: string
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
async function autoResolveStale(sql: any, rows: PendingEscalation[]): Promise<Set<number>> {
  const done = new Set<number>()
  for (const row of rows) {
    const payload: any = row.payload || {}
    let reason: string | null = null

    if (row.category === 'breaker_trip' && payload.fingerprint) {
      try {
        const b = (await sql`SELECT state FROM circuit_breaker_state WHERE fingerprint=${payload.fingerprint} LIMIT 1`) as any[]
        if (b[0]?.state === 'closed') {
          reason = `breaker ${String(payload.fingerprint).slice(0, 10)} is closed — the trip that raised this was resolved`
        }
      } catch { /* if we cannot check, leave it pending */ }
    }

    if (!reason && row.category === 'marcus_dispatch' && typeof payload.task === 'string') {
      const refusal = dispatchRefusalReason(payload.task)
      if (refusal) {
        reason = `dispatch is not executable (${refusal}) — nothing to approve; the agent must resend it intact`
      }
    }

    if (reason) {
      await sql`UPDATE escalations
        SET status='resolved', resolved_at=NOW(), resolved_via='auto_stale',
            payload = payload || ${JSON.stringify({ autoResolved: true })}::jsonb
        WHERE id=${row.id}`.catch(() => {})
      console.log(`[escalationTriage] auto-resolved #${row.id} (${row.category}): ${reason}`)
      done.add(row.id)
    }
  }
  return done
}

export async function triageEscalations(companyId: string): Promise<{ reviewed: number; resolved: number; escalatedToFounder: number }> {
  const sql = getSql()
  let rows: PendingEscalation[] = []
  try {
    rows = (await sql`
      SELECT id, category, payload, created_at FROM escalations
      WHERE status = 'pending' AND product_id = ${companyId}
      ORDER BY created_at ASC LIMIT 20
    `) as PendingEscalation[]
  } catch {
    return { reviewed: 0, resolved: 0, escalatedToFounder: 0 }
  }
  if (!rows.length) return { reviewed: 0, resolved: 0, escalatedToFounder: 0 }

  // PS-ESCALATION-STALE-01 (2026-08-18): an escalation had no way to become irrelevant. Fixing the
  // underlying fault resolved nothing, so repaired problems kept escalating at the founder daily
  // and LOUDER — on 2026-08-17 he received eight, of which seven were already dead: merge-405s
  // (the daemon was running stale code), Grok format mismatches (max_tokens truncation, fixed),
  // and a truncated DDL that cannot execute at all. Real signal drowns in that. An escalation
  // whose cause is demonstrably gone is now closed automatically, with the evidence recorded.
  const autoResolved = await autoResolveStale(sql, rows)
  const live = rows.filter((r) => !autoResolved.has(r.id))
  if (!live.length) return { reviewed: rows.length, resolved: autoResolved.size, escalatedToFounder: 0 }

  let resolved = autoResolved.size
  let escalatedToFounder = 0

  for (const row of live) {
    const age = AGE_DAYS(row.created_at)
    // Already flagged founder-decision-required in a prior pass — just re-alert with growing
    // urgency, do not re-spend an LLM call re-litigating the same item every day.
    const already = String(row.payload?.janetTriage ?? '')
    if (already === 'founder_required') {
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
