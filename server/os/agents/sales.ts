import { getSql } from '../conn'
import { learnFromOutcome } from '../memory'
import { runFullSequence } from '../sequences'

export interface SalesReport {
  touched: number
  replied: number
  engaged: number
  customers: number
  prospects: number
  replyRate: number
  topProspects: any[]
  recommendation: string
}

export async function runSalesAgent(companyId = 'phishsimai'): Promise<SalesReport> {
  const sql = getSql()
  const [stats] = await sql`SELECT
    count(*) filter(where touch1_sent_at is not null) as touched,
    count(*) filter(where replied=true) as replied,
    count(*) filter(where pipeline_stage='engaged') as engaged,
    count(*) filter(where pipeline_stage='customer') as customers,
    count(*) filter(where pipeline_stage='prospect') as prospects
    FROM ps_outreach_leads WHERE bounced=false`

  const topProspects = await sql`SELECT name, company, email, pipeline_stage, stage_updated_at
    FROM ps_outreach_leads
    WHERE pipeline_stage IN ('engaged','replied','prospect') AND bounced=false
    ORDER BY stage_updated_at DESC LIMIT 5`

  const touched = Number(stats.touched)
  const replied = Number(stats.replied)
  const replyRate = touched > 0 ? replied / touched : 0

  let recommendation = ''
  if (replyRate === 0 && touched >= 10) {
    recommendation = 'No replies after 10+ touches. A/B test subject lines immediately. Try compliance-urgency vs discovery question. Verify inbox placement.'
  } else if (replyRate > 0 && replyRate < 0.02) {
    recommendation = `Reply rate ${(replyRate * 100).toFixed(1)}% is below 2% target. Personalize T2-T3 with breach stats. Add MSP white-label angle.`
  } else if (replyRate >= 0.02) {
    recommendation = `Reply rate ${(replyRate * 100).toFixed(1)}% — healthy. Scale volume. Add 20 more MSP leads this week.`
  } else {
    recommendation = 'Continue current sequence. Monitor for T2 eligibility in 3 days.'
  }

  if (replied > 0) {
    await learnFromOutcome(companyId, `email_sequence_${touched}_sent`, `${replied} replies (${(replyRate * 100).toFixed(1)}%)`, recommendation)
  }

  return {
    touched, replied, engaged: Number(stats.engaged), customers: Number(stats.customers),
    prospects: Number(stats.prospects), replyRate, topProspects: topProspects as any[], recommendation,
  }
}

export async function runSequenceNow() {
  return runFullSequence()
}
