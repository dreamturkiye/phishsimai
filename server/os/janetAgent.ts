// server/os/janetAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Janet's agentic loop — INCREMENT 1: investigate → reason → converse.
//
// Why this exists: janetChat() used to take ONE pre-computed snapshot and answer in a
// single shot — she could not decide to go investigate. This gives her a ReAct-style
// loop so she can call tools mid-conversation, verify claims against real data, and
// answer grounded (the way a real CGO — or Claude — works).
//
// Model-portable: llmComplete has no native function-calling and Janet routes across
// Gemini/Groq/Ollama, so we use a plain JSON tool protocol the model emits as text.
//
// SAFETY: this increment ships READ-ONLY investigate tools. Act-tools (dispatch Marcus,
// resolve decisions, adjust sequences) land next, behind the OS-level hard-stops (7.5).
// janetChat() calls runJanetAgent() first and falls back to the legacy one-shot on ANY
// error — so this can only improve Janet, never regress her.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { llmComplete } from './llmChat'
import { getJanetOpsSnapshot } from './janetOpsSnapshot'
import { recallContext } from './memory'
import { queueJanetArchitectTask } from './selfHeal'

type Tool = {
  name: string
  description: string
  run: (args: Record<string, any>, companyId: string) => Promise<string>
}

const TOOLS: Tool[] = [
  {
    name: 'marcus_status',
    description:
      'Verify whether Marcus (the autonomous engineer) is working end-to-end: recent architect-task outcomes, current autonomy level, and any stuck or failed tasks. Use for any "is Marcus working / did it ship / what is Marcus doing" question.',
    run: async (_args, companyId) => {
      const sql = getSql()
      try {
        const counts: any[] = await sql`
          SELECT status, count(*)::int AS n, max(updated_at) AS last
          FROM os_architect_tasks WHERE company_id = ${companyId}
          GROUP BY status ORDER BY n DESC`
        const recent: any[] = await sql`
          SELECT left(task, 90) AS task, status, left(coalesce(notes,''), 100) AS notes, updated_at
          FROM os_architect_tasks WHERE company_id = ${companyId}
          ORDER BY updated_at DESC NULLS LAST LIMIT 8`
        let level = 'unknown'
        try {
          const a: any[] = await sql`SELECT level FROM os_autonomy_state WHERE company_id = ${companyId} LIMIT 1`
          level = a[0]?.level ?? 'unknown'
        } catch { /* level optional */ }
        const countTxt =
          counts.map((r) => `${r.status}: ${r.n}${r.last ? ` (last ${new Date(r.last).toISOString().slice(0, 16)})` : ''}`).join('; ') ||
          'no architect tasks on record'
        const recentTxt =
          recent.map((r) => `• [${r.status}] ${r.task}${r.notes ? ` — ${r.notes}` : ''}`).join('\n') || 'none'
        return `Marcus autonomy level: ${level}\nTask outcomes: ${countTxt}\nMost recent tasks:\n${recentTxt}`
      } catch (e: any) {
        return `marcus_status unavailable: ${e?.message || e}`
      }
    },
  },
  {
    name: 'ops_snapshot',
    description:
      'Live operating snapshot: current metrics, agent health, pipeline/funnel numbers, breaker states. Use for "how are we doing", revenue, funnel, outreach, or health questions.',
    run: async (_args, companyId) => {
      try {
        const snap = await getJanetOpsSnapshot(companyId)
        return snap?.text || 'ops snapshot unavailable'
      } catch (e: any) {
        return `ops_snapshot unavailable: ${e?.message || e}`
      }
    },
  },
  {
    name: 'search_memory',
    description:
      'Recall prior context, prior decisions, and founder directives from memory. Use to check "what did we decide / what did Kaan ask before / have we tried this".',
    run: async (_args, companyId) => {
      try {
        const ctx = await recallContext(companyId, 25)
        return ctx || 'no memory found'
      } catch (e: any) {
        return `search_memory unavailable: ${e?.message || e}`
      }
    },
  },
  // ── ACT TOOLS (JAN-AGENT-02) ───────────────────────────────────────────────
  // Safe by construction: dispatch_marcus goes through queueJanetArchitectTask, which already
  // enforces the autonomy gate + Marcus circuit breaker, and Marcus's own gates (destructive
  // diff / CI / dev+prod QA / auto-revert) protect prod. create_decision only writes an
  // escalation row. The OS 7.5 hard-stops (pricing/billing/spend/legal) are enforced upstream
  // and are deliberately NOT in Janet's tool surface.
  {
    name: 'dispatch_marcus',
    description:
      'Queue Marcus (the autonomous engineer) to make a code fix or build. Use when the founder asks for something that requires code to change or ship (e.g. "the homepage image is broken - fix it"). Give ONE clear, scoped, single-purpose task. arg: task (string).',
    run: async (args, _companyId) => {
      const task = String((args && args.task) || '').trim()
      if (task.length < 12) return 'dispatch_marcus needs a clear task description in the "task" arg.'
      try {
        const id = await queueJanetArchitectTask({ task, source: 'janet_agent', notes: 'Queued by Janet from founder conversation' })
        return id
          ? `Marcus task queued (id ${id}). It lands via dev -> QA -> prod; not deployed until status shows done (HQ -> Architect Log).`
          : 'Could not queue Marcus: autonomy gate denied or the circuit breaker is open (recent failures). No task was created.'
      } catch (e: any) {
        return `dispatch_marcus failed: ${e?.message || e}`
      }
    },
  },
  {
    name: 'create_decision',
    description:
      'Record a strategic decision that needs founder sign-off, so it appears in HQ and can be discussed later. Use for pivots or choices you should not make alone. args: title (string), detail (string), recommendation (string, optional).',
    run: async (args, companyId) => {
      const title = String((args && args.title) || '').trim()
      const detail = String((args && args.detail) || '').trim()
      const recommendation = String((args && args.recommendation) || '').trim()
      if (!title) return 'create_decision needs a "title".'
      try {
        const sql = getSql()
        const rows: any[] = await sql`
          INSERT INTO escalations (product_id, category, payload, status)
          VALUES (${companyId}, 'founder_decision', ${JSON.stringify({ title, detail, recommendation })}::jsonb, 'pending')
          RETURNING id`
        return `Decision recorded (id ${rows[0]?.id || '?'}) - pending your sign-off in HQ.`
      } catch (e: any) {
        return `create_decision failed: ${e?.message || e}`
      }
    },
  },
]

