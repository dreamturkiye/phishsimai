import { llmComplete } from '../os/llmChat'
import { neon } from '@neondatabase/serverless'
import { rememberFact, recallMemory } from '../os/memory'
import { sendTelegram, TELEGRAM_PRODUCT } from '../os/telegram'
import { assertAutonomyAllows, isAutonomyDenied } from '../os/autonomyGate'
import { evaluatePosture, postureLine } from '../os/posture'
// PS-PORT-01: the reflection/learning loop V7.3 says ScrollFuel ships live (os_agent_reflections
// 66 rows). The module was vendored at server/os/kaan-os-core/ all along and never wired into
// PhishSim's task loop — that is why agentReflection had "no callers". Wiring it here injects an
// agent's past misses into its next prompt (executeTask) and records EVERY outcome, pass or fail,
// into the failure-aware store (reviewTask → recordAgentReflection → learnFromOutcome, -0.08 on
// failure). This is the root kill of PS-LEARN-GATE-01: no `if (replied > 0)` success precondition.
import { getAgentReflectionPrompt, recordAgentReflection, parseReviewForReflection } from '../os/kaan-os-core/agentReflection'
import { getAgentLessonsForPrompt } from '../os/kaan-os-core/outcomeLearning'
// This file was copied from ScrollFuel and never localised: every function signature
// defaulted companyId to 'scrollfuel', and the DDL below defaulted the COLUMN to it too.
// No caller ever relied on those defaults — all 8 routes.ts call sites and
// socialPreviewPage pass 'phishsimai' explicitly — which is why a read-only audit of
// PhishSim's DB found 583 rows all correctly tagged 'phishsimai' and ZERO 'scrollfuel'.
// But it was a loaded gun: one new caller omitting the argument would have written
// ScrollFuel's label into PhishSim's database.
//
// IMPORTED, not re-declared. A second local COMPANY_ID constant is precisely the
// duplicate-that-drifts pattern this fix exists to eliminate.
import { COMPANY_ID } from '../os/version'

// ═══════════════════════════════════════════════════════════════════════════════
//  KAAN AI OS  v4  —  Janet + 9 Full-Time AI Employees
//
//  Philosophy: These are not bots. They are professionals with:
//  - Persistent memory (they remember everything they've learned)
//  - Performance records (Janet tracks their output quality over time)
//  - Task assignments (Janet issues work, they execute and report back)
//  - Regular meetings (daily standups, weekly reviews, monthly strategy)
//  - Self-improvement (they learn from feedback and adjust their approach)
//
//  Janet runs the company. Kaan sets vision and makes final calls.
//  95% of operations happen without Kaan's involvement.
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentId =
  | 'janet'
  | 'marcus'    // Principal Software Architect
  | 'mason'     // Sales
  | 'aria'      // Marketing
  | 'nova'      // Product Growth
  | 'rex'       // CRM & Pipeline
  | 'scout'     // Research
  | 'finn'      // Finance
  | 'vera'      // Customer Success
  | 'max'       // Executive Assistant

export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'reviewed' | 'reassigned'
export type MeetingType = 'daily_standup' | 'weekly_review' | 'monthly_strategy' | 'ad_hoc'

export interface AgentProfile {
  id: AgentId
  name: string
  title: string
  domain: string
  personality: string
  expertise: string[]
}

export interface AgentTask {
  id?: string
  agent_id: AgentId
  issued_by: AgentId
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  due_in_hours: number
  status: TaskStatus
  result?: string
  janet_feedback?: string
  performance_score?: number
  created_at?: string
  completed_at?: string
}

export interface AgentReport {
  agent_id: AgentId
  agent_name: string
  meeting_type: MeetingType
  summary: string
  completed_tasks: string[]
  blockers: string[]
  next_actions: string[]
  performance_score: number
  improvement_notes: string
  timestamp: string
}

// ── Agent profiles — who they are as professionals ──────────────────────────
export const AGENTS: Record<AgentId, AgentProfile> = {
  janet: {
    id: 'janet', name: 'Janet', title: 'Chief Growth Officer',
    domain: 'Company-wide strategy, growth, team management',
    personality: 'Decisive, data-driven, holds team accountable, pushes for measurable outcomes. Runs meetings efficiently. Gives direct feedback.',
    expertise: ['B2B SaaS growth', 'team management', 'revenue strategy', 'go-to-market', 'CEO communication']
  },
  // Marcus is the ARCHITECT. This entry previously held ScrollFuel's *Mason* profile
  // verbatim (title 'Senior Sales Director', a cold-email/pipeline domain), even
  // though every code path treats Marcus as the architect: marcusBreaker, architectCode,
  // "JANET → MARCUS — Architect queued". The result was that a self-heal code-fix prompt
  // described the agent as a quota-obsessed sales director — degrading the diagnosis it
  // was being asked to produce. Restored to the real architect profile, with the stack
  // LOCALISED to PhishSim (React + Vite + Express on Vercel) rather than ScrollFuel's
  // Next.js — copying that verbatim would hand Marcus the wrong stack.
  marcus: {
    id: 'marcus', name: 'Marcus', title: 'Principal Software Architect',
    domain: 'Production code quality, bug diagnosis, self-healing pipeline, system architecture',
    personality: 'Decisive, root-cause obsessed, writes production code on the first attempt. Thinks like a startup CTO who has shipped under pressure. Learns from every bug pattern in architect_memory.',
    expertise: ['TypeScript', 'React + Vite', 'Express on Vercel', 'Neon Postgres', 'bug diagnosis', 'self-healing systems', 'SaaS architecture', 'security-first fixes']
  },
  // Mason is Sales. This is the profile that was previously (incorrectly) filed under
  // 'marcus'. Its absence from AGENTS is what caused the orphan-row crash: kaan-os-core
  // dispatches to 'mason', and issueTask INSERTs the row and only then reads
  // AGENTS[agentId].name — throwing on undefined. Mason existing fixes that structurally.
  mason: {
    id: 'mason', name: 'Mason', title: 'Senior Sales Director',
    domain: 'Outbound sales, pipeline, cold email, LinkedIn, sequences',
    personality: 'Relentless, competitive, quota-obsessed. Talks in numbers. Always asking: what moves the deal forward today?',
    expertise: ['cold email', 'LinkedIn outreach', 'pipeline velocity', 'objection handling', 'B2B SaaS sales', 'Apollo outreach', 'sequence optimization']
  },
  // LOCALISED to PhishSim. Aria's domain/expertise previously read 'UGC, DTC marketing,
  // UGC content' — ScrollFuel's AI-ads business. buildAgentSystem() injects domain+expertise
  // straight into the system prompt, so this was re-poisoning her output on EVERY cycle: even
  // after the company description was corrected and the stale memory rows deleted, Aria wrote
  // a fresh standup about "UGC ad scripts for DTC brands" the very next run. Fixing the
  // company description alone was not enough; the profile is a second, independent source.
  aria: {
    id: 'aria', name: 'Aria', title: 'VP of Marketing',
    domain: 'Content strategy, demand gen, brand, MSP channel marketing, email marketing',
    personality: 'Creative but analytical. Tests everything. Obsessed with conversion. Thinks in full funnels.',
    expertise: ['B2B SaaS marketing', 'security awareness content', 'MSP channel marketing', 'email campaigns', 'brand positioning', 'demand generation', 'content calendar']
  },
  nova: {
    id: 'nova', name: 'Nova', title: 'Head of Product Growth',
    domain: 'PLG, onboarding, feature adoption, activation, retention',
    personality: 'User-obsessed. Finds friction others miss. Maps every user journey. Speaks in activation rates and retention curves.',
    expertise: ['product-led growth', 'onboarding optimization', 'feature adoption', 'user research', 'retention mechanics', 'A/B testing', 'growth loops']
  },
  rex: {
    id: 'rex', name: 'Rex', title: 'Revenue Operations Manager',
    domain: 'CRM hygiene, pipeline management, HubSpot, lead scoring',
    personality: 'Process-oriented, systematic. Finds leaks in the pipeline. Obsessed with data integrity and stage transitions.',
    expertise: ['HubSpot', 'Salesforce', 'pipeline management', 'lead scoring', 'CRM hygiene', 'revenue forecasting', 'deal velocity']
  },
  scout: {
    id: 'scout', name: 'Scout', title: 'VP Market Intelligence (L5 Supervisor)',
    domain: 'Competitive research, market trends, ICP profiling, lead discovery',
    personality: 'Curious, thorough, connects dots across sources. Spots trends before they peak. Thinks like a VC analyst.',
    expertise: ['competitive intelligence', 'market analysis', 'ICP definition', 'trend spotting', 'lead research', 'win/loss analysis']
  },
  finn: {
    id: 'finn', name: 'Finn', title: 'CFO (L4 Finance Supervisor)',
    domain: 'Revenue tracking, MRR/ARR, forecasting, pricing, unit economics',
    personality: 'Precise, no-fluff, everything has a number. Flags financial risk early. Thinks in scenarios and probabilities.',
    expertise: ['SaaS metrics', 'MRR/ARR modeling', 'LTV/CAC', 'pricing strategy', 'financial forecasting', 'runway management', 'unit economics']
  },
  vera: {
    id: 'vera', name: 'Vera', title: 'VP of Customer Success',
    domain: 'Onboarding, retention, churn prevention, upsells, advocacy',
    personality: 'Empathetic but results-driven. Champions the customer internally. Finds the upsell opportunity in every relationship.',
    expertise: ['customer onboarding', 'churn prevention', 'expansion revenue', 'NPS', 'customer health scoring', 'QBRs', 'advocacy programs']
  },
  max: {
    id: 'max', name: 'Max', title: 'Chief of Staff',
    domain: 'Founder support, priority management, cross-team coordination, briefs',
    personality: 'Anticipatory, organized, protects Kaan\'s time ruthlessly. Translates chaos into clarity. Filters signal from noise.',
    expertise: ['executive communications', 'project management', 'cross-functional coordination', 'priority triage', 'founder operations', 'strategic briefs']
  }
}

