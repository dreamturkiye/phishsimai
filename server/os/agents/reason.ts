import { getSql } from '../conn'
import { llmComplete } from '../llmChat'
import { rememberFact } from '../memory'
import { queueJanetArchitectTask } from '../selfHeal'
import { ensureMarcusProposalBugId } from '../marcusProposal'
import { classifySelfModification, loadAgentRuntime, persistAgentRuntime } from '../agentRuntime'

const COMPANY = 'phishsimai'

/** Agents whose daily reason-loop may fire the Dex-gated warm trial CTA. */
export const CONVERSION_AGENTS = new Set(['janet', 'mason', 'aria'])

export type AgentDecision = {
    assessment: string
    action: string
    queued: boolean
    taskId: string | null
    converted?: boolean
    conversion?: { sent: number; blocked: number; skipped: number; reason?: string }
    provider?: string
    error?: string
}

/** Pure: Mason/Aria/Janet naming convert/trial/warm as the next action. */
export function wantsWarmConversion(agentId: string, action: string): boolean {
  if (!CONVERSION_AGENTS.has(agentId)) return false
  const a = String(action || '').trim()
  if (!a || /^none$/i.test(a)) return false
  return /convert_warm|warm (lead|cta|trial)|trial cta|hottest|30-day trial|no-card trial/i.test(a)
}

export async function reasonAndAct(
    agentId: string,
    report: unknown,
    systemPrompt: string,
  ): Promise<AgentDecision> {
    const sql = getSql()
    const memKey = `${agentId}_latest_reasoning`
    const runtime = await loadAgentRuntime(sql, COMPANY, agentId).catch(() => null)

  let priorNote = 'none (first run)'
    try {
          const prior = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY} AND type='operating' AND key=${memKey} LIMIT 1`
          if ((prior as any[])[0]?.value) priorNote = String((prior as any[])[0].value).slice(0, 600)
    } catch {}

  const reportJson = JSON.stringify(report, null, 0).slice(0, 4000)
  const runtimeBlock = runtime?.contextBlock ? `\n\n${runtime.contextBlock}` : ''

  try {
        const result = await llmComplete({
                messages: [
                  { role: 'system', content: systemPrompt + runtimeBlock },
                  {
                              role: 'user',
                              content:
                                            `Your last reflection: ${priorNote}\n\n` +
                                            `Today's real, measured data (do not invent anything beyond this):\n${reportJson}\n\n` +
                                            `Resume the OPEN THREAD next action unless today's data invalidates it.\n` +
                                            `Reply with ONLY a JSON object, no other text: {"assessment": "1-2 sentence honest read of the data", ` +
                                            `"action": "the single most useful next action, or literally the string none if nothing is actionable today", ` +
                                            `"queueTask": true or false -- true ONLY if a concrete task should be queued for the architect to build/fix, ` +
                                            `"taskTitle": "short imperative task title if queueTask is true, else empty string"}`,
                  },
                        ],
                max_tokens: 400,
                temperature: 0.3,
                response_format: { type: 'json_object' },
        })

      let parsed: any = {}
            try {
                    parsed = JSON.parse(result.text)
            } catch {
                    parsed = { assessment: result.text.slice(0, 300), action: 'none', queueTask: false, taskTitle: '' }
            }

      const assessment = String(parsed.assessment || 'no assessment produced').slice(0, 500)
        const action = String(parsed.action || 'none').slice(0, 300)
        const kind = classifySelfModification(action)
        const wantsTask = kind !== 'hard_stop' && !!parsed.queueTask && String(parsed.taskTitle || '').trim().length > 3

      let taskId: string | null = null
        if (wantsTask) {
                const proposal = String(parsed.taskTitle).slice(0, 200)
                const bugId = await ensureMarcusProposalBugId(sql, {
                  agentId,
                  proposal,
                })
                taskId = await queueJanetArchitectTask({
                          task: proposal,
                          bugId,
                          notes: `[${agentId} reasoning] ${assessment}`.slice(0, 500),
                          source: `agent:${agentId}`,
                          notify: false,
                }).catch(() => null)
        } else if (kind === 'marcus') {
                taskId = await queueJanetArchitectTask({
                          task: action.slice(0, 2000),
                          notes: `[${agentId} self-mod] ${assessment}`.slice(0, 500),
                          source: `agent:${agentId}`,
                          notify: false,
                }).catch(() => null)
        }

      let converted = false
      let conversion: AgentDecision['conversion']
      if (kind !== 'hard_stop' && wantsWarmConversion(agentId, action)) {
        const { runCgoConversionShift } = await import('../conversionEngine')
        const shift = await runCgoConversionShift({ cap: 8 }).catch(() => null)
        if (shift) {
          converted = shift.sent > 0
          conversion = { sent: shift.sent, blocked: shift.blocked, skipped: shift.skipped, reason: shift.reason }
        }
      }

      await rememberFact({
              company_id: COMPANY,
              type: 'operating',
              key: memKey,
              value: JSON.stringify({ assessment, action, queued: !!taskId, converted, conversion, ts: new Date().toISOString() }),
              confidence: 0.7,
              source: agentId,
      }).catch(() => {})

      await persistAgentRuntime(sql, COMPANY, agentId, {
              currentGoal: runtime?.working.currentGoal || `${agentId} daily mandate`,
              nextAction: action,
              lastAssessment: assessment,
              success: (action !== 'none' && kind !== 'hard_stop') || converted,
              lesson: conversion ? `convert_warm sent=${conversion.sent}` : assessment,
      }).catch(() => {})

      return { assessment, action, queued: !!taskId, taskId, converted, conversion, provider: result.provider }
  } catch (e: any) {
        const error = String(e?.message || e).slice(0, 300)
        return { assessment: 'reasoning unavailable', action: 'none', queued: false, taskId: null, error }
  }
}
