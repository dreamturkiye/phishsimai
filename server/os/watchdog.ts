import { connect } from '@tidbcloud/serverless'
import { sendTelegram } from './telegram'

export async function runWatchdog() {
  const conn = connect({ url: process.env.DATABASE_URL! })
  const result = { checked_at: new Date().toISOString(), issues_found: 0, actions_taken: [] as string[] }
  try {
    const rows = await conn.execute(`SELECT
      COUNT(CASE WHEN bounced=1 THEN 1 END) as b,
      COUNT(*) as s
      FROM ps_outreach_leads WHERE touch1_sent_at IS NOT NULL`)
    const r = (rows as any).rows?.[0] || {}
    const rate = Number(r.s)>0 ? Number(r.b)/Number(r.s)*100 : 0
    if (rate > 8) {
      result.issues_found++
      await sendTelegram(`PHISHSIMAI BOUNCE ALERT: ${rate.toFixed(1)}% — sequence paused`)
      result.actions_taken.push(`Bounce alert: ${rate.toFixed(1)}%`)
    } else {
      result.actions_taken.push(`Bounce OK: ${rate.toFixed(1)}%`)
    }
    const stalled = await conn.execute(`SELECT COUNT(*) as n FROM ps_outreach_leads
      WHERE touch1_sent_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)
      AND bounced=0 AND unsubscribed=0 AND pipeline_stage NOT IN ('dead','customer')`)
    const n = Number((stalled as any).rows?.[0]?.n || 0)
    if (n > 20) {
      result.issues_found++
      await sendTelegram(`PHISHSIMAI STALL: ${n} leads unsent >2 days. Check cron.`)
    }
  } catch (e: any) {
    result.actions_taken.push(`watchdog error: ${e.message}`)
  }
  return result
}