function toolCatalog(): string {
  return TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n')
}

const AGENT_PROTOCOL = `
You can INVESTIGATE before answering, using tools. This is how you verify claims against real
data instead of guessing — a real CGO checks before she speaks.

TOOLS AVAILABLE:
${toolCatalog()}

OUTPUT FORMAT — every message you produce MUST be a single JSON object and nothing else:
• To use a tool:   {"thought":"<one line: why>","tool":"<tool_name>","args":{}}
• To answer Kaan:  {"final":"<your answer>"}

Rules:
- If Kaan asks anything you can verify (is Marcus working end-to-end? how is the funnel? what did
  we decide?), CALL A TOOL FIRST. Do not answer from assumption.
- You may chain several tool calls before answering — investigate, then reason, then answer.
- When you have enough evidence, return {"final": ...} with a direct, grounded answer that cites
  the actual numbers and facts you found. Keep it tight and decision-useful. You are the CGO.
- If a question needs no data (a greeting, a definition), you may answer with {"final": ...} directly.
- TO DO SOMETHING (fix or ship code, queue Marcus, record a decision) you MUST call the matching
  act-tool: dispatch_marcus to queue an engineering fix, create_decision to log a decision. You
  CANNOT perform these yourself — only the tool does. Calling the tool is the ONLY way the action
  actually happens.
- NEVER claim an engineering task is "done", "complete", or "already fixed" from your own words,
  and NEVER invent a task id. dispatch_marcus returns the real task id and status "queued" — report
  exactly that ("Marcus is queued — not deployed until it shows done"). Fabricating a completion or
  an id is a serious error that misleads the founder.
`.trim()

function extractJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Run Janet's investigate→reason→answer loop. Returns the final answer text.
 * Read-only in this increment. Caller (janetChat) falls back to the one-shot path on throw.
 */
export async function runJanetAgent(
  message: string,
  history: { role: string; text: string }[],
  companyId: string,
  systemBase: string,
): Promise<{ text: string; steps: number; tools: string[] }> {
  const MAX_STEPS = 5
  const usedTools: string[] = []
  const convo: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.slice(-6).map((m) => ({ role: (m.role === 'janet' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text })),
    { role: 'user', content: message },
  ]
  const system = `${systemBase}\n\n${AGENT_PROTOCOL}`

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await llmComplete({
      messages: [{ role: 'system', content: system }, ...convo],
      max_tokens: 700,
      temperature: 0.4,
    })
    const parsed = extractJson(res.text)
    if (!parsed) return { text: (res.text || '').trim(), steps: step + 1, tools: usedTools }
    if (parsed.final != null) return { text: String(parsed.final).trim(), steps: step + 1, tools: usedTools }
    if (parsed.tool) {
      const tool = TOOLS.find((t) => t.name === parsed.tool)
      const result = tool
        ? await tool.run(parsed.args || {}, companyId).catch((e: any) => `tool error: ${e?.message || e}`)
        : `unknown tool "${parsed.tool}" — valid tools: ${TOOLS.map((t) => t.name).join(', ')}`
      if (tool) usedTools.push(tool.name)
      convo.push({ role: 'assistant', content: JSON.stringify({ tool: parsed.tool, args: parsed.args || {} }) })
      convo.push({ role: 'user', content: `TOOL RESULT (${parsed.tool}):\n${result}` })
      continue
    }
    return { text: (parsed.answer || res.text || '').toString().trim(), steps: step + 1, tools: usedTools }
  }

  // Step cap hit — force a grounded final answer from what was gathered.
  const finalRes = await llmComplete({
    messages: [
      { role: 'system', content: `${system}\n\nYou have investigated enough. Respond NOW with {"final":"<answer>"} only.` },
      ...convo,
    ],
    max_tokens: 500,
    temperature: 0.4,
  })
  const parsed = extractJson(finalRes.text)
  return {
    text: (parsed?.final || finalRes.text || 'I could not complete the investigation cleanly — try asking again.').toString().trim(),
    steps: MAX_STEPS,
    tools: usedTools,
  }
}
