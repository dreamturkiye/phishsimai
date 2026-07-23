import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { llmComplete } from './llmChat'
import { rememberFact, recallMemory } from './memory'
import {
  AGENTS,
  executeTask,
  issueTask,
  normalizeTaskTitle,
  reviewTask,
  type AgentId,
} from '../lib/kaan_os_v4'

type Sql = ReturnType<typeof getSql>
type Trigger = 'daily' | 'lead_import' | 'manual' | 'self_heal'
type Stage = 'observe' | 'reason' | 'decide' | 'execute' | 'review' | 'learn' | 'improve' | 'report'

type Os6Metrics = {
  organizations: number
  paidOrganizations: number
  starter: number
  growth: number
  pro: number
  unlimited: number
  campaigns: number
  activeCampaigns: number
  campaignsCreated7d: number
  targets: number
  leads: number
  touched: number
  replies: number
  engaged: number
  customers: number
  bounced: number
  newFounderLeads24h: number
  staleAssigned: number
  completedUnreviewed: number
  openAlerts: number
  estimatedMrr: number
  replyRate: number
  customerRate: number
  bounceRate: number
}

type MetricDelta = Partial<Record<keyof Os6Metrics, number>>

type Os6Decision = {
  owner: AgentId
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  dueInHours: number
  dueAt: string
  successMetric: string
  reason: string
  mode: 'task' | 'safe_execute' | 'monitor' | 'self_heal'
}

type AssignedTask = {
  id: string
  owner: AgentId
  title: string
  successMetric: string
}

export type KaanOS6CycleResult = {
  ok: true
  osVersion: '6.0'
  autonomyLevel: 'L4.6'
  companyId: string
  cycleId: string
  trigger: Trigger
  metrics: Os6Metrics
  deltas: MetricDelta
  reasoning: string
  decisions: Os6Decision[]
  assigned: AssignedTask[]
  executed: string[]
  reviewed: string[]
  lessons: string[]
  improvements: string[]
  reportSent: boolean
  degraded: string[]
}

const OS_VERSION = '6.0' as const
const AUTONOMY_LEVEL = 'L4.6' as const

