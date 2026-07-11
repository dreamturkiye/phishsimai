/** Product adapter — PhishSimAI L5 autonomy hooks */
import { runJanetProactiveCycle } from './kaan-os-core/janetProactive'
import { advanceLongTermStrategies } from './kaan-os-core/janetStrategy'
import { runMarcusProactiveScan } from './kaan-os-core/marcusProactive'
import { runIntelFinanceProactiveCycle } from './kaan-os-core/intelligenceFinance'
import { queueJanetArchitectTask } from './selfHeal'
import { issueTask, runJanetFullOrchestration, type AgentId } from '../lib/kaan_os_v4'
import { getSql } from './conn'
import { isAutonomyDenied } from './autonomyGate'

// A single autonomous write the cycle attempted that the gate refused.
export interface GateDenial { action: 'issue_agent_task' | 'queue_architect_task'; target: string; reason: string }

// The three proactive sub-cycles, injectable so the cycle is unit-testable
// without live LLM/DB. Defaults are the real product cycles.
export interface L5CycleDeps {
  runJanetProactiveCycle: typeof runJanetProactiveCycle
  advanceLongTermStrategies: typeof advanceLongTermStrategies
  runIntelFinanceProactiveCycle: typeof runIntelFinanceProactiveCycle
}
const defaultL5Deps: L5CycleDeps = {
  runJanetProactiveCycle,
  advanceLongTermStrategies,
  runIntelFinanceProactiveCycle,
}

export interface L5CycleResult {
  proactive: unknown
  strategies: unknown
  intelFinance: unknown
  gateDenials: GateDenial[]
  gateDeniedCount: number
}

export async function runL5JanetCycle(
  companyId = 'phishsimai',
  productId = companyId,
  deps: L5CycleDeps = defaultL5Deps,
): Promise<L5CycleResult> {
  const sql = getSql()
  const gateDenials: GateDenial[] = []

  const issueAgentTask = async (agentId: AgentId, title: string, description: string) => {
    // Loop no-op under the autonomy gate: at 'manual', issueTask throws
    // AutonomyDenied (audited) BEFORE any insert. Swallow it and record the
    // denial so the cycle continues instead of crashing the cron; a non-gate
    // error (e.g. a real DB failure) still propagates.
    try {
      await issueTask(agentId, { agent_id: agentId, title, description, priority: 'high', due_in_hours: 48 }, companyId)
    } catch (e) {
      if (isAutonomyDenied(e)) {
        gateDenials.push({ action: 'issue_agent_task', target: agentId, reason: e.reason })
        console.warn(`[autonomy] issueAgentTask(${agentId}) denied — logged no-op (${e.reason})`)
        return
      }
      throw e
    }
  }

  const queueArchitectTask = async (task: string, notes?: string) => {
    // queueJanetArchitectTask self-swallows AutonomyDenied and returns null at
    // 'manual' (before any insert). A null here is a gate-denied no-op.
    const id = await queueJanetArchitectTask({ task, notes, notify: false }).catch(() => null)
    if (id === null) {
      gateDenials.push({ action: 'queue_architect_task', target: task.slice(0, 80), reason: 'denied_or_null' })
    }
    return id
  }

  const [proactive, strategies, intelFinance] = await Promise.all([
    deps.runJanetProactiveCycle(sql as any, companyId, productId, { queueArchitectTask, issueAgentTask }),
    deps.advanceLongTermStrategies(sql as any, companyId, productId),
    deps.runIntelFinanceProactiveCycle(sql as any, companyId, issueAgentTask),
  ])
  return { proactive, strategies, intelFinance, gateDenials, gateDeniedCount: gateDenials.length }
}

// ── Daily CGO cron body (used by cronJanetCgo) ───────────────────────────────
// Runs the existing standup orchestration AND the L5 CGO cycle, each wrapped so
// no failure crashes the cron. Returns a plain summary; NEVER throws. deps are
// injectable for tests.
export interface JanetCgoDeps {
  orchestrate?: (companyId: string) => Promise<any>
  runL5?: (companyId: string) => Promise<L5CycleResult>
}

export interface JanetCgoSummary {
  ok: boolean
  ran: string[]
  orchestration: any
  l5: any
  gateDeniedCount: number
  errors: string[]
}

export async function buildJanetCgoSummary(
  companyId = 'phishsimai',
  deps: JanetCgoDeps = {},
): Promise<JanetCgoSummary> {
  const orchestrate = deps.orchestrate ?? runJanetFullOrchestration
  const runL5 = deps.runL5 ?? ((c: string) => runL5JanetCycle(c))
  const summary: JanetCgoSummary = {
    ok: true, ran: [], orchestration: null, l5: null, gateDeniedCount: 0, errors: [],
  }

  // 1. Existing standup / full orchestration.
  try {
    summary.orchestration = await orchestrate(companyId)
    summary.ran.push('orchestration')
  } catch (e: any) {
    summary.errors.push(`orchestration: ${String(e?.message).slice(0, 200)}`)
  }

  // 2. NEW: the L5 CGO cycle — dark by code. runL5JanetCycle swallows
  //    AutonomyDenied internally and returns a denial summary; we still guard
  //    against any other sub-cycle error so the cron survives and returns 200.
  try {
    const l5 = await runL5(companyId)
    summary.ran.push('l5_janet_cycle')
    summary.gateDeniedCount = l5.gateDeniedCount
    summary.l5 = { ran: true, gateDeniedCount: l5.gateDeniedCount, gateDenials: l5.gateDenials }
  } catch (e: any) {
    summary.l5 = { ran: false, autonomyDenied: isAutonomyDenied(e), error: String(e?.message).slice(0, 200) }
    summary.errors.push(`l5: ${String(e?.message).slice(0, 200)}`)
  }

  summary.ok = summary.errors.length === 0
  return summary
}

export async function runL5MarcusScan(companyId = 'phishsimai') {
  const sql = getSql()
  return runMarcusProactiveScan(sql as any, companyId, 'os_architect_tasks', (task, notes) =>
    queueJanetArchitectTask({ task, notes, notify: false }).catch(() => null),
  )
}
