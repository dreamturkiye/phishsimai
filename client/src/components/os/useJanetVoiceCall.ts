'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type JanetConvState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'reconnecting'

type Options = {
  apiBase: string
  secret: string
  enabled: boolean
  onUserTranscript?: (text: string) => void
  onJanetReply?: (text: string) => void
  onPartial?: (text: string) => void
}

const STATE_LABEL: Record<JanetConvState, string> = {
  off: 'Voice off',
  connecting: 'Connecting…',
  listening: 'Listening — just speak',
  thinking: 'Janet is thinking…',
  speaking: 'Janet is speaking…',
  error: 'Voice connection lost',
  reconnecting: 'Reconnecting…',
}

export function useJanetVoiceCall({
  apiBase,
  secret,
  enabled,
  onUserTranscript,
  onJanetReply,
  onPartial,
}: Options) {
  const [convState, setConvState] = useState<JanetConvState>('off')
  const [partial, setPartial] = useState('')
  const [active, setActive] = useState(false)

  const sseRef = useRef<EventSource | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const playCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const pcmBufferRef = useRef<Float32Array[]>([])
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const q = (path: string) => `${apiBase}${path}?secret=${encodeURIComponent(secret)}`

  const playNext = useCallback(async () => {
    if (isPlayingRef.current || !audioQueueRef.current.length) return
    if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
      playCtxRef.current = new AudioContext()
    }
    if (playCtxRef.current.state === 'suspended') await playCtxRef.current.resume()
    isPlayingRef.current = true
    const chunk = audioQueueRef.current.shift()!
    try {
      const buf = await playCtxRef.current.decodeAudioData(chunk.slice(0))
      const src = playCtxRef.current.createBufferSource()
      src.buffer = buf
      src.connect(playCtxRef.current.destination)
      currentSourceRef.current = src
      src.onended = () => {
        isPlayingRef.current = false
        currentSourceRef.current = null
        playNext()
      }
      src.start()
    } catch {
      isPlayingRef.current = false
      playNext()
    }
  }, [])

  const interrupt = useCallback(() => {
    currentSourceRef.current?.stop()
    currentSourceRef.current = null
    audioQueueRef.current = []
    isPlayingRef.current = false
    const sid = sessionIdRef.current
    if (sid) {
      fetch(q('/interrupt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {})
    }
  }, [secret, apiBase])

  const flushAudio = useCallback(() => {
    const sid = sessionIdRef.current
    if (!sid || pcmBufferRef.current.length === 0) return
    const totalLen = pcmBufferRef.current.reduce((s, f) => s + f.length, 0)
    const pcm = new Int16Array(totalLen)
    let offset = 0
    for (const frame of pcmBufferRef.current) {
      for (let i = 0; i < frame.length; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]))
        pcm[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
    }
    pcmBufferRef.current = []
    fetch(q('/audio'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'x-janet-session': sid },
      body: pcm.buffer,
    }).catch(() => {})
  }, [secret, apiBase])

  const cleanup = useCallback(() => {
    if (flushIntervalRef.current) clearInterval(flushIntervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    processorRef.current?.disconnect()
    audioCtxRef.current?.close().catch(() => {})
    playCtxRef.current?.close().catch(() => {})
    sseRef.current?.close()
    const sid = sessionIdRef.current
    if (sid) {
      fetch(q('/end'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {})
    }
    sessionIdRef.current = null
    sseRef.current = null
    setActive(false)
    setConvState('off')
    setPartial('')
  }, [secret, apiBase])

  const connect = useCallback(async () => {
    setConvState('connecting')
    setPartial('')

    const sessionId = `janet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionIdRef.current = sessionId

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
    } catch {
      setConvState('error')
      return false
    }

    const ctx = new AudioContext({ sampleRate: 16000 })
    audioCtxRef.current = ctx
    const micSrc = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = proc
    proc.onaudioprocess = e => {
      pcmBufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    micSrc.connect(proc)
    proc.connect(ctx.destination)

    flushIntervalRef.current = setInterval(flushAudio, 250)

    const sse = new EventSource(`${q('/events')}&sessionId=${encodeURIComponent(sessionId)}`)
    sseRef.current = sse
    setActive(true)

    sse.addEventListener('ready', () => setConvState('listening'))
    sse.addEventListener('speech_started', () => {
      interrupt()
      setConvState('listening')
    })
    sse.addEventListener('interim_transcript', (e: MessageEvent) => {
      const { text } = JSON.parse(e.data) as { text: string }
      setPartial(text ?? '')
      onPartial?.(text ?? '')
    })
    sse.addEventListener('transcript_final', (e: MessageEvent) => {
      const { text } = JSON.parse(e.data) as { text: string }
      setPartial('')
      if (text) onUserTranscript?.(text)
    })
    sse.addEventListener('thinking', () => setConvState('thinking'))
    sse.addEventListener('janet_reply', (e: MessageEvent) => {
      const { text } = JSON.parse(e.data) as { text: string }
      if (text) onJanetReply?.(text)
    })
    sse.addEventListener('janet_speaking_start', () => setConvState('speaking'))
    sse.addEventListener('janet_speaking_done', () => {
      if (!audioQueueRef.current.length && !isPlayingRef.current) setConvState('listening')
    })
    sse.addEventListener('janet_stopped', () => {
      audioQueueRef.current = []
      isPlayingRef.current = false
      currentSourceRef.current?.stop()
      currentSourceRef.current = null
      setConvState('listening')
    })
    sse.addEventListener('audio_chunk', (e: MessageEvent) => {
      const { data } = JSON.parse(e.data) as { data: string }
      const binary = atob(data)
      const buf = new ArrayBuffer(binary.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
      audioQueueRef.current.push(buf)
      setConvState('speaking')
      playNext()
    })
    sse.addEventListener('reconnecting', () => setConvState('reconnecting'))
    sse.addEventListener('error', () => setConvState('listening'))
    sse.onerror = () => {
      if (sse.readyState === EventSource.CLOSED) {
        setConvState('error')
        setActive(false)
      }
    }
    return true
  }, [flushAudio, interrupt, onJanetReply, onPartial, onUserTranscript, playNext, secret, apiBase])

  const start = useCallback(async () => {
    if (active) return
    if (!enabled) return
    const ok = await connect()
    if (!ok) setConvState('error')
  }, [active, connect, enabled])

  const stop = useCallback(() => cleanup(), [cleanup])

  useEffect(() => () => cleanup(), [cleanup])

  return {
    convState,
    partial,
    active,
    start,
    stop,
    interrupt,
    label: STATE_LABEL[convState],
  }
}
