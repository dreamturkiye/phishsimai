import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { rememberFact } from './memory'
import {
  AGENTS,
  executeTask,
  issueTask,
  reviewTask,
  type AgentId,
} from '../lib/kaan_os_v4'
import { runL5JanetCycle } from './l5Autonomy'
import { getArchitectPipelineStatus } from './janetHQActions'

type Sql = ReturnType<typeof getSql>
type Trigger = 'daily' | 'lead_import' | 'manual'

type AssignedTask = { id: string; owner: AgentId; title: string }

type CgoMetrics = {
  leads: number
  touched: number
  replies: number
  engaged: number
  customers: number
  bounced: number
  newFounderLeads24h: number
  staleAssigned: number
  completedUnreviewed: number
}

export type JanetOperatingCycleResult = {
  ok: true
  trigger: Trigger
  metrics: CgoMetrics
  assigned: AssignedTask[]
  executed: string[]
  reviewed: string[]
  memoryKey: string
  l5Executed: number
}

const WORLD_CLASS_CGO_STANDARD = `Operate like a battle-tested SaaS CGO with 15+ years of startup growth experience. Do not produce generic advice. Diagnose the business, make decisions, assign owners, and define the next measurable action. Every output must be specific enough that a senior operator could execute it today. Cover growth loops, ICP, positioning, acquisition, conversion, retention, monetization, content, sales execution, customer success, and competitive pressure.`

function dayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function weekStamp() {
  const d = new Date()
  const oneJan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getUTCDay() + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

async function taskExists(sql: Sql, companyId: string, owner: AgentId, title: string): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM agent_tasks
    WHERE company_id=${companyId}
      AND agent_id=${owner}
      AND title=${title}
      AND status IN ('assigned', 'in_progress', 'completed')
      AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 1
  `.catch(() => [])
  return (rows as unknown[]).length > 0
}

async function assignOnce(
  sql: Sql,
  companyId: string,
  assigned: AssignedTask[],
  owner: AgentId,
  title: string,
  description: string,
  dueInHours = 24,
  priority: 'critical' | 'high' | 'medium' | 'low' = 'high',
) {
  if (await taskExists(sql, companyId, owner, title)) return
  const task = await issueTask(owner, {
    agent_id: owner,
    title,
    description,
    priority,
    due_in_hours: dueInHours,
  }, companyId)
  assigned.push({ id: task.task_id, owner, title })
}

async function getMetrics(sql: Sql, companyId: string): Promise<CgoMetrics> {
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
  const [assigned] = await sql`
    SELECT count(*)::int as n FROM agent_tasks
    WHERE company_id=${companyId}
      AND status IN ('assigned','in_progress')
      AND created_at < NOW() - INTERVAL '24 hours'
  `.catch(() => [{ n: 0 }])
  const [completed] = await sql`
    SELECT count(*)::int as n FROM agent_tasks
    WHERE company_id=${companyId} AND status='completed'
  `.catch(() => [{ n: 0 }])

  return {
    leads: Number((leads as { total: number }).total || 0),
    touched: Number((leads as { touched: number }).touched || 0),
    replies: Number((leads as { replies: number }).replies || 0),
    engaged: Number((leads as { engaged: number }).engaged || 0),
    customers: Number((leads as { customers: number }).customers || 0),
    bounced: Number((leads as { bounced: number }).bounced || 0),
    newFounderLeads24h: Number((leads as { new_founder: number }).new_founder || 0),
    staleAssigned: Number((assigned as { n: number }).n || 0),
    completedUnreviewed: Number((completed as { n: number }).n || 0),
  }
}

async function assignStrategicOperatingTasks(sql: Sql, companyId: string, assigned: AssignedTask[], trigger: Trigger, metrics: CgoMetrics) {
  const today = dayStamp()
  const week = weekStamp()
  const replyRate = metrics.touched > 0 ? (metrics.replies / metrics.touched) * 100 : 0
  const customerRate = metrics.leads > 0 ? (metrics.customers / metrics.leads) * 100 : 0
  const bounceRate = metrics.touched > 0 ? (metrics.bounced / metrics.touched) * 100 : 0

  if (trigger === 'daily' || trigger === 'manual') {
    await assignOnce(sql, companyId, assigned, 'janet',
      `Daily CGO growth diagnosis — ${today}`,
      `${WORLD_CLASS_CGO_STANDARD}

Run a full-company CGO diagnosis for PhishSimAI today. Use the live scorecard: ${metrics.leads} MSP/security leads, ${metrics.touched} touched, ${metrics.replies} replies (${replyRate.toFixed(1)}%), ${metrics.engaged} engaged, ${metrics.customers} customers (${customerRate.toFixed(1)}% of leads), ${metrics.bounced} bounced (${bounceRate.toFixed(1)}% of touched).

Deliver:
1. The single biggest growth bottleneck and why it matters now.
2. The highest-leverage opportunity Janet will pursue today.
3. Specific decisions across MSP/channel acquisition, compliance messaging, social/content, activation, retention, pricing/packaging, and competitive positioning.
4. Exactly which employee owns each action and what measurable result is expected.
5. What Janet will report to Kaan if he is offline for a week.`,
      8,
      'critical')

    await assignOnce(sql, companyId, assigned, 'aria',
      `Compliance content and social growth agenda — ${today}`,
      `${WORLD_CLASS_CGO_STANDARD}

Create today's PhishSimAI content/social agenda as if you owned MSP pipeline generation. Include one LinkedIn post angle, one compliance/audit proof asset, one breach-risk hook, and one channel partner content experiment. No placeholders; write the actual hooks and why they should convert.`,
      18)

    await assignOnce(sql, companyId, assigned, 'nova',
      `Activation, retention, and MSP conversion lever — ${today}`,
      `${WORLD_CLASS_CGO_STANDARD}

Find one product-led growth lever that can improve first phishing campaign launch, audit-readiness proof, MSP white-label conversion, or retention. Define the experiment, success metric, expected impact, and owner handoff.`,
      24)
  }

  if (trigger === 'daily') {
    await assignOnce(sql, companyId, assigned, 'scout',
      `Weekly security awareness competitive and ICP sweep — ${week}`,
      `${WORLD_CLASS_CGO_STANDARD}

Run a competitive/ICP sweep for PhishSimAI. Compare positioning against KnowBe4, Proofpoint, Hoxhunt, and MSP-focused alternatives. Identify one underserved MSP/security compliance wedge and give Marcus/Aria the exact angle to exploit this week.`,
      36,
      'medium')
  }
}

