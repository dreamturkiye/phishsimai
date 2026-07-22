import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { checkAgentStaleness, reportAgentRun } from './agentHealth'
import { checkEmployeeStaleness } from './agentHealth_v2'
import { runOpsRecoveryTick } from './opsRecovery'
import { runLeadResearcher } from './agents/leadResearcher'
import { getSequenceHealth } from './sequences'
import { resolveSystemAlert } from './selfHeal'

const RESEARCHER_PROACTIVE_MS = 55 * 60 * 1000

async function ensureResearcherRunning(companyId: string, actions: string[]) {
  const sql = getSql()
  const rows = await sql`
    SELECT last_success_at, last_run_at FROM agent_health
    WHERE company_id=${companyId} AND agent_name='researcher'
    LIMIT 1
  `
  const last = rows[0]?.last_success_at || rows[0]?.last_run_at
  const age = last ? Date.now() - new Date(last as string).getTime() : Infinity
  if (age < RESEARCHER_PROACTIVE_MS) return
  try {
    const heal = await runLeadResearcher(4)
    actions.push(
      `Researcher proactive: discovered=${heal.discovered} added=${heal.added} enriched=${heal.enriched}`
    )
    await resolveSystemAlert('agent_stale:researcher', 'researcher proactive run completed', companyId)
  } catch (e: any) {
    actions.push('Researcher proactive failed: ' + e.message?.slice(0, 120))
  }
}

export async function runWatchdog() {
  const sql = getSql()
  const result: { checked_at: string; issues_found: number; actions_taken: string[] } = {
    checked_at: new Date().toISOString(),
    issues_found: 0,
    actions_taken: [],
  }

  try {
    // PS-WATCHDOG-STALL-01: "stalled" = leads that SHOULD have progressed but didn't — NOT the raw
    // unsanitized pool. That pool is the funnel RESERVOIR: it correctly sits un-pulled until the
    // refill verifies it as-needed, so counting touch1_sent_at IS NULL across the whole pool always
    // alarms as the harvester fills it. A genuine stall is one of:
    //  (a) verified & sendable, but the send cron hasn't sent it in >2d (a real drain failure);
    //  (b) research that has exhausted its retries or hung mid-flight (NOT fresh pending backlog).
    const sendStuck = Number((await sql`SELECT count(*) AS n FROM ps_outreach_leads
      WHERE sanitized_at IS NOT NULL AND touch1_sent_at IS NULL
      AND country IN ('US','GB','AU') AND unsubscribed = false AND bounced = false
      AND pipeline_stage NOT IN ('dead','customer')
      AND sanitized_at < NOW() - INTERVAL '2 days'`)[0].n)
    // PS-RESEARCHER-TERMINAL-01: exclude every TERMINAL status, not just enriched/duplicate. A lead
    // the researcher will never touch again — 'unenrichable' (retired after max misses), 'failed'
    // (errored), 'dead' — is resolved, not stalled, and must not alarm. The researcher only selects
    // status='pending' AND attempts < max, so a genuine research stall is now precisely: a lead hung
    // mid-flight in 'researching', or (belt-and-suspenders, shouldn't occur post-fix) a 'pending'
    // lead that somehow maxed out its attempts without being retired.
    const researchStuck = Number((await sql`SELECT count(*) AS n FROM lead_research_queue
      WHERE created_at < NOW() - INTERVAL '2 days'
      AND status NOT IN ('enriched','duplicate','unenrichable','failed','dead')
      AND ((status = 'researching' AND last_attempt_at < NOW() - INTERVAL '2 days')
           OR (status = 'pending' AND attempts >= 3))`
      .catch(() => [{ n: 0 }]))[0].n)
    const stalledN = sendStuck + researchStuck
    if (stalledN > 20) {
      result.issues_found++
      await sendTelegram(`PHISHSIMAI WATCHDOG: ${stalledN} leads genuinely stalled >2d — send-stuck ${sendStuck} (→ /api/os/sequence), research-stuck ${researchStuck} (→ /api/os/researcher). Raw unsanitized reservoir excluded by design.`)
      result.actions_taken.push(`Stall alert: ${stalledN} (send ${sendStuck}, research ${researchStuck})`)
    } else {
      result.actions_taken.push(`Lead stall OK: ${stalledN} genuinely stalled (raw reservoir excluded)`)
    }
  } catch (e: any) {
    result.actions_taken.push('Stall check error: ' + e.message?.slice(0, 100))
  }

  try {
    // PS-BOUNCE-WINDOW-01 (second reader): this used the SAME lifetime population getSequenceHealth
    // did before the rescope (bounced/sent over touch1_sent_at IS NOT NULL). After the D2 purge that
    // is 46.5% over 42 dead leads — a memorial rate that can never drop — and it Telegram-alarmed the
    // founder hourly with "Sequence paused automatically", which was ALSO false: this watchdog never
    // paused anything, it only sent the message. Now it calls the ONE rescoped source of truth and
    // reports honestly: only a MEASURED trip alarms; an empty window is NOT MEASURED, not a scare.
    const h = await getSequenceHealth(sql)
    if (!h.measured) {
      result.actions_taken.push('Bounce rate: NOT MEASURED (no live sends in 7d window)')
    } else if (h.tripped) {
      result.issues_found++
      await sendTelegram('PHISHSIMAI BOUNCE ALERT: ' + (h.rate * 100).toFixed(1) + '% over ' + h.sent + ' live sends (7d). Breaker tripped; outbound halts on the next sequence run.')
      result.actions_taken.push('Bounce alert (measured, tripped): ' + (h.rate * 100).toFixed(1) + '%')
    } else {
      result.actions_taken.push('Bounce rate OK: ' + (h.rate * 100).toFixed(1) + '% over ' + h.sent + ' live sends (7d)')
    }
  } catch (e: any) {
    result.actions_taken.push('Bounce check error: ' + e.message?.slice(0, 100))
  }

  try {
    await ensureResearcherRunning('phishsimai', result.actions_taken)

    const recovery = await runOpsRecoveryTick('phishsimai')
    if (recovery.restarts.length > 0) {
      result.issues_found += recovery.restarts.filter((r) => !r.ok).length
      result.actions_taken.push(
        'Janet ops recovery: ' + recovery.restarts.map((r) => `${r.agent}(${r.reason})=${r.ok ? 'ok' : 'fail'}`).join(', ')
      )
    }

    const staleAgents = await checkAgentStaleness('phishsimai')
    const staleEmployees = await checkEmployeeStaleness('phishsimai')
    const allStale = [...staleAgents, ...staleEmployees]
    if (allStale.length > 0) {
      result.issues_found += allStale.length
      result.actions_taken.push('Still flagged: ' + allStale.join(', '))
    } else if (recovery.restarts.length === 0) {
      result.actions_taken.push('All ops + employee agents healthy')
    }
  } catch (e: any) {
    result.actions_taken.push('Agent health check error: ' + e.message?.slice(0, 100))
  }

  try {
    await reportAgentRun('watchdog', true, { issues: result.issues_found, actions: result.actions_taken.length })
  } catch {
    await reportAgentRun('watchdog', false, {}, 'failed to record watchdog run').catch(() => {})
  }

  return result
}