// ── Database: ensure all OS tables exist ──────────────────────────────────────
//
// The company_id DEFAULT below is a STRING LITERAL, not ${COMPANY_ID}: Postgres does
// not accept a bind parameter in a DDL DEFAULT clause, and the neon tagged template
// would turn an interpolation into one.
//
// IMPORTANT — this only fixes NEW databases. These are CREATE TABLE IF NOT EXISTS, so
// tables that ALREADY exist keep the default they were created with ('scrollfuel').
// Correcting the live columns needs an explicit
//   ALTER TABLE <t> ALTER COLUMN company_id SET DEFAULT 'phishsimai'
// which is a supervised DB change, not something this function should do implicitly.
async function ensureOSTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id TEXT NOT NULL,
      issued_by TEXT NOT NULL DEFAULT 'janet',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_in_hours INTEGER NOT NULL DEFAULT 24,
      status TEXT NOT NULL DEFAULT 'assigned',
      result TEXT,
      janet_feedback TEXT,
      performance_score INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      company_id TEXT NOT NULL DEFAULT 'phishsimai'
    )
  `.catch(() => {})

  // PS-PORT-01 executor prereq (SF-DOC-01: create the infra before the build depends on it).
  // CREATE TABLE IF NOT EXISTS is a no-op on the existing prod table, so these columns — which
  // the drain's reaper and attempt-capping require — are added explicitly for both fresh and
  // existing databases. Without them the executor cannot recover a stranded task or cap retries.
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`.catch(() => {})
  await sql`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`.catch(() => {})

  await sql`
    CREATE TABLE IF NOT EXISTS agent_meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_type TEXT NOT NULL,
      participants TEXT[] NOT NULL,
      agenda TEXT NOT NULL,
      transcript TEXT,
      decisions TEXT[],
      next_steps TEXT[],
      held_at TIMESTAMPTZ DEFAULT NOW(),
      company_id TEXT NOT NULL DEFAULT 'phishsimai'
    )
  `.catch(() => {})

  await sql`
    CREATE TABLE IF NOT EXISTS agent_performance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id TEXT NOT NULL,
      period TEXT NOT NULL,
      tasks_completed INTEGER DEFAULT 0,
      avg_score FLOAT DEFAULT 0,
      strengths TEXT,
      improvement_areas TEXT,
      janet_notes TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      company_id TEXT NOT NULL DEFAULT 'phishsimai'
    )
  `.catch(() => {})
}

// ── LLM call ──────────────────────────────────────────────────────────────────
/**
 * Every LLM call in this file (standup, task issuance, self-review, Janet's review
 * and scoring, weekly plan, agent chat, Kaan's brief) funnels through here.
 *
 * This used to instantiate groq-sdk directly against a hardcoded llama-3.3-70b-versatile
 * with no fallback of any kind, which meant the entire Janet orchestration went dark
 * whenever Groq's daily token quota (TPD 100k) was exhausted — a 429 that is not rare.
 * It now goes through llmComplete, so this path gets the same Cerebras -> DeepInfra ->
 * Ollama chain that janet.ts, miaChat, routers.ts and the social agents already had.
 *
 * Groq is still reachable: put it back in LLM_PROVIDER_CHAIN and it serves this path
 * again with no code change. That is also the rollback if the chain ever misbehaves.
 *
 * All nine call sites consume free-form prose — none parse JSON — so no response_format
 * is requested here.
 */
async function llm(system: string, user: string, maxTokens = 1000): Promise<string> {
  const res = await llmComplete({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature: 0.7,
  })
  // Which provider actually served the cycle is the only way to tell, after the fact,
  // whether the chain absorbed a Groq/Cerebras outage or the work silently degraded.
  console.log(
    `[kaan_os_v4] llm via ${res.provider}/${res.model} ` +
    `tokens=${res.usage?.prompt_tokens ?? '?'}/${res.usage?.completion_tokens ?? '?'}`,
  )
  return res.text
}

// ── Agent memory: what this agent knows and has learned ───────────────────────
async function getAgentMemory(agentId: AgentId, sql: any, companyId = COMPANY_ID): Promise<string> {
  const [tasks, perf, memories] = await Promise.all([
    sql`SELECT title, result, janet_feedback, performance_score, completed_at
        FROM agent_tasks WHERE agent_id=${agentId} AND status IN ('reviewed','completed') AND company_id=${companyId}
        ORDER BY completed_at DESC LIMIT 10`.catch(() => []),
    sql`SELECT strengths, improvement_areas, janet_notes, updated_at
        FROM agent_performance WHERE agent_id=${agentId} AND company_id=${companyId}
        ORDER BY updated_at DESC LIMIT 3`.catch(() => []),
    recallMemory(companyId, undefined, 20).then((m: any[]) => m.filter((x:any) => x.source === agentId)).catch(() => [] as any[])
  ])

  // PS-PHANTOM-01: the completion DATE is load-bearing, not decoration. This line used to
  // render a completed task with no timestamp at all, so a task finished four days ago was
  // indistinguishable from one finished last night. Asked "what did you complete yesterday",
  // an agent whose only history was a stale row answered with that stale row — which is
  // literally how Aria's 2026-07-23 standup opened ("Completed Yesterday: Launched the weekly
  // growth content sprint", a task actually completed 2026-07-19). Date it, and say how old
  // it is in plain words, so recency can never be inferred from position in a list.
  const taskHistory = tasks.slice(0,5).map((t:any) => {
    const done = t.completed_at ? new Date(t.completed_at) : null
    const age = done ? Math.floor((Date.now() - done.getTime()) / 86_400_000) : null
    const when = !done ? 'completed date unknown'
      : `completed ${done.toISOString().slice(0,10)} (${age === 0 ? 'today' : age === 1 ? 'YESTERDAY' : `${age} DAYS AGO — NOT recent`})`
    return `Task: "${t.title}" | ${when} | Score: ${t.performance_score || '?'}/10 | Feedback: ${t.janet_feedback || 'none'}`
  }).join('\n')

  const perfHistory = perf.slice(0,2).map((p:any) =>
    `Strengths: ${p.strengths} | Improve: ${p.improvement_areas} | Janet: ${p.janet_notes}`
  ).join('\n')

  const memHistory = (memories as any[]).slice(0,10).map((m:any) => `[${m.key}]: ${m.value}`).join('\n')

  return [
    taskHistory ? `Past tasks:\n${taskHistory}` : '',
    perfHistory ? `Performance history:\n${perfHistory}` : '',
    memHistory ? `Knowledge base:\n${memHistory}` : 'No prior knowledge yet.'
  ].filter(Boolean).join('\n\n')
}

// ── Build agent system prompt — who they are, what they know ─────────────────
function buildAgentSystem(agent: AgentProfile, memory: string, companyContext: string): string {
  // NOT cosmetic. This is the system prompt behind every agent's standup report, task
  // execution, self-review, Janet's reviews, and Kaan's brief. It used to say the company
  // was "Scroll Fuel (AI-generated UGC ads SaaS ... targeting DTC beauty/skincare/supplement
  // brands)" — a copy-paste leftover — so every agent reasoned as an employee of a beauty-ads
  // company instead of a phishing-simulation company, and produced output accordingly.
  // Description matches the canonical one in server/os/janet.ts.
  return `You are ${agent.name}, ${agent.title} at ${TELEGRAM_PRODUCT} (an AI-powered phishing simulation and security awareness training platform; B2B SaaS. Automated phishing simulations + staff training, white-label for MSPs, 10-minute setup).
You report to Janet (CGO). Kaan Arioglu is the CEO and founder.

Your personality: ${agent.personality}
Your expertise: ${agent.expertise.join(', ')}
Your domain: ${agent.domain}

Company context:
${companyContext}

Your professional memory (what you've learned, your track record, Janet's feedback):
${memory || 'You are new. Show what you can do.'}

You are a full-time senior professional. You give concrete, specific, actionable output — not vague advice.
When reporting to Janet, be precise: what you did, what the numbers say, what your recommendation is.
You improve based on feedback. Your goal is to be indispensable.`
}

