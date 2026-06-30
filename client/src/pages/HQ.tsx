import { useState, useEffect, useCallback, useRef } from 'react'
import { HQChatComposer, type HQAttachment } from '../components/os/HQChatComposer'

const SECRET = 'ps-hq-2026'

const QUICK_PROMPTS = [
  'What should we focus on this week?',
  'Suggest 3 subject line variants to test',
  'How close are we to first customer?',
  'What ICP should we target next?',
  'Draft a LinkedIn post for today',
  'What is our 30-day revenue forecast?',
  'Should we lower pricing to close faster?',
  'What architect task should be built next?',
]

type Msg = { role: 'janet' | 'you'; text: string; id: number; attachments?: string[] }
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking'

function formatArchitectTask(task?: string | null): string {
  if (!task) return 'Untitled architect task'
  const cleaned = task.replace(/^\*+\s*/, '').trim()
  if (!cleaned || /^[\*\s]+$/.test(cleaned) || cleaned.length < 8) {
    return 'Malformed task — cancelled or awaiting rewrite'
  }
  return cleaned.slice(0, 140)
}

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
  metricLabel: { fontSize: 11, color: '#787890', marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 700 },
  metricSub: { fontSize: 11, color: '#666', marginTop: 4 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #18182440' },
  pill: { fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase' as const },
  btn: { padding: '8px 14px', borderRadius: 7, border: '1px solid #2a2a3e', background: '#16161f', color: '#e4e4ec', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnAccent: { background: '#ef4444', border: 'none', color: '#fff' },
  btnGreen: { background: '#0d2b1a', color: '#4ade80', border: '1px solid #166534' },
  badgeGreen: { background: '#0d2b1a', color: '#4ade80', border: '1px solid #166534', fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 600 },
}

const voiceLabel: Record<VoiceState, string> = {
  idle: 'Hold to talk',
  recording: '● Recording... release to send',
  transcribing: 'Transcribing...',
  thinking: 'Janet is thinking...',
  speaking: 'Janet is speaking...',
}

const voiceBtnColor: Record<VoiceState, string> = {
  idle: '#f5a623',
  recording: '#ef4444',
  transcribing: '#6366f1',
  thinking: '#6366f1',
  speaking: '#10b981',
}

export default function HQPage() {
  const [data, setData] = useState<any>(null)
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'janet',
      id: 0,
      text: "Hi Kaan. PhishSim AI HQ is online — Kaan AI OS v4.5. I'm coordinating Marcus (Architect), Aria, Nova, Rex, Scout, Finn, Vera, and Max. Attach CSVs to import leads, hold 🎤 to talk, or pick a quick prompt below.",
    },
  ])
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [lastRefresh, setLastRefresh] = useState('')
  const [msgId, setMsgId] = useState(1)
  const chatRef = useRef<HTMLDivElement>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/os/hq?secret=' + SECRET)
      const d = await r.json()
      if (d.ok) { setData(d); setLastRefresh(new Date().toLocaleTimeString()) }
    } catch { /* ignore */ }
    try {
      const ar = await fetch('/api/os/v4/status?secret=' + SECRET)
      setAgentStatus(await ar.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t) }, [refresh])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [msgs])

  async function askJanet(text: string, attachments: HQAttachment[] = []) {
    if ((!text.trim() && !attachments.length) || chatBusy) return
    setChatBusy(true)
    const displayText = text.trim() || `(Uploaded ${attachments.map(a => a.filename).join(', ')})`
    const thinkingId = msgId + 1
    setMsgId(id => id + 2)
    setMsgs(m => [...m, { role: 'you', id: msgId, text: displayText, attachments: attachments.map(a => a.filename) }, { role: 'janet', id: thinkingId, text: '...' }])
    setInput('')

    let janetText = ''
    try {
      const r = await fetch('/api/os/hq/chat?secret=' + SECRET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: msgs.slice(-6).map(m => ({ role: m.role, text: m.text })),
          attachments: attachments.map(a => ({
            filename: a.filename,
            summary: a.summary,
            textContent: a.textPreview,
            kind: a.kind,
            memoryKey: a.memoryKey,
            imageBase64: a.imageBase64,
            imageMime: a.imageMime,
            leadsImported: a.leadsImported,
          })),
        }),
      })
      const d = await r.json()
      janetText = d.response || d.error || 'No response'
    } catch {
      janetText = 'Network error — check server.'
    }

    setMsgs(m => m.map(msg => msg.id === thinkingId ? { ...msg, text: janetText } : msg))
    setChatBusy(false)
    if (attachments.some(a => a.leadsImported)) refresh()

    if (voiceEnabled && janetText && !janetText.startsWith('Network')) {
      await speakText(janetText)
    } else {
      setVoiceState('idle')
    }
  }

  async function speakText(text: string) {
    setVoiceState('speaking')
    try {
      const r = await fetch('/api/os/hq/tts?secret=' + SECRET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!r.ok) { setVoiceState('idle'); return }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setVoiceState('idle'); URL.revokeObjectURL(url) }
      audio.onerror = () => setVoiceState('idle')
      await audio.play()
    } catch {
      setVoiceState('idle')
    }
  }

  async function toggleRecording() {
    if (voiceState === 'recording') {
      mediaRecRef.current?.stop()
      return
    }
    if (voiceState !== 'idle') return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecRef.current = rec

      rec.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }

      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setVoiceState('transcribing')
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        try {
          const r = await fetch('/api/os/hq/stt?secret=' + SECRET, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64 }),
          })
          const d = await r.json()
          if (d.text?.trim()) {
            setVoiceState('thinking')
            await askJanet(d.text.trim())
          } else {
            setVoiceState('idle')
          }
        } catch {
          setVoiceState('idle')
        }
      }

      rec.start()
      setVoiceState('recording')
    } catch {
      alert('Microphone access denied. Please allow mic access in your browser.')
    }
  }

  function stopAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setVoiceState('idle')
  }

  const p = data?.pipeline || {}
  const memory = data?.memory || []
  const tasks = data?.archTasks || []
  const runningTasks = tasks.filter((t: any) => ['queued', 'pending', 'running', 'approved'].includes(t.status)).length

  const tabs: [string, string][] = [
    ['overview', 'Overview'],
    ['janet', 'Janet CGO'],
    ['agents', 'Agent Health'],
    ['pipeline', 'Pipeline'],
    ['architect', `Architect Tasks${runningTasks > 0 ? ` (${runningTasks})` : ''}`],
    ['memory', 'Memory'],
  ]

  if (loading) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 28, height: 28, border: '2px solid #1e1e2e', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: '#8888a0', fontSize: 13 }}>Loading HQ...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      `}</style>

      <nav style={s.nav}>
        <div style={s.logo}>PhishSim<span style={{ color: '#ef4444' }}>AI</span> <span style={{ fontSize: 9, color: '#555', fontWeight: 400 }}>HQ · v4.5</span></div>
        {tabs.map(([id, label]) => (
          <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={s.badgeGreen}>● Live</span>
          {lastRefresh && <span style={{ fontSize: 10, color: '#555' }}>{lastRefresh}</span>}
          <button style={{ ...s.btn, fontSize: 11, padding: '5px 10px' }} onClick={refresh}>↺</button>
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
          <div style={{ ...s.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: voiceBtnColor[voiceState], animation: voiceState === 'recording' ? 'pulse 1s infinite' : voiceState === 'speaking' ? 'pulse 1.5s infinite' : 'none' }} />
              <span style={{ fontSize: 12, color: '#9090aa' }}>{voiceLabel[voiceState]}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#6b6b8a' }}>Voice output</span>
              <button
                style={{ ...s.btn, fontSize: 11, padding: '4px 10px', ...(voiceEnabled ? s.btnGreen : {}) }}
                onClick={() => { setVoiceEnabled(!voiceEnabled); if (audioRef.current) audioRef.current.pause() }}
              >{voiceEnabled ? 'ON' : 'OFF'}</button>
              {voiceState === 'speaking' && (
                <button style={{ ...s.btn, fontSize: 11, padding: '4px 10px', background: '#2a0d0d', color: '#f87171', borderColor: '#991b1b' }} onClick={stopAudio}>Stop</button>
              )}
            </div>
          </div>

          <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e1e2e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ef444422', border: '1px solid #ef444444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>J</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Janet</div>
                <div style={{ fontSize: 10, color: '#6b6b8a' }}>Chief Growth Officer · Groq LLaMA 3.3 · ElevenLabs voice</div>
              </div>
            </div>

            <div ref={chatRef} style={{ height: 360, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msgs.map(m => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'janet' ? 'flex-start' : 'flex-end' }}>
                  <div style={{ fontSize: 9, color: '#4a4a60', marginBottom: 3, letterSpacing: 0.5, fontWeight: 600 }}>{m.role === 'janet' ? 'JANET' : 'YOU'}</div>
                  <div style={{
                    maxWidth: '84%', padding: '9px 12px',
                    borderRadius: m.role === 'janet' ? '4px 10px 10px 10px' : '10px 4px 10px 10px',
                    background: m.role === 'janet' ? '#0c1a2e' : '#1a1a2e',
                    border: m.role === 'janet' ? '1px solid #1e3a5f' : '1px solid #2e2e42',
                    fontSize: 13, lineHeight: 1.6, color: m.role === 'janet' ? '#c8d8f0' : '#e4e4ec',
                    whiteSpace: 'pre-wrap', animation: m.text === '...' ? 'pulse 1s infinite' : undefined,
                  }}>
                    {m.text}
                    {m.attachments?.length ? <div style={{ fontSize: 10, color: '#9090aa', marginTop: 6 }}>📎 {m.attachments.join(', ')}</div> : null}
                  </div>
                </div>
              ))}
            </div>

            <HQChatComposer
              value={input}
              onChange={setInput}
              onSend={askJanet}
              disabled={chatBusy}
              secret={SECRET}
            />

            <div style={{ padding: '10px 12px', borderTop: '1px solid #12121e', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: voiceState !== 'idle' && voiceState !== 'recording' ? 'not-allowed' : 'pointer',
                  border: 'none', fontFamily: 'inherit', background: voiceBtnColor[voiceState],
                  color: voiceState === 'recording' ? '#fff' : '#0a0a0f',
                  opacity: voiceState !== 'idle' && voiceState !== 'recording' ? 0.6 : 1,
                  animation: voiceState === 'recording' ? 'pulse 1s infinite' : undefined,
                }}
                onMouseDown={() => { if (voiceState === 'idle') toggleRecording() }}
                onMouseUp={() => { if (voiceState === 'recording') toggleRecording() }}
                onTouchStart={e => { e.preventDefault(); if (voiceState === 'idle') toggleRecording() }}
                onTouchEnd={e => { e.preventDefault(); if (voiceState === 'recording') toggleRecording() }}
              >
                {voiceState === 'idle' && '🎤 Hold to speak'}
                {voiceState === 'recording' && '● Recording... release to send'}
                {voiceState === 'transcribing' && '⟳ Transcribing...'}
                {voiceState === 'thinking' && '⟳ Janet is thinking...'}
                {voiceState === 'speaking' && '🔊 Janet is speaking...'}
              </button>
              <button
                style={{ ...s.btn, padding: '11px 14px', fontSize: 12 }}
                onClick={() => { setMsgs([{ role: 'janet', id: 0, text: 'Memory cleared locally. What would you like to focus on?' }]); setMsgId(1) }}
              >Clear</button>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>Quick prompts</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {QUICK_PROMPTS.map(q => (
                <button key={q} style={{ ...s.btn, fontSize: 11, padding: '6px 11px' }} onClick={() => askJanet(q)} disabled={chatBusy}>{q}</button>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>System controls</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => askJanet('Run ARIA sequence now for all eligible MSP leads')}>Trigger ARIA sequence</button>
              <button style={{ ...s.btn }} onClick={() => fetch('/api/os/janet/report?secret=' + SECRET).then(() => alert('Janet report triggered'))}>Run Janet report</button>
              <button style={{ ...s.btn }} onClick={() => fetch('/api/os/v4/status?secret=' + SECRET).then(r => r.json()).then(d => alert(d.healthy === d.total ? 'All systems healthy ✓' : `Issues: ${d.total - d.healthy} agents down`))}>Check health</button>
            </div>
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
            <div style={s.cardTitle}>All leads ({(data?.recentLeads || []).length})</div>
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
              Janet assigns these directly to Marcus. No approval needed — they execute, get QA-tested, then deploy automatically.
            </div>
            {tasks.map((t: any) => (
              <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #18182440' }}>
                <div style={{ fontSize: 13 }}>{formatArchitectTask(t.task)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#666' }}>{new Date(t.created_at).toLocaleDateString()} · {t.source || 'system'}</span>
                  {['pending', 'approved', 'queued', 'running'].includes(t.status) && <span style={{ fontSize: 11, color: '#60a5fa' }}>⚙ Auto-executing...</span>}
                  {t.status === 'done' && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Done{t.notes ? ` — ${String(t.notes).slice(0, 60)}` : ''}</span>}
                  {t.status === 'failed' && <span style={{ fontSize: 11, color: '#f87171' }}>✗ Failed</span>}
                  {t.status === 'cancelled' && <span style={{ fontSize: 11, color: '#6b6b8a' }}>Cancelled{t.notes ? ` — ${String(t.notes).slice(0, 40)}` : ''}</span>}
                </div>
              </div>
            ))}
            {tasks.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>No architect tasks yet.</div>}
          </div>
        </>}

        {tab === 'memory' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Janet memory — {memory.length} entries</div>
            {(['company', 'operating', 'campaign', 'strategic', 'customer'] as const).map(type => {
              const items = memory.filter((m: any) => m.type === type)
              if (!items.length) return null
              return (
                <div key={type} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{type} ({items.length})</div>
                  {items.map((m: any, i: number) => (
                    <div key={i} style={{ ...s.row, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <div style={{ fontSize: 10, color: '#6b6b8a' }}>{m.key?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 12, color: '#c8c8e0', lineHeight: 1.5 }}>{m.value?.slice(0, 200)}{m.value?.length > 200 ? '...' : ''}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </>}
      </div>
    </div>
  )
}
