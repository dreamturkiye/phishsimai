import { rememberFact } from '../memory'

export interface MarketingReport {
  activeExperiment:string; channelPriority:string[]; recommendation:string
}

export async function runMarketingAgent(companyId='phishsimai'): Promise<MarketingReport> {
  const r: MarketingReport = {
    activeExperiment: 'T1 subject A/B: compliance-urgency vs discovery question',
    channelPriority: [
      'Email outbound (MSP owners, IT Directors)',
      'LinkedIn (CISOs, security managers, IT Directors)',
      'MSP partner program (ConnectWise/Datto community)',
      'Security conference sponsorship'
    ],
    recommendation: 'Post weekly LinkedIn compliance stat with free simulation CTA. Builds inbound pipeline without cold outreach friction.'
  }
  await rememberFact({ company_id:companyId, type:'campaign', key:`marketing_${Date.now()}`,
    value:JSON.stringify(r), confidence:0.85, source:'marketing_agent' })
  return r
}
