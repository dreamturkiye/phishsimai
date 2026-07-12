'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'wouter'

export interface MiaWidgetProps {
  orgId: number
  orgName?: string
  hidden?: boolean
}

type RingState = 'idle' | 'listening' | 'thinking' | 'speaking'
type Msg = { role: 'mia' | 'user'; text: string }

interface ActivationState {
  step: number
  totalSteps: number
  label: string
  targetCount: number
  campaignCount: number
  launchedCount: number
  activated: boolean
  nextAction: string
  nextLink: string
}

const RING: Record<RingState, string> = {
  idle: '#8b5cf6',
  listening: '#ef4444',
  thinking: '#eab308',
  speaking: '#22c55e',
}

const PRIMARY = '#7c3aed'

const SUGGESTIONS = [
  'Help me launch my first campaign',
  'How do I import employees?',
  'What compliance reports do you have?',
  'I have feedback or a suggestion',
]

async function miaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, credentials: 'include' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d as T
}

export default function MiaWidget({ orgId, orgName, hidden }: MiaWidgetProps) {
  const [location] = useLocation()
  const [open, setOpen] = useState(false)
  const [ring, setRing] = useState<RingState>('idle')
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'mia',
      text: `Hi! I'm Mia, your PhishSim AI guide 👋 I'll help you get your first phishing simulation live in about 10 minutes.${orgName ? ` (${orgName})` : ''}`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pta, setPta] = useState(false)
  const [activation, setActivation] = useState<ActivationState | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const transcriptR = useRef('')

  const refreshActivation = useCallback(async () => {
    try {
      const d = await miaFetch<{ activation: ActivationState }>(
        `/api/mia/activation?orgId=${orgId}`,
      )
      setActivation(d.activation)
    } catch { /* optional */ }
  }, [orgId])

  useEffect(() => {
    if (orgId && open) refreshActivation()
  }, [orgId, open, refreshActivation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => () => {
    recRef.current?.abort?.()
    audioRef.current?.pause()
  }, [])

  const speak = useCallback(async (text: string) => {
    try {
      setRing('speaking')
      const res = await fetch('/api/mia/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { setRing('idle'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setRing('idle'); URL.revokeObjectURL(url) }
      audio.onerror = () => setRing('idle')
      await audio.play()
    } catch {
      setRing('idle')
    }
  }, [])

  const send = useCallback(async (text?: string, opts?: { explicitFeedback?: boolean }) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: msg }])
    setLoading(true)
    setRing('thinking')
    try {
      const d = await miaFetch<{ reply: string; activation?: ActivationState }>('/api/mia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          message: msg,
          pathname: location,
          explicitFeedback: opts?.explicitFeedback ?? /feedback|suggest/i.test(msg),
        }),
      })
      const reply = d.reply || 'Sorry, try again!'
      setMessages(m => [...m, { role: 'mia', text: reply }])
      if (d.activation) setActivation(d.activation)
      setLoading(false)
      await speak(reply)
    } catch {
      setMessages(m => [...m, { role: 'mia', text: 'Oops, something went wrong. Try again!' }])
      setLoading(false)
      setRing('idle')
    }
  }, [input, loading, orgId, location, speak])

  const startPta = useCallback(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return
    transcriptR.current = ''
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e: { results: SpeechRecognitionResultList }) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      transcriptR.current = t
    }
    rec.onerror = () => { setPta(false); setRing('idle') }
    recRef.current = rec
    rec.start()
    setPta(true)
    setRing('listening')
  }, [])

  const stopPta = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setPta(false)
    const t = transcriptR.current.trim()
    transcriptR.current = ''
    if (t) send(t)
    else setRing('idle')
  }, [send])

  if (hidden || !orgId) return null

  const btnClass =
    ring === 'idle' ? 'mia-idle'
    : ring === 'listening' ? 'mia-listen'
    : ring === 'speaking' ? 'mia-speak'
    : ''

  const rc = RING[ring]

  return (
    <>
      <style>{`
        @keyframes mia-bob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes mia-pulse { 0%,100%{box-shadow:0 0 0 0 ${RING.listening}88} 50%{box-shadow:0 0 0 10px ${RING.listening}00} }
        @keyframes mia-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
        @keyframes mia-dot   { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        .mia-idle   { animation: mia-bob   3s ease-in-out infinite }
        .mia-listen { animation: mia-pulse 0.8s ease-in-out infinite }
        .mia-speak  { animation: mia-shake 0.4s ease-in-out infinite }
      `}</style>

      <button
        className={btnClass}
        type="button"
        onClick={() => { if (!pta) setOpen(o => !o) }}
        onMouseDown={e => { e.preventDefault(); startPta() }}
        onMouseUp={() => { if (pta) stopPta() }}
        onTouchStart={e => { e.preventDefault(); startPta() }}
        onTouchEnd={() => { if (pta) stopPta() }}
        title="Hold to talk · Click to open Mia"
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 60, height: 60, borderRadius: '50%',
          border: `3px solid ${rc}`, background: '#0a0a12',
          cursor: 'pointer', zIndex: 1000, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 24px ${rc}55`, outline: 'none', userSelect: 'none',
        }}
      >
        <img src="/brand/mia-avatar.png" alt="Mia" style={{
          width: 54, height: 54, borderRadius: '50%',
          objectFit: 'cover', objectPosition: 'top center', pointerEvents: 'none',
        }} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 24,
          width: 380, maxWidth: 'calc(100vw - 32px)', height: 540, maxHeight: 'calc(100vh - 120px)',
          background: '#0a0a12', borderRadius: 18,
          border: '1px solid rgba(139,92,246,0.25)',
          display: 'flex', flexDirection: 'column', zIndex: 999,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', background: '#080810', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4ec', flex: 1 }}>Mia · Customer Success</div>
              <button type="button" onClick={() => setOpen(false)} style={{
                border: 'none', background: 'transparent', color: '#888', cursor: 'pointer',
              }}>✕</button>
            </div>
            {activation && !activation.activated && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 4 }}>
                  Setup {activation.step}/{activation.totalSteps}: {activation.label}
                </div>
                <div style={{ fontSize: 11, color: '#c4b5fd', lineHeight: 1.4 }}>
                  {activation.nextAction}{' '}
                  <a href={activation.nextLink} style={{ color: '#a78bfa' }}>{activation.nextLink}</a>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                  background: m.role === 'user' ? PRIMARY : 'rgba(255,255,255,0.06)', color: '#e4e4ec',
                }}>{m.text}</div>
              </div>
            ))}
            {loading && <div style={{ color: '#666', fontSize: 12 }}>Mia is thinking…</div>}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} type="button" onClick={() => send(s, { explicitFeedback: s.includes('feedback') })} style={{
                    padding: '6px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                    border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.1)', color: '#c4b5fd',
                  }}>{s}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask Mia anything…"
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '9px 12px', color: '#e4e4ec', fontSize: 13, outline: 'none',
              }}
            />
            <button type="button" onClick={() => send()} disabled={loading || !input.trim()} style={{
              padding: '9px 14px', borderRadius: 10, background: PRIMARY, border: 'none', color: '#fff', cursor: 'pointer',
              opacity: input.trim() ? 1 : 0.4,
            }}>Send</button>
          </div>
        </div>
      )}
    </>
  )
}
