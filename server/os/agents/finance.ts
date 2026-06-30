import { getSql } from '../conn'
import { rememberFact } from '../memory'

export interface FinanceReport {
  mrr: number
  arr: number
  customers: number
  avgRevenuePerCustomer: number
  projectedMrrIn90Days: number
  revenueToNextMilestone: number
  nextMilestone: string
  conversionFunnelCost: string
  pricingRecommendation: string
}

export async function runFinanceAgent(companyId = 'phishsimai'): Promise<FinanceReport> {
  const sql = getSql()
  const [counts] = await sql`SELECT
    count(*) filter(where pipeline_stage='customer') as customers,
    count(*) filter(where touch1_sent_at is not null) as contacted
    FROM ps_outreach_leads WHERE bounced=false`

  const customers = Number(counts.customers)
  const contacted = Number(counts.contacted)
  const avgRevenue = 99
  const mrr = customers * avgRevenue
  const arr = mrr * 12
  const projectedCustomers90d = customers + Math.round(contacted * 0.02 * 0.30)
  const projectedMrr = projectedCustomers90d * avgRevenue

  const milestones = [
    { mrr: 500, label: '$500 MRR — first 2 MSPs' },
    { mrr: 2500, label: '$2.5K MRR — 10 clients, validated' },
    { mrr: 5000, label: '$5K MRR — profitable' },
    { mrr: 10000, label: '$10K MRR — seed territory' },
  ]
  const next = milestones.find(m => m.mrr > mrr) || milestones[milestones.length - 1]

  const report: FinanceReport = {
    mrr, arr, customers,
    avgRevenuePerCustomer: avgRevenue,
    projectedMrrIn90Days: projectedMrr,
    revenueToNextMilestone: Math.max(0, next.mrr - mrr),
    nextMilestone: next.label,
    conversionFunnelCost: '$0 (organic outreach only). Hunter.io enrichment per lead.',
    pricingRecommendation: customers === 0
      ? 'Founding MSP rate: $49/mo first 3 months for first 5 MSPs. Close fast, get testimonials, then enforce full pricing.'
      : `${customers} client(s) at $${avgRevenue}/mo avg. Test upgrade email to Pro tier at day 30.`,
  }

  await rememberFact({
    company_id: companyId,
    type: 'strategic',
    key: `finance_snapshot_${new Date().toISOString().slice(0, 10)}`,
    value: `MRR: $${mrr} | Customers: ${customers} | Projected 90d: $${projectedMrr} | Next milestone: ${next.label}`,
    confidence: 1,
    source: 'finance_agent',
  })

  return report
}
