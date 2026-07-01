/**
 * PhishSimAI — Janet always-on bidirectional voice (Express mount).
 * Kaan AI OS v4.5 — matches HQ / ScrollFuel voice architecture.
 */
import type { Application, Request, Response } from 'express'
import WebSocket from 'ws'
import { janetVoiceChat } from './janet'

const HQ_SECRET = 'ps-hq-2026'

const DEEPGRAM_WS_URL =
  'wss://api.deepgram.com/v1/listen?' +
  new URLSearchParams({
    model: 'nova-3',
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    endpointing: '300',
    interim_results: 'true',
    smart_format: 'true',
    utterance_end_ms: '1000',
  }).toString()

type History = { role: 'user' | 'assistant'; content: string }

type Session = {
  sessionId: string
  history: History[]
  sseRes: Response | null
  dgWs: WebSocket | null
  dgReady: boolean
  dgReconnectAttempts: number
  dgKeepaliveTimer: ReturnType<typeof setInterval> | null
  sseKeepaliveTimer: ReturnType<typeof setInterval> | null
  isSpeaking: boolean
  isThinking: boolean
  ttsAbortController: AbortController | null
  pendingAudio: Buffer[]
}

const sessions = new Map<string, Session>()

function okSecret(req: Request): boolean {
  return req.query.secret === HQ_SECRET || req.headers['x-hq-secret'] === HQ_SECRET
}