async function assignSignalTasks(sql: Sql, companyId: string, trigger: Trigger, metrics: CgoMetrics) {
  const assigned: AssignedTask[] = []
  const replyRate = metrics.touched > 0 ? (metrics.replies / metrics.touched) * 100 : 0
  const bounceRate = metrics.touched > 0 ? (metrics.bounced / metrics.touched) * 100 : 0

  await assignStrategicOperatingTasks(sql, companyId, assigned, trigger, metrics)

  if (trigger === 'lead_import' || metrics.newFounderLeads24h > 0) {
    await assignOnce(sql, companyId, assigned, 'rex',
      'Triage founder-uploaded MSP leads',
      `Kaan supplied ${metrics.newFounderLeads24h || 'new'} lead(s). Clean CRM fields, dedupe, score MSP/compliance fit, and set the next action for each usable lead.`,
      12)
    await assignOnce(sql, companyId, assigned, 'marcus',
      'Prepare first-touch MSP outreach plan',
      `${WORLD_CLASS_CGO_STANDARD}

Turn the new lead batch into a concrete MSP/security compliance outreach sequence with one strong breach/compliance hook and a low-friction CTA. Write the actual first-touch copy and define follow-up qualification.`,
      12)
    await assignOnce(sql, companyId, assigned, 'scout',
      'Validate compliance buyer segment in new leads',
      'Analyze the founder-uploaded leads for MSP, IT director, HIPAA/SOC2/PCI, and SMB fit. Tell Marcus which segment to work first.',
      18)
  }

  if (metrics.leads > 0 && metrics.touched === 0) {
    await assignOnce(sql, companyId, assigned, 'marcus',
      'Unblock zero-touch MSP pipeline',
      `${metrics.leads} prospects exist but no first touch has been sent. Identify the blocker and produce today’s send plan.`,
      8)
  }

  if (metrics.touched > 20 && replyRate < 3) {
    await assignOnce(sql, companyId, assigned, 'aria',
      'Rewrite compliance outreach hooks',
      `${WORLD_CLASS_CGO_STANDARD}

Reply rate is ${replyRate.toFixed(1)}%. Produce 3 MSP/compliance hooks using breach risk, audit evidence, and white-label positioning. Each hook must include buyer pain, proof angle, CTA, and why it should outperform the current message.`,
      18)
  }

  if (bounceRate > 8) {
    await assignOnce(sql, companyId, assigned, 'rex',
      'Audit bad MSP lead sources',
      `Bounce rate is ${bounceRate.toFixed(1)}%. Identify bad sources/domains and recommend which source to pause before more sends.`,
      12)
  }

  if (metrics.engaged > 0 && metrics.customers === 0) {
    await assignOnce(sql, companyId, assigned, 'finn',
      'Convert engaged MSP pipeline into revenue forecast',
      `${metrics.engaged} engaged prospect(s), 0 customers. Forecast revenue and define the next commercial action for each engaged prospect.`,
      24)
  }

  if (metrics.staleAssigned > 0) {
    await assignOnce(sql, companyId, assigned, 'max',
      'Audit overdue employee commitments',
      `${metrics.staleAssigned} agent task(s) are stale beyond 24h. Identify blockers, owners, and escalation steps for Janet.`,
      8)
  }

  return assigned
}

