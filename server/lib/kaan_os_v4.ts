import Groq from 'groq-sdk'
import { neon } from '@neondatabase/serverless'
import { rememberFact, recallMemory } from '../os/memory'
import { sendTelegram } from '../os/telegram'
import { assertAutonomyAllows } from '../os/autonomyGate'

// ═══════════════════════════════════════════════════════════════════════════════
//  KAAN AI OS  v4  —  Janet + 8 Full-Time AI Employees
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
  aria: {
    id: 'aria', name: 'Aria', title: 'VP of Marketing',
    domain: 'Content strategy, campaigns, brand, UGC, email marketing',
    personality: 'Creative but analytical. Tests everything. Obsessed with conversion. Thinks in full funnels.',
    expertise: ['DTC marketing', 'UGC content', 'email campaigns', 'brand positioning', 'growth marketing', 'social strategy', 'content calendar']
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
      company_id TEXT NOT NULL DEFAULT 'scrollfuel'
    )
  `.catch(() => {})

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
      company_id TEXT NOT NULL DEFAULT 'scrollfuel'
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
      company_id TEXT NOT NULL DEFAULT 'scrollfuel'
    )
  `.catch(() => {})
}

// ── LLM call ──────────────────────────────────────────────────────────────────
async function llm(system: string, user: string, maxTokens = 1000): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  })
  return res.choices[0]?.message?.content || ''
}

// ── Agent memory: what this agent knows and has learned ───────────────────────
async function getAgentMemory(agentId: AgentId, sql: any, companyId = 'scrollfuel'): Promise<string> {
  const [tasks, perf, memories] = await Promise.all([
    sql`SELECT title, result, janet_feedback, performance_score, completed_at
        FROM agent_tasks WHERE agent_id=${agentId} AND status IN ('reviewed','completed') AND company_id=${companyId}
        ORDER BY completed_at DESC LIMIT 10`.catch(() => []),
    sql`SELECT strengths, improvement_areas, janet_notes, updated_at
        FROM agent_performance WHERE agent_id=${agentId} AND company_id=${companyId}
        ORDER BY updated_at DESC LIMIT 3`.catch(() => []),
    recallMemory(companyId, undefined, 20).then((m: any[]) => m.filter((x:any) => x.source === agentId)).catch(() => [] as any[])
  ])

  const taskHistory = tasks.slice(0,5).map((t:any) =>
    `Task: "${t.title}" | Score: ${t.performance_score || '?'}/10 | Feedback: ${t.janet_feedback || 'none'}`
  ).join('\n')

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
  return `You are ${agent.name}, ${agent.title} at Scroll Fuel (AI-generated UGC ads SaaS, $19-99/mo, targeting DTC beauty/skincare/supplement brands).
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

// ── Get live company context for any agent ────────────────────────────────────
async function getCompanyContext(sql: any): Promise<string> {
  const [leads, subs, camps] = await Promise.all([
    sql`SELECT count(*) as total, count(*) filter(where replied=true) as replied, count(*) filter(where pipeline_stage='customer') as customers, count(*) filter(where pipeline_stage='engaged') as engaged FROM outreach_leads`.catch(() => [{ total:0,replied:0,customers:0,engaged:0 }]),
    sql`SELECT count(*) filter(where tier='starter') as starter, count(*) filter(where tier='pro') as pro, count(*) filter(where tier='agency') as agency, count(*) filter(where status='active') as active FROM subscriptions`.catch(() => [{ starter:0,pro:0,agency:0,active:0 }]),
    sql`SELECT count(*) as total, count(*) filter(where created_at > now()-interval '7 days') as this_week FROM campaigns`.catch(() => [{ total:0,this_week:0 }])
  ])

  const l = leads[0] || { total:0,replied:0,customers:0,engaged:0 }
  const s = subs[0] || { starter:0,pro:0,agency:0,active:0 }
  const c = camps[0] || { total:0,this_week:0 }
  const mrr = (Number(s.starter)||0)*19 + (Number(s.pro)||0)*49 + (Number(s.agency)||0)*99

  return `Leads: ${l.total} total | Reply rate: ${l.total>0?((l.replied/l.total)*100).toFixed(1):0}% | Customers: ${l.customers} | Engaged: ${l.engaged}
MRR: $${mrr} | Subs: ${s.starter} Starter / ${s.pro} Pro / ${s.agency} Agency | Active: ${s.active}
Campaigns: ${c.total} total | ${c.this_week} created this week`
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

export async function issueTask(
  agentId: AgentId,
  task: NewAgentTask,
  companyId = 'scrollfuel'
): Promise<{ task_id: string; agent: string; title: string }> {
  // AUTONOMY GATE — no agent task is written unless this company's earned level
  // permits it. At 'manual' this throws AutonomyDenied (audited) before any write.
  await assertAutonomyAllows('issue_agent_task', companyId)

  const sql = neon(process.env.DATABASE_URL!)
  await ensureOSTables(sql)

  const [inserted] = await sql`
    INSERT INTO agent_tasks (agent_id, issued_by, title, description, priority, due_in_hours, status, company_id)
    VALUES (${agentId}, 'janet', ${task.title}, ${task.description}, ${task.priority}, ${task.due_in_hours}, 'assigned', ${companyId})
    RETURNING id
  `

  const agent = AGENTS[agentId]
  await sendTelegram(`📋 *Task Assigned by Janet*\n\nTo: ${agent.name} (${agent.title})\nTask: ${task.title}\nPriority: ${task.priority.toUpperCase()}\nDue: ${task.due_in_hours}h`).catch(() => {})

  return { task_id: inserted.id, agent: agent.name, title: task.title }
}

export async function executeTask(taskId: string, companyId = 'scrollfuel'): Promise<AgentTask> {
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

  const system = buildAgentSystem(agent, memory, context)
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

export async function reviewTask(taskId: string, companyId = 'scrollfuel'): Promise<{ feedback: string; score: number; task: any }> {
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

  return { feedback, score, task: { ...task, janet_feedback: feedback, performance_score: score } }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MEETINGS — Janet runs structured team meetings
// ═══════════════════════════════════════════════════════════════════════════════

export async function runDailyStandup(companyId = 'scrollfuel'): Promise<{
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

    const system = buildAgentSystem(agent, memory, context)
    const standupPrompt = `Daily standup report to Janet (CGO).

Pending tasks: ${pendingTasks.map((t:any) => `"${t.title}" (${t.priority})`).join(', ') || 'None assigned yet'}

Give your standup (be brief and direct — Janet runs a tight meeting):
1. What you completed or progressed yesterday
2. What you're working on today
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

    await rememberFact({
      company_id: companyId, type: 'operating',
      key: `standup:${agentId}:${new Date().toISOString().slice(0,10)}`,
      value: report_text.slice(0,400), confidence: 0.9, source: agentId
    }).catch(() => {})
  }

  // Janet synthesizes and issues new assignments
  const standupSummary = reports.map(r => `[${r.agent_name.toUpperCase()}]: ${r.summary.slice(0,300)}`).join('\n\n')
  const janetMemory = await getAgentMemory('janet', sql, companyId)
  const janetSystem = buildAgentSystem(AGENTS.janet, janetMemory, context)

  const janetResponse = await llm(janetSystem, `You just ran your daily standup. Here are the team reports:\n\n${standupSummary}\n\nAs CGO:\n1. Call out anything that needs immediate attention\n2. Issue 1-3 new specific task assignments (who, what, why, priority)\n3. Any performance concern to address directly with a team member\n4. Your ONE focus for the company today\n5. What to tell Kaan in 2 sentences`, 800)

  // Parse and issue new tasks from Janet's response
  const newTasks: any[] = []
  const taskMatches = janetResponse.matchAll(/assign\s+([A-Z][a-z]+):?\s+"([^"]+)"|task\s+for\s+([A-Z][a-z]+):?\s+([^\n]+)/gi)
  for (const match of taskMatches) {
    const agentName = (match[1] || match[3] || '').toLowerCase()
    const taskTitle = match[2] || match[4] || ''
    const agentId = Object.values(AGENTS).find(a => a.name.toLowerCase() === agentName)?.id
    if (agentId && taskTitle && agentId !== 'janet') {
      const t = await issueTask(agentId as AgentId, {
        title: taskTitle.slice(0,100),
        description: `Issued during daily standup: ${taskTitle}`,
        priority: 'high', due_in_hours: 24
      }, companyId).catch(() => null)
      if (t) newTasks.push(t)
    }
  }

  // Log meeting
  const [meeting] = await sql`
    INSERT INTO agent_meetings (meeting_type, participants, agenda, transcript, decisions, company_id)
    VALUES ('daily_standup', ${standupAgents}, 'Daily standup', ${standupSummary}, ${[janetResponse]}, ${companyId})
    RETURNING id
  `.catch(() => [{ id: 'unknown' }])

  // Telegram brief
  const telegramMsg = `🌅 *DAILY STANDUP — Scroll Fuel OS*\n\n${janetResponse.slice(0, 600)}\n\n_${reports.length} agents reported | ${newTasks.length} tasks issued_`
  await sendTelegram(telegramMsg).catch(() => {})

  return { meeting_id: meeting?.id || '', reports, janet_summary: janetResponse, new_tasks: newTasks, timestamp: new Date().toISOString() }
}

