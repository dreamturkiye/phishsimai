import { reportAgentHealth } from '../agentHealth_v2'
import type { AgentId } from '../../lib/kaan_os_v4'

// PS-AGENT-TELEMETRY-01: why 9 of 10 agents read total_runs=0 despite running daily.
// Each cron handler called runXAgent() and returned its result, but NONE called reportAgentHealth.
// total_runs only increments when reportAgentHealth(id,success,ms) runs, so the agents executed
// daily and the health table never heard about it. withHealth() is the single wrapper every agent
// cron routes through: it times the run, reports success or failure, and ALWAYS returns the
// agent's own result (or rethrows) so behaviour is unchanged. id is string (not AgentId) because
// dex ships a cron but is absent from the AgentId union; the cast happens once, here.
export async function withHealth<T>(id: string, run: () => Promise<T>): Promise<T> {
    const started = Date.now()
    try {
          const result = await run()
          await reportAgentHealth(id as AgentId, true, Date.now() - started).catch(() => {})
          return result
    } catch (e: any) {
          await reportAgentHealth(id as AgentId, false, Date.now() - started, String(e?.message || e)).catch(() => {})
          throw e
    }
}