async function executeAndReviewDueWork(sql: Sql, companyId: string) {
  const executed: string[] = []
  const reviewed: string[] = []
  const due = await sql`
    SELECT id FROM agent_tasks
    WHERE company_id=${companyId}
      AND status='assigned'
      AND created_at < NOW() - INTERVAL '30 minutes'
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT 2
  `.catch(() => [])
  for (const row of due as Array<{ id: string }>) {
    await executeTask(row.id, companyId).then(() => executed.push(row.id)).catch(() => {})
  }

  const completed = await sql`
    SELECT id FROM agent_tasks
    WHERE company_id=${companyId} AND status='completed'
    ORDER BY completed_at ASC NULLS LAST
    LIMIT 2
  `.catch(() => [])
  for (const row of completed as Array<{ id: string }>) {
    await reviewTask(row.id, companyId).then(() => reviewed.push(row.id)).catch(() => {})
  }
  return { executed, reviewed }
}

export async function runJanetOperatingCycle(
  companyId = 'phishsimai',
  opts: { trigger?: Trigger; notify?: boolean; detail?: string; execute?: boolean; l5?: boolean } = {},
): Promise<JanetOperatingCycleResult> {
  const trigger = opts.trigger || 'manual'
  const sql = getSql()
  const metrics = await getMetrics(sql, companyId)
  const assigned = await assignSignalTasks(sql, companyId, trigger, metrics)
  const { executed, reviewed } = opts.execute === false
    ? { executed: [] as string[], reviewed: [] as string[] }
    : await executeAndReviewDueWork(sql, companyId)
  const l5 = opts.l5 === false ? null : await runL5JanetCycle(companyId, companyId).catch(() => null)
  const pipeline = await getArchitectPipelineStatus(companyId).catch(() => null)
  const memoryKey = `cgo_cycle:${new Date().toISOString()}`
  const memoryValue = [
    `trigger=${trigger}`,
    opts.detail ? `detail=${opts.detail}` : '',
    `leads=${metrics.leads}`,
    `touched=${metrics.touched}`,
    `replies=${metrics.replies}`,
    `customers=${metrics.customers}`,
    `newFounderLeads24h=${metrics.newFounderLeads24h}`,
    `assigned=${assigned.map(t => `${t.owner}:${t.title}`).join('; ') || 'none'}`,
    `executed=${executed.length}`,
    `reviewed=${reviewed.length}`,
    pipeline ? `marcusQueued=${pipeline.queued}` : '',
  ].filter(Boolean).join(' | ')

  await rememberFact({
    company_id: companyId,
    type: 'operating',
    key: memoryKey,
    value: memoryValue.slice(0, 1200),
    confidence: 1,
    source: 'janet_cgo_kernel',
  }).catch(() => {})
  await rememberFact({
    company_id: companyId,
    type: 'operating',
    key: 'janet_world_class_cgo_standard',
    value: WORLD_CLASS_CGO_STANDARD,
    confidence: 1,
    source: 'janet_cgo_kernel',
  }).catch(() => {})

  if (opts.notify !== false && (assigned.length || executed.length || reviewed.length || trigger !== 'daily')) {
    await sendTelegram([
      'JANET CGO OPERATING CYCLE — PhishSimAI',
      `Trigger: ${trigger}`,
      `Signals: ${metrics.leads} leads, ${metrics.touched} touched, ${metrics.replies} replies, ${metrics.customers} customers, ${metrics.newFounderLeads24h} new founder lead(s)`,
      assigned.length ? `Assigned: ${assigned.map(t => `${AGENTS[t.owner].name}: ${t.title}`).join(' | ')}` : 'Assigned: none',
      `Executed: ${executed.length} | Reviewed: ${reviewed.length} | L5 actions: ${(l5 as any)?.proactive?.executed?.length || 0}`,
    ].join('\n')).catch(() => {})
  }

  return {
    ok: true,
    trigger,
    metrics,
    assigned,
    executed,
    reviewed,
    memoryKey,
    l5Executed: (l5 as any)?.proactive?.executed?.length || 0,
  }
}
