import { connect } from '@tidbcloud/serverless'

export interface CSReport { activeCustomers:number; retentionScore:number; recommendation:string }

export async function runCSAgent(companyId='phishsimai'): Promise<CSReport> {
  const conn = connect({ url: process.env.DATABASE_URL! })
  let activeCustomers = 0
  try {
    const rows = await conn.execute(`SELECT COUNT(*) as cnt FROM ps_outreach_leads WHERE pipeline_stage='customer'`)
    activeCustomers = Number((rows as any).rows?.[0]?.cnt || 0)
  } catch {}
  return {
    activeCustomers, retentionScore: 100,
    recommendation: activeCustomers===0
      ? 'CS standing by. On first payment: trigger 14-day onboarding email sequence, send ROI benchmark at day 7.'
      : 'Send ROI report to all customers showing click reduction vs baseline. Upsell to Pro at day 30.'
  }
}
