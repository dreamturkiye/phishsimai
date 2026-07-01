import type { Request, Response } from 'express'
import { sdk } from '../_core/sdk'

const DEFAULT_VOICE = 'cgSgspJ2msm6clMCkdW9'

export async function miaSpeak(req: Request, res: Response) {
  try {
    await sdk.authenticateRequest(req)
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { text, voiceId } = req.body ?? {}
  if (!text?.trim()) {
    res.status(400).json({ error: 'No text' })
    return
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'ElevenLabs not configured' })
    return
  }

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: String(text).slice(0, 500),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.78 },
      }),
    })
    if (!r.ok) {
      res.status(502).json({ error: 'ElevenLabs error' })
      return
    }
    const buf = Buffer.from(await r.arrayBuffer())
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    }).send(buf)
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'TTS failed' })
  }
}

export async function miaFeedbackDigest(req: Request, res: Response) {
  const cron = process.env.CRON_SECRET
  if (!cron || req.headers.authorization !== `Bearer ${cron}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const { runMiaFeedbackDigest } = await import('./miaChat')
  const result = await runMiaFeedbackDigest()
  res.json({ ok: true, ...result })
}
