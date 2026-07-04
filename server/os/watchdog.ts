import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { checkAgentStaleness, reportAgentRun } from './agentHealth'
import { checkEmployeeStaleness } from './agentHealth_v2'
import { runOpsRecoveryTick } from './opsRecovery'
import { runLeadResearcher } from './agents/leadResearcher'
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
    const heal = await runLeadResearcher(6)
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
    const stalled = await sql`SELECT count(*) as n FROM ps_outreach_leads
      WHERE touch1_sent_at IS NULL
      AND created_at < NOW() - INTERVAL '2 days'
      AND unsubscribed = false AND bounced = false
      AND pipeline_stage NOT IN ('dead','customer')`
    const stalledN = Number(stalled[0].n)
    if (stalledN > 20) {
      result.issues_found++
      await sendTelegram('PHISHSIMAI WATCHDOG: ' + stalledN + ' leads stalled >2d. Check /api/os/aria-daily.')
      result.actions_taken.push('Stall alert: ' + stalledN + ' leads')
    } else {
      result.actions_taken.push('Lead stall OK: ' + stalledN + ' stalled')
    }
  } catch (e: any) {
    result.actions_taken.push('Stall check error: ' + e.message?.slice(0, 100))
  }

  try {
    const bounceStats = await sql`SELECT
      count(*) filter(where bounced=true) as bounced,
      count(*) as sent
      FROM ps_outreach_leads
      WHERE touch1_sent_at IS NOT NULL`
    const bounced = Number(bounceStats[0].bounced)
    const sent = Number(bounceStats[0].sent)
    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0
    if (bounceRate > 8) {
      result.issues_found++
      await sendTelegram('PHISHSIMAI BOUNCE ALERT: ' + bounceRate.toFixed(1) + '% (' + bounced + '/' + sent + ' sends). Sequence paused automatically.')
      result.actions_taken.push('Bounce alert: ' + bounceRate.toFixed(1) + '%')
    } else {
      result.actions_taken.push('Bounce rate OK: ' + bounceRate.toFixed(1) + '% (' + bounced + '/' + sent + ' sent)')
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
