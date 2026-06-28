import { connect } from '@tidbcloud/serverless'

export interface SalesReport {
  touched:number; replied:number; engaged:number; customers:number; prospects:number
  replyRate:number; recommendation:string
}

export async function runSalesAgent(companyId='phishsimai'): Promise<SalesReport> {
  const conn = connect({ url: process.env.DATABASE_URL! })
  let touched=0,replied=0,engaged=0,customers=0,prospects=0
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS ps_outreach_leads (
      id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) DEFAULT '',
      company VARCHAR(255) DEFAULT '',
      title VARCHAR(255) DEFAULT '',
      industry VARCHAR(100) DEFAULT 'technology',
      source VARCHAR(100) DEFAULT 'manual',
      pipeline_stage VARCHAR(100) DEFAULT 'prospect',
      touch1_sent_at TIMESTAMP NULL, touch2_sent_at TIMESTAMP NULL,
      touch3_sent_at TIMESTAMP NULL, touch4_sent_at TIMESTAMP NULL,
      replied TINYINT(1) DEFAULT 0, bounced TINYINT(1) DEFAULT 0, unsubscribed TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      stage_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)
    const rows = await conn.execute(`SELECT
      COUNT(CASE WHEN touch1_sent_at IS NOT NULL THEN 1 END) as touched,
      COUNT(CASE WHEN replied=1 THEN 1 END) as replied,
      COUNT(CASE WHEN pipeline_stage='engaged' THEN 1 END) as engaged,
      COUNT(CASE WHEN pipeline_stage='customer' THEN 1 END) as customers,
      COUNT(CASE WHEN pipeline_stage='prospect' THEN 1 END) as prospects
      FROM ps_outreach_leads WHERE bounced=0`)
    const s = (rows as any).rows?.[0] || {}
    touched=Number(s.touched||0); replied=Number(s.replied||0)
    engaged=Number(s.engaged||0); customers=Number(s.customers||0); prospects=Number(s.prospects||0)
  } catch {}
  const replyRate = touched>0 ? replied/touched : 0
  const recommendation = replied===0 && touched>=10
    ? 'No replies after 10+ sends. Test compliance-urgency subject line. Add 67% breach stat to T2.'
    : replyRate>=0.02 ? `${(replyRate*100).toFixed(1)}% reply rate healthy. Scale to 25/day. Prioritize MSP leads.`
    : 'Continue sequence. T2 batch eligible in 3 days.'
  return { touched, replied, engaged, customers, prospects, replyRate, recommendation }
}
