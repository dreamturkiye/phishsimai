'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Conversation } from './JanetElevenLabsClient'
import { connectionErrorHelp, isAndroid, micPermissionHelp } from './janetConvaiPlatform'

type ConvStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'

type Props = {
  secret: string
  signedUrlPath?: string
  accentColor?: string
  productLabel?: string
  onUserMessage?: (text: string) => void
  onJanetMessage?: (text: string) => void
  onStatusChange?: (status: ConvStatus) => void
}

type ActiveConversation = Awaited<ReturnType<typeof Conversation.startSession>>

export function JanetConvaiPanel({
  secret,
  signedUrlPath = '/api/janet/signed-url',
  accentColor = '#f5a623',
  productLabel = 'ScrollFuel',
  onUserMessage,
  onJanetMessage,
  onStatusChange,
}: Props) {
  const [status, setStatus] = useState<ConvStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const conversationRef = useRef<ActiveConversation | null>(null)

  const setStatusAll = useCallback((s: ConvStatus) => {
    setStatus(s)
    onStatusChange?.(s)
  }, [onStatusChange])

  async function endConversation() {
    const conv = conversationRef.current
    conversationRef.current = null
    if (conv) {
      try { await conv.endSession() } catch { /* ok */ }
    }
    setStatusAll('idle')
  }

  useEffect(() => () => { void endConversation() }, [])

  async function startConversation() {
    await endConversation()
    setStatusAll('connecting')
    setErrorMsg('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch {
      setErrorMsg(micPermissionHelp())
      setStatusAll('error')
      return
    }

    if (isAndroid() && typeof window !== 'undefined') {
      try {
        const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) { const ctx = new Ctx(); await ctx.resume() }
      } catch { /* non-fatal */ }
    }

    try {
      const resp = await fetch(`${signedUrlPath}?secret=${encodeURIComponent(secret)}`)
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}))
        throw new Error((errBody as { error?: string }).error || `Server error: ${resp.status}`)
      }
      const body = await resp.json()
      if (!body.signed_url) throw new Error('No signed URL returned')

      const conversation = await Conversation.startSession({
        signedUrl: body.signed_url,
        connectionType: 'websocket',
        dynamicVariables: {
          ops_context: String(body.ops_context || 'Live ops snapshot unavailable — use get_live_ops tool.'),
          user_name: 'Kaan',
        },
        onConnect: () => {
          setStatusAll('listening')
          setErrorMsg('')
        },
        onDisconnect: (details) => {
          conversationRef.current = null
          if (details.reason === 'error') {
            setErrorMsg(connectionErrorHelp(details.message))
            setStatusAll('error')
          } else {
            setStatusAll('idle')
          }
        },
        onError: (message) => {
          setErrorMsg(connectionErrorHelp(message))
          setStatusAll('error')
        },
        onMessage: ({ message, role }) => {
          if (!message?.trim()) return
          if (role === 'user') onUserMessage?.(message.trim())
          else onJanetMessage?.(message.trim())
        },
        onModeChange: ({ mode }) => {
          setStatusAll(mode === 'speaking' ? 'speaking' : 'listening')
        },
        onStatusChange: ({ status: sdkStatus }) => {
          if (sdkStatus === 'connecting') setStatusAll('connecting')
          if (sdkStatus === 'connected') setStatusAll('listening')
        },
      })

      conversationRef.current = conversation
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e)
      setErrorMsg(
        /denied|NotAllowed|Permission/i.test(raw) ? micPermissionHelp() : connectionErrorHelp(raw)
      )
      setStatusAll('error')
      conversationRef.current = null
    }
  }

  const isActive = ['connecting', 'listening', 'speaking'].includes(status)
  const statusLabel = {
    idle: `Tap to start — Janet · ${productLabel}`,
    connecting: 'Connecting…',
    listening: 'Listening — just speak',
    speaking: 'Janet is speaking…',
    error: 'Tap to try again',
  }[status]

  return (
    <div style={{
      padding: '14px 16px', marginBottom: 10,
      background: '#0f0f1a', border: '1px solid #1e1e2e', borderRadius: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      {errorMsg && (
        <div style={{
          fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,.1)',
          padding: '8px 14px', borderRadius: 8, textAlign: 'center', maxWidth: 420, lineHeight: 1.5,
        }}>{errorMsg}</div>
      )}
      <div style={{ fontSize: 12, color: '#9090aa', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isActive && (
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: status === 'speaking' ? accentColor : status === 'connecting' ? '#f59e0b' : '#22c55e',
            boxShadow: `0 0 8px ${status === 'speaking' ? accentColor : '#22c55e'}`,
          }} />
        )}
        {statusLabel}
      </div>
      <button
        type="button"
        aria-label={isActive ? 'End voice call' : 'Start voice call'}
        onClick={() => { void (isActive ? endConversation() : startConversation()) }}
        style={{
          width: 72, height: 72, borderRadius: '50%', cursor: 'pointer', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive
            ? `radial-gradient(circle, ${accentColor}, ${accentColor}88)`
            : 'rgba(255,255,255,.08)',
          outline: `2px solid ${isActive ? accentColor : 'rgba(255,255,255,.15)'}`,
          boxShadow: isActive ? `0 0 28px ${accentColor}44` : 'none',
          transition: 'all .25s',
        }}
      >
        {status === 'idle' || status === 'error' ? <MicIcon /> : status === 'speaking' ? <WaveIcon /> : status === 'connecting' ? <Spinner /> : <MicIcon active />}
      </button>
      <div style={{ fontSize: 11, color: '#6b6b8a' }}>
        {isActive ? 'Tap to end call' : 'No push-to-talk — like Notya'}
      </div>
      <style>{`@keyframes janet-spin{to{transform:rotate(360deg)}}@keyframes janet-wave1{0%,100%{transform:scaleY(0.5)}50%{transform:scaleY(1)}}@keyframes janet-wave2{0%,100%{transform:scaleY(1)}50%{transform:scaleY(0.4)}}`}</style>
    </div>
  )
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="21" x2="12" y2="17" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  )
}

function WaveIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 30 24">
      <rect x="1" y="9" width="4" height="6" rx="2" fill="white" style={{ animation: 'janet-wave1 0.7s ease-in-out infinite' }} />
      <rect x="8" y="5" width="4" height="14" rx="2" fill="white" style={{ animation: 'janet-wave2 0.7s ease-in-out 0.1s infinite' }} />
      <rect x="15" y="3" width="4" height="18" rx="2" fill="white" style={{ animation: 'janet-wave1 0.7s ease-in-out 0.2s infinite' }} />
      <rect x="22" y="6" width="4" height="12" rx="2" fill="white" style={{ animation: 'janet-wave2 0.7s ease-in-out 0.15s infinite' }} />
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%',
      border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: '#f59e0b',
      animation: 'janet-spin 0.8s linear infinite',
    }} />
  )
}
