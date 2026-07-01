import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { checkAgentStaleness } from './agentHealth'
import { runLeadResearcher } from './agents/leadResearcher'

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
    const staleAgents = await checkAgentStaleness('phishsimai')
    if (staleAgents.length > 0) {
      result.issues_found += staleAgents.length
      result.actions_taken.push('Stale agents: ' + staleAgents.join(', '))
      if (staleAgents.some(s => s.startsWith('researcher:'))) {
        try {
          const heal = await runLeadResearcher(6)
          result.actions_taken.push(
            `Researcher self-heal: discovered=${heal.discovered} added=${heal.added} enriched=${heal.enriched}`
          )
        } catch (e: any) {
          result.actions_taken.push('Researcher self-heal failed: ' + e.message?.slice(0, 120))
        }
      }
    } else {
      result.actions_taken.push('All agents healthy')
    }
  } catch (e: any) {
    result.actions_taken.push('Agent health check error: ' + e.message?.slice(0, 100))
  }

  return result
}
