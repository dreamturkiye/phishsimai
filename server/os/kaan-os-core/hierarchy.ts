import type { AgentId, DepartmentId, HierarchyNode } from './types'

/**
 * L5 hierarchical org — Janet CEO supervisor, department heads, specialists, sub-teams.
 * LangGraph-style routing uses this tree for delegation.
 */
export const L5_HIERARCHY: HierarchyNode[] = [
  {
    id: 'janet',
    name: 'Janet',
    title: 'Chief Executive Officer (CGO)',
    role: 'ceo',
    subordinates: ['marcus', 'aria', 'nova', 'max', 'mason', 'rex', 'finn', 'vera', 'scout'],
    autonomy: 'L5',
    domains: ['company strategy', 'cross-department orchestration', 'founder interface', 'governance'],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    title: 'VP Engineering / Principal Architect',
    role: 'department',
    department: 'engineering',
    reportsTo: 'janet',
    subordinates: ['marcus-qa', 'marcus-security', 'marcus-infra'],
    autonomy: 'L5',
    domains: ['self-heal', 'architecture', 'deploy pipeline', 'proactive maintenance'],
  },
  {
    id: 'marcus-qa',
    name: 'Quinn',
    title: 'QA Automation Lead',
    role: 'sub_agent',
    department: 'engineering',
    reportsTo: 'marcus',
    subordinates: [],
    autonomy: 'L4',
    domains: ['qa-smoke', 'regression', 'heal-test probes'],
  },
  {
    id: 'marcus-security',
    name: 'Sage',
    title: 'Security Review Agent',
    role: 'sub_agent',
    department: 'engineering',
    reportsTo: 'marcus',
    subordinates: [],
    autonomy: 'L4',
    domains: ['auth', 'webhooks', 'dependency audit'],
  },
  {
    id: 'marcus-infra',
    name: 'Ivy',
    title: 'Infra & Deploy Agent',
    role: 'sub_agent',
    department: 'engineering',
    reportsTo: 'marcus',
    subordinates: [],
    autonomy: 'L4',
    domains: ['vercel', 'launchd watcher', 'env parity'],
  },
  {
    id: 'aria',
    name: 'Aria',
    title: 'VP Marketing (Department Supervisor)',
    role: 'department',
    department: 'growth',
    reportsTo: 'janet',
    subordinates: ['aria-content', 'aria-social'],
    autonomy: 'L5',
    domains: ['campaigns', 'brand', 'LinkedIn', 'A/B messaging'],
  },
  {
    id: 'aria-content',
    name: 'Cleo',
    title: 'Content Production Agent',
    role: 'sub_agent',
    department: 'growth',
    reportsTo: 'aria',
    subordinates: [],
    autonomy: 'L4',
    domains: ['copy', 'UGC scripts', 'email sequences'],
  },
  {
    id: 'aria-social',
    name: 'Sage-L',
    title: 'Social Distribution Agent',
    role: 'sub_agent',
    department: 'growth',
    reportsTo: 'aria',
    subordinates: [],
    autonomy: 'L4',
    domains: ['PostForMe', 'social queue', 'Reddit/LinkedIn'],
  },
  {
    id: 'nova',
    name: 'Nova',
    title: 'VP Product (Department Supervisor)',
    role: 'department',
    department: 'product',
    reportsTo: 'janet',
    subordinates: ['nova-onboarding', 'nova-experiments'],
    autonomy: 'L5',
    domains: ['PLG', 'activation', 'retention', 'feature experiments'],
  },
  {
    id: 'nova-onboarding',
    name: 'Ollie',
    title: 'Onboarding Optimization Agent',
    role: 'sub_agent',
    department: 'product',
    reportsTo: 'nova',
    subordinates: [],
    autonomy: 'L4',
    domains: ['funnels', 'signup flow', 'first-session'],
  },
  {
    id: 'nova-experiments',
    name: 'Echo',
    title: 'Experimentation Agent',
    role: 'sub_agent',
    department: 'product',
    reportsTo: 'nova',
    subordinates: [],
    autonomy: 'L5',
    domains: ['A/B tests', 'variant analysis', 'autonomous experiment rollout'],
  },
  {
    id: 'max',
    name: 'Max',
    title: 'Chief of Staff (Operations Supervisor)',
    role: 'department',
    department: 'operations',
    reportsTo: 'janet',
    subordinates: ['max-briefs', 'max-coordination'],
    autonomy: 'L5',
    domains: ['founder briefs', 'cross-team coordination', 'priority triage'],
  },
  {
    id: 'max-briefs',
    name: 'Blake',
    title: 'Executive Briefing Agent',
    role: 'sub_agent',
    department: 'operations',
    reportsTo: 'max',
    subordinates: [],
    autonomy: 'L4',
    domains: ['daily standup synthesis', 'weekly review packs'],
  },
  {
    id: 'max-coordination',
    name: 'River',
    title: 'Cross-Team Coordination Agent',
    role: 'sub_agent',
    department: 'operations',
    reportsTo: 'max',
    subordinates: [],
    autonomy: 'L4',
    domains: ['conflict resolution', 'dependency tracking'],
  },
  {
    id: 'mason',
    name: 'Mason',
    title: 'Senior Sales Director',
    role: 'specialist',
    department: 'revenue',
    reportsTo: 'janet',
    subordinates: [],
    autonomy: 'L4',
    domains: ['outbound', 'pipeline', 'sequences'],
  },
  {
    id: 'rex',
    name: 'Rex',
    title: 'Revenue Operations Manager',
    role: 'specialist',
    department: 'revenue',
    reportsTo: 'janet',
    subordinates: [],
    autonomy: 'L4',
    domains: ['CRM', 'lead scoring', 'pipeline hygiene'],
  },
  {
    id: 'finn',
    name: 'Finn',
    title: 'CFO',
    role: 'specialist',
    department: 'revenue',
    reportsTo: 'janet',
    subordinates: [],
    autonomy: 'L1',
    domains: ['MRR', 'forecasting', 'unit economics'],
  },
  {
    id: 'vera',
    name: 'Vera',
    title: 'VP Customer Success',
    role: 'specialist',
    department: 'growth',
    reportsTo: 'janet',
    subordinates: [],
    autonomy: 'L4',
    domains: ['onboarding CS', 'churn', 'expansion'],
  },
  {
    id: 'scout',
    name: 'Scout',
    title: 'Head of Market Intelligence',
    role: 'specialist',
    department: 'growth',
    reportsTo: 'janet',
    subordinates: [],
    autonomy: 'L1',
    domains: ['research', 'ICP', 'competitive intel'],
  },
]

