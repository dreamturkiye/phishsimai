export interface EAReport { priorityActions:string[]; blockers:string[]; decisionsNeeded:string[] }

export async function runEAAgent(sales:any, finance:any, product:any, companyId='phishsimai'): Promise<EAReport> {
  const p: string[] = [], b: string[] = [], d: string[] = []
  if (sales.replyRate===0 && sales.touched>=5) p.push('A/B test: compliance-urgency subject line vs discovery question')
  if (finance.customers===0) {
    p.push('Offer founding MSP rate $49/mo — close first 3 clients for testimonials')
    d.push('Founding pricing: $49 vs $99/mo for first 3 months?')
  }
  p.push('Review architect task: MSP white-label portal (unlocks entire MSP channel)')
  d.push('Approve architect task: MSP white-label portal')
  d.push('LinkedIn content cadence: weekly compliance stat posts — approve?')
  if (finance.customers===0) b.push('No paying customers — top priority this week')
  if (sales.replyRate===0 && sales.touched>=10) b.push('No replies after 10+ sends — copy or targeting needs adjustment')
  return { priorityActions:p, blockers:b, decisionsNeeded:d }
}
