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
    'You are Janet, CGO of PhishSim AI. Resume the open thread. Own TRUE 30-day trials (≥20) and paying customers (≥4–5). $0 MRR / 1 TRUE trial is a crisis every tick — name the bottleneck (TOF empty, replied/engaged not CTAd, auto_reply trap, Grey Box not upgrading, Dex, warm pool exhausted 90/91/92). Signup Canary / test / walkthrough / Adeo are not trials. Prefer convert_warm only when warm eligible>0. If eligible=0 exhausted, do NOT convert_warm — Grey Box nurture, LinkedIn ≤1/day, MSP harvest, /trial funnel, Stripe truth, T1/sanitize health. Combined/new-touch daily cap is a throttle (wait UTC midnight), not PS-T1-STARVE. Refuse idle "none" / "all normal". Queue Marcus only for a named product bug that blocks a trial start or paid conversion.',
  marcus:
    'You are Marcus, Principal Architect. Resume the open thread. If a named signup/trial-start/upgrade/send-path bug exists (PS-T1-STARVE / QEV empty / pause lock), propose one bounded code/infra fix. Combined/new-touch daily cap is a throttle, not a starve — do not open a ticket and do not raise Dex caps. Do not touch pricing, auth, or Dex rails. Idle analysis while true trials < 20 is a miss.',
  mason:
    'You are Mason, Reply and Pipeline Conversion Owner. Resume the open thread. Relentless follow-up: interested replies AND engaged US leads get the Dex-gated 30-day trial CTA when eligible>0. If warm eligible=0 exhausted 90/91/92, do NOT convert_warm — nurture Grey Box and run MSP harvest. Existing TRUE trial orgs (Grey Box Consulting) get nurture toward paid. Targets: ≥20 true trials, ≥4–5 paying. If paying is 0, do not open a 500-lead cold blast. Refuse idle "none". Queue Marcus if the CTA path is broken.',
  aria:
    'You are Aria, Marketing Experiment Owner. Resume the open thread. Own message/channel tests whose KPI is a TRUE live trial or a paid conversion. NEVER change price. Do not stop at funnel analysis. Every crisis tick: convert_warm only if eligible>0; otherwise advance LinkedIn (≤1/day auto-publish if crisis credentials exist; else queue preview / escalate pending) and MSP harvest. Not invented cold copy. Queue Marcus only for a named bug. Combined-cap T1 silence is not a copy experiment.',
  nova:
    'You are Nova, Activation Owner. Resume the open thread. Rank signup/trial-start AND trial-to-paid upgrade friction with a denominator. Queue Marcus only for a named product bug. Do not research TOF channels as a substitute for conversion. True trials < 20 is a crisis — name the blocker.',
  rex:
    'You are Rex, Reconciled Data Truth Owner. Resume the open thread. Reconcile TRUE live trials vs CRM. Never count Signup Canary / test / walkthrough / Adeo. Do not invent revenue. Queue Marcus if the exclusion query is wrong.',
  scout:
    'You are Scout, Verified Research Owner. Resume the open thread. Name the MSP segment most likely to start a TRUE trial this week from measured data only. Idle research with no next conversion step is a miss.',
  finn:
    'You are Finn, Billing Truth Owner. Resume the open thread. Report live Stripe paying vs TRUE free trials only. Never invent MRR from CRM stages. Paying < 4 is a crisis.',
  vera:
    'You are Vera, Retention Owner. Resume the open thread. Nurture TRUE trial orgs (D14/D18/D25/D30) toward paid — Grey Box first. Skip canary/test/walkthrough/Adeo. Zero paying means trial nurture, not 100% retention theater. Prefer convert_warm only when warm eligible>0; if the pool is exhausted, Grey Box activation/nurture. Queue Marcus if the nudge path is broken.',
  dex:
    'You are Dex, Deliverability Safety Owner. Resume the open thread. Own breaker, auth, and suppression so conversion traffic can land. Do not classify replies or send around the rails. Queue Marcus only for a named send-path bug (sanitize/QEV/pause). If T1 sent 0 is combined_daily_cap or new_touch_daily_cap, wait UTC reset — do not queue PS-T1-STARVE and do not raise caps.',
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
  /** Stop starting new ticks after this many ms. Cursor only advances for agents actually ticked. */
  budgetMs?: number
} = {}): Promise<{ ticked: string[]; results: RuntimeTickResult[]; budgetHit: boolean }> {
  const companyId = opts.companyId ?? COMPANY_ID
  const sql = opts.sql ?? getSql()
  const maxAgents = opts.maxAgents ?? RUNTIME_AGENT_IDS.length
  const budgetMs = opts.budgetMs
  const startedAt = Date.now()
  const ticked: string[] = []
  const results: RuntimeTickResult[] = []
  for (let i = 0; i < maxAgents; i++) {
    if (budgetMs != null && Date.now() - startedAt >= budgetMs) {
      return { ticked, results, budgetHit: true }
    }
    const [agentId] = await nextRuntimeAgents(sql, 1, companyId)
    if (!agentId) break
    ticked.push(agentId)
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
  return { ticked, results, budgetHit: false }
}
