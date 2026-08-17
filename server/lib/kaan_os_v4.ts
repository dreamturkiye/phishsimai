import { llmComplete } from '../os/llmChat'
import { neon } from '@neondatabase/serverless'
import { rememberFact, recallMemory } from '../os/memory'
import { sendTelegram, TELEGRAM_PRODUCT } from '../os/telegram'
import { assertAutonomyAllows, isAutonomyDenied } from '../os/autonomyGate'
import { queueJanetArchitectTask } from '../os/selfHeal'
import { researchCurrentBestPractice } from '../os/domainResearch'
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
    // PS-RATCHET-01: filter by source in SQL. The previous form filtered AFTER a company-wide
    // LIMIT 20, which Janet's row volume exhausted, so this list was empirically always empty.
    recallMemory(companyId, undefined, 20, agentId).catch(() => [] as any[])
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

  // PS-RATCHET-01. Fixing the source filter above made these rows reachable for the FIRST time,
  // and the archive they unlock is not uniformly safe: 54 standup rows written before PS-PHANTOM-01
  // sit at confidence 0.9 with NO unverified marker — including Aria's 2026-07-19 "Built the
  // high-conversion landing page using Framer. It is live" and "Manually scraped 50 top-tier MSPs",
  // both fabrications. Shipping the filter fix without this would have handed every agent a
  // high-confidence fabricated history that had been unreachable by accident.
  //
  // So the marker is applied at READ time, not trusted from the row. A standup row is an unaudited
  // self-report by definition — that is a property of what it IS, not of when it was written — and
  // deriving the label here means it cannot be missing for any row, past or future. Writing a
  // correction into the archive instead would edit a record of what an agent actually said; this
  // annotates it without rewriting it.
  const memHistory = (memories as any[]).slice(0,10).map((m:any) => {
    const selfReport = String(m.key || '').startsWith('standup:')
    const labelled = /UNVERIFIED SELF-REPORT/.test(String(m.value || ''))
    const prefix = selfReport && !labelled
      ? '[UNVERIFIED SELF-REPORT — what you SAID at standup, not evidence that it happened] '
      : ''
    return `[${m.key}]: ${prefix}${m.value}`
  }).join('\n')

  // PS-CREDPHANTOM-01. These rows are CLOSED work, and the heading has to say so. Dating them
  // (above) fixed agents reporting old work as "completed yesterday" — but it did not stop the
  // other half: adopting a closed title as CURRENT work. On 2026-07-26 Aria correctly answered
  // "Nothing completed" from the ledger and then answered "Today's Focus: Developing the LinkedIn
  // Content and Manual Outreach Strategy for Kaan" — a task finished and reviewed on 07-25, and
  // the only place that title still existed was this block. Marcus did the same with
  // "Investigate Simulation Configuration and Reporting Gap". Neither had an open task at all.
  // The activity ledger is already the sole authority for what is open; say that here too, so the
  // two halves of the prompt cannot be read as disagreeing.
  return [
    taskHistory ? `Tasks you have already FINISHED (closed and scored — history only).\n` +
      `None of these is current work. What you are working on NOW comes ONLY from the ACTIVITY\n` +
      `LEDGER's assigned-tasks list; if that list is empty you are unassigned, and a title below\n` +
      `is NOT a substitute for one:\n${taskHistory}` : '',
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

// ── PS-CREDPHANTOM-01: a metric that carries its own reason ──────────────────
/**
 * The credential phantom was not fixed by telling the agents "capture is built". A sentence
 * elsewhere in the prompt loses to the number itself: next morning they read "Credentials
 * submitted: 0", re-derive the crisis, and the reassurance is a paragraph they have to remember
 * to apply. The number has to be unreadable AS a fault.
 *
 * So the reason travels WITH the value, at the only place the value is produced. There is no
 * rendering of this metric anywhere in the OS that can arrive without its explanation attached,
 * because the metric and the explanation are one string.
 *
 * Two failures fused into that 0, and both are answered here:
 *   • the capture layer's existence was invisible — nothing in the context said it shipped
 *     (2026-07-24, PS-CREDPAGE-01, pinned by server/credPage.test.ts), so "0" read as "missing";
 *   • the funnel was reported as PERCENTAGES ONLY. "Click 40.0% … submitted 0" looks like a
 *     confident sample with a hole in it. It was 2 clicks. Marcus wrote a 10/10 "the technical
 *     chain for the attack vector is broken" on a zero whose denominator was TWO.
 *
 * The annotation is deliberately CONDITIONAL: once a real submission lands, the explanation has
 * done its job and disappears, leaving a plain metric. A permanent disclaimer would itself become
 * noise to skip past — and would keep excusing a 0 that HAD become suspicious. If capture ever
 * does break, this line stops defending it as soon as the first submit is recorded.
 */
/**
 * PS-BAREMETRIC-01 — the same treatment for the rest of the class.
 *
 * The credential 0 was not special; it was just the one that got caught. Every zero in this brief
 * is read by agents whose job is to find problems, and a bare zero has exactly one obvious
 * explanation available to a reader who lacks context: something is broken. The standups show the
 * pattern repeating on revenue — Aria opening with "With $0 MRR…", Rex with "0 paying customers
 * despite 9 campaigns", and Finn drawing a fresh unit-economics/forecast task on nearly every
 * cycle, all from a metric that says $0 and nothing else.
 *
 * The ambiguity that actually matters here is one the number cannot express: **$0 that has never
 * been anything else** (pre-revenue) and **$0 that used to be positive** (churn to zero) are the
 * same string and opposite emergencies. So this reads whether any org has EVER activated a paid
 * plan, and says which of the two it is. That is the fact an agent cannot infer and keeps guessing.
 */
/**
 * PS-FAKEPIPELINE-01 — org admin contacts that are NOT sales leads and must be excluded from
 * lead/conversion counts. These are the founder's own internal org and known test signups; counting
 * them as prospects makes the agents strategize against a pipeline that isn't there (the same class
 * of error as fabricated MRR). Keep this list current — add the admin email, never fabricate a lead.
 *   • kaanari@mac.com            — founder; admin of "PhishSim Internal" (org 8). Internal, not a lead.
 *   • asadbek.munasar@forliion.com — one person, two throwaway test orgs ("ai worker" 6, "sending" 7),
 *                                    no trial timer. One duplicated test account, not two leads.
 * NOT excluded: info@belldesign.net ("egroth", org 9) — a genuine outside trial (exp 2026-08-08).
 * Emails are compared lower-cased.
 */
export const NON_LEAD_ORG_ADMIN_EMAILS: readonly string[] = [
  'kaanari@mac.com',
  'asadbek.munasar@forliion.com',
]

/**
 * PS-INTERNAL-FUNNEL-01 (2026-08-02, founder directive) — internal traffic is excluded from the
 * RATES, not merely annotated beside them.
 *
 * PS-INTERNAL-SIM-01 added a provenance warning under a blended funnel line. That was necessary
 * and insufficient: the rates themselves were still computed over all 5 rows, so the line still
 * literally read "Opened 5/5 (100.0%) | Clicked 2/5 (40.0%)" and an agent quoting the number
 * without the paragraph beneath it reproduced the original error exactly. A caveat under a number
 * does not fix the number. The denominator has to change.
 *
 * Established by direct query of ep-spring-leaf on 2026-08-02 — the full population, all 5 rows:
 *   • every row belongs to org 8 ("PhishSim Internal"), admin kaanari@mac.com;
 *   • every recipient is kaan@phishsimai.com — our own apex domain;
 *   • every ipAddress is 127.0.0.1 — localhost, i.e. generated on the dev machine, so not even
 *     a real network round-trip, let alone a real person;
 *   • three of five carry the synthetic UA "Mozilla/5.0";
 *   • two rows record a click or a report EARLIER than their own open — causally impossible for
 *     a human, and proof these were manual endpoint pokes rather than a funnel.
 * External sends: 0. So the honest external funnel is empty and every rate over it is undefined.
 */

/** Recipient domains that are OURS. A send to one of these is a self-test, never market data. */
export const INTERNAL_RECIPIENT_DOMAINS: readonly string[] = ['phishsimai.com']

/**
 * Orgs that are ours. `organizations` has NO internal/test boolean — confirmed against
 * information_schema on 2026-08-02, the columns are: id, name, slug, logoUrl, gamificationEnabled,
 * trainingEnabled, stripeCustomerId, stripeSubscriptionId, stripePriceId, plan, planActivatedAt,
 * planExpiresAt, createdAt, updatedAt. So these are pinned by id, which is a real liability: a new
 * test org created tomorrow is counted as a customer until someone edits this array.
 *
 * TODO(PS-INTERNAL-FUNNEL-02): add `organizations.is_internal boolean NOT NULL DEFAULT false`,
 * backfill 6/7/8, and read that column here instead of this list. Needs a prod migration, which
 * is a founder-approval gate — not taken in this change.
 *
 *   6 = "ai worker"         admin @forliion.com  — test tenant
 *   7 = "sending"           admin @forliion.com  — test tenant (0 targets, 0 campaigns)
 *   8 = "PhishSim Internal" admin @mac.com       — founder org, owns all 5 lifetime results
 */
export const INTERNAL_ORG_IDS: readonly number[] = [6, 7, 8]

/**
 * Below this external denominator we print counts only and no percentage, at any n. 30 is the
 * founder's standing reporting rule. It is deliberately a hard floor rather than a caveat: a
 * printed "40.0%" gets quoted downstream stripped of whatever qualifier sat next to it.
 */
export const MIN_RATE_DENOMINATOR = 30

export function revenueMetric(mrr: number, paying: number, freeOrgs: number, everPaid: number, oldestOrgAgeDays: number | null): string {
  if (paying > 0 || mrr > 0) return `MRR: $${Math.round(mrr).toLocaleString('en-US')} from ${paying} paying org(s)`
  const age = oldestOrgAgeDays === null ? '' :
    ` The oldest org is ${oldestOrgAgeDays} day(s) old, so no trial has had time to run its course.`
  if (everPaid > 0) {
    // The genuinely alarming case. Say so plainly — this helper exists to explain zeros, not to excuse them.
    return `MRR: $0 — ⚠️ ${everPaid} org(s) HAVE held a paid plan before and none does now. This is a drop to ` +
      `zero, NOT a pre-revenue state: revenue existed and stopped. Treat as churn and investigate.`
  }
  return `MRR: $0 — PRE-REVENUE, not a decline: no org has ever activated a paid plan, so there is no ` +
    `revenue to have lost. ${freeOrgs} org(s) are on free/trial and none has a Stripe subscription yet.${age} ` +
    `$0 is the arithmetically expected value before a first conversion and is NOT evidence of a broken ` +
    `checkout, pricing or billing system. The open question is FIRST CONVERSION (activation, offer, ICP fit), ` +
    `not a revenue fault. Do not open a billing/pricing investigation from this number alone.`
}

/**
 * PS-BAREMETRIC-01. A rate whose GOOD direction is not obvious invites the wrong reading in either
 * direction. "Reported 3/5 (60.0%)" is the training working — recipients recognising a simulated
 * phish and reporting it — but it sits in a list beside open/click rates where high means engaged,
 * so it reads as just another number. Janet's 2026-07-23 standup called the 60% report rate
 * "worthless if it doesn't drive revenue"; an agent hunting for faults can as easily read a LOW one
 * as a fault of the product rather than a training signal. State the direction with the value.
 */
export function reportRateMetric(reported: number, sent: number): string {
  const pct = sent > 0 ? ((reported / sent) * 100).toFixed(1) : '0.0'
  if (sent === 0) return `Reported 0/0 — nothing sent yet, so this is not measurable.`
  return `Reported ${reported}/${sent} (${pct}%) — HIGHER IS BETTER: this counts recipients who ` +
    `recognised the simulated phish and reported it, which is the security-awareness outcome the ` +
    `product is sold to produce. It is not a failure rate and not a complaint rate.`
}

export function submittedMetric(submitted: number, clicked: number): string {
  const built = 'capture layer BUILT AND LIVE since 2026-07-24 (PS-CREDPAGE-01)'
  if (submitted > 0) {
    // Real data exists — it speaks for itself, and a rate over clicks is now the honest framing.
    return `Credentials submitted: ${submitted} of ${clicked} click-through(s)`
  }
  if (clicked === 0) {
    // The zero is upstream of capture entirely. Nothing has even reached the page.
    return `Credentials submitted: 0 — ${built}; 0 click-throughs have reached the submit step, so ` +
      `there is nothing this number could have counted. It measures VISITOR BEHAVIOUR, not whether ` +
      `capture works, and at 0 clicks it cannot be evidence of a fault.`
  }
  return `Credentials submitted: 0 — ${built}; of ${clicked} click-through${clicked === 1 ? '' : 's'}, ` +
    `none has filled in the fake login form yet. This is a BEHAVIOURAL count over ${clicked} ` +
    `opportunit${clicked === 1 ? 'y' : 'ies'}, not a fault: at that denominator 0 is the expected reading and ` +
    `carries no information about whether capture works. By design the page records THAT a credential was ` +
    `submitted and never WHAT — so a working capture and an untried one look identical from this number ` +
    `alone. Do NOT read it as a broken attack chain, landing page, template config or reporting gap; that ` +
    `premise was investigated and CLOSED on 2026-07-24. A click that does not become a submit is a ` +
    `CONVERSION question (page credibility, pretext, audience), never an engineering-fault question.`
}

/**
 * PS-INTERNAL-SIM-01 (2026-07-29, founder directive) — our own test sends are NOT market data.
 *
 * Measured the morning this shipped: all 5 simulation results in the table belong to org 8,
 * "PhishSim Internal" — the founder's own org. Zero were sent to an outside company. Yet the
 * funnel line rendered them as bare product rates, and the agents read them as customer
 * behaviour. Vera's 07-29 standup: "The 40% click rate across our 5 sent simulations is a
 * critical urgency lever. Standard industry benchmarks are 10-15%." That is a market claim
 * derived from two clicks by us, on us — the same fabrication class as inventing a number,
 * except the number is real and only its MEANING is invented. Rex read the same rates as proof
 * of "high engagement, conversion friction"; Marcus as proof of a broken attack chain.
 *
 * A sample-size caveat did not stop it and could not: n=5 explains that the number is noisy,
 * not that it is OURS. Provenance is a different fact from precision, and it is the one that
 * makes benchmark comparison invalid at any n. So it travels with the metric, like every other
 * self-explaining number in this file.
 *
 * The note is CONDITIONAL on external sends existing: the moment real recipients appear, the
 * external rates are the honest ones and the warning narrows to the internal share. A permanent
 * disclaimer would be skipped past, and would keep discrediting data that had become real.
 */
export function simProvenanceNote(internalSent: number, externalSent: number, unknownSent: number): string {
  const total = internalSent + externalSent + unknownSent
  if (total === 0) return `No simulations have been sent yet, so there are no rates to interpret.`
  if (externalSent === 0) {
    const unk = unknownSent ? ` (${unknownSent} of them could not be attributed to an org owner — treated as unknown, not as external)` : ''
    return `🚨 PROVENANCE — THESE ARE NOT MARKET DATA: all ${total} simulation(s) were sent to our OWN ` +
      `internal/test org(s)${unk}. Zero were sent to a real external customer's employees. Every rate ` +
      `above therefore describes US testing OURSELVES, not how the market behaves. Do NOT compare them ` +
      `to industry benchmarks, do NOT call them engagement, vulnerability, urgency or demand signal, and ` +
      `do NOT build outreach narratives, pricing arguments or campaign strategy on them. They measure ` +
      `only that the product works end-to-end — which is genuinely useful, and is ALL they measure. ` +
      `Simulation metrics become market data when real external recipients exist at volume; until then, ` +
      `any sentence of the form "our click rate shows customers/MSPs ..." is fabricated insight.`
  }
  if (internalSent + unknownSent === 0) {
    return `Provenance: all ${total} simulation(s) went to external recipients — these are real customer data.`
  }
  return `⚠️ PROVENANCE — MIXED SAMPLE: of ${total} simulation(s), ${externalSent} went to external ` +
    `recipients and ${internalSent + unknownSent} to our own internal/test org(s). The blended rates above ` +
    `are part self-test and are NOT market data. Only the ${externalSent} external send(s) can support a ` +
    `claim about how the market behaves, and at that count say the raw number, never a benchmark comparison.`
}

export type FunnelCounts = {
  sent: number; opened: number; clicked: number; submitted: number; reported: number
}
export type ExcludedBreakdown = {
  /**
   * ACTUAL number of excluded rows. Must be counted independently, never derived by summing the
   * reason fields below: a row typically trips several rules at once (all 5 production rows trip
   * domain AND private-ip AND org simultaneously), so byDomain+byPrivateIp+byOrg = 15 for a
   * population of 5. The first draft of this function did exactly that and rendered "15
   * internal/test EXCLUDED" against 5 real rows — inventing 10 sends that do not exist, which is
   * the same fabrication class as the bug this whole change removes.
   */
  total: number
  /** Recipient address is on one of OUR domains. Overlaps the other reasons. */
  byDomain: number
  /** Event came from loopback or an RFC1918 private range. Overlaps the other reasons. */
  byPrivateIp: number
  /** Recipient org is one of ours. Overlaps the other reasons. */
  byOrg: number
  /** Org owner could not be resolved; withheld from the external funnel rather than assumed real. */
  unknown: number
}

/**
 * PS-INTERNAL-FUNNEL-01 — render the simulation funnel over EXTERNAL sends only.
 *
 * Three rules, in priority order:
 *   1. Excluded rows are never silently dropped. The count and the reason are always printed. A
 *      funnel that quietly shrank from 5 to 0 is worse than the blended one, because it looks like
 *      data loss and invites someone to "fix" it by putting the internal rows back.
 *   2. At an external denominator of 0 there is no funnel — say N/A, never 0%. "0%" is a measured
 *      finding; "N/A, n=0" is the absence of measurement. Collapsing the two is precisely the bug
 *      that produced "0% credential submission rate" as a reported conversion failure.
 *   3. Below MIN_RATE_DENOMINATOR, counts only — no percentage is emitted at all.
 */
export function externalFunnelMetric(ext: FunnelCounts, excluded: ExcludedBreakdown): string {
  const totalExcluded = excluded.total
  const reasons: string[] = []
  if (excluded.byOrg) reasons.push(`${excluded.byOrg} to our own org(s)`)
  if (excluded.byDomain) reasons.push(`${excluded.byDomain} to an @${INTERNAL_RECIPIENT_DOMAINS.join('/@')} address`)
  if (excluded.byPrivateIp) reasons.push(`${excluded.byPrivateIp} from localhost/private IP`)
  if (excluded.unknown) reasons.push(`${excluded.unknown} unattributable`)
  // A row usually trips several rules at once, so the reason counts overlap and will not sum to the
  // total. Say that, or the arithmetic looks broken.
  const detail = reasons.length ? ` — ${reasons.join(', ')}; reasons overlap, so they do not sum` : ''
  const excludedNote = totalExcluded
    ? ` (${totalExcluded} internal/test EXCLUDED from every rate${detail})`
    : ''

  if (ext.sent === 0) {
    return `Simulations: 0 external sends${excludedNote} | funnel N/A — n=0\n` +
      `   ↳ There is NO external simulation data. Not a low number, not a zero result: no measurement ` +
      `exists. Every open/click/report/submission figure the product has ever recorded came from the ` +
      `excluded rows above. Any sentence about "our open rate", "our click rate", engagement, ` +
      `vulnerability, urgency or demand is unsupported at this denominator — including a sentence ` +
      `saying those things are BAD. The correct read is: the product works end-to-end and has never ` +
      `been pointed at a real recipient. The constraint is acquisition, not the funnel.`
  }

  if (ext.sent < MIN_RATE_DENOMINATOR) {
    return `Simulations: ${ext.sent} external send(s)${excludedNote}\n` +
      `   ↳ Opened ${ext.opened}/${ext.sent} | Clicked ${ext.clicked}/${ext.sent} | ` +
      `Reported ${ext.reported}/${ext.sent} | Submitted ${ext.submitted}/${ext.sent}\n` +
      `   ↳ COUNTS ONLY — no percentage is shown because the external denominator (${ext.sent}) is ` +
      `below ${MIN_RATE_DENOMINATOR}. Quote these as raw counts. Do not convert them to a rate, do ` +
      `not compare them to an industry benchmark, and do not read a trend across them.`
  }

  const pct = (x: number) => ((x / ext.sent) * 100).toFixed(1)
  return `Simulations: ${ext.sent} external send(s)${excludedNote}\n` +
    `   ↳ Opened ${ext.opened}/${ext.sent} (${pct(ext.opened)}%) | Clicked ${ext.clicked}/${ext.sent} (${pct(ext.clicked)}%) | ` +
    `Reported ${ext.reported}/${ext.sent} (${pct(ext.reported)}%) | Submitted ${ext.submitted}/${ext.sent} (${pct(ext.submitted)}%)`
}

/**
 * PS-INTERNAL-FUNNEL-01 — capture-layer status, stated as deployment fact rather than inferred
 * from a count. Marcus's 2026-08-02 standup asserted the credential endpoint was "still unbuilt"
 * while `/c/:token` and `POST /submit/:token` had been live on main since 2026-07-24; the only
 * evidence for "unbuilt" was that `credentialSubmittedAt` was 0. This line removes the inference
 * by naming the routes, so a zero can never again be read as an absent feature.
 */
export function credentialCaptureStatus(submitted: number): string {
  return `Credential capture: BUILT AND LIVE (/c/:token, /submit/:token) | ${submitted} submission(s)`
}

export type SuspectedInternalOrg = { id: number; name: string; adminEmail: string }

/**
 * PS-INTERNAL-FUNNEL-01 — the tripwire on INTERNAL_ORG_IDS being a hardcoded list.
 *
 * The list is a known liability: a test org created tomorrow is counted as a real external
 * customer until a human edits the array, and the funnel lies again in exactly the way this
 * change removed. Until PS-INTERNAL-FUNNEL-02 adds `organizations.is_internal`, this detects the
 * drift and SHOUTS rather than letting it pass silently.
 *
 * DETECTION IS BROADER THAN THE FOUNDER'S BRIEF, deliberately — and it has to be. The directive
 * said "admin email @phishsimai.com", but measured against ep-spring-leaf on 2026-08-02 the three
 * known internal orgs have admins asadbek.munasar@forliion.com (orgs 6, 7) and kaanari@mac.com
 * (org 8). NOT ONE is @phishsimai.com. A check written to that letter would match 0 of 3 existing
 * test orgs and would miss a fourth created the same way — a tripwire that cannot fire on any
 * instance of the thing it watches for. So it fires on our own domain OR any address already
 * known to be ours (NON_LEAD_ORG_ADMIN_EMAILS), which is the pattern the data actually shows.
 *
 * Fail-LOUD, not fail-closed: it does not auto-exclude the org. Silently reclassifying a real
 * customer as internal would delete genuine market data, which is the costlier error — one is a
 * warning a human resolves, the other is data that disappears without anyone noticing.
 */
export function unflaggedInternalOrgWarning(orgs: readonly SuspectedInternalOrg[]): string {
  if (orgs.length === 0) return ''
  const list = orgs.map(o => `#${o.id} "${o.name}" (${o.adminEmail})`).join(', ')
  return `\n🚨 FUNNEL INTEGRITY — ${orgs.length} ORG(S) LOOK INTERNAL BUT ARE NOT EXCLUDED: ${list}. ` +
    `Their admin contact is one of ours, but their id is not in INTERNAL_ORG_IDS, so every ` +
    `simulation they run is being counted as EXTERNAL market data in the funnel above. If these are ` +
    `test orgs, the external numbers in this brief are INFLATED and must not be quoted until the ` +
    `list is corrected (server/lib/kaan_os_v4.ts, INTERNAL_ORG_IDS). If any is a genuine customer, ` +
    `no action is needed — say so explicitly rather than leaving this warning to recur. Root fix is ` +
    `PS-INTERNAL-FUNNEL-02 (an is_internal column), which needs a prod migration.`
}

/**
 * PS-TOPFUNNEL-01 (2026-07-29, founder directive) — put the funnel's ACTUAL constraint in front
 * of the team.
 *
 * Every agent on 07-29 proposed conversion work — landing-page drop-off, a pricing email to the
 * "4 free orgs", a follow-up cadence, CRM stage mapping — on a funnel that almost nobody has
 * entered. That was not five independent misjudgements: the context they read described the
 * BOTTOM of the funnel in detail (orgs, MRR, sim rates) and never mentioned the top at all. Cold
 * outreach — the one channel actually acquiring anyone — was invisible in the prompt, so it was
 * invisible in the plans. Agents optimise what they can see.
 *
 * So the top of the funnel is stated first, with real sends separated from our own test data,
 * and the two failure modes that a raw send count hides are named explicitly:
 *   • a STALLED sender looks identical to a healthy one if you only print a lifetime total;
 *   • 0 replies means nothing if inbound capture was never wired — "nobody answered" and "we
 *     cannot hear answers" are the same string and opposite problems, so we refuse to report
 *     the first when we cannot rule out the second.
 */
export function topOfFunnelMetric(f: {
  touchedEver: number; touched7d: number; touchedToday: number; lastSendIso: string | null
  touch2: number; replied: number; bounced: number; unsubscribed: number
  readyPool: number; replyDraftsEver: number; newRealSignups7d: number; realLeadsTotal: number
  /** OUR OWN addresses that received touch-1. Counted, excluded from every rate above. */
  internalExcl?: number
  /** Replies from those addresses — self-tests, never market signal. */
  internalReplies?: number
  nowMs: number
}): string {
  const lines: string[] = ['── TOP OF FUNNEL (REAL EXTERNAL PROSPECTS — this is the binding constraint) ──']

  // Liveness first. A lifetime total cannot distinguish "sending 50/day" from "stopped a week ago".
  const ageH = f.lastSendIso ? (f.nowMs - new Date(f.lastSendIso).getTime()) / 3_600_000 : null
  if (f.touchedEver === 0) {
    lines.push(`Cold outreach (Sarah, sarah@phishsimai.com): 🔴 NEVER SENT. Not one first-touch email has ` +
      `gone to a real MSP. There is no top of funnel at all — this is the ONLY thing that matters today.`)
  } else if (ageH === null || ageH > 36) {
    lines.push(`Cold outreach (Sarah): 🔴 STALLED — ${f.touchedEver} MSP(s) contacted lifetime, but the last ` +
      `send was ${ageH === null ? 'never recorded' : `${Math.round(ageH)}h ago`}. The sender is NOT running. ` +
      `Nothing downstream can improve while this is stopped; restarting it outranks every conversion task.`)
  } else {
    lines.push(`Cold outreach (Sarah): ✅ LIVE — ${f.touched7d} real MSP(s) contacted in the last 7 days ` +
      `(${f.touchedToday} today, ${f.touchedEver} lifetime, last send ${Math.round(ageH)}h ago). These are ` +
      `genuine external companies, NOT our test orgs.`)
  }

  // Follow-up depth. A single-touch cold campaign is the standard explanation for a zero reply rate,
  // and it is invisible in a send count — 523 sends reads as 523 conversations attempted.
  if (f.touchedEver > 0) {
    const pct = ((f.touch2 / f.touchedEver) * 100).toFixed(0)
    lines.push(f.touch2 * 4 < f.touchedEver
      ? `Follow-up: ⚠️ effectively SINGLE-TOUCH — only ${f.touch2} of ${f.touchedEver} contacted leads (${pct}%) ` +
        `ever got a second email. The sequence's follow-up steps are switched off pending honest copy. Most ` +
        `cold replies come from touches 2-4, so a low reply rate here is EXPECTED and is not evidence that ` +
        `the offer, ICP or copy is wrong. Writing follow-up copy is a top-of-funnel fix.`
      : `Follow-up: ${f.touch2} of ${f.touchedEver} contacted leads have received a second touch.`)
  }

  // Replies — the number the whole strategy turns on, and the one we cannot currently trust.
  if (f.replied === 0 && f.replyDraftsEver === 0 && f.touchedEver > 0) {
    lines.push(`Replies: 0 recorded — ⚠️ UNVERIFIED, DO NOT REPORT AS "nobody replied". Inbound capture ` +
      `depends on a mail relay POSTing to /api/os/webhooks/resend-inbound, and that endpoint has produced ` +
      `ZERO rows ever. "No prospect replied" and "we cannot receive replies" are indistinguishable from ` +
      `this number. Confirming the relay actually fires is a prerequisite for any claim about reply rate.`)
  } else {
    // PS-OUTREACH-INTERNAL-01: state the EXTERNAL reply count, and say plainly when the only
    // captured reply was one of ours. "1 reply from 884" reads as first market traction; if that 1
    // is the founder typing TEST to check the pipe, it is the opposite of traction and every plan
    // built on it is built on nothing.
    const internal = f.internalExcl ?? 0
    const selfReplies = f.internalReplies ?? 0
    const excl = internal
      ? ` · ${internal} of our own address(es) EXCLUDED from this count${selfReplies ? `, incl. ${selfReplies} self-test repl(y/ies)` : ''}`
      : ''
    // PS-METRIC-QUOTE-01 (2026-08-17): the reply RATE is now computed here and handed over ready to
    // quote. Bounce and unsubscribe rates were already precomputed; this one was not, so every agent
    // divided it themselves and they disagreed in the same standup — Finn published 0.07% and Vera
    // 0.13% off the identical 2-from-1,477, and Janet then repeated Finn's figure to the founder.
    // Two different reply rates in one brief destroys trust in every other number in it.
    const replyPct = f.touchedEver > 0 ? ((f.replied / f.touchedEver) * 100).toFixed(2) : '0.00'
    lines.push(`Replies: ${f.replied} EXTERNAL from ${f.touchedEver} contacted ` +
      `(${f.replyDraftsEver} inbound message(s) captured, so the capture path is PROVEN LIVE)${excl}.`)
    lines.push(`Reply rate: ${replyPct}% (${f.replied}/${f.touchedEver}). QUOTE THIS FIGURE VERBATIM — ` +
      `do not recalculate it, and do not round it to a different number of decimals. If your report ` +
      `states a reply rate that differs from this line, your report is wrong.`)
    if (f.replied === 0 && f.replyDraftsEver > 0) {
      lines.push(`   ↳ Zero EXTERNAL replies so far, but this is now a measured zero rather than an ` +
        `unverified one: inbound capture has demonstrably written a row, so "nobody replied" and ` +
        `"we cannot hear replies" are no longer indistinguishable. At this denominator do not read ` +
        `it as the message failing — it is the honest starting point.`)
    }
  }

  // Deliverability, and the one funnel stage we do not instrument at all.
  if (f.touchedEver > 0) {
    const r = (x: number) => ((x / f.touchedEver) * 100).toFixed(1)
    lines.push(`Deliverability: ${f.bounced} bounced (${r(f.bounced)}%) · ${f.unsubscribed} unsubscribed (${r(f.unsubscribed)}%) · ${f.readyPool} enriched lead(s) queued and not yet contacted.`)
    // PS-BACKFILL-NOTE-01 (2026-08-03) — the bounce rate JUMPED 2.8% -> 4.3% on this date and an
    // agent comparing week-over-week will read that as deliverability degrading and propose a
    // sender/list remediation that is not warranted. It is the opposite: the old figure was wrong.
    // 161 sends and 18 bounces from the 2026-07-04..07-18 era were never written to
    // ps_outreach_leads (an earlier sender path did not persist leads; recording starts 07-11), so
    // the denominator AND numerator were both short. Reconciled from the Resend export on
    // 2026-08-03 — gap re-verified at 0 rows afterwards.
    //
    // Time-boxed deliberately: this explains a one-off step change, and a permanent disclaimer
    // would still be here in six months explaining a discontinuity nobody can see any more.
    if (Date.now() < Date.parse('2026-09-03T00:00:00Z')) {
      lines.push(`   ↳ NOTE (bounce rate, expires 2026-09-03): 2.8%→4.3% is CORRECTED COUNTING, not a ` +
        `deliverability regression — same population, finally measured. 161 sends and 18 bounces from ` +
        `2026-07-04..07-18 were never recorded (pre-dating the current sender path) and were backfilled ` +
        `from the Resend export on 2026-08-03. Do NOT open a deliverability investigation from this step ` +
        `change, and do NOT read it as a week-over-week trend.`)
    }
  }
  lines.push(`Opens on cold outreach: INSTRUMENTED (PS-OPEN-TRACK-01) but currently INERT — the pixel, the ` +
    `/api/os/open route, and ps_outreach_leads.open_count/first_opened_at/last_opened_at all exist and are ` +
    `wired into sequences.ts, but touch1/touch2 bodies are text-only (PS-COPY-PLAINTEXT-01), so no pixel is ` +
    `ever delivered and every lead's open_count stays 0. There is still no honest external open rate to ` +
    `state — a 0% read here would mean "no HTML shipped", not "nobody opened". Any "open rate" figure in ` +
    `this brief refers to SIMULATIONS sent to our own internal org, never to cold outreach.`)
  lines.push(`   ↳ INERT IS NOT BROKEN. Text-only cold email is a deliberate positioning decision ` +
    `(PS-COPY-PLAINTEXT-01: a plain-text note reads as personal, an HTML shell reads as bulk), so do NOT ` +
    `propose "fixing the open tracking instrumentation" — there is no defect in it. Shipping an HTML body ` +
    `to make the pixel fire REVERSES that decision and is the founder's call, not an engineering task. ` +
    `A standup that assigns this as a bug wastes a cycle: on 2026-08-16 exactly that framing produced a ` +
    `917-line rewrite of the email subsystem that the destructive-diff guard correctly refused.`)

  // Inbound conversion — the number every "convert our free orgs" plan is really about.
  lines.push(`NEW real prospects that entered this week: ${f.newRealSignups7d} · REAL prospects ever: ` +
    `${f.realLeadsTotal}. That is the denominator for every conversion idea. With a number this small, ` +
    `conversion work (landing page, pricing, cadence, CRM stages) cannot move revenue — there is nobody ` +
    `in the funnel to convert. Bringing NEW real MSPs in is the priority; propose top-of-funnel work.`)

  return lines.join('\n')
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
// Exported (PS-INTERNAL-FUNNEL-01) so the brief's metrics block can be rendered against a real
// database and inspected verbatim, without going through a standup that would also spend LLM
// calls. It is read-only: every statement inside is a SELECT.
export async function getCompanyContext(sql: any): Promise<string> {
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

  const [orgRows, camps, results, orgAges, leadOrgs, unflagged, outreach, replyDrafts, newSignups] = await Promise.all([
    q('organizations', sql`SELECT plan::text AS plan, "stripePriceId" AS price_id, count(*)::int AS n
        FROM organizations GROUP BY plan, "stripePriceId"`, [] as any[]),
    q('campaigns', sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')::int AS this_week
        FROM campaigns`, [{ total: 0, this_week: 0 }]),
    // PS-INTERNAL-FUNNEL-01: classify every sent row as internal / unknown / external FIRST, then
    // aggregate the funnel over EXTERNAL only. The excluded rows are counted and returned beside
    // the funnel — never dropped — so the brief can always state what was removed and why.
    //
    // A row is INTERNAL if ANY of: its org is one of ours, its org admin is one of us, the
    // recipient is on one of our domains, or the event came from loopback/RFC1918. Any one of
    // those is sufficient — the tests are OR'd, and a row that trips several is still one row.
    // `targets` is LEFT JOINed because targets get deleted while their results persist (2 target
    // rows survive for 5 results), so a NULL recipient must not resurrect a row as external.
    //
    // The private-IP test is string-based on purpose: `ipAddress` is a varchar that can hold
    // anything, and `::inet` throws on malformed input, which would take down the whole brief.
    q('campaign_results', sql`
      SELECT count(*) FILTER (WHERE bucket = 'external')::int                    AS sent,
             count(*) FILTER (WHERE bucket = 'external' AND opened)::int         AS opened,
             count(*) FILTER (WHERE bucket = 'external' AND clicked)::int        AS clicked,
             count(*) FILTER (WHERE bucket = 'external' AND submitted)::int      AS submitted,
             count(*) FILTER (WHERE bucket = 'external' AND reported)::int       AS reported,
             count(*) FILTER (WHERE bucket = 'internal')::int                    AS internal_sent,
             count(*) FILTER (WHERE bucket = 'unknown')::int                     AS unknown_sent,
             count(*) FILTER (WHERE bucket = 'internal' AND is_int_domain)::int  AS excl_domain,
             count(*) FILTER (WHERE bucket = 'internal' AND is_priv_ip)::int     AS excl_priv_ip,
             count(*) FILTER (WHERE bucket = 'internal' AND is_int_org)::int     AS excl_org
      FROM (
        SELECT
          CASE WHEN is_int_org OR is_int_owner OR is_int_domain OR is_priv_ip THEN 'internal'
               WHEN owner IS NULL THEN 'unknown'
               ELSE 'external' END AS bucket,
          is_int_org, is_int_domain, is_priv_ip, opened, clicked, submitted, reported
        FROM (
          SELECT
            r."orgId" = ANY(${INTERNAL_ORG_IDS}::int[])                      AS is_int_org,
            lower(split_part(t.email, '@', 2)) = ANY(${INTERNAL_RECIPIENT_DOMAINS}) AS is_int_domain,
            COALESCE(r."ipAddress" = '127.0.0.1' OR r."ipAddress" LIKE '127.%'
                  OR r."ipAddress" = '::1'       OR r."ipAddress" = '0:0:0:0:0:0:0:1'
                  OR r."ipAddress" LIKE '10.%'   OR r."ipAddress" LIKE '192.168.%'
                  OR r."ipAddress" ~ '^172\\.(1[6-9]|2[0-9]|3[01])\\.', false) AS is_priv_ip,
            (SELECT lower(u.email) FROM org_members m JOIN users u ON u.id = m."userId"
               WHERE m."orgId" = r."orgId" AND m.role = 'admin' AND u.email IS NOT NULL
               ORDER BY m.id ASC LIMIT 1)                                    AS owner,
            r."emailOpenedAt"         IS NOT NULL AS opened,
            r."linkClickedAt"         IS NOT NULL AS clicked,
            r."credentialSubmittedAt" IS NOT NULL AS submitted,
            r."reportedAt"            IS NOT NULL AS reported
          FROM campaign_results r
          LEFT JOIN targets t ON t.id = r."targetId"
          WHERE r."emailSentAt" IS NOT NULL
        ) c
        CROSS JOIN LATERAL (SELECT c.owner = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}) AS is_int_owner) o
      ) t`, [{ sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0,
               internal_sent: 0, unknown_sent: 0, excl_domain: 0, excl_priv_ip: 0, excl_org: 0 }]),
    // PS-BAREMETRIC-01: the two facts that tell pre-revenue apart from churn-to-zero. `ever_paid`
    // counts orgs that have ever activated a paid plan — if that is 0, $0 MRR cannot be a decline.
    q('org_ages', sql`SELECT count(*) FILTER (WHERE "planActivatedAt" IS NOT NULL)::int AS ever_paid,
               EXTRACT(DAY FROM now() - min("createdAt"))::int AS oldest_days
        FROM organizations`, [{ ever_paid: 0, oldest_days: null }]),
    // PS-FAKEPIPELINE-01 (2026-07-28, founder directive). "N free orgs" was read as a conversion
    // pipeline, but most of it is not a pipeline: the founder's own internal org and a duplicated
    // test signup are not leads, and strategizing against them is the same class of error as
    // fabricated MRR — a real-looking number that is mostly not real. Count free orgs whose ADMIN
    // contact is in NON_LEAD_ORG_ADMIN_EMAILS so the brief can report REAL leads and annotate the
    // rest, rather than silently inflating the denominator. A free org with a NULL admin email is
    // NOT excluded (fail-open: we never hide a real org, we only subtract KNOWN internal/test ones).
    q('lead_orgs', sql`
      SELECT count(*) FILTER (WHERE is_excluded)::int AS free_excluded
      FROM (
        SELECT lower((
          SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
          WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
          ORDER BY m.id ASC LIMIT 1
        )) = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}) AS is_excluded
        FROM organizations o WHERE o.plan = 'free'
      ) t`, [{ free_excluded: 0 }]),
    // PS-INTERNAL-FUNNEL-01: tripwire on the hardcoded INTERNAL_ORG_IDS list. Finds orgs whose
    // admin contact is one of OURS but whose id was never added to the list — i.e. a test org
    // created after this code shipped, silently counting as external market data. Matches our own
    // domain OR a known-internal address, because the existing test orgs use @forliion.com and
    // @mac.com, not @phishsimai.com. Detect-and-shout only; it never auto-excludes.
    q('unflagged_internal', sql`
      SELECT id, name, admin_email FROM (
        SELECT o.id, o.name, lower((
          SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
          WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
          ORDER BY m.id ASC LIMIT 1
        )) AS admin_email
        FROM organizations o
      ) t
      WHERE admin_email IS NOT NULL
        AND (admin_email LIKE ${'%@' + INTERNAL_RECIPIENT_DOMAINS[0]}
             OR admin_email = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}))
        AND NOT (id = ANY(${INTERNAL_ORG_IDS}::int[]))
      ORDER BY id`, [] as any[]),
    // PS-INTERNAL-SIM-01's separate `sim_provenance` query was REMOVED by PS-INTERNAL-FUNNEL-01:
    // the campaign_results query above now performs the same three-way split (internal / unknown /
    // external) as part of setting the funnel denominator, and returns those counts directly. Two
    // queries computing "how many sends were ours" by different rules — that one keyed only on the
    // org admin email, this one also on recipient domain, org id and source IP — would drift apart
    // and put two different internal counts in the same brief.
    // PS-TOPFUNNEL-01: the outbound channel that actually acquires people. `touched_today` and
    // `last_send` exist so a STALLED sender cannot hide behind a healthy lifetime total.
    // PS-OUTREACH-INTERNAL-01 (2026-08-03, founder directive) — our own addresses are NOT market
    // data, in the OUTREACH funnel exactly as in the simulation funnel.
    //
    // Measured: kaanari@mac.com (the founder's personal address) was on the cold list and received
    // touch-1 on 2026-07-18. On 2026-08-03 he sent a one-word "TEST" reply to verify the newly
    // wired Gmail capture, and it landed as replied=true, pipeline_stage='engaged'. That single row
    // was about to become the ENTIRE numerator of the reply metric — "1 reply from 884 contacted",
    // where the 1 is us. Identical to the 5 localhost simulations that produced "100% open rate",
    // and reintroduced here by the 2026-08-03 Resend backfill, which matched on email alone and
    // filtered nothing internal.
    //
    // Excluded three ways so a future row cannot slip through a single gap: an address on one of
    // OUR domains, an address already known to be ours (NON_LEAD_ORG_ADMIN_EMAILS), or a row
    // explicitly staged 'internal_test'. Excluded rows are COUNTED, never dropped — internal_excl
    // travels with the metric so the brief can always say what was removed.
    q('outreach', sql`SELECT
             count(*) FILTER (WHERE NOT is_internal AND touch1_sent_at IS NOT NULL)::int AS touched_ever,
             count(*) FILTER (WHERE NOT is_internal AND touch1_sent_at > now() - interval '7 days')::int AS touched_7d,
             count(*) FILTER (WHERE NOT is_internal AND touch1_sent_at > now() - interval '24 hours')::int AS touched_today,
             count(*) FILTER (WHERE NOT is_internal AND touch2_sent_at IS NOT NULL)::int AS touch2,
             count(*) FILTER (WHERE NOT is_internal AND replied)::int AS replied,
             count(*) FILTER (WHERE NOT is_internal AND bounced)::int AS bounced,
             count(*) FILTER (WHERE NOT is_internal AND unsubscribed)::int AS unsubscribed,
             count(*) FILTER (WHERE NOT is_internal AND touch1_sent_at IS NULL AND pipeline_stage = 'prospect')::int AS ready_pool,
             count(*) FILTER (WHERE is_internal AND touch1_sent_at IS NOT NULL)::int AS internal_excl,
             count(*) FILTER (WHERE is_internal AND replied)::int AS internal_replies,
             max(touch1_sent_at) FILTER (WHERE NOT is_internal) AS last_send
        FROM (
          SELECT touch1_sent_at, touch2_sent_at, replied, bounced, unsubscribed, pipeline_stage,
                 (lower(email) = ANY(${NON_LEAD_ORG_ADMIN_EMAILS})
                  OR lower(split_part(email, '@', 2)) = ANY(${INTERNAL_RECIPIENT_DOMAINS})
                  OR pipeline_stage = 'internal_test') AS is_internal
          FROM ps_outreach_leads
        ) t`,
      [{ touched_ever: 0, touched_7d: 0, touched_today: 0, touch2: 0, replied: 0, bounced: 0, unsubscribed: 0, ready_pool: 0, internal_excl: 0, internal_replies: 0, last_send: null }]),
    // PS-TOPFUNNEL-01: has inbound reply capture EVER received anything? Distinguishes "no one
    // replied" from "we cannot hear replies" — see topOfFunnelMetric.
    q('reply_drafts', sql`SELECT count(*)::int AS n FROM outreach_reply_drafts`, [{ n: 0 }]),
    // PS-TOPFUNNEL-01: genuinely NEW external signups this week, internal/test orgs excluded.
    q('new_signups', sql`
      SELECT count(*)::int AS n FROM organizations o
      WHERE o."createdAt" > now() - interval '7 days'
        AND COALESCE(lower((
          SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
          WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
          ORDER BY m.id ASC LIMIT 1
        )) = ANY(${NON_LEAD_ORG_ADMIN_EMAILS}), false) = false`, [{ n: 0 }]),
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

  const n = (x: any, d: any) => `${Number(x)}/${Number(d)} (${rate(x, d)}%)`

  const ages = (orgAges as any[])[0] || { ever_paid: 0, oldest_days: null }
  const legacyNote = legacyUnlimited ? ` (excludes ${legacyUnlimited} legacy 'unlimited' org(s) — no Stripe product)` : ''

  // PS-FAKEPIPELINE-01: report REAL free leads, not the raw free count. `free` includes the
  // founder's internal org and test signups; subtract those so the agents don't strategize a
  // conversion funnel around a pipeline that isn't there. Annotate the exclusion — never hide it.
  const freeExcluded = Number((leadOrgs as any[])[0]?.free_excluded ?? 0)
  const freeLeads = Math.max(0, free - freeExcluded)
  const pipelineNote = freeExcluded
    ? ` (${freeExcluded} internal/test org(s) EXCLUDED — founder + test accounts, not leads)`
    : ''

  // PS-TOPFUNNEL-01: the top of the funnel is rendered FIRST and the simulation block is explicitly
  // labelled as the bottom. Ordering is doing real work here — on 2026-07-29 all five agents opened
  // their standup with a bottom-funnel metric because that was the only kind the context contained.
  const of_ = (outreach as any[])[0] || {}
  const topFunnel = topOfFunnelMetric({
    touchedEver: Number(of_.touched_ever ?? 0),
    touched7d: Number(of_.touched_7d ?? 0),
    touchedToday: Number(of_.touched_today ?? 0),
    lastSendIso: of_.last_send ? new Date(of_.last_send).toISOString() : null,
    touch2: Number(of_.touch2 ?? 0),
    replied: Number(of_.replied ?? 0),
    bounced: Number(of_.bounced ?? 0),
    unsubscribed: Number(of_.unsubscribed ?? 0),
    readyPool: Number(of_.ready_pool ?? 0),
    internalExcl: Number(of_.internal_excl ?? 0),
    internalReplies: Number(of_.internal_replies ?? 0),
    replyDraftsEver: Number((replyDrafts as any[])[0]?.n ?? 0),
    newRealSignups7d: Number((newSignups as any[])[0]?.n ?? 0),
    realLeadsTotal: freeLeads + paying,
    nowMs: Date.now(),
  })

  // PS-INTERNAL-FUNNEL-01: provenance is derived from the SAME classification that sets the funnel
  // denominator, not from a second query with its own rules. Two independent internal/external
  // counts in one brief will eventually disagree, and a brief that contradicts itself gets resolved
  // by whichever number the reader liked better.
  const ext: FunnelCounts = {
    sent: Number(s.sent ?? 0), opened: Number(s.opened ?? 0), clicked: Number(s.clicked ?? 0),
    submitted: Number(s.submitted ?? 0), reported: Number(s.reported ?? 0),
  }
  const internalSent = Number(s.internal_sent ?? 0)
  const suspectedInternal: SuspectedInternalOrg[] = ((unflagged as any[]) || []).map(r => ({
    id: Number(r.id), name: String(r.name ?? ''), adminEmail: String(r.admin_email ?? ''),
  }))
  const excluded: ExcludedBreakdown = {
    // Counted from the rows themselves, NOT summed from the reasons below — see ExcludedBreakdown.
    total: internalSent + Number(s.unknown_sent ?? 0),
    byDomain: Number(s.excl_domain ?? 0),
    byPrivateIp: Number(s.excl_priv_ip ?? 0),
    byOrg: Number(s.excl_org ?? 0),
    unknown: Number(s.unknown_sent ?? 0),
  }

  return `${topFunnel}

