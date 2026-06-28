import { connect } from '@tidbcloud/serverless'

export async function runHeartbeat() {
  const conn = connect({ url: process.env.DATABASE_URL! })
  const checks: {name:string,ok:boolean,detail:string}[] = []
  let healthy = true
  try {
    const rows = await conn.execute(`SELECT COUNT(*) as n FROM ps_outreach_leads`)
    checks.push({ name:'db_connection', ok:true, detail:(rows as any).rows?.[0]?.n+' leads' })
  } catch(e: any) { checks.push({name:'db_connection',ok:false,detail:e.message}); healthy=false }
  try {
    const rows = await conn.execute(`SELECT COUNT(*) as n FROM ps_outreach_leads
      WHERE touch1_sent_at IS NOT NULL AND touch2_sent_at IS NULL
      AND touch1_sent_at < DATE_SUB(NOW(), INTERVAL 5 DAY) AND replied=0 AND bounced=0`)
    const n = Number((rows as any).rows?.[0]?.n || 0)
    checks.push({name:'sequence_engine', ok:n<10, detail:`${n} stalled >5d`})
  } catch(e: any) { checks.push({name:'sequence_engine',ok:false,detail:e.message}) }
  return { company:'phishsimai', timestamp:new Date().toISOString(), checks, healthy, issues:checks.filter(c=>!c.ok).map(c=>c.name) }
}