const OS6_STANDARD = `Kaan AI OS 6.0: run PhishSimAI like a self-sustaining, self-healing B2B security awareness SaaS growth operation. Janet owns observe, reason, decide, execute, review, learn, improve, report, repeat. Think briefly and sharply, then move. Every decision must have an owner, success metric, due date, and learning loop. Improve what is not working immediately. Keep Telegram quiet: one meaningful daily Janet proof-of-work report, not noisy task pings.`

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function dueAt(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function cycleIdFor(companyId: string, trigger: Trigger) {
  return `${companyId}:os6:${trigger}:${new Date().toISOString()}`
}

function zeroMetrics(): Os6Metrics {
  return {
    organizations: 0,
    paidOrganizations: 0,
    starter: 0,
    growth: 0,
    pro: 0,
    unlimited: 0,
    campaigns: 0,
    activeCampaigns: 0,
    campaignsCreated7d: 0,
    targets: 0,
    leads: 0,
    touched: 0,
    replies: 0,
    engaged: 0,
    customers: 0,
    bounced: 0,
    newFounderLeads24h: 0,
    staleAssigned: 0,
    completedUnreviewed: 0,
    openAlerts: 0,
    estimatedMrr: 0,
    replyRate: 0,
    customerRate: 0,
    bounceRate: 0,
  }
}

async function ensureOS6Tables(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS kaan_os6_cycles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL UNIQUE,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      current_stage TEXT,
      metrics JSONB,
      deltas JSONB,
      reasoning TEXT,
      decisions JSONB,
      assigned JSONB,
      executed JSONB,
      reviewed JSONB,
      lessons JSONB,
      improvements JSONB,
      degraded JSONB,
      report_sent BOOLEAN DEFAULT FALSE,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS kaan_os6_checkpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      payload JSONB,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS kaan_os6_decisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      title TEXT NOT NULL,
      success_metric TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'decided',
      task_id TEXT,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS kaan_os6_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      report_day TEXT NOT NULL,
      report_kind TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, report_day, report_kind)
    )
  `
}

async function checkpoint(
  sql: Sql,
  companyId: string,
  cycleId: string,
  stage: Stage,
  status: 'started' | 'completed' | 'failed',
  payload?: unknown,
  error?: unknown,
) {
  await sql`
    INSERT INTO kaan_os6_checkpoints (company_id, cycle_id, stage, status, payload, error)
    VALUES (${companyId}, ${cycleId}, ${stage}, ${status}, ${payload ? JSON.stringify(payload) : null}, ${error ? String((error as Error).message || error).slice(0, 500) : null})
  `.catch(() => {})
}

async function updateCycle(sql: Sql, cycleId: string, patch: Record<string, unknown>) {
  await sql`
    UPDATE kaan_os6_cycles
    SET
      current_stage = COALESCE(${patch.current_stage as string | undefined}, current_stage),
      metrics = COALESCE(${patch.metrics ? JSON.stringify(patch.metrics) : null}, metrics),
      deltas = COALESCE(${patch.deltas ? JSON.stringify(patch.deltas) : null}, deltas),
      reasoning = COALESCE(${patch.reasoning as string | undefined}, reasoning),
      decisions = COALESCE(${patch.decisions ? JSON.stringify(patch.decisions) : null}, decisions),
      assigned = COALESCE(${patch.assigned ? JSON.stringify(patch.assigned) : null}, assigned),
      executed = COALESCE(${patch.executed ? JSON.stringify(patch.executed) : null}, executed),
      reviewed = COALESCE(${patch.reviewed ? JSON.stringify(patch.reviewed) : null}, reviewed),
      lessons = COALESCE(${patch.lessons ? JSON.stringify(patch.lessons) : null}, lessons),
      improvements = COALESCE(${patch.improvements ? JSON.stringify(patch.improvements) : null}, improvements),
      degraded = COALESCE(${patch.degraded ? JSON.stringify(patch.degraded) : null}, degraded),
      report_sent = COALESCE(${patch.report_sent as boolean | undefined}, report_sent),
      status = COALESCE(${patch.status as string | undefined}, status),
      completed_at = CASE WHEN ${patch.completed_at ? 'yes' : null} IS NULL THEN completed_at ELSE NOW() END,
      updated_at = NOW()
    WHERE cycle_id = ${cycleId}
  `.catch(() => {})
}

async function observe(sql: Sql, companyId: string): Promise<Os6Metrics> {
  const [orgs] = await sql`
    SELECT
      count(*)::int as total,
      count(*) filter(where plan != 'free')::int as paid,
      count(*) filter(where plan='starter')::int as starter,
      count(*) filter(where plan='growth')::int as growth,
      count(*) filter(where plan='pro')::int as pro,
      count(*) filter(where plan in ('unlimited','enterprise'))::int as unlimited
    FROM organizations
  `.catch(() => [{ total: 0, paid: 0, starter: 0, growth: 0, pro: 0, unlimited: 0 }])
  const [campaigns] = await sql`
    SELECT
      count(*)::int as total,
      count(*) filter(where status in ('active','scheduled','completed'))::int as active,
      count(*) filter(where "createdAt" > NOW() - INTERVAL '7 days')::int as created_7d
    FROM campaigns
  `.catch(() => [{ total: 0, active: 0, created_7d: 0 }])
  const [targets] = await sql`SELECT count(*)::int as n FROM targets WHERE "isActive"=true`.catch(() => [{ n: 0 }])
  const [leads] = await sql`
    SELECT
      count(*)::int as total,
      count(*) filter(where touch1_sent_at is not null)::int as touched,
      count(*) filter(where replied=true)::int as replies,
      count(*) filter(where pipeline_stage='engaged')::int as engaged,
      count(*) filter(where pipeline_stage='customer')::int as customers,
      count(*) filter(where bounced=true)::int as bounced,
      count(*) filter(where source='founder_upload' and created_at > NOW() - INTERVAL '24 hours')::int as new_founder
    FROM ps_outreach_leads
  `.catch(() => [{ total: 0, touched: 0, replies: 0, engaged: 0, customers: 0, bounced: 0, new_founder: 0 }])
  const [stale] = await sql`
    SELECT count(*)::int as n FROM agent_tasks
    WHERE company_id=${companyId}
      AND status IN ('assigned','in_progress')
      AND created_at < NOW() - INTERVAL '24 hours'
  `.catch(() => [{ n: 0 }])
  const [completed] = await sql`
    SELECT count(*)::int as n FROM agent_tasks
    WHERE company_id=${companyId} AND status='completed'
  `.catch(() => [{ n: 0 }])
  const [alerts] = await sql`
    SELECT count(*)::int as n FROM janet_memory
    WHERE company_id=${companyId}
      AND type='operating'
      AND key LIKE 'system_alert:%'
  `.catch(() => [{ n: 0 }])

  const starter = Number((orgs as any).starter || 0)
  const growth = Number((orgs as any).growth || 0)
  const pro = Number((orgs as any).pro || 0)
  const unlimited = Number((orgs as any).unlimited || 0)
  const totalLeads = Number((leads as any).total || 0)
  const touched = Number((leads as any).touched || 0)
  const replies = Number((leads as any).replies || 0)
  const customers = Number((leads as any).customers || 0)
  const bounced = Number((leads as any).bounced || 0)

  return {
    organizations: Number((orgs as any).total || 0),
    paidOrganizations: Number((orgs as any).paid || 0),
    starter,
    growth,
    pro,
    unlimited,
    campaigns: Number((campaigns as any).total || 0),
    activeCampaigns: Number((campaigns as any).active || 0),
    campaignsCreated7d: Number((campaigns as any).created_7d || 0),
    targets: Number((targets as any).n || 0),
    leads: totalLeads,
    touched,
    replies,
    engaged: Number((leads as any).engaged || 0),
    customers,
    bounced,
    newFounderLeads24h: Number((leads as any).new_founder || 0),
    staleAssigned: Number((stale as any).n || 0),
    completedUnreviewed: Number((completed as any).n || 0),
    openAlerts: Number((alerts as any).n || 0),
    estimatedMrr: Math.round(starter * 149 + growth * 299 + pro * 749 + unlimited * 1499),
    replyRate: touched > 0 ? Number(((replies / touched) * 100).toFixed(1)) : 0,
    customerRate: totalLeads > 0 ? Number(((customers / totalLeads) * 100).toFixed(1)) : 0,
    bounceRate: touched > 0 ? Number(((bounced / touched) * 100).toFixed(1)) : 0,
  }
}

async function previousMetrics(sql: Sql, companyId: string): Promise<Partial<Os6Metrics>> {
  const [row] = await sql`
    SELECT metrics FROM kaan_os6_cycles
    WHERE company_id=${companyId} AND status='completed' AND metrics IS NOT NULL
    ORDER BY completed_at DESC NULLS LAST, updated_at DESC
    LIMIT 1
  `.catch(() => [])
  return ((row as any)?.metrics || {}) as Partial<Os6Metrics>
}

function metricDeltas(current: Os6Metrics, previous: Partial<Os6Metrics>): MetricDelta {
  const keys: Array<keyof Os6Metrics> = [
    'organizations',
    'paidOrganizations',
    'campaigns',
    'activeCampaigns',
    'campaignsCreated7d',
    'targets',
    'leads',
    'touched',
    'replies',
    'engaged',
    'customers',
    'estimatedMrr',
    'replyRate',
    'customerRate',
    'bounceRate',
  ]
  const out: MetricDelta = {}
  for (const key of keys) {
    if (typeof previous[key] === 'number') out[key] = Number((current[key] - (previous[key] || 0)).toFixed(2))
  }
  return out
}

function deterministicReasoning(metrics: Os6Metrics, deltas: MetricDelta) {
  const constraints = []
  if (metrics.leads > 0 && metrics.touched === 0) constraints.push('MSP/security lead pipeline is not being touched')
  if (metrics.touched > 20 && metrics.replyRate < 3) constraints.push('reply rate is under the minimum viable outbound threshold')
  if (metrics.engaged > 0 && metrics.customers === 0) constraints.push('engaged pipeline is not converting into customers')
  if (metrics.organizations > 3 && metrics.paidOrganizations === 0) constraints.push('organizations exist but paid conversion is zero')
  if (metrics.campaigns === 0 && metrics.organizations > 0) constraints.push('product activation is weak because no campaigns exist')
  if (metrics.bounceRate > 8) constraints.push('bounce rate is high enough to threaten sender reputation')
  if (metrics.staleAssigned > 0) constraints.push('agent commitments are stale and need management pressure')
  if (metrics.openAlerts > 0) constraints.push('system alerts exist and require self-healing')
  const movement = Object.entries(deltas)
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .slice(0, 6)
    .map(([key, value]) => `${key} ${Number(value) > 0 ? '+' : ''}${value}`)
    .join(', ')
  return [
    'OS 6.0 diagnosis: PhishSimAI must optimize for qualified MSP pipeline, campaign activation, paid conversion, retention, and reliable execution today.',
    constraints.length ? `Pressure points: ${constraints.join('; ')}.` : 'No acute blocker detected, so Janet should keep compounding acquisition, activation, retention, and revenue instrumentation.',
    movement ? `Movement since last checkpoint: ${movement}.` : 'No prior checkpoint movement yet; this cycle seeds the baseline.',
    'Janet should make a small number of owner-bound decisions, execute only safe bounded work, learn from deltas, and send one concise proof-of-work report.',
  ].join(' ')
}

async function reason(metrics: Os6Metrics, deltas: MetricDelta, companyId: string, deepReason = true): Promise<string> {
  const fallback = deterministicReasoning(metrics, deltas)
  if (!deepReason) return fallback

  const memories = await recallMemory(companyId, undefined, 18).catch(() => [])
  const memoryBlock = memories.map((m: any) => `[${m.type}] ${m.key}: ${String(m.value).slice(0, 160)}`).join('\n') || 'No memory yet.'
  const prompt = `${OS6_STANDARD}

