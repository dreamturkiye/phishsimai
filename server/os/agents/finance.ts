import { connect } from '@tidbcloud/serverless'
import { rememberFact } from '../memory'

export interface FinanceReport {
  mrr:number; arr:number; customers:number; nextMilestone:string; pricingRecommendation:string
}

export async function runFinanceAgent(companyId='phishsimai'): Promise<FinanceReport> {
  const conn = connect({ url: process.env.DATABASE_URL! })
  let customers = 0
  try {
    const rows = await conn.execute(`SELECT COUNT(*) as cnt FROM ps_outreach_leads WHERE pipeline_stage='customer'`)
    customers = Number((rows as any).rows?.[0]?.cnt || 0)
  } catch {}
  const mrr = customers * 249
  const arr = mrr * 12
  const milestones = [
    {mrr:500, label:'$500 MRR — first 2 MSPs'},
    {mrr:2500, label:'$2.5K MRR — 10 clients, validated'},
    {mrr:5000, label:'$5K MRR — profitable'},
    {mrr:10000, label:'$10K MRR — seed territory'}
  ]
  const next = milestones.find(m=>m.mrr>mrr) || milestones[milestones.length-1]
  await rememberFact({ company_id:companyId, type:'strategic', key:`finance_${new Date().toISOString().slice(0,10)}`,
    value:`MRR:$${mrr} Customers:${customers} Next:${next.label}`, confidence:1, source:'finance_agent' })
  return { mrr, arr, customers, nextMilestone:next.label,
    pricingRecommendation: customers===0
      ? 'Founding MSP rate: $49/mo first 3 months for first 5 MSPs. Close fast, get testimonials, then enforce full pricing.'
      : 'Send ROI report at day 30 showing click rate reduction. Use as upsell to Pro tier.' }
}