export async function runWeeklyReview(companyId = 'scrollfuel'): Promise<{
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

  const scores = performanceReviews.map(r => `${r.name}: ${r.score}/10`).join(' | ')
  await sendTelegram(`📊 *WEEKLY REVIEW — Scroll Fuel OS*\n\nScores: ${scores}\n\n${weeklyPlan.slice(0,600)}\n\n_${newAssignments.length} new assignments issued_`).catch(() => {})

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
  companyId = 'scrollfuel',
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
  companyId = 'scrollfuel'
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

export async function runJanetFullOrchestration(companyId = 'scrollfuel'): Promise<{
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
  const kaanBrief = await llm(maxSystem,
    `Prepare Kaan's morning brief. Standup summary: ${standup.janet_summary.slice(0,500)}\nTasks executed: ${executed}\n\nBrief:\n1. What happened overnight / this morning\n2. Top 3 things Kaan needs to know\n3. Decision that requires Kaan's input (only if truly necessary)\n4. OS health: all agents operating normally? (yes/issues)\n5. 2-sentence bottom line`, 400)

  await sendTelegram(`☀️ *KAAN'S MORNING BRIEF*\n\n${kaanBrief}\n\n_Janet OS v4 | ${new Date().toLocaleTimeString()}_`).catch(() => {})

  return { janet_brief: kaanBrief, standup, pending_tasks_executed: executed, timestamp: new Date().toISOString() }
}

// ── OS status — what's running, who's doing what ─────────────────────────────
export async function getOSStatus(companyId = 'scrollfuel') {
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
