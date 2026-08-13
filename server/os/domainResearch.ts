// PS-SME-01: closes the "current best practices" gap (founder-directed, 2026-08-13, part of
// #1/#2/#3/#4: agents as SMEs, self-learning, autonomous, and acting — not just reporting).
//
// Grounds an agent's self-originated domain work in REAL, CURRENT external data instead of pure
// LLM internal knowledge (which has a training cutoff and cannot know what changed this month).
// Uses Tavily (same provider SF's Scout already uses for market observation) with a per-company
// daily budget, tracked in janet_memory exactly like the existing budget pattern.
//
// FAILS OPEN TO THE STATUS QUO, NOT CLOSED: if TAVILY_API_KEY is unset or the budget is spent,
// this returns null and the caller falls back to the existing generic domain-default task text
// (PS-OWNERSHIP-02) — zero regression, zero new failure mode. Ships safely today; activates
// automatically the moment a working key exists. NOTE (2026-08-13): PhishSim's own Vercel env has
// no TAVILY_API_KEY at all today (verified); ScrollFuel's TAVILY_API_KEY exists but is an EMPTY
// placeholder (verified) — this capability is built and wired but currently inert on BOTH products
// until a real key is provisioned. That is a founder action, not something Claude can self-serve
// (creating a Tavily account/key is outside Claude's permitted actions).
import { getSql } from './conn'
import { llmComplete } from './llmChat'
import { learnFromOutcome } from './kaan-os-core/outcomeLearning'
import { COMPANY_ID } from './version'

const TAVILY_URL = 'https://api.tavily.com/search'
const DAILY_BUDGET = Number(process.env.TAVILY_DAILY_BUDGET) || 20

export function webResearchEnabled(): boolean {
  return !!process.env.TAVILY_API_KEY?.trim()
}

async function withinBudget(sql: ReturnType<typeof getSql>, companyId: string): Promise<boolean> {
  const date = new Date().toISOString().slice(0, 10)
  const key = `tavily_calls_${date}`
  try {
    const rows = (await sql`SELECT value FROM janet_memory WHERE company_id=${companyId} AND type='operating' AND key=${key}`) as { value: string }[]
    const cur = Number(rows[0]?.value || 0)
    if (cur >= DAILY_BUDGET) return false
    await sql`INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
      VALUES (${companyId}, 'operating', ${key}, ${String(cur + 1)}, 1, 'domain_research')
      ON CONFLICT (company_id, type, key) DO UPDATE SET value=${String(cur + 1)}`.catch(() => {})
    return true
  } catch {
    return true // DB hiccup on the budget check must not block research; Tavily's own error handling covers real failures
  }
}

export interface ResearchResult {
  summary: string
  sources: { title: string; url: string }[]
}

/**
 * Research CURRENT best practice in an agent's domain. Returns null if search is unconfigured,
 * over budget, or genuinely finds nothing usable — callers must treat null as "fall back to the
 * existing generic task", never as an error to surface.
 */
export async function researchCurrentBestPractice(
  agentId: string,
  domain: string,
  title: string,
  companyId: string = COMPANY_ID,
): Promise<ResearchResult | null> {
  const key = process.env.TAVILY_API_KEY?.trim()
  if (!key) return null
  const sql = getSql()
  if (!(await withinBudget(sql, companyId))) return null

  let sources: { title: string; url: string; content: string }[] = []
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: `${domain} best practices August 2026`,
        max_results: 5,
        search_depth: 'advanced',
        include_answer: false,
        topic: 'news',
        days: 60,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    sources = (data?.results || []).map((r: any) => ({ title: r.title, url: r.url, content: r.content }))
  } catch {
    return null
  }
  if (!sources.length) return null

  let summary = ''
  try {
    const r = await llmComplete({
      messages: [
        {
          role: 'system',
          content:
            `You are ${title}, an SME in ${domain}. Summarize the single most actionable, current ` +
            'insight from these search results as ONE concrete sentence you would apply to your work ' +
            'today. Be specific and concrete, not generic advice. If nothing here is genuinely new or ' +
            'actionable, say exactly "NOTHING_ACTIONABLE".',
        },
        {
          role: 'user',
          content: sources.map((s) => `- ${s.title}: ${s.content.slice(0, 300)}`).join('\n'),
        },
      ],
      max_tokens: 200,
    })
    summary = (r.text || '').trim()
  } catch {
    return null
  }
  if (!summary || summary.includes('NOTHING_ACTIONABLE')) return null

  const result: ResearchResult = { summary, sources: sources.slice(0, 3).map((s) => ({ title: s.title, url: s.url })) }

  // Compound into the EXISTING reflection store, tagged distinctly from outcome-based lessons —
  // this is external knowledge, not a result of the agent's own actions.
  // 'source' stays 'agent_task' (the default) rather than a new enum value: outcomeLearning.ts is
  // a PINNED copy of the canonical kaan-os-core package here and must never be edited directly in
  // this repo (CI's check-core-drift enforces this). The lesson TEXT prefix + signature already
  // distinguish this as external research, which is all that's needed to compound it correctly.
  await learnFromOutcome(sql, companyId, {
    agentId,
    success: true,
    lesson: `[current best practice, ${new Date().toISOString().slice(0, 10)}] ${summary}`,
    signature: `${agentId}:web_research:${new Date().toISOString().slice(0, 10)}`,
  }).catch(() => {})

  return result
}