function sseEvent(res: Response, event: string, data: unknown) {
  if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function stopSpeaking(session: Session) {
  session.ttsAbortController?.abort()
  session.ttsAbortController = null
  session.isSpeaking = false
  if (session.sseRes) sseEvent(session.sseRes, 'janet_stopped', {})
}

async function speak(session: Session, text: string) {
  if (!session.sseRes || session.sseRes.writableEnded) return
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    sseEvent(session.sseRes, 'error', { text: 'ELEVENLABS_API_KEY not configured' })
    return
  }
  if (session.isSpeaking) stopSpeaking(session)
  session.isSpeaking = true
  session.ttsAbortController = new AbortController()
  sseEvent(session.sseRes, 'janet_speaking_start', {})

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: text.slice(0, 500),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.55, similarity_boost: 0.75 },
      }),
      signal: session.ttsAbortController.signal,
    })
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`)
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
    if (session.isSpeaking && session.sseRes) sseEvent(session.sseRes, 'audio_chunk', { data: b64, mime: 'audio/mpeg' })
    session.isSpeaking = false
    session.ttsAbortController = null
    if (session.sseRes) sseEvent(session.sseRes, 'janet_speaking_done', {})
  } catch (e: unknown) {
    session.isSpeaking = false
    session.ttsAbortController = null
    if (e instanceof Error && e.name === 'AbortError') return
    if (session.sseRes) sseEvent(session.sseRes, 'error', { text: 'Voice synthesis failed' })
  }
}

async function voiceChat(session: Session, userText: string): Promise<string> {
  const history = session.history.slice(-6).map(h => ({
    role: h.role === 'assistant' ? 'janet' : 'you',
    text: h.content,
  }))
  return janetVoiceChat(userText, history)
}

async function processUserMessage(session: Session, userText: string) {
  if (session.isThinking) return
  session.isThinking = true
  if (session.sseRes) sseEvent(session.sseRes, 'thinking', {})
  try {
    session.history.push({ role: 'user', content: userText })
    const reply = (await voiceChat(session, userText)).trim() || "I didn't catch that. Say it again."
    session.history.push({ role: 'assistant', content: reply })
    if (session.sseRes) sseEvent(session.sseRes, 'janet_reply', { text: reply })
    await speak(session, reply)
  } catch (e) {
    console.error('[JanetVoice:PhishSim] chat error:', e)
    if (session.sseRes) sseEvent(session.sseRes, 'error', { text: 'Janet had trouble responding' })
  } finally {
    session.isThinking = false
  }
}

function openDeepgramWs(session: Session) {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) {
    if (session.sseRes) sseEvent(session.sseRes, 'error', { text: 'DEEPGRAM_API_KEY not configured' })
    return
  }

  const dg = new WebSocket(DEEPGRAM_WS_URL, { headers: { Authorization: `Token ${key}` } })
  session.dgWs = dg

  dg.on('open', () => {
    session.dgReady = true
    session.dgReconnectAttempts = 0
    for (const buf of session.pendingAudio) {
      if (dg.readyState === WebSocket.OPEN) dg.send(buf)
    }
    session.pendingAudio = []
    if (session.dgKeepaliveTimer) clearInterval(session.dgKeepaliveTimer)
    session.dgKeepaliveTimer = setInterval(() => {
      if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: 'KeepAlive' }))
    }, 20_000)
    if (session.sseRes) sseEvent(session.sseRes, 'ready', { sessionId: session.sessionId })
    setTimeout(async () => {
      if (!session.sseRes || session.sseRes.writableEnded) return
      const hour = new Date().getUTCHours()
      const greeting =
        hour < 12 ? 'Good morning Kaan. PhishSim HQ is live — what are we solving today?'
        : hour < 17 ? 'Good afternoon. What do you need on PhishSim?'
        : "Evening. What's on your mind for PhishSim?"
      sseEvent(session.sseRes, 'janet_reply', { text: greeting, isGreeting: true })
      await speak(session, greeting)
    }, 800)
  })

  dg.on('message', async raw => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>
      if (msg.type === 'SpeechStarted') {
        if (session.sseRes) sseEvent(session.sseRes, 'speech_started', {})
        if (session.isSpeaking) stopSpeaking(session)
      }
      if (msg.type === 'Results') {
        const channel = (msg.channel as Record<string, unknown>)?.alternatives as Array<{ transcript: string }>
        const transcript = channel?.[0]?.transcript ?? ''
        const isFinal = msg.is_final as boolean
        const speechFinal = msg.speech_final as boolean
        if (transcript && session.sseRes) {
          sseEvent(session.sseRes, isFinal ? 'transcript_final' : 'interim_transcript', { text: transcript })
        }
        if (speechFinal && transcript.trim()) await processUserMessage(session, transcript.trim())
      }
    } catch (e) {
      console.error('[JanetVoice:PhishSim] Deepgram parse:', e)
    }
  })

  dg.on('error', () => { session.dgReady = false })
  dg.on('close', code => {
    session.dgReady = false
    if (session.dgKeepaliveTimer) clearInterval(session.dgKeepaliveTimer)
    if (code !== 1000 && session.sseRes && !session.sseRes.writableEnded) {
      session.dgReconnectAttempts++
      sseEvent(session.sseRes, 'reconnecting', { attempt: session.dgReconnectAttempts })
      setTimeout(() => {
        if (session.sseRes && !session.sseRes.writableEnded) openDeepgramWs(session)
      }, session.dgReconnectAttempts * 2000)
    }
  })
}

function cleanupSession(session: Session) {
  if (session.dgKeepaliveTimer) clearInterval(session.dgKeepaliveTimer)
  if (session.sseKeepaliveTimer) clearInterval(session.sseKeepaliveTimer)
  session.dgWs?.removeAllListeners()
  if (session.dgWs?.readyState === WebSocket.OPEN) session.dgWs.close(1000)
  session.ttsAbortController?.abort()
  sessions.delete(session.sessionId)
}

export function mountJanetVoice(app: Application) {
  app.get('/api/os/janet/events', (req: Request, res: Response) => {
    if (!okSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return }
    const sessionId = (req.query.sessionId as string) || `janet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const session: Session = {
      sessionId, history: [], sseRes: res, dgWs: null, dgReady: false,
      dgReconnectAttempts: 0, dgKeepaliveTimer: null, sseKeepaliveTimer: null,
      isSpeaking: false, isThinking: false, ttsAbortController: null, pendingAudio: [],
    }
    sessions.set(sessionId, session)
    sseEvent(res, 'session_init', { sessionId })
    session.sseKeepaliveTimer = setInterval(() => {
      if (!res.writableEnded) res.write(': keepalive\n\n')
    }, 25_000)
    openDeepgramWs(session)
    req.on('close', () => cleanupSession(session))
  })

  app.post('/api/os/janet/audio', (req: Request, res: Response) => {
    if (!okSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return }
    const sessionId = req.headers['x-janet-session'] as string
    const session = sessionId ? sessions.get(sessionId) : null
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      if (buf.length && session.dgWs?.readyState === WebSocket.OPEN) session.dgWs.send(buf)
      else if (buf.length) {
        session.pendingAudio.push(buf)
        if (session.pendingAudio.length > 50) session.pendingAudio.shift()
      }
      res.json({ ok: true })
    })
  })

  app.post('/api/os/janet/interrupt', (req: Request, res: Response) => {
    if (!okSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return }
    const { sessionId } = req.body as { sessionId: string }
    const session = sessions.get(sessionId)
    if (session?.isSpeaking) stopSpeaking(session)
    res.json({ ok: true })
  })

  app.post('/api/os/janet/end', (req: Request, res: Response) => {
    if (!okSecret(req)) { res.status(401).json({ error: 'Unauthorized' }); return }
    const { sessionId } = req.body as { sessionId?: string }
    if (sessionId) {
      const s = sessions.get(sessionId)
      if (s) cleanupSession(s)
    }
    res.json({ ok: true })
  })

  console.log('[JanetVoice] Mounted — /api/os/janet/* always-on voice (Deepgram + ElevenLabs)')
}
