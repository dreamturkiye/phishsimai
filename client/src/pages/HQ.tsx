'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

const SECRET = 'ps-hq-2026'
const API = '/api/os'

type Msg = { role: 'janet' | 'you'; text: string; id: number }

export default function HQPage() {
  const [data, setData] = useState<any>(null)
  const [agentHealth, setAgentHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'janet', id: 0, text: "Hi Kaan. PhishSim AI HQ is online. I'm coordinating Marcus, Aria, Nova, Rex, Scout, Finn, Vera, and Max. What do you want to focus on — MSP outreach, compliance messaging, or closing the first customers?" }
  ])
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle'|'recording'|'transcribing'|'thinking'|'speaking'>('idle')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [lastRefresh, setLastRefresh] = useState('')
  const [msgId, setMsgId] = useState(1)
  const chatRef = useRef<HTMLDivElement>(null)
  const mediaRecRef = useRef<MediaRecorder|null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement|null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(API + '/hq?secret=' + SECRET)
      const d = await r.json()
      if (d.ok) { setData(d); setLastRefresh(new Date().toLocaleTimeString()) }
    } catch {}
    try {
      const hr = await fetch(API + '/agent-watchdog?secret=' + SECRET + '&action=status')
      const hd = await hr.json()
      setAgentHealth(hd)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t) }, [refresh])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [msgs])

  // ── Core: send text to Janet, get response, optionally speak it ───────────
  async function askJanet(text: string) {
    if (!text.trim() || chatBusy) return
    setChatBusy(true)
    const userMsg: Msg = { role: 'you', text, id: msgId }
    const thinkingId = msgId + 1
    setMsgId(id => id + 2)
    setMsgs(m => [...m, userMsg, { role: 'janet', text: '...', id: thinkingId }])
    setInput('')

    let janetText = ''
    try {
      const r = await fetch(API + '/hq/chat?secret=' + SECRET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: msgs.slice(-6) })
      })
      const d = await r.json()
      janetText = d.response || d.error || 'No response'
    } catch {
      janetText = 'Network error — check server.'
    }

    setMsgs(m => m.map(msg => msg.id === thinkingId ? { ...msg, text: janetText } : msg))
    setChatBusy(false)

    // Speak if voice enabled
    if (voiceEnabled && janetText && !janetText.startsWith('Network')) {
      await speakText(janetText)
    }
  }

  // ── TTS: send Janet's text to ElevenLabs, play audio ─────────────────────
  async function speakText(text: string) {
    setVoiceState('speaking')
    try {
      const r = await fetch(API + '/hq/tts?secret=' + SECRET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
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

  // ── STT: record mic, transcribe via Groq Whisper, send to Janet ───────────
  async function toggleRecording() {
    if (voiceState === 'recording') {
      // Stop recording
      mediaRecRef.current?.stop()
      return
    }
    if (voiceState !== 'idle') return

    // Stop any playing audio first
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
        const fd = new FormData()
        fd.append('audio', blob, 'audio.webm')
        try {
          const r = await fetch(API + '/hq/stt?secret=' + SECRET, { method: 'POST', body: fd })
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

  const voiceLabel: Record<string, string> = {
    idle: 'Hold to talk',
    recording: '● Recording... release to send',
    transcribing: 'Transcribing...',
    thinking: 'Janet is thinking...',
    speaking: 'Janet is speaking...'
  }
  const voiceBtnColor: Record<string, string> = {
    idle: '#f5a623',
    recording: '#ef4444',
    transcribing: '#6366f1',
    thinking: '#6366f1',
    speaking: '#10b981'
  }

  // ─────────────────────────────────────────────────────────────────────────
  const s = {
    page: { minHeight:'100vh', background:'#0a0a0f', color:'#e8e8f0', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:14 },
    nav: { background:'#0f0f1a', borderBottom:'1px solid #1e1e2e', padding:'0 20px', display:'flex', alignItems:'center', gap:0, position:'sticky' as const, top:0, zIndex:100 },
    logo: { fontSize:15, fontWeight:700, color:'#fff', marginRight:20, padding:'12px 0', flexShrink:0 },
    tab: { padding:'12px 14px', fontSize:12, color:'#6b6b8a', cursor:'pointer', border:'none', background:'none', borderBottom:'2px solid transparent', fontFamily:'inherit', whiteSpace:'nowrap' as const },
    tabActive: { color:'#ef4444', borderBottomColor:'#ef4444' },
    main: { maxWidth:1100, margin:'0 auto', padding:'20px' },
    grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:8, marginBottom:16 },
    metricCard: { background:'#0f0f1a', border:'1px solid #1e1e2e', borderRadius:10, padding:'12px 14px' },
    metricLabel: { fontSize:10, color:'#6b6b8a', marginBottom:4, textTransform:'uppercase' as const, letterSpacing:0.5 },
    metricValue: { fontSize:24, fontWeight:600, lineHeight:1 },
    metricSub: { fontSize:10, color:'#6b6b8a', marginTop:3 },
    card: { background:'#0f0f1a', border:'1px solid #1e1e2e', borderRadius:10, padding:'14px 16px', marginBottom:10 },
    cardTitle: { fontSize:11, fontWeight:700, color:'#9090aa', textTransform:'uppercase' as const, letterSpacing:1, marginBottom:10 },
    row: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #12121e' },
    btn: { padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer', border:'1px solid #2e2e42', background:'#1a1a2e', color:'#e8e8f0', fontFamily:'inherit' },
    btnAccent: { background:'#ef4444', color:'#fff', borderColor:'#ef4444' },
    btnGreen: { background:'#0d2b1a', color:'#4ade80', borderColor:'#166534' },
    btnRed: { background:'#2d0f0f', color:'#f87171', borderColor:'#991b1b' },
    inp: { flex:1, background:'#1a1a2e', border:'1px solid #2e2e42', borderRadius:8, padding:'10px 13px', color:'#e8e8f0', fontSize:13, fontFamily:'inherit', outline:'none' },
    funnelBar: { height:5, borderRadius:3, background:'#1e1e2e', overflow:'hidden', flex:1, margin:'0 8px' },
    funnelFill: { height:'100%', background:'#f5a623', borderRadius:3 },
    pill: { fontSize:10, padding:'2px 8px', borderRadius:99, fontWeight:700 },
    badge: { fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:600 },
    badgeGreen: { background:'#0d2b1a', color:'#4ade80', border:'1px solid #166534' },
    badgeAmber: { background:'#2a1f05', color:'#f5a623', border:'1px solid #854d0e' },
  }

  if (loading) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <div style={{ width:28, height:28, border:'2px solid #1e1e2e', borderTopColor:'#f5a623', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}></div>
      <div style={{ color:'#6b6b8a', fontSize:13 }}>Loading HQ...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const p = data?.pipeline || {}
  const leads = data?.recentLeads || []
  const tasks = data?.archTasks || []
  const memory = data?.memory || []
  const ab = data?.abResults || []
  const customers = data?.customers || []
  const mrr = customers.length * 249
  const pendingTasks = tasks.filter((t: any) => t.status === 'pending').length
  const tabs = [
    ['overview', 'Overview'],
    ['janet', 'Janet CGO'],
    ['pipeline', 'Pipeline'],
    ['approvals', `Architect Tasks${pendingTasks > 0 ? ` (${pendingTasks})` : ''}`],
    ['memory', 'Memory'],
    ['health', 'Health'],
    ['issues', 'Live Issues 🔴'],
    ['architect', 'Architect 🧠'],
  ]

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f0f1a}::-webkit-scrollbar-thumb{background:#2e2e42;border-radius:2px}
        button:hover{opacity:0.85}
        input:focus,textarea:focus{border-color:#f5a623!important}
      `}</style>

      <nav style={s.nav}>
        <div style={s.logo}>PhishSim<span style={{ color:'#ef4444' }}>AI</span> <span style={{ fontSize:9, color:'#4a4a60', fontWeight:400 }}>HQ · Kaan AI OS v4.0</span></div>
        {tabs.map(([id, label]) => (
          <button key={id} style={{ ...s.tab, ...(tab===id?s.tabActive:{}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ ...s.badge, ...s.badgeGreen }}>● Live</span>
          <span style={{ fontSize:10, color:'#4a4a60' }}>{lastRefresh}</span>
          <button style={{ ...s.btn, fontSize:11, padding:'5px 10px' }} onClick={refresh}>↺</button>
        </div>
      </nav>

      <div style={s.main}>

        {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
        {tab==='overview' && <>
          <div style={s.grid}>
            {[
              ['MRR', '$'+mrr.toLocaleString(), mrr>0?'#4ade80':'#e8e8f0', 'Next: $1K MRR'],
              ['Touched', p.touched||0, '#e8e8f0', (p.bounceRate||'0')+'% bounce'],
              ['Reply rate', (p.replyRate||'0')+'%', Number(p.replyRate)>=2?'#4ade80':'#f5a623', 'Target: 2%'],
              ['Prospects', p.prospects||0, '#e8e8f0', 'T2 eligible soon'],
              ['Engaged', p.engaged||0, Number(p.engaged)>0?'#f5a623':'#e8e8f0', 'Hot leads'],
              ['Customers', p.customers||0, Number(p.customers)>0?'#4ade80':'#e8e8f0', 'Target: 4 wk4'],
            ].map(([label,val,color,sub]) => (
              <div key={label as string} style={s.metricCard}>
                <div style={s.metricLabel}>{label as string}</div>
                <div style={{ ...s.metricValue, color:color as string }}>{val as any}</div>
                <div style={s.metricSub}>{sub as string}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={s.card}>
              <div style={s.cardTitle}>Pipeline funnel</div>
              {[['Seeded',p.touched,p.touched],['Prospects',p.prospects,p.touched],['Engaged',p.engaged,p.touched],['Customers',p.customers,p.touched]].map(([l,v,max]:any)=>(
                <div key={l} style={{ display:'flex', alignItems:'center', fontSize:12, marginBottom:7 }}>
                  <span style={{ width:72, color:'#9090aa' }}>{l}</span>
                  <div style={s.funnelBar}><div style={{ ...s.funnelFill, width:max>0?(v/max*100)+'%':'0%' }}></div></div>
                  <span style={{ width:22, textAlign:'right', fontWeight:600 }}>{v||0}</span>
                </div>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>A/B test — T1 subject</div>
              {ab.length===0
                ? <div style={{ fontSize:12, color:'#6b6b8a' }}>Awaiting impressions...</div>
                : ab.map((v:any)=>(
                  <div key={v.variant} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
                      <span style={{ color:'#9090aa', textTransform:'capitalize' }}>{v.variant}</span>
                      <span style={{ color:'#6b6b8a' }}>Sent:{v.sent} · Replied:{v.replied}</span>
                    </div>
                    <div style={s.funnelBar}><div style={{ ...s.funnelFill, background:v.variant==='control'?'#6366f1':'#f5a623', width:v.sent>0?(v.replied/v.sent*100)+'%':'0%' }}></div></div>
                  </div>
                ))
              }
              <div style={{ fontSize:10, color:'#4a4a60', marginTop:8 }}>Winner declared at 5+ replies per variant</div>
            </div>
          </div>
          <div style={s.card}>
            <div style={s.cardTitle}>Self-serve journey — all steps live</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
              {[['Cold email','ARIA 5-touch sequence'],['Reply intent','Groq classifies'],['Trial signup','Self-serve demo'],['Stripe pay','MSP billing'],['Portal','Training dashboard']].map(([t,s2])=>(
                <div key={t} style={{ textAlign:'center', padding:'10px 6px', background:'#0a0a14', borderRadius:8, border:'1px solid #1e1e2e' }}>
                  <div style={{ fontSize:9, color:'#4ade80', marginBottom:3 }}>●</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'#e8e8f0', marginBottom:2 }}>{t}</div>
                  <div style={{ fontSize:10, color:'#6b6b8a', lineHeight:1.4 }}>{s2}</div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── JANET CGO — CHAT + VOICE ────────────────────────────────────── */}
        {tab==='janet' && <>

          {/* Voice status bar */}
          <div style={{ ...s.card, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:voiceBtnColor[voiceState], animation:voiceState==='recording'?'pulse 1s infinite':voiceState==='speaking'?'pulse 1.5s infinite':'none' }}></div>
              <span style={{ fontSize:12, color:'#9090aa' }}>{voiceLabel[voiceState]}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'#6b6b8a' }}>Voice output</span>
              <button
                style={{ ...s.btn, fontSize:11, padding:'4px 10px', ...(voiceEnabled?s.btnGreen:{}) }}
                onClick={() => { setVoiceEnabled(!voiceEnabled); if(audioRef.current){audioRef.current.pause()} }}
              >{voiceEnabled ? 'ON' : 'OFF'}</button>
              {voiceState==='speaking' && (
                <button style={{ ...s.btn, ...s.btnRed, fontSize:11, padding:'4px 10px' }} onClick={stopAudio}>Stop</button>
              )}
            </div>
          </div>

          {/* Chat window */}
          <div style={{ ...s.card, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #1e1e2e', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#f5a62322', border:'1px solid #f5a62344', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>J</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#e8e8f0' }}>Janet</div>
                <div style={{ fontSize:10, color:'#6b6b8a' }}>Chief Growth Officer · Groq LLaMA 3.3 · ElevenLabs voice</div>
              </div>
            </div>

            <div ref={chatRef} style={{ height:360, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:10 }}>
              {msgs.map(m => (
                <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems:m.role==='janet'?'flex-start':'flex-end' }}>
                  <div style={{ fontSize:9, color:'#4a4a60', marginBottom:3, letterSpacing:0.5, fontWeight:600 }}>{m.role==='janet'?'JANET':'YOU'}</div>
                  <div style={{
                    maxWidth:'84%', padding:'9px 12px', borderRadius:m.role==='janet'?'4px 10px 10px 10px':'10px 4px 10px 10px',
                    background:m.role==='janet'?'#0c1a2e':'#1a1a2e',
                    border:m.role==='janet'?'1px solid #1e3a5f':'1px solid #2e2e42',
                    fontSize:13, lineHeight:1.6,
                    color:m.role==='janet'?'#c8d8f0':'#e8e8f0',
                    animation:m.text==='...'?'pulse 1s infinite':''
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Text input row */}
            <div style={{ padding:'10px 12px', borderTop:'1px solid #1e1e2e', display:'flex', gap:8, alignItems:'center' }}>
              <input
                ref={inputRef}
                style={{ ...s.inp }}
                placeholder="Type a message or direction to Janet..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askJanet(input)} }}
                disabled={chatBusy}
              />
              <button
                style={{ ...s.btn, ...s.btnAccent, padding:'10px 16px', flexShrink:0 }}
                onClick={() => askJanet(input)}
                disabled={chatBusy || !input.trim()}
              >{chatBusy?'...':'Send'}</button>
            </div>

            {/* Voice button row */}
            <div style={{ padding:'10px 12px', borderTop:'1px solid #12121e', display:'flex', gap:8, alignItems:'center' }}>
              <button
                style={{
                  flex:1, padding:'11px 16px', borderRadius:8, fontWeight:700, fontSize:13, cursor:voiceState!=='idle'&&voiceState!=='recording'?'not-allowed':'pointer',
                  border:'none', fontFamily:'inherit',
                  background:voiceBtnColor[voiceState],
                  color:voiceState==='recording'?'#fff':'#0a0a0f',
                  opacity:voiceState!=='idle'&&voiceState!=='recording'?0.6:1,
                  animation:voiceState==='recording'?'pulse 1s infinite':''
                }}
                onMouseDown={() => { if(voiceState==='idle') toggleRecording() }}
                onMouseUp={() => { if(voiceState==='recording') toggleRecording() }}
                onTouchStart={e => { e.preventDefault(); if(voiceState==='idle') toggleRecording() }}
                onTouchEnd={e => { e.preventDefault(); if(voiceState==='recording') toggleRecording() }}
              >
                {voiceState==='idle' && '🎤 Hold to speak'}
                {voiceState==='recording' && '● Recording... release to send'}
                {voiceState==='transcribing' && '⟳ Transcribing...'}
                {voiceState==='thinking' && '⟳ Janet is thinking...'}
                {voiceState==='speaking' && '🔊 Janet is speaking...'}
              </button>
              <button
                style={{ ...s.btn, padding:'11px 14px', fontSize:12 }}
                onClick={() => { setMsgs([{ role:'janet', id:0, text:"Memory cleared. What would you like to focus on?" }]); setMsgId(1) }}
              >Clear</button>
            </div>
          </div>

          {/* Quick prompts */}
          <div style={s.card}>
            <div style={s.cardTitle}>Quick prompts</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
              {[
                'What should we focus on this week?',
                'Suggest 3 subject lines for MSP outreach',
                'How close are we to first customer?',
                'What compliance angle should we lead with?',
                'Draft a LinkedIn post for Sarah Mitchell',
                'What is our 30-day revenue forecast?',
                'Should we offer founding MSP pricing?',
                'What architect task should be built next?',
              ].map(q => (
                <button key={q} style={{ ...s.btn, fontSize:11, padding:'6px 11px' }} onClick={() => askJanet(q)}>{q}</button>
              ))}
            </div>
          </div>
        </>}

        {/* ── PIPELINE ───────────────────────────────────────────────────── */}
        {tab==='pipeline' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>{leads.length} most recent leads</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ color:'#6b6b8a' }}>
                    {['Name','Company','Stage','T1','T2','Replied','Bounced'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #1e1e2e', fontWeight:600, fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l:any,i:number)=>{
                    const stageColor:any={customer:'#4ade80',engaged:'#f5a623',prospect:'#60a5fa',dead:'#6b6b8a',not_now:'#9090aa'}
                    return(
                      <tr key={i} style={{ borderBottom:'1px solid #12121e' }}>
                        <td style={{ padding:'7px 8px' }}>{l.name}</td>
                        <td style={{ padding:'7px 8px', color:'#9090aa' }}>{l.company}</td>
                        <td style={{ padding:'7px 8px' }}>
                          <span style={{ ...s.pill, background:(stageColor[l.pipeline_stage]||'#6b6b8a')+'22', color:stageColor[l.pipeline_stage]||'#6b6b8a', border:`1px solid ${stageColor[l.pipeline_stage]||'#6b6b8a'}44` }}>{l.pipeline_stage}</span>
                        </td>
                        <td style={{ padding:'7px 8px', color:l.touch1_sent_at?'#4ade80':'#4a4a60' }}>{l.touch1_sent_at?'✓':'—'}</td>
                        <td style={{ padding:'7px 8px', color:l.touch2_sent_at?'#4ade80':'#4a4a60' }}>{l.touch2_sent_at?'✓':'—'}</td>
                        <td style={{ padding:'7px 8px', color:l.replied?'#f5a623':'#4a4a60' }}>{l.replied?'✓':'—'}</td>
                        <td style={{ padding:'7px 8px', color:l.bounced?'#f87171':'#4a4a60' }}>{l.bounced?'✗':'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ── APPROVALS ──────────────────────────────────────────────────── */}
        {tab==='approvals' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Architect tasks</div>
            {tasks.length===0
              ? <div style={{ fontSize:13, color:'#6b6b8a' }}>No tasks queued</div>
              : tasks.map((t:any)=>(
                <div key={t.id} style={{ padding:12, background:'#0a0a14', borderRadius:8, border:'1px solid #1e1e2e', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{t.task?.replace(/^\*+\s*/,'').slice(0,140)}</div>
                      <div style={{ display:'flex', gap:8, fontSize:10, color:'#6b6b8a' }}>
                        <span>{t.source}</span><span>{new Date(t.created_at).toLocaleDateString()}</span>
                        <span style={{ ...s.pill, background:t.status==='done'?'#0d2b1a':t.status==='approved'?'#0c1a2e':'#2a1f05', color:t.status==='done'?'#4ade80':t.status==='approved'?'#60a5fa':'#f5a623' }}>{t.status}</span>
                      </div>
                      {t.notes&&<div style={{ fontSize:11, color:'#9090aa', marginTop:5, fontStyle:'italic' }}>{t.notes}</div>}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {(t.status==='pending'||t.status==='approved')&&<span style={{ fontSize:11, color:'#60a5fa' }}>⚙ Auto-executing via Qwen...</span>}
                      {t.status==='done'&&<span style={{ fontSize:11, color:'#4ade80' }}>✓ Done{t.notes ? ` — ${t.notes.slice(0,60)}` : ''}</span>}
                      {t.status==='failed'&&<span style={{ fontSize:11, color:'#f87171' }}>✗ Failed — {t.notes?.slice(0,60) || 'see logs'}</span>}
                      {t.status==='rejected'&&<span style={{ fontSize:11, color:'#9090aa' }}>Rejected</span>}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
          <div style={s.card}>
            <div style={s.cardTitle}>System controls</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
              <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => { askJanet('Run ARIA sequence now for all eligible MSP leads'); setTab('janet') }}>Trigger ARIA sequence</button>
              <button style={{ ...s.btn }} onClick={() => fetch('/api/os/janet/report?secret=ps-hq-2026').then(()=>alert('Report triggered → kaanari@mac.com'))}>Run Janet report</button>
              <button style={{ ...s.btn }} onClick={() => fetch('/api/os/heartbeat?secret=ps-hq-2026').then(r=>r.json()).then(d=>alert(d.healthy?'All systems healthy ✓':'Issues: '+d.issues.join(', ')))}>Check health</button>
              <button style={{ ...s.btn }} onClick={() => askJanet('Run your daily CGO brief and summarize pipeline status')}>Run Janet brief</button>
              <button style={{ ...s.btn }} onClick={() => fetch(API + '/agent-watchdog?secret=' + SECRET + '&action=status').then(r=>r.json()).then(d=>alert(d.overall==='healthy'?'All agents healthy':'Status: '+d.overall))}>Check health</button>
            </div>
          </div>
        </>}

        {/* ── MEMORY ─────────────────────────────────────────────────────── */}
        {tab==='memory' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Janet memory — {memory.length} entries</div>
            {(['company','operating','campaign','strategic','customer'] as const).map((type:string)=>{
              const items=memory.filter((m:any)=>m.type===type)
              if(!items.length) return null
              return(
                <div key={type} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#f5a623', textTransform:'uppercase' as const, letterSpacing:1, marginBottom:8 }}>{type} ({items.length})</div>
                  {items.map((m:any,i:number)=>(
                    <div key={i} style={{ ...s.row, flexDirection:'column' as const, alignItems:'flex-start', gap:2 }}>
                      <div style={{ fontSize:10, color:'#6b6b8a' }}>{m.key?.replace(/_/g,' ')}</div>
                      <div style={{ fontSize:12, color:'#c8c8e0', lineHeight:1.5 }}>{m.value?.slice(0,200)}{m.value?.length>200?'...':''}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </>}

        {/* ── HEALTH ─────────────────────────────────────────────────────── */}
        {tab==='health' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Kaan AI OS — 9 Agent Health{agentHealth ? ` (${agentHealth.healthy}/${agentHealth.total} healthy)` : ''}</div>
            {!agentHealth && <div style={{ color:'#9090aa', fontSize:13 }}>Loading agent health...</div>}
            {agentHealth && agentHealth.agents && agentHealth.agents.map((a:any) => {
              const statusColor = a.status==='healthy' ? '#4ade80' : a.status==='warning' ? '#f5a623' : a.status==='healing' ? '#60a5fa' : '#f87171'
              const statusBg = a.status==='healthy' ? '#0d2b1a' : a.status==='warning' ? '#2a1f05' : a.status==='healing' ? '#0c1a2e' : '#2a0d0d'
              return (
                <div key={a.agent_id} style={s.row}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:statusColor, display:'inline-block', flexShrink:0 }}></span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{a.name} <span style={{ fontWeight:400, color:'#9090aa', fontSize:11 }}>— {a.title}</span></div>
                      <div style={{ fontSize:11, color:'#7070888' }}>
                        Uptime {a.uptime} · {a.heals} heals · avg {a.avg_ms}ms
                        {a.failures > 0 && <span style={{ color:'#f87171' }}> · {a.failures} failures</span>}
                      </div>
                    </div>
                  </div>
                  <span style={{ ...s.pill, background:statusBg, color:statusColor }}>{a.status}</span>
                </div>
              )
            })}
          </div>
          <div style={s.grid}>
            {[['Bounce rate',(p.bounceRate||'0')+'%',Number(p.bounceRate)<8,'Pause at 8%'],['Sends',p.touched||0,true,'0 apollo bounces'],['Webhooks','2 live',true,'Resend enabled'],['Agents',agentHealth?`${agentHealth.healthy}/${agentHealth.total}`:'...',agentHealth?agentHealth.healthy===agentHealth.total:true,'Self-healing every 15min']].map(([l,v,ok,sub])=>(
              <div key={l as string} style={s.metricCard}>
                <div style={s.metricLabel}>{l as string}</div>
                <div style={{ ...s.metricValue, fontSize:18, color:ok?'#4ade80':'#f87171' }}>{v as any}</div>
                <div style={s.metricSub}>{sub as string}</div>
              </div>
            ))}
          </div>
          <div style={s.card}>
            <div style={s.cardTitle}>Live endpoints</div>
            {['/api/os/aria-daily','/api/os/janet-cgo','/api/os/v4/weekly-review','/api/os/agent-watchdog','/api/os/heartbeat','/api/os/watchdog','/api/os/webhook/reply','/api/os/webhooks/resend','/api/os/hq/chat','/api/os/hq/tts','/api/os/hq/stt','/api/os/janet/report','/api/os/architect/pending','/api/os','/api/os/qa-smoke','/api/os/discover','/api/os/researcher','/hq'].map(ep=>(
              <div key={ep} style={s.row}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', display:'inline-block' }}></span>
                  <code style={{ fontSize:12, color:'#60a5fa' }}>{ep}</code>
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* ── LIVE ISSUES ─────────────────────────────────────────────────── */}
        {tab==='issues' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Live bugs — real user sessions</div>
            {(data?.bugReports||[]).length===0
              ? <div style={{fontSize:13,color:'#4ade80'}}>✅ No open bugs. System clean.</div>
              : (data?.bugReports||[]).map((b:any)=>{
                const sevColor:any={critical:'#f87171',high:'#f5a623',medium:'#60a5fa',low:'#9090aa'}
                const diag = typeof b.diagnosis==='string' ? JSON.parse(b.diagnosis||'{}') : (b.diagnosis||{})
                return(
                  <div key={b.id} style={{padding:12,background:'#0a0a14',borderRadius:8,border:`1px solid ${sevColor[b.severity]||'#2e2e42'}33`,marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{...s.badge,background:sevColor[b.severity]+'22',color:sevColor[b.severity],border:`1px solid ${sevColor[b.severity]}44`,fontSize:10}}>{b.severity?.toUpperCase()}</span>
                      <span style={{fontSize:12,fontWeight:600,color:'#e8e8f0'}}>{b.component_name}</span>
                      <span style={{fontSize:10,color:'#6b6b8a',marginLeft:'auto'}}>{b.occurrence_count}x · {new Date(b.last_seen).toLocaleTimeString()}</span>
                    </div>
                    <div style={{fontSize:12,color:'#c8c8e0',marginBottom:4}}>{b.error_message?.slice(0,120)}</div>
                    <div style={{fontSize:10,color:'#6b6b8a'}}>{b.url_path}</div>
                    {diag.root_cause && <div style={{fontSize:11,color:'#f5a623',marginTop:6,padding:'4px 8px',background:'#2a1f0533',borderRadius:4}}>🧠 Marcus: {diag.root_cause}</div>}
                    {diag.file_affected && <div style={{fontSize:10,color:'#60a5fa',marginTop:3}}>📁 {diag.file_affected}</div>}
                  </div>
                )
              })
            }
          </div>
        </>}
        {/* ── ARCHITECT BRAIN ───────────────────────────────────────────────── */}
        {tab==='architect' && <>
          <div style={s.card}>
            <div style={s.cardTitle}>Marcus — Architect Memory ({(data?.architectMemory||[]).length} patterns learned)</div>
            {(data?.architectMemory||[]).length===0
              ? <div style={{fontSize:13,color:'#6b6b8a'}}>No patterns yet. Memory builds as bugs are diagnosed.</div>
              : (data?.architectMemory||[]).map((m:any,i:number)=>(
                <div key={i} style={{...s.row,flexDirection:'column',alignItems:'flex-start',gap:4,paddingBottom:12}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:10,fontWeight:700,color:'#f5a623'}}>{m.times_applied}x applied</span>
                    <span style={{fontSize:10,color:'#6b6b8a'}}>{Math.round((m.confidence||0)*100)}% confidence</span>
                    <span style={{fontSize:10,color:'#4a4a60'}}>{m.file_affected}</span>
                  </div>
                  <div style={{fontSize:12,color:'#e8e8f0'}}>{m.root_cause}</div>
                  <div style={{fontSize:11,color:'#9090aa'}}>{m.error_signature?.slice(0,80)}</div>
                </div>
              ))
            }
          </div>
          <div style={s.card}>
            <div style={s.cardTitle}>QA Smoke Test History</div>
            {(data?.qaRuns||[]).length===0
              ? <div style={{fontSize:12,color:'#6b6b8a'}}>No QA runs yet</div>
              : (data?.qaRuns||[]).map((q:any,i:number)=>(
                <div key={i} style={s.row}>
                  <span style={{fontSize:12}}>{q.trigger_type}</span>
                  <span style={{fontSize:12,color:q.tests_failed===0?'#4ade80':'#f87171'}}>
                    {q.tests_passed}/{q.tests_passed+q.tests_failed} passed
                  </span>
                  <span style={{fontSize:10,color:'#6b6b8a'}}>{new Date(q.created_at).toLocaleString()}</span>
                </div>
              ))
            }
            <button style={{...s.btn,marginTop:10}} onClick={()=>fetch(API + '/qa-smoke?secret='+SECRET).then(r=>r.json()).then(d=>alert('QA: '+d.passed+' passed, '+d.failed+' failed'))}>Run QA Now</button>
          </div>
        </>}
      </div>
    </div>
  )
}