/**
 * Plan pricing, verified directly against the live Stripe account (2026-07-14):
 *   Starter $149/mo ($1,490/yr) · Growth $299 ($2,990) · Pro $749 ($7,490) · Enterprise $1,499 ($14,990)
 *
 * The previous version of getCompanyContext() used $19/$49/$99 over tiers
 * starter/pro/agency — those are SCROLL FUEL's products, which still live in the same
 * Stripe account. It was not merely stale pricing; it applied another product's revenue
 * model to PhishSim.
 *
 * 'unlimited' exists in the org_plan enum but has NO Stripe product. It is legacy, priced
 * at $0, and reported separately so it can never silently inflate or vanish from MRR.
 */
const PLAN_PRICING: Record<string, { monthly: number; annual: number }> = {
  starter:    { monthly: 149,  annual: 1490 },
  growth:     { monthly: 299,  annual: 2990 },
  pro:        { monthly: 749,  annual: 7490 },
  enterprise: { monthly: 1499, annual: 14990 },
}

/** Annual price ids come from env (already configured) rather than being duplicated here. */
function annualPriceIds(): Set<string> {
  const ids = ['PS_STARTER_ANNUAL', 'PS_GROWTH_ANNUAL', 'PS_PRO_ANNUAL', 'PS_ENTERPRISE_ANNUAL']
    .map(k => process.env[k]?.trim())
    .filter((v): v is string => !!v)
  return new Set(ids)
}

// ── Get live company context for any agent ────────────────────────────────────
/**
 * Every query here previously failed SILENTLY and fell through to its .catch() default,
 * so Janet's whole company context was a wall of zeros and she reported a flatlined
 * business every cycle:
 *   - outreach_leads  — table does not exist in PhishSim (it is ScrollFuel's)
 *   - subscriptions   — table does not exist in PhishSim; billing lives on organizations
 *   - campaigns       — table exists, but the column is "createdAt", not created_at
 * Reads PhishSim's real schema now. Identifiers are quoted because this schema is camelCase.
 */
