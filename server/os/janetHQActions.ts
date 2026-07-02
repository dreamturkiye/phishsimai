/**
 * Janet HQ post-processing — queue Marcus tasks and block false deploy claims.
 */
import { getSql } from './conn'
import { queueJanetArchitectTask } from './selfHeal'
import { getWatcherHeartbeatAgeMinutes, ARCHITECT_TABLE } from './marcusPipelineHealth'

export type ArchitectPipelineStatus = {
  queued: number
  running: number
  doneRecent: number
  lastDone: { task: string; updated_at: string; commit_sha?: string } | null
  watcherAgeMin?: number | null
}

const COMPLETION_CLAIM_RE =
  /\b(deployed|deployment (is )?complete|it(?:'s| is) (done|live|fixed)|changes (are |have been )?live|marcus (confirmed|deployed|fixed|completed)|live and accurate|already (deployed|fixed|on vercel)|double-checked with marcus)\b/i

const CODE_INTENT_RE =
  /\b(fix|deploy|build|clear|zero(?:ed)? out|reset|dashboard|hq|code|marcus|architect|bug|implement|change the|update the|remove the fake|incorrect (mrr|metrics|numbers))\b/i

function normalizeArchitectTask(task: string): string {
  return task.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').replace(/\s+/g, ' ').trim()
}

function isValidArchitectTask(task: string): boolean {
  const t = task.trim()
  return t.length >= 12 && !/^\*+$/.test(t) && !/^[\W_]+$/.test(t) && !/^(n\/a|none|todo|tbd)$/i.test(t)
}

export function extractArchitectTasks(text: string): string[] {
  const tasks: string[] = []
  const seen = new Set<string>()
  const blockRe = /ARCHITECT_TASK:\s*([\s\S]*?)(?=\n\n|\n#{1,3}\s|\n[A-Z][A-Z\s]{3,}:|$)/gi
  for (const match of text.matchAll(blockRe)) {
    const lines = match[1].trim().split('\n').map(l => l.trim()).filter(Boolean)
    const task = normalizeArchitectTask(lines.join(' '))
    if (isValidArchitectTask(task) && !seen.has(task.toLowerCase())) {
      seen.add(task.toLowerCase())
      tasks.push(task)
    }
  }
  return tasks
}

export async function getArchitectPipelineStatus(companyId: string): Promise<ArchitectPipelineStatus> {
  const sql = getSql()
  const rows = await sql`
    SELECT status, count(*)::int as n FROM os_architect_tasks
    WHERE created_at > NOW() - INTERVAL '14 days' GROUP BY status
  `.catch(() => [] as { status: string; n: number }[])

  const byStatus = Object.fromEntries((rows as any[]).map(r => [r.status, r.n])) as Record<string, number>
  const active = ['queued', 'pending', 'approved', 'running']
  const queued = active.reduce((s, k) => s + (byStatus[k] || 0), 0)
  const running = (byStatus.running || 0) + (byStatus.approved || 0)

  const doneRows = await sql`
    SELECT task, updated_at, commit_sha FROM os_architect_tasks
    WHERE status = 'done' AND updated_at > NOW() - INTERVAL '48 hours'
    ORDER BY updated_at DESC LIMIT 1
  `.catch(() => [])

  const doneRecent = await sql`
    SELECT count(*)::int as n FROM os_architect_tasks
    WHERE status = 'done' AND updated_at > NOW() - INTERVAL '48 hours'
  `.catch(() => [{ n: 0 }])

  const last = (doneRows as any[])[0]
  const watcherAgeMin = await getWatcherHeartbeatAgeMinutes(companyId)
  return {
    queued, running,
    doneRecent: Number((doneRecent as any[])[0]?.n || 0),
    lastDone: last ? { task: String(last.task), updated_at: String(last.updated_at), commit_sha: last.commit_sha || undefined } : null,
    watcherAgeMin,
  }
}

function synthesizeArchitectTask(founderMessage: string): string | null {
  const m = founderMessage.trim()
  if (!CODE_INTENT_RE.test(m) || m.length < 8) return null
  return normalizeArchitectTask(`FOUNDER REQUEST: ${m.slice(0, 500)}`)
}

function claimsCompletion(response: string): boolean {
  return COMPLETION_CLAIM_RE.test(response)
}

function honestQueuedReply(taskPreview: string, pipeline: ArchitectPipelineStatus): string {
  const short = taskPreview.slice(0, 120)
  if (pipeline.running > 0) {
    return `Kaan — Marcus is actively working on this (${pipeline.running} in progress). No verified prod deploy yet — check HQ → Architect Log. Latest: "${short}".`
  }
  return `Kaan — queued Marcus now. Pipeline: dev → preview QA → prod → prod QA. Not deployed until Architect Log shows done + commit. Task: "${short}".`
}

function honestNotDoneReply(pipeline: ArchitectPipelineStatus): string {
  if (pipeline.lastDone) {
    return `Kaan — I cannot confirm that deploy yet. Last verified completion: ${pipeline.lastDone.updated_at}. Check Architect Log or refresh HQ metrics. I will not claim "deployed" without proof.`
  }
  return `Kaan — no verified Marcus deploy in the last 48h. I will queue Marcus for code changes — track in Architect Log until status is done.`
}

export type ProcessJanetHQResult = {
  response: string
  architectTasksQueued: string[]
  completionClaimBlocked: boolean
  pipeline: ArchitectPipelineStatus
}

export async function processJanetHQResponse(
  founderMessage: string,
  janetResponse: string,
  companyId: string,
): Promise<ProcessJanetHQResult> {
  const pipeline = await getArchitectPipelineStatus(companyId)
  const architectTasksQueued: string[] = []
  let response = janetResponse.trim()
  let completionClaimBlocked = false

  for (const task of extractArchitectTasks(response)) {
    const id = await queueJanetArchitectTask({ task, notes: `Janet HQ chat → Marcus (${companyId})` })
    if (id) architectTasksQueued.push(task)
  }

  if (architectTasksQueued.length === 0 && CODE_INTENT_RE.test(founderMessage)) {
    const synthesized = synthesizeArchitectTask(founderMessage)
    if (synthesized && isValidArchitectTask(synthesized)) {
      const id = await queueJanetArchitectTask({
        task: synthesized,
        notes: `Janet HQ chat — auto-queued from founder directive (${companyId})`,
      })
      if (id) architectTasksQueued.push(synthesized)
    }
  }

  if (claimsCompletion(response)) {
    const hasRecentProof = pipeline.doneRecent > 0 && architectTasksQueued.length === 0
    if (!hasRecentProof) {
      completionClaimBlocked = true
      response = architectTasksQueued.length > 0
        ? honestQueuedReply(architectTasksQueued[0], pipeline)
        : honestNotDoneReply(pipeline)
    }
  } else if (architectTasksQueued.length > 0 && !/queued|architect log|not deployed|dev → qa/i.test(response)) {
    response = `${response}\n\n(Marcus queued — HQ → Architect Log. Not deployed until status shows done.)`
  }

  response = response.replace(/ARCHITECT_TASK:\s*[\s\S]*?(?=\n\n|$)/gi, '').trim()
  return { response, architectTasksQueued, completionClaimBlocked, pipeline }
}

export function architectStatusForPrompt(pipeline: ArchitectPipelineStatus): string {
  const watcherLine = pipeline.watcherAgeMin == null
    ? '- Mac watcher: no heartbeat — tasks will not deploy until launchd runs'
    : pipeline.watcherAgeMin <= 20
      ? `- Mac watcher: alive (${Math.round(pipeline.watcherAgeMin)}m ago)`
      : `- Mac watcher: STALE (${Math.round(pipeline.watcherAgeMin)}m ago)`
  return [
    'MARCUS / ARCHITECT PIPELINE (authoritative — never contradict):',
    `- Queued: ${pipeline.queued} | In progress: ${pipeline.running} | Done (48h): ${pipeline.doneRecent}`,
    watcherLine,
    'Deploy path: dev → preview QA → prod → prod QA (Mac watcher, every 10m).',
    'RULES: Never say Marcus deployed unless Last verified deploy matches this request.',
    'For code fixes: QUEUE Marcus via ARCHITECT_TASK — never invent completion.',
  ].join('\n')
}
