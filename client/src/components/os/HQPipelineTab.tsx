import { useMemo, useState } from 'react'

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

type Filter = 'action' | 'activity' | 'new' | 'sequence' | 'engaged' | 'all'

const TONE: Record<PipelineLeadView['statusTone'], { bg: string; color: string; border: string }> = {
  green: { bg: '#0d2b1a', color: '#4ade80', border: '#166534' },
  amber: { bg: '#2a1f05', color: '#f5a623', border: '#854d0e' },
  blue: { bg: '#0c1a2e', color: '#60a5fa', border: '#1e3a5f' },
  red: { bg: '#2a0d0d', color: '#f87171', border: '#991b1b' },
  gray: { bg: '#1a1a2e', color: '#9090aa', border: '#2e2e42' },
}

const s = {
  card: { background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10, padding: '14px 16px', marginBottom: 10 } as const,
  cardTitle: { fontSize: 11, fontWeight: 700, color: '#9090aa', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 12 },
  metricCard: { background: '#0a0a14', border: '1px solid #1e1e2e', borderRadius: 8, padding: '10px 12px' },
  metricLabel: { fontSize: 9, color: '#6b6b8a', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  metricValue: { fontSize: 20, fontWeight: 600, lineHeight: 1 },
  pill: { fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700, display: 'inline-block' } as const,
  chip: { padding: '5px 11px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #2e2e42', background: '#1a1a2e', color: '#9090aa', fontFamily: 'inherit' } as const,
  chipActive: { background: '#f5a623', color: '#0a0a0f', borderColor: '#f5a623' },
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #12121e' } as const,
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(iso).toLocaleDateString()
}

function LeadRow({ lead, showReason }: { lead: PipelineLeadView; showReason?: boolean }) {
  const tone = TONE[lead.statusTone]
  return (
    <div style={s.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0' }}>
          {lead.name} <span style={{ fontWeight: 400, color: '#9090aa' }}>· {lead.company}</span>
        </div>
        <div style={{ fontSize: 11, color: '#6b6b8a', marginTop: 2 }}>{lead.lastEvent}</div>
        {showReason && lead.actionReason && (
          <div style={{ fontSize: 10, color: '#f5a623', marginTop: 4 }}>→ {lead.actionReason}</div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{ ...s.pill, background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>{lead.status}</span>
        <div style={{ fontSize: 10, color: '#4a4a60', marginTop: 4 }}>{relTime(lead.lastEventAt)}</div>
      </div>
    </div>
  )
}

function filterLeads(view: PipelineView, filter: Filter): PipelineLeadView[] {
  switch (filter) {
    case 'action': return view.actionQueue
    case 'new': return view.recentlyAdded
    case 'sequence': return view.activityFeed.filter(l => l.status.includes('sequence') || l.status.includes('Due') || l.status.includes('Awaiting'))
    case 'engaged': return view.activityFeed.filter(l => l.statusTone === 'green' || l.stage === 'engaged')
    case 'activity':
    case 'all':
    default: return view.activityFeed
  }
}

type Props = { pipelineView?: PipelineView | null }

export function HQPipelineTab({ pipelineView: pv }: Props) {
  const [filter, setFilter] = useState<Filter>('action')

  const view = pv || {
    buckets: { awaitingT1: 0, stalled: 0, inSequence: 0, dueNextTouch: 0, engaged: 0, bounced: 0, customers: 0 },
    actionQueue: [],
    activityFeed: [],
    recentlyAdded: [],
  }

  const list = useMemo(() => filterLeads(view, filter), [view, filter])

  const chips: [Filter, string][] = [
    ['action', `Needs action (${view.actionQueue.length})`],
    ['activity', 'Latest activity'],
    ['new', `Recently added (${view.recentlyAdded.length})`],
    ['sequence', 'In sequence'],
    ['engaged', 'Engaged'],
    ['all', 'All activity'],
  ]

  return (
    <>
      <div style={s.card}>
        <div style={s.cardTitle}>Pipeline queue</div>
        <div style={s.grid}>
          {[
            ['Awaiting T1', view.buckets.awaitingT1, '#9090aa'],
            ['Stalled', view.buckets.stalled, view.buckets.stalled > 0 ? '#f5a623' : '#9090aa'],
            ['In sequence', view.buckets.inSequence, '#60a5fa'],
            ['Due touch', view.buckets.dueNextTouch, view.buckets.dueNextTouch > 0 ? '#f5a623' : '#9090aa'],
            ['Engaged', view.buckets.engaged, '#4ade80'],
            ['Customers', view.buckets.customers, '#4ade80'],
            ['Bounced', view.buckets.bounced, view.buckets.bounced > 0 ? '#f87171' : '#9090aa'],
          ].map(([label, val, color]) => (
            <div key={label as string} style={s.metricCard}>
              <div style={s.metricLabel}>{label as string}</div>
              <div style={{ ...s.metricValue, color: color as string }}>{val as number}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#6b6b8a', lineHeight: 1.5 }}>
          ARIA sends T1 oldest-first. New imports show as <strong style={{ color: '#9090aa' }}>Awaiting T1</strong> until the daily run — not empty T1/T2 columns.
        </div>
      </div>

      {view.actionQueue.length > 0 && filter !== 'new' && (
        <div style={s.card}>
          <div style={s.cardTitle}>Action queue — {view.actionQueue.length} need attention</div>
          {view.actionQueue.slice(0, 8).map(lead => (
            <LeadRow key={lead.id} lead={lead} showReason />
          ))}
        </div>
      )}

      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={s.cardTitle}>Lead feed</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map(([id, label]) => (
              <button
                key={id}
                type="button"
                style={{ ...s.chip, ...(filter === id ? s.chipActive : {}) }}
                onClick={() => setFilter(id)}
              >{label}</button>
            ))}
          </div>
        </div>
        {list.length === 0
          ? <div style={{ fontSize: 13, color: '#6b6b8a' }}>No leads in this view yet.</div>
          : list.map(lead => <LeadRow key={`${filter}-${lead.id}`} lead={lead} showReason={filter === 'action'} />)
        }
      </div>
    </>
  )
}
