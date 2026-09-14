/**
 * L5.7 continuous runtime — Janet + nine workers.
 *
 * Meanings (from in-repo design, not invented):
 *   Persistent memory  — os_agent_working_state + lessons/reflections (agentRuntime.ts,
 *                        KAAN_AI_OS 7.10 §E agent scope).
 *   Self-modification  — change the open thread and/or queue Marcus; never price/Dex rails
 *                        (agentRuntimePolicy.classifySelfModification).
 *   Continuous operation — 7.10 §H hourly subsidiary cycle + PhishSim task-runner (every 10 min).
 *                        This module is the shared tick both crons call.
 */
import { AGENT_IDS } from '@kaan/os-core'
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { ensureMemoryTable } from './memory'
import { reasonAndAct, type AgentDecision } from './agents/reason'
import { loadAgentRuntime } from './agentRuntime'

export const RUNTIME_AGENT_IDS = [...AGENT_IDS] as const
export const RUNTIME_TICK_CURSOR_KEY = 'agent_runtime_tick_cursor'

export const RUNTIME_PROMPTS: Record<(typeof RUNTIME_AGENT_IDS)[number], string> = {
  janet:
    'You are Janet, CGO of PhishSim AI. Resume the open thread. Own verified 30-day trials and paid MRR. Prefer convert_warm on replied/engaged leads. Queue Marcus only for a named product bug.',
  marcus:
    'You are Marcus, Principal Architect. Resume the open thread. Propose one bounded code/infra fix if a named bug exists. Do not touch pricing, auth, or Dex rails.',
  mason:
    'You are Mason, Reply and Pipeline Conversion Owner. Resume the open thread. Interested replies get the Dex-gated 30-day trial CTA. Existing free-trial orgs get nurture toward paid. If paying is 0, do not open a 500-lead cold blast. Prefer convert_warm. If the reply queue is empty, say so and still fire convert_warm on hottest sendable leads.',
  aria:
    'You are Aria, Marketing Experiment Owner. Resume the open thread. Own message/channel tests whose KPI is a live trial or a paid conversion from an existing trial. NEVER change price. Do not stop at funnel analysis.',
  nova:
    'You are Nova, Activation Owner. Resume the open thread. Rank signup/trial-start AND trial-to-paid upgrade friction with a denominator. Queue Marcus only for a named product bug. Do not research TOF channels as a substitute for conversion.',
  rex:
    'You are Rex, Reconciled Data Truth Owner. Resume the open thread. Reconcile live trials vs CRM. Do not invent revenue.',
  scout:
    'You are Scout, Verified Research Owner. Resume the open thread. Name the MSP segment most likely to start a trial this week from measured data only.',
  finn:
    'You are Finn, Billing Truth Owner. Resume the open thread. Report live Stripe only. Never invent MRR from CRM stages.',
  vera:
    'You are Vera, Retention Owner. Resume the open thread. Zero paying customers means trial nurture (D14/D25/D30) toward paid, not 100% retention theater.',
  dex:
    'You are Dex, Deliverability Safety Owner. Resume the open thread. Own breaker, auth, and suppression. Do not classify replies or send around the rails.',
}

export type RuntimeTickResult = {
  agentId: string
  decision: AgentDecision
}

export async function nextRuntimeAgents(sql: any, n: number, companyId = COMPANY_ID): Promise<string[]> {
  await ensureMemoryTable().catch(() => {})
  const count = Math.max(1, Math.min(RUNTIME_AGENT_IDS.length, Math.floor(n)))
  const rows = (await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${RUNTIME_TICK_CURSOR_KEY}
    LIMIT 1
  `.catch(() => [])) as Array<{ value?: string }>
  const last = String(rows[0]?.value || '')
  const start = Math.max(0, RUNTIME_AGENT_IDS.indexOf(last as (typeof RUNTIME_AGENT_IDS)[number]))
  const offset = last && start >= 0 ? (start + 1) % RUNTIME_AGENT_IDS.length : 0
  const picked: string[] = []
  for (let i = 0; i < count; i++) picked.push(RUNTIME_AGENT_IDS[(offset + i) % RUNTIME_AGENT_IDS.length])
  const cursor = picked[picked.length - 1]
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', ${RUNTIME_TICK_CURSOR_KEY}, ${cursor}, 1, 'runtime_tick')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `.catch(() => {})
  return picked
}

export async function tickAgentRuntime(agentId: string, companyId = COMPANY_ID): Promise<AgentDecision> {
  const sql = getSql()
  const runtime = await loadAgentRuntime(sql, companyId, agentId).catch(() => null)
  const prompt = RUNTIME_PROMPTS[agentId as keyof typeof RUNTIME_PROMPTS] || RUNTIME_PROMPTS.janet
  const report = {
    agentId,
    working: runtime?.working ?? { currentGoal: '', nextAction: 'none', lastAssessment: '' },
    hasOpenThread: Boolean(runtime?.working.nextAction && runtime.working.nextAction !== 'none'),
  }
  return reasonAndAct(agentId, report, prompt)
}

export async function tickAllAgentRuntimes(opts: {
  maxAgents?: number
  companyId?: string
  sql?: any
} = {}): Promise<{ ticked: string[]; results: RuntimeTickResult[] }> {
  const companyId = opts.companyId ?? COMPANY_ID
  const sql = opts.sql ?? getSql()
  const maxAgents = opts.maxAgents ?? RUNTIME_AGENT_IDS.length
  const ids = await nextRuntimeAgents(sql, maxAgents, companyId)
  const results: RuntimeTickResult[] = []
  for (const agentId of ids) {
    try {
      results.push({ agentId, decision: await tickAgentRuntime(agentId, companyId) })
    } catch (e: any) {
      results.push({
        agentId,
        decision: {
          assessment: 'tick failed',
          action: 'none',
          queued: false,
          taskId: null,
          error: String(e?.message || e).slice(0, 200),
        },
      })
    }
  }
  return { ticked: ids, results }
}
