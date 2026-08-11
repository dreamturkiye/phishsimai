import { getSql } from '../conn'
import { llmComplete } from '../llmChat'
import { rememberFact } from '../memory'
import { queueJanetArchitectTask } from '../selfHeal'

const COMPANY = 'phishsimai'

export type AgentDecision = {
    assessment: string
    action: string
    queued: boolean
    taskId: string | null
    provider?: string
    error?: string
}

export async function reasonAndAct(
    agentId: string,
    report: unknown,
    systemPrompt: string,
  ): Promise<AgentDecision> {
    const sql = getSql()
    const memKey = `${agentId}_latest_reasoning`

  let priorNote = 'none (first run)'
    try {
          const prior = await sql`SELECT value FROM janet_memory WHERE company_id=${COMPANY} AND type='operating' AND key=${memKey} LIMIT 1`
          if ((prior as any[])[0]?.value) priorNote = String((prior as any[])[0].value).slice(0, 600)
    } catch {}

  const reportJson = JSON.stringify(report, null, 0).slice(0, 4000)

  try {
        const result = await llmComplete({
                messages: [
                  { role: 'system', content: systemPrompt },
                  {
                              role: 'user',
                              content:
                                            `Your last reflection: ${priorNote}\n\n` +
                                            `Today's real, measured data (do not invent anything beyond this):\n${reportJson}\n\n` +
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
        const wantsTask = !!parsed.queueTask && String(parsed.taskTitle || '').trim().length > 3

      let taskId: string | null = null
        if (wantsTask) {
                taskId = await queueJanetArchitectTask({
                          task: String(parsed.taskTitle).slice(0, 200),
                          notes: `[${agentId} reasoning] ${assessment}`.slice(0, 500),
                          source: `agent:${agentId}`,
                }).catch(() => null)
        }

      await rememberFact({
              company_id: COMPANY,
              type: 'operating',
              key: memKey,
              value: JSON.stringify({ assessment, action, queued: !!taskId, ts: new Date().toISOString() }),
              confidence: 0.7,
              source: agentId,
      }).catch(() => {})

      return { assessment, action, queued: !!taskId, taskId, provider: result.provider }
  } catch (e: any) {
        const error = String(e?.message || e).slice(0, 300)
        return { assessment: 'reasoning unavailable', action: 'none', queued: false, taskId: null, error }
  }
}
