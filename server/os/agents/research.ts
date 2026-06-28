import { rememberFact } from '../memory'

export interface ResearchReport {
  icpNote:string; leadOpportunities:string[]; competitors:string[]
}

export async function runResearchAgent(companyId='phishsimai'): Promise<ResearchReport> {
  const competitors = [
    'KnowBe4: enterprise $30+/user/yr, no AI templates, complex setup. Our edge: 10-min setup, MSP pricing, AI-generated',
    'Proofpoint: $50K+ contracts, no SMB tier. Our edge: self-serve, white-label, SMB-ready',
    'Cofense: manual campaigns, dated UI. Our edge: fully automated, AI-generated templates',
    'Hoxhunt: Euro-centric, no MSP program. Our edge: MSP partner program, US focus'
  ]
  const icpNote = 'Highest LTV ICP: MSP owners with 50-500 managed seats + compliance pressure. 1 MSP = 10-100x LTV of direct SMB buyer.'
  for (const c of competitors) {
    const name = c.split(':')[0].toLowerCase().replace(/\s/g,'_')
    await rememberFact({ company_id:companyId, type:'strategic', key:`competitor_${name}`,
      value:c, confidence:0.9, source:'research_agent' })
  }
  return {
    icpNote, competitors,
    leadOpportunities: [
      'LinkedIn: MSP owner + managed services — 50K+ US/UK decision makers',
      'ConnectWise/Datto community forums — captive MSP audience already buying security',
      'G2 reviews of KnowBe4 — active buyers looking for alternatives',
      'CompTIA channel partner list — verified MSPs with contact info'
    ]
  }
}