── BOTTOM OF FUNNEL (orgs already signed up) ──
Orgs: ${free + paying} total | Paying: ${paying} (${mix}) | Free/trial leads: ${freeLeads}${pipelineNote}
${revenueMetric(mrr, paying, freeLeads, Number(ages.ever_paid ?? 0), ages.oldest_days == null ? null : Number(ages.oldest_days))}${legacyNote}
Campaigns: ${c.total} total | ${c.this_week} created this week

── PRODUCT USAGE (simulations run INSIDE signed-up orgs — not a market signal) ──
${externalFunnelMetric(ext, excluded)}
${credentialCaptureStatus(ext.submitted)}${ext.sent > 0 ? `
${reportRateMetric(ext.reported, ext.sent)}
${submittedMetric(ext.submitted, ext.clicked)}` : ''}
${simProvenanceNote(internalSent, ext.sent, excluded.unknown)}
⚠️ SAMPLE SIZE: every figure above is over ${ext.sent} EXTERNAL sent email(s). These are counts, not
trends — do not reason about a percentage without saying the raw number it came from.${unflaggedInternalOrgWarning(suspectedInternal)}${infra}${warn}`
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

// ── PS-CREDPHANTOM-01: tasks whose PREMISE is void ───────────────────────────
/**
 * Title dedupe (above) cannot stop this class of task, and that is the whole reason this exists.
 * The credential phantom was re-minted under a DIFFERENT title every time — "Investigate
 * Credential Submission Funnel" (07-24, cancelled), then "Investigate Simulation Configuration
 * and Reporting Gap" (07-25) — so normalizeTaskTitle saw two unrelated strings and let both
 * through. What repeats is not the wording, it is the PREMISE: "credential submissions are 0,
 * therefore something is broken". That premise is false (capture shipped 2026-07-24; the 0 is
 * behavioural over 2 clicks), so every task built on it is work with no possible finding.
 *
 * Matching a premise rather than a title means a rephrase does not evade it. A task must name one
 * of these SUBJECTS *and* frame it as a defect or an investigation before it is refused — so
 * "Draft fake-login page copy variants" or "Improve click→submit conversion" still go through,
 * because neither asserts a fault.
 *
 * This is a LIST because the pattern will recur with a different phantom. Add an entry, with the
 * evidence that voided it and the date, and the loop stops re-manufacturing that one too.
 */
export type VoidPremise = { id: string; subject: RegExp; frame: RegExp; reason: string }
export const VOID_PREMISE_TASKS: VoidPremise[] = [
  {
    id: 'credential-capture-phantom',
    subject: /credential[- ](capture|submission|harvest)|submission funnel|capture layer|data[- ]capture|fake[- ]login|simulation configuration|attack (chain|vector)/i,
    frame: /investigat|diagnos|root[- ]cause|troubleshoot|debug|audit|why|broken|break|fail|fault|gap|misconfigur|not working|\bissue\b|\b0%|\bzero\b/i,
    reason:
      'PREMISE VOID (PS-CREDPHANTOM-01): credential capture is built and live — PS-CREDPAGE-01 shipped ' +
      '2026-07-24, pinned by server/credPage.test.ts. "Credentials submitted: 0" is a behavioural result ' +
      'over a handful of clicks, not a fault, and was already investigated and closed. There is no defect ' +
      'here to find. And do NOT re-issue this as a "conversion" question either (PS-SIMFRICTION-01): ' +
      'every simulation ever sent went to our own internal org, so there is no visitor behaviour to ' +
      'analyse — only ours. The real gap is TOP of funnel: bringing new external MSPs in.',
  },
  {
    // PS-CREDCAPTURE-DEFAULT-01 (2026-07-28, founder directive). The credential phantom's twin: not
    // "investigate why capture is 0" (caught above) but "BUILD capture-by-default / expose safe_mode".
    // That framing carries no fault word, so the rule above lets it through — proven at issue time.
    // It must be refused because the thing it asks to build is a LIABILITY, not because it has no
    // finding: `safe_mode` does not exist anywhere in code or the prod schema, and by design the fake
    // login page records THAT a credential was submitted and NEVER the password value (no `name` on
    // the input; the /submit handler reads only the token — credPage.test.ts). Storing real employee
    // passwords is exactly what this design refuses to do. Any task asking to store/persist the typed
    // credential, or to "expose safe_mode" so campaigns "capture credentials by default", is rejected.
    // NOTE: this is the DANGEROUS reading of "capture their data". The BENIGN one — collecting a free
    // org's signup CONTACT info (email/name/org) for sales follow-up — is a different thing entirely,
    // already supported via org_members/users and consumed by trialNudges. If that is the intent,
    // re-issue it as lead/contact follow-up (no passwords, no safe_mode) and it will pass.
    id: 'credential-capture-by-default',
    // Key on the DANGER SIGNAL, never the subject noun. "credential capture template" and
    // "credential harvest simulation" are legitimate product work and MUST pass (voidPremise.test.ts
    // pins this) — so the subject matches only: safe_mode (a thing that does not exist), capture/harvest
    // NEAR credential (paired with an enable/store frame below), or a store-verb near password/credential.
    // The frame is intent-to-enable/store — deliberately NOT bare "capture"/"harvest", or a template
    // task would trip it. Subject AND frame must both hit, so "add a credential capture template" (no
    // enable/store word) falls through, while "capture credentials by default" / "store the password" do not.
    subject: /safe[_ ]?mode|(capture|harvest)[- a-z0-9]{0,20}credentials?|credentials?[- a-z0-9]{0,20}(capture|harvest)|(store|persist|save|warehouse|keep|retain)[- a-z0-9]{0,24}(passwords?|credentials?)/i,
    frame: /by default|expose|enable|turn[- ]?on|store|persist|save|warehouse|retain|\blog\b|warehous/i,
    reason:
      'PREMISE VOID (PS-CREDCAPTURE-DEFAULT-01): there is nothing to expose and nothing to build. ' +
      '`safe_mode` does not exist in the codebase or the prod schema, and credential capture is already ' +
      'built the only defensible way (PS-CREDPAGE-01, pinned by server/credPage.test.ts): the fake login ' +
      'page records THAT a submission happened, keyed to the target/campaign, and NEVER the password — ' +
      'the input has no name attribute and the /submit handler reads only the token. Storing real ' +
      'employee passwords is a security/legal liability this design deliberately refuses; do NOT build ' +
      'capture-by-default. If the real goal is following up with free/trial orgs to convert them, that is ' +
      'a LEAD task — the signup contact (email/name/org) is already in org_members/users and used by ' +
      'trialNudges; re-issue it as contact follow-up (no passwords, no safe_mode) and it will pass.',
  },
  {
    // PS-SIMFRICTION-01 (2026-07-29, founder directive). The credential phantom's THIRD costume,
    // and the one that proved the first rule was keyed too literally. On 07-29 Marcus asked to
    // "review the conversion drop-off between the 40% click rate and 0% credential submission …
    // determine if this is a UX friction issue on the landing page … and propose a fix to increase
    // data capture", and Janet issued it as "Analyze Landing Page Conversion Drop-off". That title
    // names no credential, asserts no fault, and sailed through both rules above — verified before
    // this entry existed. The premise survived by being renamed.
    //
    // It is void for a reason no amount of rephrasing touches: ALL 5 simulations ever sent belong
    // to org 8, "PhishSim Internal" — the founder's own org. The 40% click rate is 2 clicks by us.
    // There is no visitor whose friction could be studied, so a UX analysis of that drop-off has no
    // possible finding, and "increase data capture" is the rejected liability idea in yet newer
    // words. The fix for a click that never becomes a submit is real external recipients, not a
    // page change.
    //
    // The subject deliberately requires the SIMULATION landing page or the click→submit step, NOT
    // "landing page" alone: work on the MARKETING site's signup conversion is legitimate top-of-
    // funnel work and must pass. Where the wording is genuinely ambiguous ("landing page conversion
    // drop-off" — Janet's exact title) it IS refused, and the reason says how to re-issue the
    // marketing-site version. Forcing that one word of disambiguation is the point: this thread has
    // survived three rewordings precisely because nobody had to say which page they meant.
    id: 'sim-landing-page-friction',
    subject: /(landing|fake[- ]?login|phish(ing)?[- ]?)\s?page|click[\s-]*(through)?[\s-]*(to|→|->|vs\.?|versus|and)?[\s-]*(credential|submi)|submi\w*[\s-]*(rate|drop|funnel|step)|drop[\s-]?off/i,
    frame: /conversion|friction|drop[\s-]?off|ux|usability|hesitat|why|analy[sz]|review|improve|increase[\s-]+data[\s-]+capture|optimi[sz]/i,
    reason:
      'PREMISE VOID (PS-SIMFRICTION-01): there is no visitor behaviour here to analyse. Every ' +
      'simulation PhishSim has ever sent — all of them — went to our OWN internal/test org, so the ' +
      'click rate is us clicking our own emails and the 0 submissions are ours too. A UX/friction/' +
      'conversion study of that drop-off cannot produce a finding, because the sample is not users. ' +
      '"Increase data capture" is additionally refused outright: PhishSim records THAT a credential ' +
      'was submitted and NEVER the password, by design (PS-CREDPAGE-01) — see the ' +
      'credential-capture-by-default rule. The actual constraint is TOP OF FUNNEL: almost no real ' +
      'external MSP has ever entered the funnel. Propose work that brings NEW real prospects in ' +
      '(outreach volume, follow-up copy, reply capture, ICP/list quality) — that will pass. If you ' +
      'genuinely meant the MARKETING website signup page (phishsimai.com), say "marketing site" or ' +
      '"signup page" in the title and re-issue: that is real top-of-funnel work and is allowed.',
  },
]

/** Returns the void-premise rule a task trips, or null. Pure + exported → see the test file. */
export function voidPremiseFor(title: string, description = ''): VoidPremise | null {
  const t = `${title} ${description}`
  return VOID_PREMISE_TASKS.find(v => v.subject.test(t) && v.frame.test(t)) ?? null
}

export async function issueTask(
  agentId: AgentId,
  task: NewAgentTask,
  companyId = COMPANY_ID,
  opts: { force?: boolean; issuedBy?: string } = {},
): Promise<{ task_id: string; agent: string; title: string; deduped?: boolean; voided?: boolean; reason?: string }> {
  // AUTONOMY GATE — no agent task is written unless this company's earned level
  // permits it. At 'manual' this throws AutonomyDenied (audited) before any write.
  // Stays FIRST: it is the security boundary, and its audit trail must not depend
  // on whether a duplicate happened to short-circuit the write.
  await assertAutonomyAllows('issue_agent_task', companyId)

  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)
  const agent = AGENTS[agentId]

  // PS-CREDPHANTOM-01 — refuse work whose premise is already known to be false. Sits beside the
  // dedupe check for the same reason: one choke point, so a new issuer cannot reintroduce it.
  // `force` is the deliberate escape hatch for a human who has decided otherwise; the autonomous
  // loops never pass it. Refusal is LOUD and audited — a silently dropped assignment would be
  // indistinguishable from the parser failing, which is the bug PS-PHANTOM-01 already paid for.
  const void_ = opts.force ? null : voidPremiseFor(task.title, task.description)
  if (void_) {
    console.warn(`[kaan_os_v4] issueTask REFUSED for ${agentId} (${void_.id}): "${task.title.slice(0, 80)}" — ${void_.reason.slice(0, 160)}`)
    await sql`INSERT INTO audit_log (actor, action, target, detail) VALUES ('kaan_os_v4', 'task_refused_void_premise', ${agentId},
              ${JSON.stringify({ rule: void_.id, title: task.title, company_id: companyId })}::jsonb)`.catch(() => {})
    return { task_id: '', agent: agent.name, title: task.title, voided: true, reason: void_.reason }
  }

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
    VALUES (${agentId}, ${opts.issuedBy ?? 'janet'}, ${task.title}, ${task.description}, ${task.priority}, ${task.due_in_hours}, 'assigned', ${companyId})
    RETURNING id
  `

  const _issuerLabel = (opts.issuedBy && opts.issuedBy !== 'janet') ? `Self-Originated by ${agent.name}` : 'Task Assigned by Janet'
  await sendTelegram(`📋 *${_issuerLabel}*\n\nTo: ${agent.name} (${agent.title})\nTask: ${task.title}\nPriority: ${task.priority.toUpperCase()}\nDue: ${task.due_in_hours}h`).catch(() => {})

  return { task_id: inserted.id, agent: agent.name, title: task.title, deduped: false }
}

