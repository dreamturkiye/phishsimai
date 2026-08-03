export interface EAReport { priorityActions:string[]; blockers:string[]; decisionsNeeded:string[] }

export async function runEAAgent(sales:any, finance:any, product:any, companyId='phishsimai'): Promise<EAReport> {
  const p: string[] = [], b: string[] = [], d: string[] = []
  // PS-FINN-01 (in passing): this proposed the compliance-urgency angle — the exact framing the
  // permanent lesson phishsim:insurance-angle-failed retired after 908 sends produced 1 hostile
  // reply. An agent must not propose a doctrine-forbidden angle. Messaging is Aria's; she holds the
  // current best outreach and the reason the old angle is dead.
  if (sales.replyRate===0 && sales.touched>=5) p.push('Ask Aria for the current best outreach — do NOT reopen the compliance/insurance angle (retired: 908 sends, 1 hostile reply)')
  if (finance.customers===0) {
    // PS-JANET-DOCTRINE-01: proposed a $49/mo rate that exists in no Stripe account. An agent may
    // not invent a discount; pricing is frozen and only Kaan changes it.
    p.push('Close the first paying MSP at list price — pricing is FROZEN (Starter $149 / Growth $299 / Pro $749 / Enterprise $1,499). No discount or founding rate may be offered.')
    d.push('Any pricing change (discounts, founding rates, trials beyond the standard 30 days) is a Kaan decision — do not propose numbers.')
  }
  // PS-NOVA-01: this named a feature from the deleted hardcoded backlog and called it channel-
  // unlocking with nothing measured. Product priority is Nova's, derived from activation drop-off.
  p.push('Ask Nova which product work is ranked by measured activation drop-off — do not assert a priority without one')

  d.push('LinkedIn content cadence: weekly compliance stat posts — approve?')
  if (finance.customers===0) b.push('No paying customers — top priority this week')
  if (sales.replyRate===0 && sales.touched>=10) b.push('No replies after 10+ sends — copy or targeting needs adjustment')
  return { priorityActions:p, blockers:b, decisionsNeeded:d }
}