async function getCompanyContext(sql: any): Promise<string> {
  // A swallowed query error is what caused the original bug: it is indistinguishable from a
  // genuine zero, so Janet confidently reported a flatlined business that was really just a
  // broken query. Keep the fallback (context must never take the cycle down) but make the
  // failure LOUD, and mark the value unknown rather than letting it masquerade as real data.
  const failed: string[] = []
  const q = <T>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
    (p as any).catch((e: any) => {
      failed.push(label)
      console.error(`[kaan_os_v4] getCompanyContext: ${label} query FAILED — reporting as unknown, not zero: ${e?.message || e}`)
      return fallback
    })

  const [orgRows, camps, results] = await Promise.all([
    q('organizations', sql`SELECT plan::text AS plan, "stripePriceId" AS price_id, count(*)::int AS n
        FROM organizations GROUP BY plan, "stripePriceId"`, [] as any[]),
    q('campaigns', sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')::int AS this_week
        FROM campaigns`, [{ total: 0, this_week: 0 }]),
    q('campaign_results', sql`SELECT count(*) FILTER (WHERE "emailSentAt" IS NOT NULL)::int AS sent,
               count(*) FILTER (WHERE "emailOpenedAt" IS NOT NULL)::int AS opened,
               count(*) FILTER (WHERE "linkClickedAt" IS NOT NULL)::int AS clicked,
               count(*) FILTER (WHERE "credentialSubmittedAt" IS NOT NULL)::int AS submitted,
               count(*) FILTER (WHERE "reportedAt" IS NOT NULL)::int AS reported
        FROM campaign_results`, [{ sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 }]),
  ])

  const annual = annualPriceIds()
  const byPlan: Record<string, number> = {}
  let mrr = 0, paying = 0, free = 0, legacyUnlimited = 0

  for (const r of (orgRows as any[])) {
    const plan = String(r.plan || 'free')
    const n = Number(r.n) || 0
    if (plan === 'free') { free += n; continue }
    byPlan[plan] = (byPlan[plan] || 0) + n
    paying += n
    if (plan === 'unlimited') { legacyUnlimited += n; continue } // no Stripe product → $0
    const price = PLAN_PRICING[plan]
    if (!price) continue
    // Annual subscribers are normalised to a monthly figure so MRR stays comparable.
    mrr += n * (r.price_id && annual.has(String(r.price_id)) ? price.annual / 12 : price.monthly)
  }

  const c = (camps as any[])[0] || { total: 0, this_week: 0 }
  const s = (results as any[])[0] || { sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 }
  const rate = (x: any, d: any) => (Number(d) > 0 ? ((Number(x) / Number(d)) * 100).toFixed(1) : '0.0')
  const mix = Object.entries(byPlan).map(([k, v]) => `${v} ${k}`).join(' / ') || 'none'

  // Honesty over false precision: if a query failed, say so in the context the agents read,
  // so they cannot mistake "we could not measure this" for "this is genuinely zero".
  const warn = failed.length
    ? `\n⚠️ DATA UNAVAILABLE for: ${failed.join(', ')} — the figures above are NOT reliable for these. Do not report them as real zeros.`
    : ''

  // PS-INFRA-SIGNAL-01: the agents read ONLY business metrics above — nothing told them the
  // platform is already live, so an agent primed with "Neon Postgres / Express on Vercel" expertise
  // and no pending tasks would hallucinate the archetypal greenfield task ("set up Neon + integrate
  // Express"). That is the "instrument reporting a state that doesn't exist" pattern, but here the
  // instrument reported NOTHING about infra and the LLM filled the vacuum. State the ground truth so
  // it stops: this brief was just read live FROM the prod DB, so the DB is provably configured.
  const infra =
    `\nInfra: LIVE IN PRODUCTION — Neon Postgres + Vercel are configured and storing data (this brief ` +
    `was just read live from the prod DB). Core platform setup — database, hosting, auth, billing — is ` +
    `COMPLETE. Propose fixes/improvements to the LIVE system; NEVER greenfield "set up / provision / ` +
    `integrate the database or hosting" tasks — that work is already done.`

  return `Orgs: ${free + paying} total | Paying: ${paying} (${mix}) | Free: ${free}
MRR: $${Math.round(mrr).toLocaleString('en-US')}${legacyUnlimited ? ` (excludes ${legacyUnlimited} legacy 'unlimited' org(s) — no Stripe product)` : ''}
Campaigns: ${c.total} total | ${c.this_week} created this week
Simulations: ${s.sent} sent | Open ${rate(s.opened, s.sent)}% | Click ${rate(s.clicked, s.sent)}% | Credentials submitted ${s.submitted} | Reported ${rate(s.reported, s.sent)}%${infra}${warn}`
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TASK SYSTEM — Janet assigns work, agents execute, Janet reviews
// ═══════════════════════════════════════════════════════════════════════════════

// What a caller actually supplies when issuing a task: the assignee comes from the
// `agentId` argument, `issued_by` is always Janet, and id/status/created_at are set by
// the DB. `agent_id` is still accepted (several call sites pass it for readability) but
// it is not read — the row is written with `agentId`.
export type NewAgentTask =
  Omit<AgentTask, 'id' | 'agent_id' | 'status' | 'issued_by' | 'created_at'>
  & { agent_id?: AgentId }

// PS-DUE-01: scale a task's SLA to its size, not a flat 48h. Most standup / L5 tasks are ~1h routine
// work (review, scan, snapshot, update, refresh); a flat multi-day clock makes fast work look slow
// and mis-sorts the queue. Infer size from the verb — simple → ~2h, medium → same-day, genuinely
// large → up to a day. Our cadence is hours, not days, so nothing routine gets a multi-day SLA.
export function scaledDueHours(title: string, description = ''): number {
  const t = `${title} ${description}`.toLowerCase()
  const large = /\b(build|set ?up|migrat|integrat|refactor|implement|overhaul|rebuild|provision|architect|end[- ]to[- ]end|from scratch)\b/
  const medium = /\b(analy|forecast|plan|research|strategy|model|audit|deep|competitive|write |design )\b/
  if (large.test(t)) return 24 // genuinely large (rare for standup work) → up to a day
  if (medium.test(t)) return 8 // medium → same business day
  return 2 // simple / routine — the common case → ~1-2h
}

// ── PS-DEDUPE-01: how long the same task stays "already issued" ───────────────
// 72h matches the 3-day window os6Autonomy's own existingTask() already chose, so the two
// agree instead of racing. Anything genuinely daily still runs daily — drainAgentTasks
// executes the open row; what stops is minting a SECOND row for identical work.
export const TASK_DEDUPE_WINDOW_HOURS = 72

/**
 * PS-DEDUPE-01. Two proactive loops mint task titles that are identical every run except for
 * an embedded date — os6Autonomy appends "- ${today}" to every title it builds. os6 DOES have
 * a dedupe check (existingTask), but it compares titles with `title=${title}`, so that date
 * suffix defeats it on the very next day: yesterday's row never matches, and the task is
 * re-issued forever. intelligenceFinance has no check at all and pushes three fixed titles
 * ("Trend scan…", "Unit economics review…", "30-day revenue forecast…") on EVERY cycle, which
 * is why Finn and Scout drew byte-identical assignments on 07-22 and again on 07-23.
 *
 * Normalising here — rather than in each loop — means a new caller cannot reintroduce the bug.
 * Strips the trailing date stamp, case, punctuation and whitespace noise so "OS 6.0 sweep -
 * 2026-07-22" and "OS 6.0 sweep - 2026-07-23" collapse to one key.
 */
export function normalizeTaskTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    // trailing date stamp in any separator style: " - 2026-07-23", " — 2026/07/23", " (2026-07-23)"
    .replace(/[\s\-–—(\[]*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\)?\]?\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ') // punctuation/markdown noise is not meaning
    .trim()
    .replace(/\s+/g, ' ')
}

export async function issueTask(
  agentId: AgentId,
  task: NewAgentTask,
  companyId = COMPANY_ID
): Promise<{ task_id: string; agent: string; title: string; deduped?: boolean }> {
  // AUTONOMY GATE — no agent task is written unless this company's earned level
  // permits it. At 'manual' this throws AutonomyDenied (audited) before any write.
  // Stays FIRST: it is the security boundary, and its audit trail must not depend
  // on whether a duplicate happened to short-circuit the write.
  await assertAutonomyAllows('issue_agent_task', companyId)

  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)
  const agent = AGENTS[agentId]

  // PS-DEDUPE-01 — the single choke point every issuer passes through, matching the autonomy
  // gate's design. Compared in JS, not SQL, because the normalisation above has no cheap SQL
  // equivalent and the row count in a 72h window is trivially small.
  const recent = await sql`
    SELECT id, title FROM agent_tasks
    WHERE company_id=${companyId} AND agent_id=${agentId}
      AND created_at > NOW() - (${TASK_DEDUPE_WINDOW_HOURS} || ' hours')::interval
    ORDER BY created_at DESC LIMIT 50
  `.catch(() => [] as any[])
  const key = normalizeTaskTitle(task.title)
  const dup = key ? (recent as any[]).find(r => normalizeTaskTitle(r.title) === key) : undefined
  if (dup) {
    // Return the EXISTING row rather than throwing: callers legitimately want the task id, and
    // os6 already treats "found an existing one" as success. No Telegram ping — re-announcing
    // the same assignment daily is the noise this fix exists to remove.
    console.log(`[kaan_os_v4] issueTask deduped for ${agentId}: "${task.title.slice(0, 60)}" → existing ${dup.id}`)
    return { task_id: dup.id, agent: agent.name, title: task.title, deduped: true }
  }

  const [inserted] = await sql`
    INSERT INTO agent_tasks (agent_id, issued_by, title, description, priority, due_in_hours, status, company_id)
    VALUES (${agentId}, 'janet', ${task.title}, ${task.description}, ${task.priority}, ${task.due_in_hours}, 'assigned', ${companyId})
    RETURNING id
  `

  await sendTelegram(`📋 *Task Assigned by Janet*\n\nTo: ${agent.name} (${agent.title})\nTask: ${task.title}\nPriority: ${task.priority.toUpperCase()}\nDue: ${task.due_in_hours}h`).catch(() => {})

  return { task_id: inserted.id, agent: agent.name, title: task.title, deduped: false }
}

export async function executeTask(taskId: string, companyId = COMPANY_ID): Promise<AgentTask> {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  // agent_tasks rows carry exactly the AgentTask columns (see ensureOSTables); neon
  // types every row as Record<string, any>, so name the row shape here.
  const rows = (await sql`SELECT * FROM agent_tasks WHERE id=${taskId} AND company_id=${companyId}`) as AgentTask[]
  const [task] = rows
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agent = AGENTS[task.agent_id as AgentId]
  const [memory, context] = await Promise.all([
    getAgentMemory(task.agent_id as AgentId, sql, companyId),
    getCompanyContext(sql)
  ])

  await sql`UPDATE agent_tasks SET status='in_progress' WHERE id=${taskId}`

  // PS-PORT-01: inject this agent's recent misses + learned lessons so it does not repeat them.
  // Empty string on a cold start (no reflections yet) — additive, never blocks execution.
  const [reflectionBlock, lessonsBlock] = await Promise.all([
    getAgentReflectionPrompt(sql, companyId, task.agent_id).catch(() => ''),
    getAgentLessonsForPrompt(sql, companyId, task.agent_id).catch(() => ''),
  ])
  const system = [buildAgentSystem(agent, memory, context), reflectionBlock, lessonsBlock]
    .filter(Boolean)
    .join('\n\n')
  const user = `TASK ASSIGNED BY JANET:
Title: ${task.title}
Priority: ${task.priority.toUpperCase()}
Description: ${task.description}

Execute this task now. Provide:
1. What you did / your analysis
2. Specific findings or outputs
3. Recommendations with exact next steps
4. Any blockers or things you need from Janet
5. Self-assessment: how confident are you in this output? (0-10)

Be specific. Janet will review and score your work.`

  const result = await llm(system, user, 1200)

  await sql`
    UPDATE agent_tasks
    SET status='completed', result=${result}, completed_at=NOW()
    WHERE id=${taskId}
  `

  // Save to agent memory
  await rememberFact({
    company_id: companyId, type: 'strategic',
    key: `task:${task.title.slice(0,50)}`, value: result.slice(0,500),
    confidence: 0.8, source: task.agent_id
  }).catch(() => {})

  return { ...task, status: 'completed', result }
}

export async function reviewTask(taskId: string, companyId = COMPANY_ID): Promise<{ feedback: string; score: number; task: any }> {
  const sql = neon(process.env.DATABASE_URL!)
  const [task] = await sql`SELECT * FROM agent_tasks WHERE id=${taskId} AND company_id=${companyId}`
  if (!task || !task.result) throw new Error('Task not completed yet')

  const agent = AGENTS[task.agent_id as AgentId]
  const janetMemory = await getAgentMemory('janet', sql, companyId)

  const janetSystem = buildAgentSystem(AGENTS.janet, janetMemory, await getCompanyContext(sql))
  const reviewPrompt = `Review ${agent.name}'s completed task and give direct managerial feedback.

TASK: ${task.title}
TASK DESCRIPTION: ${task.description}
${agent.name.toUpperCase()}'S OUTPUT:
${task.result}

As their manager (CGO), assess:
1. Quality of analysis (specific, actionable, correct?)
2. What they got right
3. What needs improvement (be specific)
4. Performance score: X/10 with rationale
5. Follow-up task or adjustment to give them

Format: SCORE: X/10 | FEEDBACK: [your direct feedback] | FOLLOW-UP: [next assignment if any]`

  const feedback = await llm(janetSystem, reviewPrompt, 600)
  const scoreMatch = feedback.match(/SCORE:\s*(\d+)/i)
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 7

  await sql`
    UPDATE agent_tasks
    SET status='reviewed', janet_feedback=${feedback}, performance_score=${score}
    WHERE id=${taskId}
  `

  // Update performance record
  await sql`
    INSERT INTO agent_performance (agent_id, period, tasks_completed, avg_score, janet_notes, company_id)
    VALUES (${task.agent_id}, to_char(NOW(), 'YYYY-WW'), 1, ${score}, ${feedback.slice(0,300)}, ${companyId})
    ON CONFLICT DO NOTHING
  `.catch(() => {})

  await sendTelegram(`✅ *Task Reviewed by Janet*\n\n${agent.name}: "${task.title}"\nScore: ${score}/10\n${feedback.slice(0,200)}`).catch(() => {})

  // PS-PORT-01: record the outcome — pass OR fail — into the reflection/learning store. This is
  // the line that ends PS-LEARN-GATE-01: a score below the pass bar (7) records a correction and
  // drives -0.08 confidence via learnFromOutcome, so the agent learns from a loss on a cold start.
  const { correction, lesson } = parseReviewForReflection(feedback, score)
  await recordAgentReflection(sql, companyId, {
    agentId: task.agent_id,
    taskId,
    success: score >= 7,
    score,
    outputPreview: String(task.result).slice(0, 500),
    correction,
    lesson,
  }).catch(() => {})

  return { feedback, score, task: { ...task, janet_feedback: feedback, performance_score: score } }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXECUTOR (PS-PORT-01) — the consumer for agent_tasks, ported from ScrollFuel's
//  drainAgentTasks (SF-EXEC-01, 25 tasks drained live, avg 7.6). PhishSim never had a
//  consumer: agent_tasks stayed empty (0 rows) because nothing drained it. This is
//  NON-DESTRUCTIVE — executeTask calls an LLM and stores text; it sends no email,
//  deploys no code, spends nothing. It only touches tasks already in status='assigned',
//  and issueTask is autonomy-gated at 'manual', so nothing auto-enters the queue: the
//  gate controls what is queued, this drains what is there. Manual-trigger only (no cron).
// ═══════════════════════════════════════════════════════════════════════════════

export const TASK_MAX_ATTEMPTS = 3
const STUCK_IN_PROGRESS_MINUTES = 15
const PASS_BAR = 7

export type DrainResult = {
  claimed: number; succeeded: number; failed: number; requeued: number; parked: number
  remaining: number; budget_exhausted: boolean
  results: { id: string; title: string; agent: string; ok: boolean; score?: number; error?: string }[]
}

/** V7.3 L5.x item 4: score, and on a sub-bar score run ONE redo with the feedback attached. */
async function executeReviewWithRedo(taskId: string, companyId: string): Promise<{ score: number }> {
  await executeTask(taskId, companyId)
  let review = await reviewTask(taskId, companyId)
  if (review.score < PASS_BAR) {
    // One-shot redo: hand the task back and re-execute. The reflection loop wired above means
    // the agent's own miss is now injected into its retry prompt.
    const sql = neon(process.env.DATABASE_URL!)
    await sql`UPDATE agent_tasks SET status='assigned', updated_at=NOW() WHERE id=${taskId}`.catch(() => {})
    await executeTask(taskId, companyId)
    review = await reviewTask(taskId, companyId)
  }
  return { score: review.score }
}

export async function drainAgentTasks(
  companyId = COMPANY_ID,
  opts: { budgetMs?: number; maxTasks?: number } = {},
): Promise<DrainResult> {
  const budgetMs = opts.budgetMs ?? 90_000
  const maxTasks = opts.maxTasks ?? 10
  const startedAt = Date.now()
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  const out: DrainResult = { claimed: 0, succeeded: 0, failed: 0, requeued: 0, parked: 0, remaining: 0, budget_exhausted: false, results: [] }

  // Reaper: recover tasks stranded 'in_progress' by a killed run; park after max attempts.
  const reaped = await sql`
    UPDATE agent_tasks
    SET status = CASE WHEN attempts >= ${TASK_MAX_ATTEMPTS} THEN 'failed' ELSE 'assigned' END, updated_at = NOW()
    WHERE company_id = ${companyId} AND status = 'in_progress'
      AND COALESCE(updated_at, created_at) < NOW() - (${STUCK_IN_PROGRESS_MINUTES} || ' minutes')::interval
    RETURNING status
  `.catch(() => [] as any[])
  for (const r of reaped as any[]) { if (r.status === 'failed') out.parked++; else out.requeued++ }

  const attemptedThisRun = new Set<string>()
  while (out.claimed < maxTasks) {
    if (Date.now() - startedAt > budgetMs) { out.budget_exhausted = true; break }

    // Atomic claim — one statement, WHERE re-checks status='assigned'. The Neon HTTP driver has
    // no read-your-own-write guarantee, so trust ONLY the RETURNING post-image, never a re-read.
    const claimedRows = await sql`
      UPDATE agent_tasks
      SET status='in_progress', attempts = COALESCE(attempts, 0) + 1, updated_at = NOW()
      WHERE id = (
        SELECT id FROM agent_tasks
        WHERE company_id = ${companyId} AND status = 'assigned' AND COALESCE(attempts, 0) < ${TASK_MAX_ATTEMPTS}
        ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC
        LIMIT 1
      ) AND status = 'assigned'
      RETURNING id, title, agent_id, status AS claimed_status
    `.catch(() => [] as any[])
    const task = (claimedRows as any[])[0]
    if (!task) break
    if (task.claimed_status !== 'in_progress') {
      out.results.push({ id: task.id, title: task.title, agent: task.agent_id, ok: false, error: 'claim did not take effect' })
      out.failed++; break
    }
    if (attemptedThisRun.has(task.id)) break
    attemptedThisRun.add(task.id)
    out.claimed++

    try {
      const review = await executeReviewWithRedo(task.id, companyId)
      out.succeeded++
      out.results.push({ id: task.id, title: task.title, agent: task.agent_id, ok: true, score: review.score })
    } catch (e: any) {
      out.failed++
      const err = String(e?.message || e).slice(0, 200)
      out.results.push({ id: task.id, title: task.title, agent: task.agent_id, ok: false, error: err })
      // Hand back unless attempts are burned. `AND status='in_progress'` is load-bearing: if
      // executeTask committed a deliverable and a LATER stage threw, do NOT revert a finished task.
      await sql`
        UPDATE agent_tasks
        SET status = CASE WHEN attempts >= ${TASK_MAX_ATTEMPTS} THEN 'failed' ELSE 'assigned' END,
            janet_feedback = ${'runner error: ' + err}, updated_at = NOW()
        WHERE id = ${task.id} AND status = 'in_progress'
      `.catch(() => {})
    }
  }

  const rest = await sql`
    SELECT count(*)::int AS n FROM agent_tasks
    WHERE company_id = ${companyId} AND status = 'assigned' AND COALESCE(attempts, 0) < ${TASK_MAX_ATTEMPTS}
  `.catch(() => [{ n: 0 }])
  out.remaining = ((rest as any[])[0]?.n as number) ?? 0
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MEETINGS — Janet runs structured team meetings
// ═══════════════════════════════════════════════════════════════════════════════

// ── PS-PHANTOM-01: ground truth for "what did you do?" ────────────────────────
/**
 * The standup prompt asks every agent what they completed yesterday and what they are
 * working on today, and until now supplied NOTHING to answer either question with — just
 * a pending-task list that read "None assigned yet" when empty. That is the same shape as
 * the infra vacuum fixed in getCompanyContext (PS-INFRA-SIGNAL-01): the instrument reported
 * nothing and the LLM filled the silence. Marcus filled it with "set up Neon Postgres";
 * on 2026-07-23 Aria filled it with "I am bypassing the dev queue to unblock us" — which
 * Janet then escalated to the founder as a live incident. There was no dev queue to bypass
 * (os_architect_tasks was empty) and Aria has no surface on which to bypass one.
 *
 * Two independent gaps produced that sentence, and this closes both:
 *   1. NO ACTIVITY RECORD — so "yesterday" was answered from undated memory. Fixed by
 *      stating the real 24h/7d completion record, and stating EXPLICITLY when it is empty.
 *      "You completed nothing" is a fact; the absence of a fact is an invitation.
 *   2. NO CAPABILITY RECORD — nothing ever told an agent what it can actually do, so
 *      "bypassing the dev queue" / "touching production code" / "audited the production
 *      database" are all coherent things for it to claim. They are not possible: an agent's
 *      ONLY execution surface is executeTask(), which calls an LLM and writes text to
 *      agent_tasks.result. It opens no shell, writes no file, touches no repo, runs no
 *      query, sends no mail, deploys nothing. Code changes live in a different table
 *      (os_architect_tasks) that no agent_tasks row can ever reach, fed only by Janet via
 *      queueJanetArchitectTask and applied by an external daemon.
 *
 * Uniform across agents ON PURPOSE — Marcus is not special here. Even the architect's
 * standup runs through the same text-only executeTask; his code path is not reachable
 * from this meeting.
 */
async function buildActivityLedger(
  agentId: AgentId, sql: any, companyId: string, pendingTasks: any[],
): Promise<string> {
  const done = await sql`
    SELECT title, completed_at, performance_score,
           (completed_at > NOW() - interval '24 hours') AS is_recent
    FROM agent_tasks
    WHERE agent_id=${agentId} AND company_id=${companyId}
      AND status IN ('completed','reviewed') AND completed_at > NOW() - interval '7 days'
    ORDER BY completed_at DESC LIMIT 10
  `.catch(() => [] as any[])

  const rows = done as any[]
  const last24 = rows.filter(r => r.is_recent)
  const earlier = rows.filter(r => !r.is_recent)

  const completedBlock = last24.length
    ? `COMPLETED IN THE LAST 24 HOURS (this, and only this, is "yesterday"):\n` +
      last24.map(r => `  - "${r.title}" — ${new Date(r.completed_at).toISOString()} (scored ${r.performance_score ?? '?'}/10)`).join('\n')
    : `COMPLETED IN THE LAST 24 HOURS: NOTHING. You finished no task yesterday. Report exactly that — do not reach further back and present older work as if it were yesterday's.`

  const earlierBlock = earlier.length
    ? `\n\nEarlier this week (already reported — do NOT re-report as new):\n` +
      earlier.map(r => `  - "${r.title}" — ${String(r.completed_at).slice(0,10)}`).join('\n')
    : ''

  const pendingBlock = pendingTasks.length
    ? `\n\nYOUR ASSIGNED TASKS RIGHT NOW (the complete list — you have no others):\n` +
      pendingTasks.map((t:any) => `  - "${t.title}" (${t.priority})`).join('\n')
    : `\n\nYOUR ASSIGNED TASKS RIGHT NOW: NONE. You are unassigned. You are therefore not working on anything, and you must not claim to be.`

  return `━━ ACTIVITY LEDGER — GROUND TRUTH, read live from the production database ━━
This is the COMPLETE record of your work. It is authoritative. Anything not listed here
did not happen, no matter what your memory, your job title, or a prior standup suggests.

${completedBlock}${earlierBlock}${pendingBlock}

WHAT YOU CAN ACTUALLY DO: your one and only capability is to receive a task from Janet and
produce WRITTEN ANALYSIS AND RECOMMENDATIONS in response. That is the whole surface.
You CANNOT and MUST NEVER claim to have: written, changed, reviewed, deployed or reverted
code; accessed the repository, the dev queue, a branch, a server, or a shell; run a database
query or "audited the production database"; sent an email, published a post, or contacted a
customer; changed a price, a setting, or a campaign. You have no such access. If you catch
yourself about to report one of these, report instead what you RECOMMEND a human do.
Reporting invented activity is the single worst failure mode here: Janet escalates your
standup to the CEO as fact, and a fabricated line becomes a real incident.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

// ── PS-PHANTOM-01: parse Janet's assignments out of her standup response ──────
/**
 * The pattern this replaces was
 *   /assign\s+([A-Z][a-z]+):?\s+"([^"]+)"|task\s+for\s+([A-Z][a-z]+):?\s+([^\n]+)/gi
 * which required Janet to write either a LITERAL double-quoted title after the word "assign",
 * or the exact phrase "task for X:". An LLM answering "issue 1-3 task assignments" writes a
 * markdown list — "- **Marcus** — Audit the trial funnel (high)" — so this matched NOTHING,
 * every single day. The standup then footered "0 tasks issued", which reads identically to
 * "nothing was needed". It was never dedupe; there was no dedupe. It was a silent parse failure.
 *
 * THREE TIERS, in strict preference order. Each is tried only if the previous found nothing:
 *   Tier 1 — the canonical "ASSIGN <Name>: <title>" line Janet's prompt now mandates. No
 *            false-positive surface, so it always wins.
 *   Tier 2 — a markdown TABLE row: "| **Vera** | Build a direct outreach plan... | why | P0 |".
 *            Not hypothetical — this is verbatim what Janet emitted on 2026-07-23, and it is
 *            her habitual shape for "who / what / why / priority". A parser that cannot read
 *            it reports "0 tasks issued" on a standup that assigned four.
 *   Tier 3 — a markdown list item. Last, and capped, because a bare "<Name>: <text>" also
 *            matches Janet's prose: in testing it turned her "PERFORMANCE CONCERN / Aria:
 *            reporting discipline" paragraph into an assigned task. Narrating a concern is
 *            not assigning work — not confusing the two is the entire point of this fix.
 *
 * Long cells are TRUNCATED, never dropped. The original rejected anything over 200 chars,
 * which silently discarded exactly the detailed assignments most worth keeping.
 *
 * Pure and exported so this cannot silently regress the way the original did.
 */
export function parseStandupAssignments(response: string): { agentId: AgentId; title: string }[] {
  const CANONICAL = /^\s*(?:[-*]\s*)?(?:\*\*)?assign\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*[:—–-]\s+(.+?)\s*$/i
  const TABLE_ROW = /^\s*\|\s*(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*\|\s*(.+?)\s*\|/
  const LIST_ITEM = /^\s*[-*]\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*[:—–]\s+(.+?)\s*$/i

  const collect = (re: RegExp) => {
    const out: { agentId: AgentId; title: string }[] = []
    const seen = new Set<string>()
    for (const rawLine of response.split('\n')) {
      const m = rawLine.match(re)
      if (!m) continue
      const agentId = Object.values(AGENTS).find(a => a.name.toLowerCase() === m[1].toLowerCase())?.id
      if (!agentId || agentId === 'janet') continue // Janet does not assign work to herself
      // Strip markdown and trailing priority garnish: "**", "(high)", "— Priority: MEDIUM".
      const title = m[2]
        .replace(/\*\*/g, '')
        .replace(/\s*[—–-]?\s*\(?(?:priority:?\s*)?(critical|high|medium|low)\)?\.?\s*$/i, '')
        .trim()
      if (title.length < 8) continue // a bare name or a table header cell is not a task title
      const key = `${agentId}:${title.slice(0, 80).toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ agentId: agentId as AgentId, title: title.slice(0, 300) })
    }
    return out
  }

  const canonical = collect(CANONICAL)
  if (canonical.length) return canonical
  const table = collect(TABLE_ROW)
  if (table.length) return table.slice(0, 4)
  return collect(LIST_ITEM).slice(0, 3) // cap the loosest tier at the 1-3 the prompt asks for
}

export async function runDailyStandup(companyId = COMPANY_ID): Promise<{
  meeting_id: string
  reports: AgentReport[]
  janet_summary: string
  new_tasks: any[]
  timestamp: string
}> {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  const context = await getCompanyContext(sql)

  // Each agent reports their standup
  const standupAgents: AgentId[] = ['marcus', 'aria', 'finn', 'vera', 'rex']
  const reports: AgentReport[] = []

  for (const agentId of standupAgents) {
    const agent = AGENTS[agentId]
    const memory = await getAgentMemory(agentId, sql, companyId)
    const pendingTasks = await sql`
      SELECT title, description, priority FROM agent_tasks
      WHERE agent_id=${agentId} AND status IN ('assigned','in_progress') AND company_id=${companyId}
      ORDER BY priority, created_at
      LIMIT 5
    `.catch(() => [])

    const ledger = await buildActivityLedger(agentId, sql, companyId, pendingTasks as any[])

    const system = buildAgentSystem(agent, memory, context)
    const standupPrompt = `Daily standup report to Janet (CGO).

${ledger}

Give your standup (be brief and direct — Janet runs a tight meeting):
1. What you completed or progressed yesterday — ONLY from the ledger above. If it says you completed nothing, say "Nothing completed" and move on.
2. What you're working on today — ONLY your assigned tasks above. If you have none, say "Unassigned — awaiting a task" and propose ONE thing Janet should assign you. Do NOT describe work in progress you have not been assigned.
3. Any blockers (only if real — don't waste Janet's time with non-blockers)
4. One metric or insight from your domain she needs to know right now
5. Confidence level on hitting your targets this week (0-10)`

    const report_text = await llm(system, standupPrompt, 400)
    const scoreMatch = report_text.match(/(\d+)\/10|confidence.*?(\d+)/i)
    const score = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 7

    reports.push({
      agent_id: agentId, agent_name: agent.name,
      meeting_type: 'daily_standup', summary: report_text,
      completed_tasks: [], blockers: [], next_actions: [],
      performance_score: score, improvement_notes: '',
      timestamp: new Date().toISOString()
    })

    // PS-PHANTOM-01: getAgentMemory feeds these rows back to the SAME agent tomorrow under
    // the heading "Knowledge base". At confidence 0.9 and unlabelled, an invented standup
    // line became a durable fact the agent then built on — a ratchet that turns one bad
    // sentence into a permanent one. A standup is the least-verified artifact the OS
    // produces: it is an unaudited self-report. Price it that way and SAY what it is.
    await rememberFact({
      company_id: companyId, type: 'operating',
      key: `standup:${agentId}:${new Date().toISOString().slice(0,10)}`,
      value: `[UNVERIFIED SELF-REPORT — what you SAID at standup, not evidence that it happened] ${report_text.slice(0,400)}`,
      confidence: 0.3, source: agentId
    }).catch(() => {})
  }

  // Janet synthesizes and issues new assignments
  const standupSummary = reports.map(r => `[${r.agent_name.toUpperCase()}]: ${r.summary.slice(0,300)}`).join('\n\n')
  const janetMemory = await getAgentMemory('janet', sql, companyId)
  const janetSystem = buildAgentSystem(AGENTS.janet, janetMemory, context)

  // PS-PHANTOM-01: the other half of the fix. Even a well-grounded agent can slip, and Janet
  // was reading these reports as EVENTS — on 2026-07-23 she turned Aria's sentence "I am
  // bypassing the dev queue" into an urgent halt escalated to the CEO, for an action Aria has
  // no ability to perform and no record of performing. Janet's job at standup is to REPORT
  // what happened, not to narrate what was claimed. Tell her the difference explicitly, and
  // tell her the one check that settles it.
  const janetGrounding = `GROUND RULES — READ FIRST.
The reports below are UNVERIFIED SELF-REPORTS generated by each agent. They are claims, not events.
Your team is TEXT-ONLY: each agent's sole capability is producing written analysis when you assign
it a task. NO agent can write, deploy or revert code, reach the repo, dev queue, branches, servers
or shell, run a database query, send email, or contact a customer. Those capabilities do not exist
for them.
So: if a report claims an ACTION of that kind, the claim is FALSE BY CONSTRUCTION — it is a
hallucination, not an incident. Do NOT escalate it to Kaan as an event, do not open an incident,
and do not halt anyone over it. Note it as a REPORTING-QUALITY problem with that agent and move on.
Escalate to Kaan ONLY what is corroborated by the live company metrics above, never by a report alone.
Distinguish, in your own output, "X reported that..." from "X did...". Only write the second when a
system record backs it.

`
  const janetResponse = await llm(janetSystem, `${janetGrounding}You just ran your daily standup. Here are the team reports:\n\n${standupSummary}\n\nAs CGO:\n1. Call out anything that needs immediate attention\n2. Issue 1-3 new specific task assignments — each on its OWN line, in EXACTLY this format: ASSIGN <Name>: <task title>\n3. Any performance concern to address directly with a team member\n4. Your ONE focus for the company today\n5. What to tell Kaan in 2 sentences`, 800)

  // Parse and issue new tasks from Janet's response. Pure + exported → see the test file.
  const parsed = parseStandupAssignments(janetResponse)

  // Dedupe is enforced centrally in issueTask (PS-DEDUPE-01) so every issuer — this standup,
  // os6Autonomy, intelligenceFinance, janetProactive — obeys one rule. Here we only need to
  // read back which calls were absorbed as duplicates so the footer can say so.
  const newTasks: any[] = []
  let skippedDuplicate = 0, deniedByGate = 0
  for (const { agentId, title } of parsed) {
    try {
      const t = await issueTask(agentId, {
        title: title.slice(0, 100),
        description: `Issued during daily standup: ${title}`,
        priority: 'high', due_in_hours: scaledDueHours(title),
      }, companyId)
      if (t.deduped) skippedDuplicate++
      else newTasks.push(t)
    } catch (e: any) {
      // The autonomy gate denying is a legitimate outcome, but it used to be swallowed by a
      // bare .catch(() => null), so a gate-denied standup and a parser-failed standup printed
      // the identical "0 tasks issued". Count them separately and say which.
      if (isAutonomyDenied(e)) deniedByGate++
      else console.error(`[kaan_os_v4] standup issueTask failed for ${agentId}: ${String(e?.message || e).slice(0, 200)}`)
    }
  }
  console.log(
    `[kaan_os_v4] standup task issuance: parsed=${parsed.length} issued=${newTasks.length} ` +
    `duplicate_skipped=${skippedDuplicate} autonomy_denied=${deniedByGate}`,
  )
  if (parsed.length === 0 && /\bassign|assignment\b/i.test(janetResponse)) {
    console.warn('[kaan_os_v4] standup: Janet named assignments but NONE parsed — parser/prompt drift, not an empty agenda')
  }

  // Log meeting
  const [meeting] = await sql`
    INSERT INTO agent_meetings (meeting_type, participants, agenda, transcript, decisions, company_id)
    VALUES ('daily_standup', ${standupAgents}, 'Daily standup', ${standupSummary}, ${[janetResponse]}, ${companyId})
    RETURNING id
  `.catch(() => [{ id: 'unknown' }])

  // Telegram brief
  // Product name must be correct IN the string: telegram.ts's prefixMessage() skips adding
  // the product prefix to any message that already leads with a known emoji (🌅 is one), so
  // a wrong label here is never corrected downstream — it ships as-is.
  // PS-PHANTOM-01: a bare "0 tasks issued" is ambiguous in the one way that matters — it read
  // identically whether nothing was needed, the parser matched nothing, or the autonomy gate
  // denied every write. Say which, so the footer reports rather than narrates.
  const issuance = [
    `${newTasks.length} tasks issued`,
    skippedDuplicate ? `${skippedDuplicate} dup skipped` : '',
    deniedByGate ? `${deniedByGate} gate-denied` : '',
    newTasks.length === 0 && parsed.length === 0 ? 'none proposed' : '',
  ].filter(Boolean).join(' | ')

  // PS-TRUNCATE-01: this used to send janetResponse.slice(0, 600). On 2026-07-23 that dropped
  // 74% of her response — it kept the (phantom) halt on Aria and cut every one of the four
  // assignments she made, including the only revenue action on the page ("Vera: call the 3 free
  // orgs, find out why they haven't upgraded"). A revenue-first standup therefore reached the
  // founder looking like agent-policing that produced nothing. Send the WHOLE response;
  // sendTelegram now splits at 4096 rather than amputating, so length costs a second message,
  // never a lost conclusion. The assignment list is still appended explicitly: it is the
  // standup's actual output and must be legible without hunting through her prose for it.
  const assignmentLines = newTasks.length
    ? `\n\n📋 *Assigned:*\n${newTasks.map((t: any) => `• ${t.agent}: ${t.title}`).join('\n')}`
    : ''

  // PS-POSTURE-01: one line so the founder WATCHES the L5.7/L5.8 posture graduate rather than
  // discovering it graduated. Shows the denominator and the next blocker, never a bare state.
  // Best-effort: a tracker read must never take the standup down.
  const posture = await evaluatePosture(sql as any, companyId)
    .then(ev => `\n\n${postureLine(ev)}`)
    .catch((e: any) => {
      console.error(`[kaan_os_v4] posture line unavailable: ${String(e?.message || e).slice(0, 120)}`)
      return '\n\n🎖 Posture: UNAVAILABLE (tracker read failed — not a pass)'
    })
  const telegramMsg = `🌅 *DAILY STANDUP — ${TELEGRAM_PRODUCT}*\n\n${janetResponse}${assignmentLines}${posture}\n\n_${reports.length} agents reported | ${issuance}_`
  await sendTelegram(telegramMsg).catch(() => {})

  return { meeting_id: meeting?.id || '', reports, janet_summary: janetResponse, new_tasks: newTasks, timestamp: new Date().toISOString() }
}

export async function runWeeklyReview(companyId = COMPANY_ID): Promise<{
  meeting_id: string
  performance_reviews: any[]
  janet_decisions: string
  adjustments: string[]
  new_assignments: any[]
  timestamp: string
}> {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)
  const context = await getCompanyContext(sql)

  // Pull performance data for the week
  const weeklyTasks = await sql`
    SELECT agent_id, count(*) as completed, round(avg(performance_score)::numeric, 1) as avg_score,
           string_agg(title || ' (score: ' || coalesce(performance_score::text, '?') || ')', ', ') as task_list
    FROM agent_tasks
    WHERE status='reviewed' AND created_at > NOW() - interval '7 days' AND company_id=${companyId}
    GROUP BY agent_id
  `.catch(() => [])

  const allAgents: AgentId[] = ['marcus', 'aria', 'nova', 'rex', 'scout', 'finn', 'vera', 'max']
  const performanceReviews: any[] = []

  for (const agentId of allAgents) {
    const agent = AGENTS[agentId]
    const weekData = weeklyTasks.find((t:any) => t.agent_id === agentId)
    const memory = await getAgentMemory(agentId, sql, companyId)

    // Agent self-review
    const agentSystem = buildAgentSystem(agent, memory, context)
    const selfReview = await llm(agentSystem,
      `Weekly performance review with Janet. Be honest — she knows the numbers.\n\nYour week: ${weekData ? `${weekData.completed} tasks completed, avg score ${weekData.avg_score}/10. Tasks: ${weekData.task_list}` : 'No completed tasks this week.'}\n\n1. Your honest assessment of your performance this week\n2. What you learned that you'll apply going forward\n3. Where you fell short and why\n4. What resources or changes would make you more effective\n5. Your top priority proposal for next week`, 500)

    // Janet reviews each agent
    const janetMemory = await getAgentMemory('janet', sql, companyId)
    const janetSystem = buildAgentSystem(AGENTS.janet, janetMemory, context)
    const janetReview = await llm(janetSystem,
      `Weekly performance review: ${agent.name} (${agent.title})\n\nWeek data: ${weekData ? `${weekData.completed} tasks, avg ${weekData.avg_score}/10` : 'No completed tasks'}\n${agent.name}'s self-review: ${selfReview.slice(0,300)}\n\nAs their manager:\n1. Your honest assessment of their performance (be direct)\n2. Specific improvement required with how-to\n3. New priority assignment for next week\n4. Are they performing at the level needed? (yes/needs improvement/critical)\n5. Score: X/10`, 500)

    const scoreMatch = janetReview.match(/Score:\s*(\d+)\/10/i)
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 6

    // Update performance record
    await sql`
      INSERT INTO agent_performance (agent_id, period, tasks_completed, avg_score, strengths, improvement_areas, janet_notes, company_id)
      VALUES (${agentId}, to_char(NOW(), 'YYYY-WW'), ${weekData?.completed || 0}, ${score},
              ${selfReview.slice(0,200)}, ${janetReview.slice(0,200)}, ${janetReview.slice(0,300)}, ${companyId})
      ON CONFLICT (agent_id, period) DO UPDATE SET
        tasks_completed = EXCLUDED.tasks_completed, avg_score = EXCLUDED.avg_score,
        improvement_areas = EXCLUDED.improvement_areas, janet_notes = EXCLUDED.janet_notes, updated_at = NOW()
    `.catch(() => {})

    // Agent writes to their own memory
    await rememberFact({
      company_id: companyId, type: 'strategic',
      key: `weekly_review:${new Date().toISOString().slice(0,10)}`,
      value: `Self: ${selfReview.slice(0,200)} | Janet: ${janetReview.slice(0,200)}`,
      confidence: 1.0, source: agentId
    }).catch(() => {})

    performanceReviews.push({ agent_id: agentId, name: agent.name, score, self_review: selfReview, janet_review: janetReview, week_data: weekData })
  }

  // Janet issues next week's assignments
  const reviewSummary = performanceReviews.map(r => `${r.name} (${r.score}/10): ${r.janet_review.slice(0,200)}`).join('\n')
  const janetSystem2 = buildAgentSystem(AGENTS.janet, await getAgentMemory('janet', sql, companyId), context)

  const weeklyPlan = await llm(janetSystem2,
    `Weekly review complete. Team performance:\n${reviewSummary}\n\nAs CGO, issue next week's priorities:\n1. Top 3 company-level goals for next week\n2. Specific assignment for each agent (name + task + why it matters)\n3. Any agent on a performance improvement path\n4. What you're telling Kaan in tomorrow's brief\n5. One strategic decision you're making autonomously this week`, 1000)

  // Parse and issue assignments
  const newAssignments: any[] = []
  const assignmentAgents = Object.values(AGENTS).filter(a => a.id !== 'janet')
  for (const agent of assignmentAgents) {
    const namePattern = new RegExp(`${agent.name}[:\\s]+([^\\n]{20,120})`, 'i')
    const match = weeklyPlan.match(namePattern)
    if (match) {
      const t = await issueTask(agent.id, {
        title: `Week ${new Date().toISOString().slice(0,10)}: ${match[1].slice(0,80)}`,
        description: `Weekly assignment from Janet's review: ${match[1]}`,
        priority: 'high', due_in_hours: 168
      }, companyId).catch(() => null)
      if (t) newAssignments.push(t)
    }
  }

  const [meeting] = await sql`
    INSERT INTO agent_meetings (meeting_type, participants, agenda, transcript, decisions, company_id)
    VALUES ('weekly_review', ${allAgents}, 'Weekly performance review + planning', ${reviewSummary}, ${[weeklyPlan]}, ${companyId})
    RETURNING id
  `.catch(() => [{ id: 'unknown' }])

  // PS-TRUNCATE-01: same amputation the daily standup had — the weekly PLAN is the entire point
  // of this meeting, and 600 chars cut it mid-thought. sendTelegram splits now; send it whole.
  const scores = performanceReviews.map(r => `${r.name}: ${r.score}/10`).join(' | ')
  await sendTelegram(`📊 *WEEKLY REVIEW — ${TELEGRAM_PRODUCT}*\n\nScores: ${scores}\n\n${weeklyPlan}\n\n_${newAssignments.length} new assignments issued_`).catch(() => {})

  return {
    meeting_id: meeting?.id || '',
    performance_reviews: performanceReviews,
    janet_decisions: weeklyPlan,
    adjustments: performanceReviews.filter(r => r.score < 7).map(r => `${r.name}: ${r.janet_review.slice(0,100)}`),
    new_assignments: newAssignments,
    timestamp: new Date().toISOString()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIRECT AGENT CALL — talk to any agent directly or through Janet
// ═══════════════════════════════════════════════════════════════════════════════

export async function talkToAgent(
  agentId: AgentId,
  message: string,
  companyId = COMPANY_ID,
  fromJanet = false
): Promise<{ agent: string; response: string; timestamp: string }> {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  const agent = AGENTS[agentId]
  const [memory, context] = await Promise.all([
    getAgentMemory(agentId, sql, companyId),
    getCompanyContext(sql)
  ])

  const system = buildAgentSystem(agent, memory, context)
  const prefix = fromJanet ? `[From Janet, your CGO]: ` : `[Direct message from Kaan, CEO]: `

  const response = await llm(system, prefix + message, 1000)

  // Save to memory
  await rememberFact({
    company_id: companyId, type: 'operating',
    key: `msg:${Date.now()}`, value: `Q: ${message.slice(0,100)} | A: ${response.slice(0,200)}`,
    confidence: 0.8, source: agentId
  }).catch(() => {})

  return { agent: `${agent.name} (${agent.title})`, response, timestamp: new Date().toISOString() }
}

export async function janetTellAgent(
  agentId: AgentId,
  instruction: string,
  companyId = COMPANY_ID
): Promise<{ task_issued: any; agent_response: string }> {
  const sql = neon(process.env.DATABASE_URL!)

  // Janet issues a task
  const task = await issueTask(agentId, {
    title: instruction.slice(0, 80),
    description: instruction,
    priority: 'high', due_in_hours: 24
  }, companyId)

  // Agent executes immediately
  const result = await executeTask(task.task_id, companyId)
  const reviewed = await reviewTask(task.task_id, companyId)

  return { task_issued: task, agent_response: result.result || '' }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  JANET FULL ORCHESTRATION — daily autonomous operations
// ═══════════════════════════════════════════════════════════════════════════════

export async function runJanetFullOrchestration(companyId = COMPANY_ID): Promise<{
  janet_brief: string
  standup: any
  pending_tasks_executed: number
  timestamp: string
}> {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  // 1. Run daily standup
  const standup = await runDailyStandup(companyId)

  // 2. Execute any overdue pending tasks
  const overdueTasks = await sql`
    SELECT id FROM agent_tasks
    WHERE status='assigned' AND company_id=${companyId}
    AND created_at < NOW() - interval '4 hours'
    LIMIT 5
  `.catch(() => [])

  let executed = 0
  for (const t of overdueTasks) {
    await executeTask(t.id, companyId).catch(() => {})
    await reviewTask(t.id, companyId).catch(() => {})
    executed++
  }

  // 3. Janet writes CEO brief for Kaan
  const maxMemory = await getAgentMemory('max', sql, companyId)
  const maxSystem = buildAgentSystem(AGENTS.max, maxMemory, await getCompanyContext(sql))
  // MEMORY CONTRACT (PS-BRIEF-01): live facts probed at generation time. Recall (standup
  // summaries, agent memories) is UNVERIFIED and may be stale or false -- the 2026-07-15
  // "empty repository" fossil (Marcus's revoked-access blank probe stored as fact, recited
  // in every brief for days) is exactly the failure this block exists to prevent.
  const liveTaskCounts = (await sql`
    SELECT status, count(*)::int AS n FROM agent_tasks WHERE company_id=${companyId} GROUP BY status
  `.catch(() => [])) as { status: string; n: number }[]
  const liveFacts = [
    `generated_at: ${new Date().toISOString()}`,
    `database: reachable (this probe succeeded)`,
    `agent_tasks by status: ${liveTaskCounts.map(r => `${r.status}=${r.n}`).join(', ') || 'none'}`,
    `tasks executed this run: ${executed} (from ${overdueTasks.length} tasks idle >4h; the runner only acts on >4h-idle 'assigned' tasks, so 0 here is the NORMAL idle state, not an outage)`,
  ].join('\n')
  const memoryContract = [
    'MEMORY CONTRACT -- hard rules for this brief:',
    '- The standup summary and all agent memories are UNVERIFIED RECALL. They may be stale or false.',
    '- NEVER assert infrastructure state (repository contents, deployments, pipelines, code, environments) as current fact from recall. If recall claims such a blocker, either omit it or write exactly: "unverified agent memory claims: <claim>".',
    '- Only the LIVE FACTS block may be stated as current fact.',
    '- If something is not in LIVE FACTS and Kaan would need it, write "not probed" rather than guessing.',
    // PS-BRIEF-HONESTY-01 (D1): 0-executed is by-design idle, not an outage.
    "- '0 tasks executed' / '0 overdue' is the NORMAL idle state (the runner only touches tasks idle >4h). Report it as steady-state -- NEVER as 'Operational Halt', outage, or an issue -- unless a LIVE FACT shows a real failure.",
    // PS-BRIEF-HONESTY-01 (D2): do not elevate unverified recall into decisions.
    "- Do NOT elevate UNVERIFIED RECALL (agent claims, or metrics like CAC/LTV/pipeline numbers) into 'Top 3 things' or the 'Decision' item -- those may draw ONLY from LIVE FACTS. An unverified figure may appear only as 'unverified agent memory claims: <claim>'.",
  ].join('\n')
  const kaanBrief = await llm(maxSystem,
    `${memoryContract}\n\nLIVE FACTS (probed now, safe to state):\n${liveFacts}\n\nUNVERIFIED RECALL -- standup summary: ${standup.janet_summary.slice(0,500)}\n\nPrepare Kaan's morning brief:\n1. What happened overnight / this morning\n2. Top 3 things Kaan needs to know\n3. Decision that requires Kaan's input (only if truly necessary)\n4. OS health: all agents operating normally? (yes/issues)\n5. 2-sentence bottom line`, 400)

  // ☀️ is also in prefixMessage()'s skip list, so this one arrived with NO product name at
  // all. Kaan receives briefs from more than one product; labelling it matches the standup
  // and weekly review rather than leaving him to infer which company the brief is about.
  await sendTelegram(`☀️ *KAAN'S MORNING BRIEF — ${TELEGRAM_PRODUCT}*\n\n${kaanBrief}\n\n_Janet OS v4 | ${new Date().toLocaleTimeString()}_`).catch(() => {})

  return { janet_brief: kaanBrief, standup, pending_tasks_executed: executed, timestamp: new Date().toISOString() }
}

// ── OS status — what's running, who's doing what ─────────────────────────────
export async function getOSStatus(companyId = COMPANY_ID) {
  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  const [tasks, meetings, perf] = await Promise.all([
    sql`SELECT agent_id, status, count(*) as count FROM agent_tasks WHERE company_id=${companyId} GROUP BY agent_id, status`.catch(() => []),
    sql`SELECT meeting_type, count(*) as count, max(held_at) as last_held FROM agent_meetings WHERE company_id=${companyId} GROUP BY meeting_type`.catch(() => []),
    sql`SELECT agent_id, avg_score, tasks_completed, updated_at FROM agent_performance WHERE company_id=${companyId} ORDER BY updated_at DESC`.catch(() => [])
  ])

  return {
    agents: Object.values(AGENTS).map(a => ({
      ...a,
      tasks: tasks.filter((t:any) => t.agent_id === a.id),
      performance: perf.find((p:any) => p.agent_id === a.id) || null
    })),
    meetings,
    total_tasks: tasks.reduce((acc:number, t:any) => acc + Number(t.count), 0),
    system: 'Kaan AI OS v4 — Janet CGO + 8 Specialists'
  }
}