/**
 * PS-AGENT-ACT-01: scoped, gated, LOGGED action layer. An agent may take ONE real action per task,
 * under Janet's supervision. Two safe surfaces only — none touches prod, real recipients, or money
 * directly. queue_marcus routes a code/infra change into the VERIFIED architect pipeline (autonomy
 * gate + circuit breaker + CI verify + deploy); escalate puts anything sensitive in front of a
 * human as a founder_decision (the no-drift guarantee). Every action is logged to agent_actions.
 */
/**
 * PS-AGENT-DISPATCH-01: why a dispatch must be refused, or null when it is safe to queue.
 * Cheap structural checks only — this is not a SQL parser. It exists to catch the failure mode
 * actually observed in production (statements cut mid-expression by a length or newline limit)
 * plus two dialect mistakes that are guaranteed to fail against Postgres, so the pipeline does not
 * burn a task, a breaker and a founder escalation discovering them.
 */
export function dispatchRefusalReason(arg: string): string | null {
  const s = arg.trim()
  if (!s) return 'empty task'
  if (s.length >= 2000) return 'task exceeds 2000 chars — split it into separate dispatches'
  const looksSql = /^\s*(alter|update|delete|insert|create|drop|truncate)\s/i.test(s)
  if (!looksSql) return null
  // Unbalanced brackets/quotes mean the statement was cut before it finished.
  const opens = (s.match(/\(/g) || []).length
  const closes = (s.match(/\)/g) || []).length
  if (opens !== closes) return `incomplete SQL: ${opens} "(" vs ${closes} ")" — statement was cut off`
  if ((s.match(/'/g) || []).length % 2 !== 0) return 'incomplete SQL: unterminated string literal'
  // A statement that stops on a keyword or operator never finished.
  if (/\b(and|or|then|else|when|case|as|set|where|values|add)\s*$/i.test(s)) return 'incomplete SQL: ends on a keyword'
  if (/[,+\-=<>]\s*$/.test(s)) return 'incomplete SQL: ends on an operator'
  // MySQL backticks are not Postgres identifier quotes — this task would always have failed.
  if (s.includes('`')) return 'MySQL backticks are not valid in Postgres — use double quotes or bare identifiers'
  // Destructive statements without a predicate would hit every row.
  if (/^\s*(update|delete)\s/i.test(s) && !/\swhere\s/i.test(s)) return 'refusing UPDATE/DELETE with no WHERE clause'
  return null
}

async function executeAgentAction(sql: any, task: AgentTask, resultText: string, companyId: string): Promise<string> {
  const m = resultText.match(/ACTION:\s*(queue_marcus|escalate)\s*:\s*([^\n]+)/i)
  if (!m) return ''
  const verb = m[1].toLowerCase()
  const arg = m[2].trim()
  const agentId = task.agent_id
  await sql`CREATE TABLE IF NOT EXISTS agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT, agent_id TEXT, task_id TEXT,
    action TEXT, arg TEXT, result TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`.catch(() => {})
  let outcome = ''
  try {
    if (verb === 'queue_marcus') {
      // PS-AGENT-DISPATCH-01 (2026-08-17): `arg.slice(0, 400)` silently truncated the dispatched
      // task, and the ACTION regex already stops at the first newline. Both cuts landed MID-
      // STATEMENT on real DDL: escalations went out reading "...THEN true ELSE f" and
      // "GENERATED ALWAYS AS (C". A truncated statement is not a smaller task, it is a DIFFERENT
      // one — and for an UPDATE or DELETE, losing the tail means losing the WHERE clause, which
      // would apply to every row in the table. So: never trim a statement to fit. Refuse it,
      // say why, and let the agent send something that fits intact.
      const refusal = dispatchRefusalReason(arg)
      if (refusal) {
        outcome = `queue_marcus REFUSED: ${refusal}`
        console.warn(`[kaan_os_v4] dispatch refused for ${agentId}: ${refusal}`)
        await sql`INSERT INTO agent_actions (company_id, agent_id, task_id, action, arg, result)
          VALUES (${companyId}, ${agentId}, ${String(task.id)}, ${verb}, ${arg.slice(0, 2000)}, ${outcome})`.catch(() => {})
        return `\n\n---\n**ACTION REFUSED (${agentId}):** ${outcome}`
      }
      const id = await queueJanetArchitectTask({
        task: arg.slice(0, 2000),
        source: `agent:${agentId}`,
        notes: `Self-originated action from ${agentId} on task "${task.title.slice(0, 60)}"`,
      })
      outcome = id
        ? `queued engineering task to Marcus via the verified pipeline (id ${id})`
        : `queue_marcus blocked by the autonomy gate / circuit breaker and parked — not executed`
    } else {
      const [title, detail] = arg.split('|').map((x) => x.trim())
      const rows = (await sql`INSERT INTO escalations (product_id, category, payload, status)
        VALUES (${companyId}, 'founder_decision',
          ${JSON.stringify({ title: title || arg, detail: detail || '', from: agentId })}::jsonb, 'pending')
        RETURNING id`) as any[]
      outcome = `escalated a decision to Janet/founder (id ${rows[0]?.id || '?'}, pending sign-off)`
    }
  } catch (e: any) {
    outcome = `action failed: ${String(e?.message || e).slice(0, 120)}`
  }
  await sql`INSERT INTO agent_actions (company_id, agent_id, task_id, action, arg, result)
    VALUES (${companyId}, ${agentId}, ${String(task.id)}, ${verb}, ${arg.slice(0, 2000)}, ${outcome})`.catch(() => {})
  console.log(`[kaan_os_v4] agent action: ${agentId} ${verb} -> ${outcome}`)
  return `\n\n---\n**ACTION TAKEN (${agentId}, under Janet's review):** ${outcome}`
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

You may take ONE real action to advance this (under Janet's supervision) by ending with a single line:
- ACTION: queue_marcus: <specific code/infra change> — routes into the verified deploy pipeline (you never touch prod directly).
- ACTION: escalate: <title> | <why a human must decide> — for pricing, spend, legal, contacting real customers, or cross-team calls.
Only ONE action, only if a concrete step should genuinely HAPPEN now, not just be recommended. Omit the ACTION line for analysis-only work. Never invent an action to look busy.
Be specific. Janet will review and score your work.`

  const result = await llm(system, user, 1200)
  // PS-AGENT-ACT-01: if the agent proposed a real action, execute it (gated + logged) and append
  // the outcome so the stored result records what actually happened, not just what was recommended.
  const actionSummary = await executeAgentAction(sql, task, result, companyId).catch(() => '')
  const finalResult = result + actionSummary

  await sql`
    UPDATE agent_tasks
    SET status='completed', result=${finalResult}, completed_at=NOW()
    WHERE id=${taskId}
  `

  // Save to agent memory
  await rememberFact({
    company_id: companyId, type: 'strategic',
    key: `task:${task.title.slice(0,50)}`, value: finalResult.slice(0,500),
    confidence: 0.8, source: task.agent_id
  }).catch(() => {})

  return { ...task, status: 'completed', result: finalResult }
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
// PS-SUPERSEDE-01: a directive that PAUSES/PIVOTS/STOPS an agent's current work is a REPLACEMENT,
// not an addition. Detected here so the consumer can cancel the agent's prior open tasks before
// issuing this one — otherwise the old, now-contradicted task lingers (Vera ran "define cadence" and
// "pause the cadence, pivot" simultaneously because nothing cancelled the first). Matches the
// natural language Janet actually writes ("Pause X and pivot to Y") plus an explicit SUPERSEDE verb.
const SUPERSEDE_RE = /^(?:pause|stop|drop|halt|supersede|pivot|replace|abandon)\b|\bpivot\s+to\b|\bstop\s+work(?:ing)?\s+on\b/i

export function parseStandupAssignments(response: string): { agentId: AgentId; title: string; supersede: boolean }[] {
  const CANONICAL = /^\s*(?:[-*]\s*)?(?:\*\*)?(?:assign|supersede)\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*[:—–-]\s+(.+?)\s*$/i
  const TABLE_ROW = /^\s*\|\s*(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*\|\s*(.+?)\s*\|/
  const LIST_ITEM = /^\s*[-*]\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?\s*[:—–]\s+(.+?)\s*$/i

  const collect = (re: RegExp) => {
    const out: { agentId: AgentId; title: string; supersede: boolean }[] = []
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
      // A directive that opens by pausing/pivoting/replacing is a supersession of prior work.
      const supersede = SUPERSEDE_RE.test(title) || /^\s*supersede\b/i.test(rawLine)
      out.push({ agentId: agentId as AgentId, title: title.slice(0, 300), supersede })
    }
    return out
  }

  const canonical = collect(CANONICAL)
  if (canonical.length) return canonical
  const table = collect(TABLE_ROW)
  if (table.length) return table.slice(0, 4)
  return collect(LIST_ITEM).slice(0, 3) // cap the loosest tier at the 1-3 the prompt asks for
}

// ── PS-TRUNCATE-02: the INBOUND half of PS-TRUNCATE-01 ───────────────────────
/**
 * PS-TRUNCATE-01 fixed the outbound side (sendTelegram splits at 4096 instead of amputating).
 * The inbound side kept doing exactly what that fix condemned: `r.summary.slice(0,300)`.
 *
 * Agents are prompted for FIVE items (completed / today / blockers / key metric / confidence)
 * with a 400-token budget — roughly 1,600 chars. Only the first 300 reached Janet OR the stored
 * transcript. The tell was that every stored standup was exactly 1,549 chars: 5 blocks × 300 +
 * the fixed "[NAME]: " headers. Items 3, 4 and 5 — blockers and the one metric Janet is
 * explicitly asking each agent to surface — were structurally never delivered. Janet has been
 * running the company's daily meeting on the first paragraph of each report.
 *
 * Same shape of fix as the outbound one: a GENEROUS limit, a cut on a LINE boundary, and an
 * explicit marker so a trim is visible rather than silent. At 4,000 the limit does not bind on
 * any real report (the LLM cannot emit that much at 400 tokens) — it exists as a guard against a
 * runaway generation blowing Janet's context, not as routine amputation.
 *
 * Exported and pure so it cannot silently regress the way slice(0,300) did.
 */
export function trimToLineBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text
  const window = text.slice(0, limit)
  // Prefer a paragraph break, then a line break, then a space — never mid-word. Mirrors
  // splitForTelegram's boundary ladder; the 0.5 floor stops a boundary near the very start
  // from throwing away most of the allowance.
  let cut = window.lastIndexOf('\n\n')
  if (cut < limit * 0.5) cut = window.lastIndexOf('\n')
  if (cut < limit * 0.5) cut = window.lastIndexOf(' ')
  if (cut < limit * 0.5) cut = limit
  const kept = text.slice(0, cut).trimEnd()
  // SAY that it happened. A trim nobody can see is the same failure as a silent slice.
  return `${kept}\n… [trimmed ${text.length - kept.length} of ${text.length} chars]`
}

/**
 * PS-OWNERSHIP-01: pull an agent's proposed next step out of its standup report ("PROPOSAL: ...").
 * Agents write this when unassigned; we convert it into a self-originated task so they own their lane.
 */
function extractProposal(summary: string): string | null {
  const m = summary.match(/PROPOSAL[:\s\*]+([\s\S]*?)(?:\n\n|\n\s*\*\*|\n\s*\d[.)]|\n\s*#|$)/i)
  if (!m) return null
  const p = m[1].replace(/[\*`]/g, '').replace(/\s+/g, ' ').trim()
  return p.length >= 12 ? p.slice(0, 200) : null
}

/** Generous guard rail for one agent's standup report. Does not bind at a 400-token budget. */
export const AGENT_REPORT_LIMIT = 4000

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
    // PS-RATCHET-01. Item 2 used to be asked identically whether or not the agent had work, with
    // the no-work case handled by a caveat inside the question. An LLM asked "what are you working
    // on today?" answers it — the caveat loses to the question. On 2026-07-26 Aria, with an EMPTY
    // assigned list, answered "Today's Focus: Developing the LinkedIn Content and Manual Outreach
    // Strategy for Kaan" (a task closed the day before), and Marcus answered with the credential
    // investigation the same way. That invented focus is then stored as a standup row and comes
    // back tomorrow as history — a fabricated present becoming a fabricated past.
    //
    // So when there is no assigned work, the question is not asked at all. There is no field for a
    // focus to be invented into: the agent states the fact, and a PROPOSAL is explicitly marked as
    // something it is not doing. You cannot answer a question that was never put.
    const unassigned = (pendingTasks as any[]).length === 0
    const todayItem = unassigned
      ? `2. Today: you have NO assigned task. Write exactly "Unassigned — awaiting a task." and nothing more for this item.\n` +
        `   Then, on a separate line beginning "PROPOSAL:", name ONE task Janet could assign you.\n` +
        `   A proposal is a REQUEST, not work: do not describe it as your focus, do not say you are\n` +
        `   starting/continuing/developing it, and do not name a task you finished earlier — those are\n` +
        `   closed. If you write a focus here it will be recorded as fact and quoted back to you tomorrow.`
      : `2. What you're working on today — ONLY the assigned tasks listed in the ledger above, by their exact titles.\n` +
        `   Do NOT add work you were not assigned, and do NOT carry forward a task the ledger shows as finished.`

    const standupPrompt = `Daily standup report to Janet (CGO).

${ledger}

Give your standup (be brief and direct — Janet runs a tight meeting):
1. What you completed or progressed yesterday — ONLY from the ledger above. If it says you completed nothing, say "Nothing completed" and move on.
${todayItem}
3. Any blockers (only if real — don't waste Janet's time with non-blockers)
4. One metric or insight from your domain she needs to know right now — quote the raw number AND the reason the context gives for it. If a metric there already explains itself, do not re-explain it as a problem.
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
  //
  // PS-TRUNCATE-02: two renderings, and the difference is deliberate.
  //
  //   standupFull  — every report in full, nothing dropped. This is what gets STORED as the
  //                  meeting transcript and what gets SENT to Telegram. The transcript is the
  //                  audit artifact: scripts/verify-standup.ts scans it for fabricated
  //                  capability claims, and a scan of the first 300 chars is a scan that any
  //                  fabrication in the tail walks straight past. It has to be complete.
  //   standupForJanet — the same reports behind a generous line-boundary guard rail, because
  //                  this one goes into an LLM prompt and is the only place a length limit has
  //                  an actual reason. At 4,000 chars/report it does not bind in practice.
  //
  // They are allowed to differ ONLY in that edge case, and when they do, the transcript is the
  // longer one — never the other way round.
  const block = (r: AgentReport, text: string) => `[${r.agent_name.toUpperCase()}]: ${text}`
  const standupFull = reports.map(r => block(r, r.summary)).join('\n\n')
  const standupSummary = reports.map(r => block(r, trimToLineBoundary(r.summary, AGENT_REPORT_LIMIT))).join('\n\n')
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
  // PS-GOAL-ALIGN-01: the founder's real_pipeline fact is the binding constraint on WHAT to assign.
  // It lived in memory but the standup ignored it and kept assigning conversion work over a
  // 1-prospect funnel. Read it and turn it into a hard gate on task generation, so the standup
  // proposes ACQUISITION work (fill the funnel) instead of conversion work (a denominator of 1).
  const pipelineFact = (await sql`SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='company' AND key='real_pipeline' LIMIT 1`.catch(() => [])) as any[]
  const acquisitionGate = pipelineFact[0]?.value
    ? `TODAY'S BINDING CONSTRAINT — founder directive, and it OVERRIDES any instinct to work the existing funnel:\n${pipelineFact[0].value}\n\n` +
      `THEREFORE every task you assign must aim at ACQUISITION / TOP OF FUNNEL: contacting more MSPs, ` +
      `expanding and enriching the lead list, opening new outreach channels, discovery of new prospects. ` +
      `Do NOT assign conversion, follow-up-copy, re-engagement, lead-scoring, or CRM/free-tier-cadence ` +
      `work over this near-empty funnel — it cannot move revenue when the denominator is 1. Assign work ` +
      `that FILLS the funnel.\n\n`
    : ''

  const janetResponse = await llm(janetSystem, `${janetGrounding}${acquisitionGate}You just ran your daily standup. Here are the team reports:\n\n${standupSummary}\n\nAs CGO:\n1. Call out anything that needs immediate attention\n2. Issue 1-3 new specific task assignments — each on its OWN line, in EXACTLY this format: ASSIGN <Name>: <task title>. Assign to IDLE agents, or agents whose current task is genuinely obsolete. Do NOT redirect an agent who is progressing on a valid task — let them finish and DELIVER; reflexive redirecting churns work so nothing ever completes. ONLY when a task is truly wrong or overtaken by events, begin the replacement with "Pause ... and pivot to ..." to cancel the old one. Default to letting agents finish.\n3. Any performance concern to address directly with a team member\n4. Your ONE focus for the company today\n5. What to tell Kaan in 2 sentences`, 800)

  // Parse and issue new tasks from Janet's response. Pure + exported → see the test file.
  const parsed = parseStandupAssignments(janetResponse)

  // Dedupe is enforced centrally in issueTask (PS-DEDUPE-01) so every issuer — this standup,
  // os6Autonomy, intelligenceFinance, janetProactive — obeys one rule. Here we only need to
  // read back which calls were absorbed as duplicates so the footer can say so.
  const newTasks: any[] = []
  let skippedDuplicate = 0, deniedByGate = 0, refusedVoid = 0, supersededTasks = 0
  for (const { agentId, title, supersede } of parsed) {
    try {
      // PS-SUPERSEDE-01: a pause/pivot/replace directive CANCELS this agent's currently-open work
      // before the new task is issued — one directive supersedes, not both live. This is the fix for
      // the lingering-contradicted-task defect (Vera's "define cadence" stayed in_progress after a
      // "pause and pivot" directive). Cancel BEFORE issueTask so the new task lands clean.
      if (supersede) {
        const cancelled = (await sql`UPDATE agent_tasks SET status='cancelled', updated_at=NOW()
          WHERE company_id=${companyId} AND agent_id=${agentId} AND status IN ('assigned','in_progress')
          RETURNING id`) as any[]
        supersededTasks += cancelled.length
      }
      const t = await issueTask(agentId, {
        title: title.slice(0, 100),
        description: `Issued during daily standup: ${title}`,
        priority: 'high', due_in_hours: scaledDueHours(title),
      }, companyId)
      if (t.voided) refusedVoid++
      else if (t.deduped) skippedDuplicate++
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
    `superseded=${supersededTasks} duplicate_skipped=${skippedDuplicate} autonomy_denied=${deniedByGate} void_premise_refused=${refusedVoid}`,
  )

  // PS-OWNERSHIP-01: restore agent OWNERSHIP. Any specialist left with NO open task after Janet's
  // 1-3 assignments SELF-ORIGINATES its own proposed next step (issued_by = the agent, not 'janet').
  // Root cause of the regression: every task was Janet-assigned, so self-originated % (the L5 bar)
  // was structurally 0 and most of 8 agents sat idle at "unassigned / 0 confidence". Marcus is
  // excluded — his work is architect_tasks, a separate pipeline. Bounded: one self-task per idle
  // agent per standup; issueTask still dedupes and still honours the autonomy gate.
  let selfOriginated = 0
  for (const report of reports) {
    const aId = report.agent_id as AgentId
    if (aId === 'marcus' || aId === 'janet') continue
    const openN = ((await sql`SELECT count(*)::int AS n FROM agent_tasks
      WHERE company_id=${companyId} AND agent_id=${aId} AND status IN ('assigned','in_progress')`) as any[])[0]?.n ?? 0
    if (openN > 0) continue
    let taskText = extractProposal(report.summary)
    let source = 'standup proposal'
    if (!taskText) {
      // PS-OWNERSHIP-02: domain-default ownership. An agent whose report carried no PROPOSAL still
      // OWNS its lane — self-originate a domain-anchored task so it proactively improves its own
      // area (Vera and the other SMEs). Janet is not an SME on everything; each specialist drives
      // its domain. executeTask already injects getCompanyContext (real company data) and
      // os_agent_reflections (that agent's past lessons), so the task runs grounded and self-learning.
      const a = AGENTS[aId]
      if (!a) continue
      // PS-SME-01: ground the self-originated task in CURRENT external best practice when search is
      // configured (see domainResearch.ts) — an SME does not reason from a frozen training cutoff.
      // Fails open to the original generic wording if research is unavailable/inert/finds nothing.
      const research = await researchCurrentBestPractice(aId, a.domain, a.title, companyId).catch(() => null)
      taskText = research
        ? `As ${a.title}: current best practice (verified ${new Date().toISOString().slice(0, 10)}) — ${research.summary} Apply this to your domain (${a.domain}) to advance the company's current top goal. Sources: ${research.sources.map((x) => x.url).join(', ')}`
        : `As ${a.title}, identify and begin the single highest-impact improvement in your domain (${a.domain}) that advances the company's current top goal. Use real company data; propose and start the concrete next step.`
      source = research ? 'domain-default ownership (current best practice)' : 'domain-default ownership'
    }
    try {
      const t = await issueTask(aId, {
        title: taskText.slice(0, 100),
        description: `Self-originated by ${aId} (${source}): ${taskText}`,
        priority: 'high', due_in_hours: 24,
      }, companyId, { issuedBy: aId })
      if (!t.deduped && !t.voided) selfOriginated++
    } catch (e: any) {
      if (!isAutonomyDenied(e)) console.error(`[kaan_os_v4] self-originate failed for ${aId}: ${String(e?.message || e).slice(0, 160)}`)
    }
  }
  if (selfOriginated) console.log(`[kaan_os_v4] standup: ${selfOriginated} agent(s) self-originated their proposal (ownership restored)`)
  if (parsed.length === 0 && /\bassign|assignment\b/i.test(janetResponse)) {
    console.warn('[kaan_os_v4] standup: Janet named assignments but NONE parsed — parser/prompt drift, not an empty agenda')
  }

  // Log meeting
  const [meeting] = await sql`
    INSERT INTO agent_meetings (meeting_type, participants, agenda, transcript, decisions, company_id)
    VALUES ('daily_standup', ${standupAgents}, 'Daily standup', ${standupFull}, ${[janetResponse]}, ${companyId})
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
  // PS-TRUNCATE-02: the founder asked to read the AGENT reports on Telegram, not just Janet's
  // synthesis of them. Janet's summary is a lossy read of five reports she is not obliged to
  // quote — "ARIA reported nothing completed" is not the same artifact as what Aria actually
  // wrote, and the whole PS-PHANTOM-01 class of bug lives in that gap. Ship both: her synthesis
  // first (it is the actionable part), the raw reports under it for anyone checking her work.
  // sendTelegram splits at 4096, so five full reports cost extra messages, never lost content.
  const telegramMsg =
    `🌅 *DAILY STANDUP — ${TELEGRAM_PRODUCT}*\n\n${janetResponse}${assignmentLines}${posture}\n\n` +
    `_${reports.length} agents reported | ${issuance}_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n📝 *Agent reports (verbatim, unedited self-reports)*\n\n${standupFull}`
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
      // PS-TRUNCATE-02: same bug as the standup, one meeting over. The self-review is prompted
      // for FIVE items at a 500-token budget (~2,000 chars) and Janet was shown the first 300 —
      // so "where you fell short and why", "what would make you more effective" and the agent's
      // own priority proposal never reached the manager writing their review. A performance
      // review is the worst possible place to read a third of the evidence: the sections that
      // get cut are exactly the ones an agent would use to explain a bad week.
      `Weekly performance review: ${agent.name} (${agent.title})\n\nWeek data: ${weekData ? `${weekData.completed} tasks, avg ${weekData.avg_score}/10` : 'No completed tasks'}\n${agent.name}'s self-review: ${trimToLineBoundary(selfReview, AGENT_REPORT_LIMIT)}\n\nAs their manager:\n1. Your honest assessment of their performance (be direct)\n2. Specific improvement required with how-to\n3. New priority assignment for next week\n4. Are they performing at the level needed? (yes/needs improvement/critical)\n5. Score: X/10`, 500)

    const scoreMatch = janetReview.match(/Score:\s*(\d+)\/10/i)
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 6

    // Update performance record
    await sql`
      INSERT INTO agent_performance (agent_id, period, tasks_completed, avg_score, strengths, improvement_areas, janet_notes, company_id)
      -- PS-TRUNCATE-02: strengths / improvement_areas / janet_notes are all unbounded TEXT, so
      -- the 200/200/300 slices bought nothing and cost the record. janet_notes is the only
      -- durable trace of a review — storing its first 300 chars means the improvement actually
      -- required (item 2 of her five) is routinely the part that gets dropped. Store in full.
      --
      -- improvement_areas and janet_notes have ALWAYS held the same source text at two different
      -- lengths; they are now identical. Splitting them properly needs a parser over Janet's
      -- five numbered items, which is a separate change — duplicating beats truncating.
      VALUES (${agentId}, to_char(NOW(), 'YYYY-WW'), ${weekData?.completed || 0}, ${score},
              ${selfReview}, ${janetReview}, ${janetReview}, ${companyId})
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

  // Janet issues next week's assignments.
  //
  // PS-TRUNCATE-02: third instance of the same pattern in this function — she was planning the
  // whole next week from the first 200 chars of each of her OWN reviews, so the improvement
  // paths and assignments she had just written were not in front of her when she assigned work.
  //
  // A limit IS justified here, unlike the DB write above, and for a concrete reason: this fans
  // out over every agent, and Cerebras (first on DEFAULT_CHAIN) caps free-tier context at 8,192
  // tokens — 8 unbounded reviews would silently push every weekly plan onto paid DeepInfra. So:
  // a line-boundary trim that keeps the substance, with the marker saying when it bit.
  const WEEKLY_REVIEW_PROMPT_LIMIT = 1200 // ~8 agents × 1.2k chars ≈ 2.4k tokens, well inside the cap
  const reviewSummary = performanceReviews
    .map(r => `${r.name} (${r.score}/10): ${trimToLineBoundary(r.janet_review, WEEKLY_REVIEW_PROMPT_LIMIT)}`)
    .join('\n')
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
