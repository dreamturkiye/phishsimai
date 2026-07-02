/** Product adapter — PhishSimAI L5 autonomy hooks */
import { runJanetProactiveCycle } from './kaan-os-core/janetProactive'
import { advanceLongTermStrategies } from './kaan-os-core/janetStrategy'
import { runMarcusProactiveScan } from './kaan-os-core/marcusProactive'
import { queueJanetArchitectTask } from './selfHeal'
import { issueTask, type AgentId } from './agents/kaan_os_v4'
import { getSql } from './conn'

export async function runL5JanetCycle(companyId = 'phishsimai', productId = companyId) {
  const sql = getSql()
  const [proactive, strategies] = await Promise.all([
    runJanetProactiveCycle(sql as any, companyId, productId, {
      queueArchitectTask: (task, notes) =>
        queueJanetArchitectTask({ task, notes, notify: false }).catch(() => null),
      issueAgentTask: async (agentId: AgentId, title, description) => {
        await issueTask(agentId, { agent_id: agentId, title, description, priority: 'high', due_in_hours: 48 }, companyId)
      },
    }),
    advanceLongTermStrategies(sql as any, companyId, productId),
  ])
  return { proactive, strategies }
}

export async function runL5MarcusScan(companyId = 'phishsimai') {
  const sql = getSql()
  return runMarcusProactiveScan(sql as any, companyId, 'os_architect_tasks', (task, notes) =>
    queueJanetArchitectTask({ task, notes, notify: false }).catch(() => null),
  )
}
