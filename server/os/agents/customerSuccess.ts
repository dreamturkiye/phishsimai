import { getSql } from '../conn'
import { rememberFact } from '../memory'

export interface CSReport {
  activeCustomers: number
  atRiskCustomers: any[]
  upsellOpportunities: any[]
  checkInsDue: any[]
  retentionScore: number
  recommendation?: string
}

export async function runCSAgent(companyId = 'phishsimai'): Promise<CSReport> {
  const sql = getSql()
  const customers = await sql`SELECT name, company, email, stage_updated_at
    FROM ps_outreach_leads WHERE pipeline_stage='customer' AND bounced=false`

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const checkInsDue = customers.filter((c: any) => new Date(c.stage_updated_at) < thirtyDaysAgo)
  const atRisk = customers.filter((c: any) => {
    const daysSince = (Date.now() - new Date(c.stage_updated_at).getTime()) / 86400000
    return daysSince > 25
  })
  const upsellOpportunities = customers.filter((c: any) => {
    const daysSince = (Date.now() - new Date(c.stage_updated_at).getTime()) / 86400000
    return daysSince > 14 && daysSince < 25
  })

  const retentionScore = customers.length === 0 ? 100 :
    Math.round(((customers.length - atRisk.length) / customers.length) * 100)

  const recommendation = customers.length === 0
    ? 'CS standing by. On first payment: trigger 14-day onboarding email sequence, send ROI benchmark at day 7.'
    : 'Send ROI report to all customers showing click reduction vs baseline. Upsell to Pro at day 30.'

  await rememberFact({
    company_id: companyId,
    type: 'strategic',
    key: `cs_snapshot_${new Date().toISOString().slice(0, 10)}`,
    value: `Customers: ${customers.length} | At risk: ${atRisk.length} | Upsell opps: ${upsellOpportunities.length} | Retention score: ${retentionScore}%`,
    confidence: 1,
    source: 'cs_agent',
  })

  return {
    activeCustomers: customers.length,
    atRiskCustomers: atRisk as any[],
    upsellOpportunities: upsellOpportunities as any[],
    checkInsDue: checkInsDue as any[],
    retentionScore,
    recommendation,
  }
}

export const runCustomerSuccessAgent = runCSAgent
