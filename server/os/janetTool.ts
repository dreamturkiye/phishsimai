/**
 * ElevenLabs ConvAI webhook tools — Janet fetches live company data mid-call.
 */
import { getJanetOpsSnapshot } from './janetOpsSnapshot'
import { getNextSarahLinkedInPreview } from './social/sarahLinkedIn'
import { talkToAgent, AGENTS, type AgentId } from './agents/kaan_os_v4'

const EMPLOYEE_IDS = Object.keys(AGENTS).filter((id) => id !== 'janet') as AgentId[]

function resolveEmployeeId(name: string): AgentId | null {
  const n = name.toLowerCase().trim()
  const hit = (Object.keys(AGENTS) as AgentId[]).find(
    (id) => id === n || AGENTS[id].name.toLowerCase() === n
  )
  return hit || null
}

export async function handleJanetToolCall(
  toolName: string,
  params: Record<string, unknown> = {},
  companyId = 'phishsimai'
): Promise<Record<string, unknown>> {
  if (toolName === 'get_live_ops' || toolName === 'get_company_ops') {
    const ops = await getJanetOpsSnapshot(companyId)
    return {
      ok: true,
      ops_context: ops.text,
      generated_at: ops.generatedAt,
      sarah_linkedin: ops.sarahLinkedIn,
      sarah_reddit: ops.sarahReddit,
      open_alerts: ops.openAlerts,
    }
  }

  if (toolName === 'get_sarah_linkedin_preview') {
    const preview = await getNextSarahLinkedInPreview()
    return {
      ok: true,
      status: preview.status,
      hook: preview.hook,
      body: preview.body,
      hashtags: preview.hashtags,
      scheduled_at: preview.scheduledAt || null,
      preview_url: preview.previewUrl || null,
      blocker: preview.blocker || null,
      summary: preview.previewUrl
        ? `Preview link: ${preview.previewUrl} — Hook: ${preview.hook}`
        : preview.blocker
          ? `LinkedIn blocked: ${preview.blocker}. Draft hook: ${preview.hook}`
          : `Next LinkedIn post (${preview.status}): "${preview.hook}"`,
    }
  }

  if (toolName === 'ask_employee') {
    const employee = String(params.employee || params.name || '').trim()
    const question = String(params.question || params.message || 'Status update for Kaan').trim()
    const agentId = resolveEmployeeId(employee)
    if (!agentId) {
      return {
        ok: false,
        error: `Unknown employee "${employee}". Team: ${EMPLOYEE_IDS.map((id) => AGENTS[id].name).join(', ')}`,
      }
    }
    const reply = await talkToAgent(agentId, question, companyId, true)
    return {
      ok: true,
      employee: reply.agent,
      response: reply.response,
      timestamp: reply.timestamp,
    }
  }

  return { ok: false, error: `Unknown tool: ${toolName}` }
}
