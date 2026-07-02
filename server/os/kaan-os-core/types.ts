/** Kaan AI OS v5.0 — shared types for all product editions */

export type AutonomyLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export type AgentId =
  | 'janet'
  | 'marcus'
  | 'mason'
  | 'aria'
  | 'nova'
  | 'rex'
  | 'scout'
  | 'finn'
  | 'vera'
  | 'max'

export type SupervisorRole = 'ceo' | 'department' | 'specialist' | 'sub_agent'

export type DepartmentId =
  | 'engineering'
  | 'growth'
  | 'product'
  | 'revenue'
  | 'operations'

export type ProductId = 'scrollfuel' | 'phishsimai' | 'vellachat' | string

export interface ProductOsConfig {
  productId: ProductId
  companyId: string
  label: string
  baseUrl: string
  hqSecret: string
  devBranch: string
  prodBranch: string
  vercelProject: string
  architectTable: 'architect_tasks' | 'os_architect_tasks'
  routes: {
    architectPending: string
    architectWake: string
    architectCode: string
    architectComplete: string
    bugReport: string
    hqChat: string
    janetSignedUrl: string
    janetTool: string
    wiring: string
    healTestArm: string
  }
  janetAgentEnvKey: string
  repoPath: string
}

export interface HierarchyNode {
  id: AgentId | string
  name: string
  title: string
  role: SupervisorRole
  department?: DepartmentId
  reportsTo?: AgentId | string
  subordinates: string[]
  autonomy: AutonomyLevel
  domains: string[]
}

export interface SupervisorGraphState {
  runId: string
  companyId: string
  productId: ProductId
  goal: string
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'supervisor'; content: string; agentId?: string }>
  pendingTasks: Array<{ agentId: string; task: string; priority: 'critical' | 'high' | 'medium' | 'low' }>
  reflections: string[]
  status: 'planning' | 'delegating' | 'executing' | 'reflecting' | 'done' | 'failed'
  auditLog: GovernanceAuditEntry[]
}

export interface GovernanceAuditEntry {
  at: string
  actor: string
  action: string
  detail: string
  verified?: boolean
}

export interface SkillRecord {
  skillId: string
  source: 'architect_memory' | 'agent_task' | 'experiment' | 'manual'
  signature: string
  description: string
  confidence: number
  embeddingHint?: string
  timesUsed: number
  lastUsedAt?: string
}

export interface WiringFeatureL5 {
  id: string
  label: string
  ok: boolean
  detail?: string
  required: boolean
}

export interface CrossCompanyTask {
  id: string
  sourceProduct: ProductId
  targetProducts: ProductId[]
  kind: 'incident' | 'pattern' | 'experiment' | 'maintenance'
  payload: string
  createdAt: string
}
