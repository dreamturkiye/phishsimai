import { getCeoNode, getDirectReports, getHierarchyNode } from './hierarchy'
import { appendGovernanceAudit } from './governance'
import type { ProductId, SupervisorGraphState } from './types'

export type GraphNodeId = 'ceo' | 'route_dept' | 'delegate' | 'execute' | 'reflect' | 'complete'

export type SupervisorGraphOptions = {
  maxReflections?: number
  onDelegate?: (state: SupervisorGraphState, agentId: string, task: string) => Promise<void>
}

/**
 * LangGraph-style supervisor loop in TypeScript (no external graph runtime).
 * Janet (CEO) → department supervisor → specialist/sub-agent → reflect → done.
 */
export class SupervisorGraph {
  private state: SupervisorGraphState
  private opts: SupervisorGraphOptions

  constructor(
    companyId: string,
    productId: ProductId,
    goal: string,
    opts: SupervisorGraphOptions = {},
  ) {
    this.opts = opts
    this.state = {
      runId: `sg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      companyId,
      productId,
      goal,
      messages: [],
      pendingTasks: [],
      reflections: [],
      status: 'planning',
      auditLog: [],
    }
  }

  getState(): SupervisorGraphState {
    return { ...this.state, messages: [...this.state.messages], pendingTasks: [...this.state.pendingTasks] }
  }

  /** Plan: CEO analyzes goal and picks department supervisors */
  async plan(): Promise<SupervisorGraphState> {
    this.state.status = 'planning'
    const ceo = getCeoNode()
    this.state.messages.push({
      role: 'supervisor',
      agentId: ceo.id,
      content: `CEO ${ceo.name} planning for: ${this.state.goal}`,
    })
    appendGovernanceAudit(this.state, 'janet', 'plan_start', this.state.goal)

    const keywords = this.state.goal.toLowerCase()
    const departments: string[] = []

    if (/fix|bug|deploy|code|architect|dashboard|hq|metric|marcus/i.test(keywords)) {
      departments.push('marcus')
    }
    if (/market|campaign|linkedin|content|aria|social/i.test(keywords)) {
      departments.push('aria')
    }
    if (/product|onboard|experiment|a\/b|nova|feature|retention/i.test(keywords)) {
      departments.push('nova')
    }
    if (/priorit|brief|coordination|max|standup|focus/i.test(keywords)) {
      departments.push('max')
    }
    if (/sales|pipeline|outbound|mason/i.test(keywords)) {
      departments.push('mason')
    }
    if (departments.length === 0) {
      departments.push('max')
    }

    for (const deptId of departments) {
      const node = getHierarchyNode(deptId)
      if (!node) continue
      const task = `[${node.title}] ${this.state.goal}`
      this.state.pendingTasks.push({ agentId: deptId, task, priority: 'high' })
    }

    this.state.status = 'delegating'
    appendGovernanceAudit(this.state, 'janet', 'plan_delegated', departments.join(', '))
    return this.getState()
  }

  /** Delegate pending tasks to department supervisors (and sub-agents) */
  async delegate(): Promise<SupervisorGraphState> {
    this.state.status = 'executing'
    for (const t of this.state.pendingTasks) {
      const sup = getHierarchyNode(t.agentId)
      if (!sup) continue
      this.state.messages.push({
        role: 'supervisor',
        agentId: t.agentId,
        content: `Delegated: ${t.task}`,
      })
      if (this.opts.onDelegate) {
        await this.opts.onDelegate(this.state, t.agentId, t.task)
      }
      for (const subId of sup.subordinates.slice(0, 2)) {
        const sub = getHierarchyNode(subId)
        if (!sub) continue
        this.state.messages.push({
          role: 'assistant',
          agentId: subId,
          content: `Sub-agent ${sub.name} acknowledged: ${t.task.slice(0, 120)}`,
        })
      }
    }
    return this.getState()
  }

  /** Reflection loop — supervisors review outcomes; may re-delegate on failure signal */
  async reflect(notes: string): Promise<SupervisorGraphState> {
    this.state.status = 'reflecting'
    const max = this.opts.maxReflections ?? 3
    this.state.reflections.push(notes)
    appendGovernanceAudit(this.state, 'janet', 'reflect', notes.slice(0, 200))

    const failed = /\bfail(ed|ure)?|incorrect|retry|miss(ed)?|below bar\b/i.test(notes)
    if (failed && this.state.reflections.length < max) {
      appendGovernanceAudit(this.state, 'janet', 'self_correct', 'Re-delegating after failed reflection')
      this.state.status = 'delegating'
      await this.delegate()
      return this.reflect('Self-correction pass completed.')
    }

    this.state.status = 'done'
    return this.getState()
  }

  /** Full run: plan → delegate → reflect */
  async run(reflectionNotes = 'L5 graph completed initial delegation.'): Promise<SupervisorGraphState> {
    await this.plan()
    await this.delegate()
    await this.reflect(reflectionNotes)
    appendGovernanceAudit(this.state, 'janet', 'graph_complete', `runId=${this.state.runId}`)
    return this.getState()
  }
}

export function routeGoalToSupervisors(goal: string): string[] {
  const g = new SupervisorGraph('temp', 'scrollfuel', goal)
  void g.plan()
  return g.getState().pendingTasks.map(t => t.agentId)
}

export function ceoDirectReportsBlock(): string {
  const reports = getDirectReports('janet')
  return reports.map(r => `- ${r.name}: ${r.title} (${r.domains.slice(0, 2).join(', ')})`).join('\n')
}
