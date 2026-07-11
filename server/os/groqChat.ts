const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Current Groq chat model — single source of truth. (llama-3.1-8b-instant was DISCONTINUED.) */
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile'
export const GROQ_CHAT_MODELS = [GROQ_DEFAULT_MODEL] as const

export type GroqMessage = { role: string; content: string | unknown }

export async function groqComplete(opts: {
  messages: GroqMessage[]
  max_tokens?: number
  temperature?: number
  models?: readonly string[]
  response_format?: { type: 'json_object' }
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new Error('GROQ_API_KEY not configured on server')

  const models = opts.models ?? GROQ_CHAT_MODELS
  let lastError = 'Groq returned no completion'

  for (const model of models) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        max_tokens: opts.max_tokens ?? 300,
        temperature: opts.temperature ?? 0.7,
        ...(opts.response_format ? { response_format: opts.response_format } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (res.ok && text) return text

    lastError = data.error?.message || `Groq HTTP ${res.status}`
    // Only try fallback model on rate limit; other errors won't help on retry.
    if (res.status !== 429) break
  }

  throw new Error(lastError)
}

/** Lightweight health check for /api/os/diag */
export async function groqPing(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const text = await groqComplete({
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      max_tokens: 8,
      temperature: 0,
      models: [GROQ_DEFAULT_MODEL],
    })
    return { ok: text.toLowerCase().includes('ok'), model: GROQ_DEFAULT_MODEL }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