Metrics JSON:
${JSON.stringify(metrics)}

Metric deltas JSON:
${JSON.stringify(deltas)}

Relevant memory:
${memoryBlock}

Think deeply but briefly. Return one sharp CGO operating diagnosis in 8-12 sentences. Include what to improve today, what to stop doing, and what the company should learn from this cycle.`

  const result = await llmComplete({
    messages: [
      { role: 'system', content: 'You are Janet, a battle-tested B2B security SaaS CGO. Be specific, concise, decisive, and revenue-driven.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 900,
    temperature: 0.35,
  }).catch(() => null)

  return result?.text?.trim() || fallback
}

function decision(
  owner: AgentId,
  title: string,
  description: string,
  priority: Os6Decision['priority'],
  dueInHours: number,
  successMetric: string,
  reason: string,
  mode: Os6Decision['mode'] = 'task',
): Os6Decision {
  return { owner, title, description, priority, dueInHours, dueAt: dueAt(dueInHours), successMetric, reason, mode }
}

function decide(metrics: Os6Metrics, deltas: MetricDelta, trigger: Trigger, reasoning: string): Os6Decision[] {
  const today = dayStamp()
  const decisions: Os6Decision[] = [
    decision(
      'janet',
      `OS 6.0 daily PhishSimAI operating diagnosis - ${today}`,
      `${OS6_STANDARD}\n\nUse this diagnosis as the operating truth for today:\n${reasoning}\n\nDecide the one MSP pipeline bottleneck, one activation bottleneck, one compliance trust move, and one thing to stop or simplify. Report only proof of work, not chatter.`,
      'critical',
      8,
      'One daily CGO diagnosis with bottleneck, owner map, expected metric movement, and stop-doing decision.',
      'Janet must own the full business loop, not only respond to founder prompts.',
    ),
    decision(
      'aria',
      `OS 6.0 compliance demand agenda - ${today}`,
      'Create the actual PhishSimAI content/demand agenda for today. Include MSP/compliance hook, channel, offer angle, proof claim, buyer psychology, and what will be measured. Optimize for qualified pipeline and trust, not vanity content.',
      'high',
      18,
      'At least 3 concrete campaign/content assets with channel, hook, CTA, and success metric.',
      'Growth needs daily compounding demand creation around compliance and breach-risk proof.',
    ),
    decision(
      'nova',
      `OS 6.0 campaign activation improvement - ${today}`,
      'Find one product-led improvement for first campaign launch, audit-readiness proof, MSP white-label conversion, training completion, or retention. Specify experiment, success metric, expected lift, and handoff.',
      'high',
      24,
      'One activation/retention experiment with metric target and implementation owner.',
      'Revenue improves when campaign activation and proof of compliance improve, not only when more leads arrive.',
    ),
  ]

  if (trigger === 'lead_import' || metrics.newFounderLeads24h > 0 || (metrics.leads > 0 && metrics.touched === 0)) {
    decisions.push(
      decision('rex', `OS 6.0 founder lead triage and CRM hygiene - ${today}`, 'Clean, dedupe, score, and segment the newest or untouched MSP/security leads. Mark next action and ICP fit so Marcus can act without waiting.', 'high', 12, 'Every usable lead has ICP score, segment, and next action.', 'Leads must not sit idle.'),
      decision('marcus', `OS 6.0 first-touch MSP revenue sequence - ${today}`, 'Write the first-touch sequence for the highest-fit MSP/security compliance segment. Include breach/compliance hook, offer, qualification rule, follow-up cadence, and expected reply-rate benchmark.', 'high', 12, 'Sequence ready with reply-rate target and follow-up rule.', 'Imported or untouched leads must convert into sales conversations quickly.'),
    )
  }

  if (metrics.touched > 20 && metrics.replyRate < 3) {
    decisions.push(decision('aria', `OS 6.0 fix low-reply compliance positioning - ${today}`, `Reply rate is ${metrics.replyRate}%. Produce 3 stronger acquisition hooks using breach risk, audit readiness, and MSP white-label economics, then pick the first test.`, 'critical', 12, 'New hook test selected with target reply-rate lift.', 'Low reply rate is a positioning and offer problem until proven otherwise.'))
  }

  if (metrics.engaged > 0 && metrics.customers === 0) {
    decisions.push(decision('marcus', `OS 6.0 convert engaged MSP pipeline - ${today}`, `${metrics.engaged} engaged prospect(s), 0 customers. Define the next commercial action, objection handling, and follow-up plan for converting engaged MSP/security buyers.`, 'critical', 12, 'Each engaged prospect has a next action, CTA, and conversion path.', 'Sales decisions in PhishSimAI belong to Marcus, and engaged pipeline must not age silently.'))
  }

  if (metrics.organizations > 3 && metrics.paidOrganizations === 0) {
    decisions.push(decision('finn', `OS 6.0 paid conversion and packaging review - ${today}`, `Paid organizations are zero across ${metrics.organizations} organization(s). Diagnose pricing, packaging, trial, annual discount, and upgrade friction. Give Janet the highest ROI monetization move and proof metric.`, 'high', 24, 'One monetization move tied to paid org conversion or MRR lift.', 'A CGO must manage revenue quality, not just activity.'))
  }

  if (metrics.campaigns === 0 && metrics.organizations > 0) {
    decisions.push(decision('vera', `OS 6.0 campaign launch recovery - ${today}`, 'Build a dormant or unactivated organization recovery move for PhishSimAI. Include segment, message, timing, audit-readiness promise, and success metric.', 'high', 18, 'Activation move ready with campaign-launch target.', 'Retention and activation are revenue levers and must be managed daily.'))
  }

  if (metrics.staleAssigned > 0 || metrics.openAlerts > 0) {
    decisions.push(decision('max', `OS 6.0 self-heal and lean operations audit - ${today}`, `Audit ${metrics.staleAssigned} stale task(s) and ${metrics.openAlerts} open alert(s). Decide what to close, reassign, or escalate. Keep Kaan out unless material.`, 'critical', 8, 'Stale commitments and open alerts reduced or assigned to a real owner.', 'The system must self-sustain and self-heal without noisy founder pings.', 'self_heal'))
  }

  decisions.push(decision('scout', `OS 6.0 weekly security awareness ICP sweep - ${today}`, 'Compare PhishSimAI against KnowBe4, Proofpoint, Hoxhunt, and MSP-focused alternatives. Identify one acquisition wedge, one trust wedge, and one monetization wedge to exploit this week.', 'medium', 36, 'One competitor-informed wedge handed to Aria/Marcus/Nova.', 'Janet needs market awareness to adapt organically.'))

  return decisions.slice(0, trigger === 'lead_import' ? 6 : 8)
}

// PS-DEDUPE-01: this check is EXACT-MATCH on title, and every title built above ends with
// `- ${today}`. So yesterday's row never matched today's title and the same decision was
// re-issued every single day (Finn and Scout drew byte-identical work on 07-22 and 07-23).
// Normalise before comparing — normalizeTaskTitle strips the trailing date stamp — so the
// window this function always intended to enforce actually holds. issueTask enforces the
// same rule centrally as a backstop; this stays because catching it here also avoids
// writing a redundant kaan_os6_decisions row.
async function existingTask(sql: Sql, companyId: string, owner: AgentId, title: string) {
  const rows = await sql`
    SELECT id, title FROM agent_tasks
    WHERE company_id=${companyId}
      AND agent_id=${owner}
      AND created_at > NOW() - INTERVAL '3 days'
    ORDER BY created_at DESC
    LIMIT 50
  `.catch(() => [])
  const key = normalizeTaskTitle(title)
  if (!key) return undefined
  return (rows as any[]).find(r => normalizeTaskTitle(r.title) === key)?.id as string | undefined
}

async function executeDecisions(sql: Sql, companyId: string, cycleId: string, decisions: Os6Decision[]) {
  const assigned: AssignedTask[] = []
  for (const item of decisions) {
    const existingId = await existingTask(sql, companyId, item.owner, item.title)
    if (existingId) {
      assigned.push({ id: existingId, owner: item.owner, title: item.title, successMetric: item.successMetric })
      continue
    }

    const task = await issueTask(item.owner, {
      agent_id: item.owner,
      title: item.title,
      description: `${item.description}\n\nSuccess metric: ${item.successMetric}\nDue: ${item.dueAt}\nOS 6.0 reason: ${item.reason}`,
      priority: item.priority,
      due_in_hours: item.dueInHours,
    }, companyId).catch(() => null) // notify was never a param of issueTask -- 4th arg was silently ignored

    // PS-DEDUPE-01: issueTask now absorbs a repeat centrally and hands back the EXISTING row.
    // Treat that exactly like the existingTask() hit above — record the decision as already
    // assigned, and do NOT write another kaan_os6_decisions row for work already tracked.
    if (task?.deduped) {
      assigned.push({ id: task.task_id, owner: item.owner, title: item.title, successMetric: item.successMetric })
      continue
    }

    const taskId = task?.task_id || `unpersisted:${Date.now()}:${item.owner}`
    assigned.push({ id: taskId, owner: item.owner, title: item.title, successMetric: item.successMetric })
    await sql`
      INSERT INTO kaan_os6_decisions (company_id, cycle_id, owner, title, success_metric, priority, status, task_id, due_at)
      VALUES (${companyId}, ${cycleId}, ${item.owner}, ${item.title}, ${item.successMetric}, ${item.priority}, ${task ? 'assigned' : 'unpersisted'}, ${taskId}, ${item.dueAt})
    `.catch(() => {})
  }
  return assigned
}

async function executeDueWork(sql: Sql, companyId: string, limit: number) {
  const executed: string[] = []
  if (limit <= 0) return executed
  const rows = await sql`
    SELECT id FROM agent_tasks
    WHERE company_id=${companyId}
      AND status='assigned'
      AND created_at < NOW() - INTERVAL '45 minutes'
    ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at
    LIMIT ${limit}
  `.catch(() => [])
  for (const row of rows as Array<{ id: string }>) {
    await executeTask(row.id, companyId).then(() => executed.push(row.id)).catch(() => {})
  }
  return executed
}

async function reviewCompletedWork(sql: Sql, companyId: string, limit: number) {
  const reviewed: string[] = []
  if (limit <= 0) return reviewed
  const rows = await sql`
    SELECT id FROM agent_tasks
    WHERE company_id=${companyId} AND status='completed'
    ORDER BY completed_at ASC NULLS LAST
    LIMIT ${limit}
  `.catch(() => [])
  for (const row of rows as Array<{ id: string }>) {
    await reviewTask(row.id, companyId).then(() => reviewed.push(row.id)).catch(() => {})
  }
  return reviewed
}

function learn(metrics: Os6Metrics, deltas: MetricDelta, assigned: AssignedTask[], executed: string[], reviewed: string[]) {
  const lessons: string[] = []
  if ((deltas.replyRate || 0) < 0) lessons.push('Reply rate weakened. Janet should change positioning or lead segment immediately, not wait for more volume.')
  if ((deltas.customerRate || 0) < 0) lessons.push('Customer conversion weakened. Janet should inspect sales follow-up and paid conversion friction before increasing acquisition.')
  if ((deltas.activeCampaigns || 0) < 0) lessons.push('Campaign activation weakened. Vera/Nova should prioritize onboarding nudges and first-campaign quality.')
  if (metrics.bounceRate > 8) lessons.push('Bounce rate is risky. Rex must pause bad sources and protect sender reputation before more volume.')
  if (metrics.staleAssigned > 0) lessons.push('Stale agent work exists. Max must close, reassign, or escalate because autonomy fails when commitments age silently.')
  if (!lessons.length) lessons.push('No negative movement detected. Keep compounding the highest-leverage acquisition, activation, retention, and revenue loops.')
  if (assigned.length > 6 && executed.length === 0 && reviewed.length === 0) lessons.push('Assignment volume is high relative to execution. Keep future cycles lean and outcome-focused.')
  return lessons
}

function improve(metrics: Os6Metrics, deltas: MetricDelta) {
  const improvements: string[] = []
  if (metrics.leads > 0 && metrics.touched === 0) improvements.push('Shorten lead-to-first-touch time to same day.')
  if (metrics.touched > 20 && metrics.replyRate < 3) improvements.push('Replace weak outbound hooks within 24 hours and test a sharper MSP/compliance angle.')
  if (metrics.engaged > 0 && metrics.customers === 0) improvements.push('Convert engaged pipeline with a Marcus-owned next action and low-friction CTA.')
  if (metrics.organizations > 3 && metrics.paidOrganizations === 0) improvements.push('Run one monetization or activation experiment before adding more broad acquisition.')
  if ((deltas.estimatedMrr || 0) <= 0 && metrics.organizations > 0) improvements.push('Tie every daily decision to MRR, paid org conversion, campaign activation, or qualified pipeline movement.')
  if (metrics.openAlerts > 0) improvements.push('Resolve or suppress stale system alerts so Kaan receives only the daily proof-of-work report.')
  if (!improvements.length) improvements.push('Keep the daily loop lean: fewer tasks, clearer owners, faster metric feedback.')
  return improvements
}

async function persistLearning(companyId: string, cycleId: string, reasoning: string, lessons: string[], improvements: string[]) {
  await rememberFact({
    company_id: companyId,
    type: 'operating',
    key: 'kaan_ai_os_version',
    value: 'Kaan AI OS 6.0 persistent operating loop active: observe, reason, decide, execute, review, learn, improve, report, repeat.',
    confidence: 1,
    source: 'os6_kernel',
  }).catch(() => {})
  await rememberFact({
    company_id: companyId,
    type: 'operating',
    key: 'os6_cgo_standard',
    value: OS6_STANDARD,
    confidence: 1,
    source: 'os6_kernel',
  }).catch(() => {})
  await rememberFact({
    company_id: companyId,
    type: 'strategic',
    key: `os6_cycle:${cycleId}`,
    value: JSON.stringify({ reasoning: reasoning.slice(0, 900), lessons, improvements }).slice(0, 1600),
    confidence: 0.95,
    source: 'os6_kernel',
  }).catch(() => {})
}

async function report(
  sql: Sql,
  companyId: string,
  cycleId: string,
  trigger: Trigger,
  metrics: Os6Metrics,
  assigned: AssignedTask[],
  executed: string[],
  reviewed: string[],
  lessons: string[],
  improvements: string[],
  force = false,
) {
  if (trigger !== 'daily' && !force) return false
  const reportDay = dayStamp()
  const body = [
    '<b>Janet OS 6.0 Daily Proof of Work</b>',
    `PhishSimAI: ${metrics.organizations} orgs, ${metrics.paidOrganizations} paid, est. MRR $${metrics.estimatedMrr}, ${metrics.campaigns} campaigns, ${metrics.targets} active targets, ${metrics.leads} leads, reply rate ${metrics.replyRate}%.`,
    `Decisions assigned: ${assigned.length}. Executed: ${executed.length}. Reviewed: ${reviewed.length}.`,
    assigned.slice(0, 5).map((item) => `- ${(AGENTS[item.owner] || AGENTS.janet).name}: ${item.title} (${item.successMetric})`).join('\n'),
    `Improve next: ${improvements[0] || 'Keep compounding.'}`,
    `Learning: ${lessons[0] || 'No negative movement detected.'}`,
  ].filter(Boolean).join('\n')

  const [inserted] = await sql`
    INSERT INTO kaan_os6_reports (company_id, report_day, report_kind, cycle_id, body)
    VALUES (${companyId}, ${reportDay}, 'daily_cgo', ${cycleId}, ${body})
    ON CONFLICT (company_id, report_day, report_kind) DO NOTHING
    RETURNING id
  `.catch(() => [])

  if (!(inserted as any)?.id && !force) return false
  await sendTelegram(body).catch(() => {})
  return true
}

function fallbackResult(companyId: string, cycleId: string, trigger: Trigger, degraded: string[]): KaanOS6CycleResult {
  const today = dayStamp()
  const decisions = decide(zeroMetrics(), {}, trigger, deterministicReasoning(zeroMetrics(), {}))
  return {
    ok: true,
    osVersion: OS_VERSION,
    autonomyLevel: AUTONOMY_LEVEL,
    companyId,
    cycleId,
    trigger,
    metrics: zeroMetrics(),
    deltas: {},
    reasoning: 'OS 6.0 degraded fallback: Janet preserved the operating loop and assigned the minimum CGO owner map while persistence recovered.',
    decisions,
    assigned: decisions.slice(0, 4).map((item) => ({
      id: `fallback:${today}:${item.owner}`,
      owner: item.owner,
      title: item.title,
      successMetric: item.successMetric,
    })),
    executed: [],
    reviewed: [],
    lessons: ['The OS 6.0 loop degraded gracefully instead of paging Kaan or failing the cron. Repair persistence before the next cycle.'],
    improvements: ['Self-heal the persistence path and keep Telegram quiet until the next daily report.'],
    reportSent: false,
    degraded,
  }
}

export async function runKaanOS6JanetCycle(
  companyId = 'phishsimai',
  opts: {
    trigger?: Trigger
    detail?: string
    deepReason?: boolean
    executeLimit?: number
    reviewLimit?: number
    report?: boolean
    forceReport?: boolean
  } = {},
): Promise<KaanOS6CycleResult> {
  const trigger = opts.trigger || 'manual'
  const cycleId = cycleIdFor(companyId, trigger)
  const degraded: string[] = []

  try {
    const sql = getSql()
    await ensureOS6Tables(sql)
    await sql`
      INSERT INTO kaan_os6_cycles (company_id, cycle_id, trigger, status, current_stage)
      VALUES (${companyId}, ${cycleId}, ${trigger}, 'running', 'observe')
      ON CONFLICT (cycle_id) DO NOTHING
    `

    await checkpoint(sql, companyId, cycleId, 'observe', 'started', opts.detail ? { detail: opts.detail } : undefined)
    const metrics = await observe(sql, companyId)
    const previous = await previousMetrics(sql, companyId)
    const deltas = metricDeltas(metrics, previous)
    await checkpoint(sql, companyId, cycleId, 'observe', 'completed', { metrics, deltas })
    await updateCycle(sql, cycleId, { current_stage: 'reason', metrics, deltas })

    await checkpoint(sql, companyId, cycleId, 'reason', 'started')
    const reasoning = await reason(metrics, deltas, companyId, opts.deepReason !== false).catch((e) => {
      degraded.push(`reason:${String((e as Error).message || e).slice(0, 120)}`)
      return deterministicReasoning(metrics, deltas)
    })
    await checkpoint(sql, companyId, cycleId, 'reason', 'completed', { reasoning })
    await updateCycle(sql, cycleId, { current_stage: 'decide', reasoning })

    await checkpoint(sql, companyId, cycleId, 'decide', 'started')
    const decisions = decide(metrics, deltas, trigger, reasoning)
    await checkpoint(sql, companyId, cycleId, 'decide', 'completed', { decisions })
    await updateCycle(sql, cycleId, { current_stage: 'execute', decisions })

    await checkpoint(sql, companyId, cycleId, 'execute', 'started')
    const assigned = await executeDecisions(sql, companyId, cycleId, decisions).catch((e) => {
      degraded.push(`assign:${String((e as Error).message || e).slice(0, 120)}`)
      return [] as AssignedTask[]
    })
    const executed = await executeDueWork(sql, companyId, opts.executeLimit ?? 1)
    await checkpoint(sql, companyId, cycleId, 'execute', 'completed', { assigned, executed })
    await updateCycle(sql, cycleId, { current_stage: 'review', assigned, executed })

    await checkpoint(sql, companyId, cycleId, 'review', 'started')
    const reviewed = await reviewCompletedWork(sql, companyId, opts.reviewLimit ?? 2)
    await checkpoint(sql, companyId, cycleId, 'review', 'completed', { reviewed })
    await updateCycle(sql, cycleId, { current_stage: 'learn', reviewed })

    await checkpoint(sql, companyId, cycleId, 'learn', 'started')
    const lessons = learn(metrics, deltas, assigned, executed, reviewed)
    await persistLearning(companyId, cycleId, reasoning, lessons, [])
    await checkpoint(sql, companyId, cycleId, 'learn', 'completed', { lessons })
    await updateCycle(sql, cycleId, { current_stage: 'improve', lessons })

    await checkpoint(sql, companyId, cycleId, 'improve', 'started')
    const improvements = improve(metrics, deltas)
    await persistLearning(companyId, cycleId, reasoning, lessons, improvements)
    await checkpoint(sql, companyId, cycleId, 'improve', 'completed', { improvements })
    await updateCycle(sql, cycleId, { current_stage: 'report', improvements, degraded })

    await checkpoint(sql, companyId, cycleId, 'report', 'started')
    const reportSent = opts.report === false
      ? false
      : await report(sql, companyId, cycleId, trigger, metrics, assigned, executed, reviewed, lessons, improvements, opts.forceReport)
    await checkpoint(sql, companyId, cycleId, 'report', 'completed', { reportSent })
    await updateCycle(sql, cycleId, { status: 'completed', completed_at: true, report_sent: reportSent, degraded })

    return {
      ok: true,
      osVersion: OS_VERSION,
      autonomyLevel: AUTONOMY_LEVEL,
      companyId,
      cycleId,
      trigger,
      metrics,
      deltas,
      reasoning,
      decisions,
      assigned,
      executed,
      reviewed,
      lessons,
      improvements,
      reportSent,
      degraded,
    }
  } catch (e) {
    return fallbackResult(companyId, cycleId, trigger, [`kernel:${String((e as Error).message || e).slice(0, 160)}`])
  }
}
