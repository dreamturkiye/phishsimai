'use client'

import { useJanetVoiceCall, type JanetConvState } from './useJanetVoiceCall'

const DOT_COLOR: Record<JanetConvState, string> = {
  off: '#6b6b8a',
  connecting: '#f5a623',
  listening: '#4ade80',
  thinking: '#6366f1',
  speaking: '#10b981',
  error: '#ef4444',
  reconnecting: '#f5a623',
}

type Props = {
  secret: string
  apiBase?: string
  enabled?: boolean
  onUserTranscript?: (text: string) => void
  onJanetReply?: (text: string) => void
}

export function JanetVoiceBar({
  secret,
  apiBase = '/api/os/janet',
  enabled = true,
  onUserTranscript,
  onJanetReply,
}: Props) {
  const voice = useJanetVoiceCall({
    apiBase,
    secret,
    enabled,
    onUserTranscript,
    onJanetReply,
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, padding: '10px 14px', background: '#0f0f1a',
      border: '1px solid #1e1e2e', borderRadius: 10, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: DOT_COLOR[voice.convState],
          animation: ['listening', 'speaking'].includes(voice.convState) ? 'pulse 1.2s infinite' : undefined,
        }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#c8c8d8', fontWeight: 600 }}>{voice.label}</div>
          {voice.partial ? (
            <div style={{ fontSize: 11, color: '#9090aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {voice.partial}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#6b6b8a' }}>
              {voice.active ? 'Natural 2-way — no button needed' : 'Click Start Voice for hands-free call'}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {voice.convState === 'speaking' && (
          <button type="button" onClick={voice.interrupt} style={btnStyle('#2a1f05', '#f5a623')}>
            Interrupt
          </button>
        )}
        {voice.active ? (
          <button type="button" onClick={voice.stop} style={btnStyle('#2a0d0d', '#f87171')}>
            End call
          </button>
        ) : (
          <button type="button" onClick={voice.start} disabled={!enabled} style={btnStyle('#0d2b1a', '#4ade80')}>
            Start Voice
          </button>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </div>
  )
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 7, border: '1px solid #2a2a3e',
    background: bg, color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }
}
