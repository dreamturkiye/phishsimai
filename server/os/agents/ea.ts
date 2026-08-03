export interface EAReport { priorityActions:string[]; blockers:string[]; decisionsNeeded:string[] }

export async function runEAAgent(sales:any, finance:any, product:any, companyId='phishsimai'): Promise<EAReport> {
  const p: string[] = [], b: string[] = [], d: string[] = []
  if (sales.replyRate===0 && sales.touched>=5) p.push('A/B test: compliance-urgency subject line vs discovery question')
  if (finance.customers===0) {
    // PS-JANET-DOCTRINE-01: proposed a $49/mo rate that exists in no Stripe account. An agent may
    // not invent a discount; pricing is frozen and only Kaan changes it.
    p.push('Close the first paying MSP at list price — pricing is FROZEN (Starter $149 / Growth $299 / Pro $749 / Enterprise $1,499). No discount or founding rate may be offered.')
    d.push('Any pricing change (discounts, founding rates, trials beyond the standard 30 days) is a Kaan decision — do not propose numbers.')
  }
  p.push('Review architect task: MSP white-label portal (unlocks entire MSP channel)')
  d.push('Approve architect task: MSP white-label portal')
  d.push('LinkedIn content cadence: weekly compliance stat posts — approve?')
  if (finance.customers===0) b.push('No paying customers — top priority this week')
  if (sales.replyRate===0 && sales.touched>=10) b.push('No replies after 10+ sends — copy or targeting needs adjustment')
  return { priorityActions:p, blockers:b, decisionsNeeded:d }
}
