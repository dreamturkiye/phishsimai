import { runLeadResearcher, runLeadDiscover } from './agents/leadResearcher'
import { runFullSequence } from './sequences'
import { runJanetFullOrchestration } from './agents/kaan_os_v4'

export const HEALABLE_OPS_AGENTS = ['researcher', 'discover', 'aria', 'janet'] as const

export const EXPECTED_OPS_AGENTS: Record<string, Record<string, number>> = {
  phishsimai: {
    researcher: 90 * 60 * 1000,
    discover: 7 * 60 * 60 * 1000,
    aria: 26 * 60 * 60 * 1000,
    janet: 26 * 60 * 60 * 1000,
    watchdog: 2 * 60 * 60 * 1000,
    heartbeat: 2 * 60 * 60 * 1000,
    agent_watchdog: 60 * 60 * 1000,
  },
}

export function getExpectedOpsAgents(companyId: string): Record<string, number> {
  return EXPECTED_OPS_AGENTS[companyId] || EXPECTED_OPS_AGENTS.phishsimai
}

export async function healOpsAgent(agentName: string, companyId: string): Promise<string> {
  switch (agentName) {
    case 'researcher': {
      const r = await runLeadResearcher(6)
      return `discovered=${r.discovered} added=${r.added} enriched=${r.enriched}`
    }
    case 'discover': {
      const r = await runLeadDiscover(8)
      return `discovered=${r.discovered} candidates=${r.candidates}`
    }
    case 'aria': {
      const r = await runFullSequence()
      return `sent=${r.sent ?? 0} paused=${!!(r as any).paused}`
    }
    case 'janet': {
      const r = await runJanetFullOrchestration(companyId)
      return `tasks_executed=${r.pending_tasks_executed}`
    }
    default:
      return 'no auto-heal handler'
  }
}
