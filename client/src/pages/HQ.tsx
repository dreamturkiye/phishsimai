import { useState, useEffect, useCallback, useRef } from 'react'
import { HQChatComposer, type HQAttachment } from '../components/os/HQChatComposer'

const SECRET = 'ps-hq-2026'

type Msg = { role: 'janet' | 'you'; text: string; id: number }

const s = {
  page: { minHeight: '100vh', background: '#0a0a12', color: '#e4e4ec', fontFamily: '-apple-system, system-ui, sans-serif' } as React.CSSProperties,
  nav: { display: 'flex', alignItems: 'center', gap: 4, padding: '0 20px', height: 52, borderBottom: '1px solid #1e1e2e', position: 'sticky' as const, top: 0, background: '#0a0a12', zIndex: 10, overflowX: 'auto' as const },
  logo: { fontWeight: 700, fontSize: 15, marginRight: 16, whiteSpace: 'nowrap' as const },
  tab: { padding: '14px 12px', background: 'none', border: 'none', color: '#8888a0', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const, borderBottom: '2px solid transparent' },
  tabActive: { color: '#fff', borderBottom: '2px solid #ef4444' },
  main: { padding: 20, maxWidth: 1100, margin: '0 auto' },
  card: { background: '#111119', border: '1px solid #1e1e2e', borderRadius: 10, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#aaaabe' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 },
  metricCard: { background: '#111119', border: '1px solid #1e1e2e', borderRadius: 10, padding: 14 },
  metricLabel: { fontSize: 11, color: '#7878900', marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 700 },
  metricSub: { fontSize: 11, color: '#666', marginTop: 4 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #18182400' },
  pill: { fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase' as const },
  btn: { padding: '8px 14px', borderRadius: 7, border: '1px solid #2a2a3e', background: '#16161f', color: '#e4e4ec', fontSize: 12, cursor: 'pointer' },
  btnAccent: { background: '#ef4444', border: 'none', color: '#fff' },
  input: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #2a2a3e', background: '#0e0e16', color: '#e4e4ec', fontSize: 13 },
}

export default function HQPage() {
  const [data, setData] = useState<any>(null)
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'janet', id: 0, text: "Hi Kaan. PhishSim AI HQ is online — Kaan AI OS v4.5. I'm coordinating Marcus (Architect), Aria, Nova, Rex, Scout, Finn, Vera, and Max. Attach CSVs to import leads, or ask me anything." }
  ])
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [lastRefresh, setLastRefresh] = useState('')
  const [msgId, setMsgId] = useState(1)
  const chatRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/os/hq?secret=' + SECRET)
      const d = await r.json()
      if (d.ok) { setData(d); setLastRefresh(new Date().toLocaleTimeString()) }
    } catch {}
    try {
      const ar = await fetch('/api/os/v4/status?secret=' + SECRET)
      const ad = await ar.json()
      setAgentStatus(ad)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t) }, [refresh])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [msgs])

  async function sendMessage(text: string, attachments: HQAttachment[] = []) {
    if ((!text.trim() && !attachments.length) || chatBusy) return
    const display = text.trim() || `[${attachments.length} file(s) attached]`
    setMsgs(m => [...m, { role: 'you', id: msgId, text: display }])
    setMsgId(i => i + 1)
    setChatBusy(true)
    try {
      const r = await fetch('/api/os/hq/chat?secret=' + SECRET, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attachments: attachments.map(a => ({ filename: a.filename, summary: a.summary, textContent: a.textPreview, kind: a.kind })),
          history: msgs.slice(-6).map(m => ({ role: m.role, text: m.text })),
        }),
      })
      const d = await r.json()
      setMsgs(m => [...m, { role: 'janet', id: msgId + 1, text: d.response || 'No response.' }])
      setMsgId(i => i + 2)
      if (attachments.some(a => a.leadsImported)) refresh()
    } catch {
      setMsgs(m => [...m, { role: 'janet', id: msgId + 1, text: 'Connection error — try again.' }])
      setMsgId(i => i + 2)
    }
    setChatBusy(false)
  }

  const p = data?.pipeline || {}
  const pendingTasks = (data?.archTasks || []).filter((t: any) => t.status === 'pending' || t.status === 'approved').length

  const tabs: [string, string][] = [
    ['overview', 'Overview'],
    ['janet', 'Janet CGO'],
    ['agents', 'Agent Health'],
    ['pipeline', 'Pipeline'],
    ['architect', `Architect Tasks${pendingTasks > 0 ? ` (${pendingTasks})` : ''}`],
    ['memory', 'Memory'],
  ]

  if (loading) return <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading HQ...</div>

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <div style={s.logo}>PhishSim<span style={{ color: '#ef4444' }}>AI</span> <span style={{ fontSize: 9, color: '#555', fontWeight: 400 }}>HQ</span></div>
        {tabs.map(([id, label]) => (
          <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#555', flexShrink: 0 }}>
          {lastRefresh && `Updated ${lastRefresh}`}
        </div>
      </nav>

      <div style={s.main}>
        {tab === 'overview' && <>
          <div style={s.grid}>
            <div style={s.metricCard}>
              <div style={s.metricLabel}>Reply rate</div>
              <div style={s.metricValue}>{p.replyRate || '0.0'}%</div>
              <div style={s.metricSub}>{p.replied || 0} replies / {p.touched || 0} sent</div>
            </div>
            <div style={s.metricCard}>
              <div style={s.metricLabel}>Customers</div>
              <div style={s.metricValue}>{p.customers || 0}</div>
              <div style={s.metricSub}>{p.engaged || 0} engaged, {p.prospects || 0} prospects</div>
            </div>
            <div style={s.metricCard}>
              <div style={s.metricLabel}>Bounce rate</div>
              <div style={{ ...s.metricValue, color: Number(p.bounceRate) < 8 ? '#4ade80' : '#f87171' }}>{p.bounceRate || '0.0'}%</div>
              <div style={s.metricSub}>Pause threshold 8%</div>
            </div>
            <div style={s.metricCard}>
              <div style={s.metricLabel}>Agents</div>
              <div style={{ ...s.metricValue, color: agentStatus && agentStatus.healthy === agentStatus.total ? '#4ade80' : '#f5a623' }}>
                {agentStatus ? `${agentStatus.healthy}/${agentStatus.total}` : '...'}
              </div>
              <div style={s.metricSub}>Self-healing every 15min</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Recent leads</div>
            {(data?.recentLeads || []).slice(0, 8).map((l: any, i: number) => (
              <div key={i} style={s.row}>
                <div>
                  <div style={{ fontSize: 13 }}>{l.name} <span style={{ color: '#666' }}>· {l.company}</span></div>
                  <div style={{ fontSize: 11, color: '#666' }}>{l.email}</div>
                </div>
                <span style={{ ...s.pill, background: l.pipeline_stage === 'customer' ? '#0d2b1a' : '#1a1a2e', color: l.pipeline_stage === 'customer' ? '#4ade80' : '#8888a0' }}>{l.pipeline_stage}</span>
              </div>
            ))}
            {(!data?.recentLeads || data.recentLeads.length === 0) && <div style={{ color: '#666', fontSize: 13 }}>No leads yet.</div>}
          </div>
        </>}

        {tab === 'janet' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Talk to Janet — CGO</div>
            <div ref={chatRef} style={{ height: 360, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msgs.map(m => (
                <div key={m.id} style={{ alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div style={{
                    background: m.role === 'you' ? '#ef4444' : '#16161f',
                    color: m.role === 'you' ? '#fff' : '#e4e4ec',
                    padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap'
                  }}>{m.text}</div>
                </div>
              ))}
              {chatBusy && <div style={{ color: '#666', fontSize: 12 }}>Janet is thinking...</div>}
            </div>
            <HQChatComposer
              value={input}
              onChange={setInput}
              onSend={sendMessage}
              disabled={chatBusy}
              secret={SECRET}
            />
          </div>
        </>}

        {tab === 'agents' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Kaan AI OS — 9 Agent Health{agentStatus ? ` (${agentStatus.healthy}/${agentStatus.total} healthy)` : ''}</div>
            {!agentStatus && <div style={{ color: '#666', fontSize: 13 }}>Loading agent health...</div>}
            {agentStatus?.agents?.map((a: any) => {
              const color = a.status === 'healthy' ? '#4ade80' : a.status === 'warning' ? '#f5a623' : a.status === 'healing' ? '#60a5fa' : '#f87171'
              const bg = a.status === 'healthy' ? '#0d2b1a' : a.status === 'warning' ? '#2a1f05' : a.status === 'healing' ? '#0c1a2e' : '#2a0d0d'
              return (
                <div key={a.agent_id} style={s.row}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name} <span style={{ fontWeight: 400, color: '#666', fontSize: 11 }}>— {a.title}</span></div>
                      <div style={{ fontSize: 11, color: '#666' }}>Uptime {a.uptime} · {a.heals} heals · avg {a.avg_ms}ms</div>
                    </div>
                  </div>
                  <span style={{ ...s.pill, background: bg, color }}>{a.status}</span>
                </div>
              )
            })}
          </div>
        </>}

        {tab === 'pipeline' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>All leads</div>
            {(data?.recentLeads || []).map((l: any, i: number) => (
              <div key={i} style={s.row}>
                <div style={{ fontSize: 13 }}>{l.name} · {l.company} · {l.email}</div>
                <span style={{ fontSize: 11, color: l.replied ? '#4ade80' : '#666' }}>{l.replied ? 'Replied' : l.bounced ? 'Bounced' : 'Sent'}</span>
              </div>
            ))}
          </div>
        </>}

        {tab === 'architect' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Architect Tasks — Autonomous Execution</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              Janet assigns these directly to the Architect. No approval needed — they execute, get QA-tested in dev, then deploy to production automatically.
            </div>
            {(data?.archTasks || []).map((t: any) => (
              <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #18182440' }}>
                <div style={{ fontSize: 13 }}>{t.task?.slice(0, 140)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#666' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                  {(t.status === 'pending' || t.status === 'approved') && <span style={{ fontSize: 11, color: '#60a5fa' }}>⚙ Auto-executing...</span>}
                  {t.status === 'done' && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Done{t.notes ? ` — ${t.notes.slice(0, 60)}` : ''}</span>}
                  {t.status === 'failed' && <span style={{ fontSize: 11, color: '#f87171' }}>✗ Failed — {t.notes?.slice(0, 60) || 'see logs'}</span>}
                </div>
              </div>
            ))}
            {(!data?.archTasks || data.archTasks.length === 0) && <div style={{ color: '#666', fontSize: 13 }}>No architect tasks yet.</div>}
          </div>
        </>}

        {tab === 'memory' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Janet's memory</div>
            {(data?.memory || []).slice(0, 30).map((m: any, i: number) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #18182440', fontSize: 12 }}>
                <span style={{ color: '#666' }}>[{m.type}]</span> {m.key}: {m.value?.slice(0, 100)}
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  )
}
