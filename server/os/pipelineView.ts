/** Kaan AI OS v4.5.3 — HQ Pipeline operational view (activity + action queue) */

export type RawPipelineLead = {
  id: string
  name: string
  company: string
  email: string
  source?: string | null
  pipeline_stage: string
  created_at: string | Date
  stage_updated_at?: string | Date | null
  touch1_sent_at?: string | Date | null
  touch2_sent_at?: string | Date | null
  touch3_sent_at?: string | Date | null
  touch4_sent_at?: string | Date | null
  replied?: boolean
  bounced?: boolean
  unsubscribed?: boolean
}

export type PipelineLeadView = {
  id: string
  name: string
  company: string
  email: string
  source: string
  stage: string
  status: string
  statusTone: 'green' | 'amber' | 'blue' | 'red' | 'gray'
  lastEvent: string
  lastEventAt: string
  actionReason?: string
}

export type PipelineView = {
  buckets: {
    awaitingT1: number
    stalled: number
    inSequence: number
    dueNextTouch: number
    engaged: number
    bounced: number
    customers: number
  }
  actionQueue: PipelineLeadView[]
  activityFeed: PipelineLeadView[]
  recentlyAdded: PipelineLeadView[]
}

const TOUCH_GAPS = [
  { touch: 2, prev: 'touch1_sent_at' as const, delayDays: 3 },
  { touch: 3, prev: 'touch2_sent_at' as const, delayDays: 7 },
  { touch: 4, prev: 'touch3_sent_at' as const, delayDays: 12 },
  { touch: 5, prev: 'touch3_sent_at' as const, delayDays: 19 },
]

const MS_DAY = 86400000

function ts(v: string | Date | null | undefined): number {
  if (!v) return 0
  return new Date(v).getTime()
}

function iso(v: string | Date | null | undefined): string {
  if (!v) return new Date(0).toISOString()
  return new Date(v).toISOString()
}

function relTime(at: string): string {
  const diff = Date.now() - new Date(at).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < MS_DAY) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < MS_DAY * 7) return `${Math.floor(diff / MS_DAY)}d ago`
  return new Date(at).toLocaleDateString()
}

function isTerminal(lead: RawPipelineLead): boolean {
  return lead.pipeline_stage === 'dead' || lead.pipeline_stage === 'customer' || !!lead.bounced || !!lead.unsubscribed
}

function lastActiveAt(lead: RawPipelineLead): number {
  return Math.max(
    ts(lead.created_at),
    ts(lead.touch1_sent_at),
    ts(lead.touch2_sent_at),
    ts(lead.touch3_sent_at),
    ts(lead.touch4_sent_at),
    ts(lead.stage_updated_at),
  )
}

function nextTouchDue(lead: RawPipelineLead): { touch: number; dueAt: number } | null {
  if (isTerminal(lead) || !lead.touch1_sent_at) return null
  for (const gap of TOUCH_GAPS) {
    const prevAt = lead[gap.prev]
    const sentCol = gap.touch === 2 ? 'touch2_sent_at' : gap.touch === 3 ? 'touch3_sent_at' : 'touch4_sent_at'
    const alreadySent = lead[sentCol as keyof RawPipelineLead]
    if (prevAt && !alreadySent) {
      const dueAt = ts(prevAt) + gap.delayDays * MS_DAY
      return { touch: gap.touch, dueAt }
    }
  }
  return null
}