const byId = new Map(L5_HIERARCHY.map(n => [n.id, n]))

export function getHierarchyNode(id: string): HierarchyNode | undefined {
  return byId.get(id)
}

export function getDepartmentSupervisor(dept: DepartmentId): HierarchyNode | undefined {
  return L5_HIERARCHY.find(n => n.role === 'department' && n.department === dept)
}

export function getCeoNode(): HierarchyNode {
  return byId.get('janet')!
}

export function getDirectReports(supervisorId: AgentId | string): HierarchyNode[] {
  const sup = byId.get(supervisorId)
  if (!sup) return []
  return sup.subordinates.map(id => byId.get(id)).filter(Boolean) as HierarchyNode[]
}

export function hierarchyPromptBlock(): string {
  const lines = ['L5 ORG HIERARCHY (authoritative for delegation):']
  for (const n of L5_HIERARCHY) {
    if (n.role === 'ceo') {
      lines.push(`- ${n.name} (${n.title}) [${n.autonomy}] — top supervisor`)
    } else if (n.role === 'department') {
      lines.push(`- ${n.name} (${n.title}) → reports to ${n.reportsTo} [${n.autonomy}] — supervises: ${n.subordinates.join(', ')}`)
    }
  }
  lines.push('Delegate to department supervisors first; they route to sub-agents. Marcus owns all code/deploy.')
  return lines.join('\n')
}
