import { getSql } from './conn'
import { reportAgentRun } from './agentHealth'

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

  await reportAgentRun('heartbeat', healthy, { checks }, healthy ? undefined : 'heartbeat unhealthy', 'phishsimai')
  return { company: 'phishsimai', timestamp: new Date().toISOString(), checks, healthy, issues: checks.filter(c => !c.ok).map(c => c.name) }
}