function computeStatus(lead: RawPipelineLead): { status: string; tone: PipelineLeadView['statusTone']; lastEvent: string; lastEventAt: string } {
  const source = (lead.source || 'manual').replace(/_/g, ' ')
  const activeAt = lastActiveAt(lead)

  if (lead.bounced) {
    return { status: 'Bounced', tone: 'red', lastEvent: 'Bounced — removed from sequence', lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }
  if (lead.unsubscribed) {
    return { status: 'Unsubscribed', tone: 'gray', lastEvent: 'Unsubscribed', lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }
  if (lead.pipeline_stage === 'customer') {
    return { status: 'Customer', tone: 'green', lastEvent: 'Converted to customer', lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }
  if (lead.replied || lead.pipeline_stage === 'engaged') {
    return { status: 'Engaged', tone: 'green', lastEvent: `Replied · ${lead.pipeline_stage}`, lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }
  if (lead.pipeline_stage === 'not_now') {
    return { status: 'Not now', tone: 'gray', lastEvent: 'Replied — not now', lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }
  if (lead.pipeline_stage === 'dead') {
    return { status: 'Closed', tone: 'gray', lastEvent: 'Sequence closed', lastEventAt: iso(lead.stage_updated_at || lead.created_at) }
  }

  const due = nextTouchDue(lead)
  if (due) {
    const overdue = due.dueAt <= Date.now()
    const daysLeft = Math.ceil((due.dueAt - Date.now()) / MS_DAY)
    const touchLabel = due.touch === 5 ? 'final touch' : `Touch ${due.touch}`
    if (overdue) {
      return {
        status: `Due · ${touchLabel}`,
        tone: 'amber',
        lastEvent: `${touchLabel} overdue · last sent ${relTime(iso(lead.touch1_sent_at))}`,
        lastEventAt: new Date(due.dueAt).toISOString(),
      }
    }
    const lastTouch = lead.touch4_sent_at || lead.touch3_sent_at || lead.touch2_sent_at || lead.touch1_sent_at
    return {
      status: `In sequence · T${due.touch - 1} sent`,
      tone: 'blue',
      lastEvent: `${touchLabel} due in ${daysLeft}d`,
      lastEventAt: iso(lastTouch || lead.created_at),
    }
  }

  if (lead.touch4_sent_at) {
    return { status: 'Sequence complete', tone: 'gray', lastEvent: 'Final touch sent', lastEventAt: iso(lead.touch4_sent_at) }
  }
  if (lead.touch1_sent_at) {
    const t = [lead.touch4_sent_at, lead.touch3_sent_at, lead.touch2_sent_at, lead.touch1_sent_at].find(Boolean)
    const n = lead.touch4_sent_at ? 4 : lead.touch3_sent_at ? 3 : lead.touch2_sent_at ? 2 : 1
    return { status: `In sequence · T${n} sent`, tone: 'blue', lastEvent: `Touch ${n} sent ${relTime(iso(t))}`, lastEventAt: iso(t) }
  }

  const age = Date.now() - ts(lead.created_at)
  const stalled = age > 2 * MS_DAY
  return {
    status: stalled ? 'Stalled · awaiting T1' : 'Awaiting T1',
    tone: stalled ? 'amber' : 'gray',
    lastEvent: `Imported via ${source} · not contacted`,
    lastEventAt: iso(lead.created_at),
  }
}

function actionReason(lead: RawPipelineLead): string | undefined {
  if (lead.bounced) return 'Bounced — list hygiene'
  if (lead.replied || lead.pipeline_stage === 'engaged') return 'Hot reply — follow up'
  if (lead.pipeline_stage === 'customer') return 'Customer — success check-in'
  const due = nextTouchDue(lead)
  if (due && due.dueAt <= Date.now()) return `Touch ${due.touch === 5 ? 'final' : due.touch} overdue`
  if (!lead.touch1_sent_at && !isTerminal(lead)) {
    const age = Date.now() - ts(lead.created_at)
    if (age > 2 * MS_DAY) return 'Stalled >2 days — not contacted'
  }
  return undefined
}

function enrich(lead: RawPipelineLead, withAction = false): PipelineLeadView {
  const { status, tone, lastEvent, lastEventAt } = computeStatus(lead)
  return {
    id: String(lead.id),
    name: lead.name || '—',
    company: lead.company || '—',
    email: lead.email,
    source: (lead.source || 'manual').replace(/_/g, ' '),
    stage: lead.pipeline_stage || 'prospect',
    status,
    statusTone: tone,
    lastEvent,
    lastEventAt,
    actionReason: withAction ? actionReason(lead) : undefined,
  }
}

export function buildPipelineView(rows: RawPipelineLead[]): PipelineView {
  const active = rows.filter(r => !r.bounced && !r.unsubscribed)

  const buckets = {
    awaitingT1: active.filter(r => !r.touch1_sent_at && !['dead', 'customer'].includes(r.pipeline_stage)).length,
    stalled: active.filter(r => !r.touch1_sent_at && !['dead', 'customer'].includes(r.pipeline_stage) && Date.now() - ts(r.created_at) > 2 * MS_DAY).length,
    inSequence: active.filter(r => !!r.touch1_sent_at && !['dead', 'customer'].includes(r.pipeline_stage) && !r.replied).length,
    dueNextTouch: active.filter(r => {
      const d = nextTouchDue(r)
      return d !== null && d.dueAt <= Date.now()
    }).length,
    engaged: rows.filter(r => r.replied || r.pipeline_stage === 'engaged').length,
    bounced: rows.filter(r => r.bounced).length,
    customers: rows.filter(r => r.pipeline_stage === 'customer').length,
  }

  const actionQueue = rows
    .map(r => enrich(r, true))
    .filter(r => r.actionReason)
    .sort((a, b) => new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime())
    .slice(0, 25)

  const activityFeed = [...rows]
    .sort((a, b) => lastActiveAt(b) - lastActiveAt(a))
    .slice(0, 30)
    .map(r => enrich(r))

  const recentlyAdded = [...rows]
    .sort((a, b) => ts(b.created_at) - ts(a.created_at))
    .slice(0, 20)
    .map(r => enrich(r))

  return { buckets, actionQueue, activityFeed, recentlyAdded }
}

export const PIPELINE_LEAD_SELECT = `
  id, name, company, email,
  COALESCE(source, 'manual') as source,
  COALESCE(pipeline_stage, 'prospect') as pipeline_stage,
  created_at, stage_updated_at,
  touch1_sent_at, touch2_sent_at, touch3_sent_at, touch4_sent_at,
  COALESCE(replied, false) as replied,
  COALESCE(bounced, false) as bounced,
  COALESCE(unsubscribed, false) as unsubscribed
`
