/** ElevenLabs ConvAI — Janet voice (Notya /asistan pattern) */

export const JANET_AGENT_PHISHSIM =
  process.env.ELEVENLABS_AGENT_JANET_PHISHSIM ||
  process.env.ELEVENLABS_AGENT_JANET ||
  ''

export async function getJanetConvaiSignedUrl(agentId: string): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey || !agentId) return null

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        cache: 'no-store',
      }
    )
    if (!response.ok) {
      console.error('[JanetConvai] ElevenLabs error:', response.status, await response.text())
      return null
    }
    const data = (await response.json()) as { signed_url?: string }
    if (!data.signed_url) return null
    try {
      const parts = data.signed_url.split('.')
      const payload = parts[1] ? JSON.parse(Buffer.from(parts[1], 'base64').toString()) : null
      if (payload?.signed_url) return payload.signed_url as string
    } catch { /* raw */ }
    return data.signed_url
  } catch (e) {
    console.error('[JanetConvai] signed URL failed:', e)
    return null
  }
}
