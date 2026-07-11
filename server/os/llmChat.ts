import { groqComplete, GROQ_MODEL, type GroqMessage } from './groqChat'

export type LlmMessage = GroqMessage

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL?.trim() || 'gemini-2.5-flash'
/** Ollama Cloud — Z.ai GLM-5.2 via https://ollama.com/v1 (see ollama.com/library/glm-5.2:cloud) */
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || 'glm-5.2:cloud'
const OLLAMA_MODEL_FALLBACKS = ['glm-5.2:cloud', 'glm-5.2', 'qwen3.5'] as const
const OLLAMA_CHAT_URL = `${(process.env.OLLAMA_BASE_URL?.trim() || 'https://ollama.com').replace(/\/$/, '')}/v1/chat/completions`

function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null
}

function ollamaApiKey(): string | null {
  return process.env.OLLAMA_API_KEY?.trim() || null
}

function providerChain(): string[] {
  const raw = process.env.LLM_PROVIDER_CHAIN?.trim() || 'gemini,ollama,groq'
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

async function openAiStyleComplete(
  url: string,
  apiKey: string,
  model: string,
  opts: { messages: LlmMessage[]; max_tokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      max_tokens: opts.max_tokens ?? 400,
      temperature: opts.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (res.ok && text) return text
  const err = new Error(data.error?.message || `HTTP ${res.status}`) as Error & { status?: number }
  err.status = res.status
  throw err
}

async function geminiComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  model?: string
}): Promise<string> {
  const key = geminiApiKey()
  if (!key) throw new Error('GEMINI_API_KEY not configured')
  const model = opts.model || DEFAULT_GEMINI_MODEL

  // Prefer native generateContent — works with Google AI Studio keys (incl. non-AIza formats).
  let system = ''
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const m of opts.messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    if (m.role === 'system') {
      system += (system ? '\n\n' : '') + text
      continue
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    })
  }
  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: system || 'Hello' }] })
    system = ''
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.max_tokens ?? 400,
      temperature: opts.temperature ?? 0.7,
    },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }

  const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const nativeRes = await fetch(nativeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const nativeData = await nativeRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  const nativeText = nativeData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim()
  if (nativeRes.ok && nativeText) return nativeText

  // Fallback: OpenAI-compatible surface (some keys only work here).
  try {
    return await openAiStyleComplete(GEMINI_OPENAI_URL, key, model, opts)
  } catch (openAiErr: unknown) {
    const geminiErr = nativeData.error?.message || `Gemini HTTP ${nativeRes.status}`
    const openErr = openAiErr instanceof Error ? openAiErr.message : String(openAiErr)
    const err = new Error(`${geminiErr}; openai-compat: ${openErr}`) as Error & { status?: number }
    err.status = nativeRes.status
    throw err
  }
}

async function ollamaComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  model?: string
}): Promise<{ text: string; model: string }> {
  const key = ollamaApiKey()
  if (!key) throw new Error('OLLAMA_API_KEY not configured')

  const preferred = opts.model || DEFAULT_OLLAMA_MODEL
  const models = [...new Set([preferred, ...OLLAMA_MODEL_FALLBACKS])]
  let lastError = 'Ollama returned no completion'

  for (const model of models) {
    try {
      const text = await openAiStyleComplete(OLLAMA_CHAT_URL, key, model, opts)
      return { text, model }
    } catch (e: unknown) {
      const err = e as Error & { status?: number }
      lastError = err.message || String(e)
      if (err.status === 404) continue
      if (err.status === 429) throw err
      if (err.status === 401 || err.status === 403) throw err
    }
  }

  throw new Error(lastError)
}

export type LlmCompleteResult = {
  text: string
  provider: 'gemini' | 'groq' | 'ollama'
  model: string
}

/** Janet + OS agents: Gemini first, Groq fallback, optional Ollama Cloud for live demos. */
export async function llmComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  /** Override provider order, e.g. ['ollama','gemini'] for live demos */
  providers?: string[]
}): Promise<LlmCompleteResult> {
  const chain = opts.providers ?? providerChain()
  let lastError = 'No LLM provider succeeded'

  for (const provider of chain) {
    try {
      if (provider === 'gemini') {
        if (!geminiApiKey()) continue
        const model = DEFAULT_GEMINI_MODEL
        const text = await geminiComplete({ ...opts, model })
        return { text, provider: 'gemini', model }
      }
      if (provider === 'groq') {
        if (!process.env.GROQ_API_KEY?.trim()) continue
        const text = await groqComplete(opts)
        return { text, provider: 'groq', model: GROQ_MODEL }
      }
      if (provider === 'ollama') {
        if (!ollamaApiKey()) continue
        const ollama = await ollamaComplete({ ...opts, model: DEFAULT_OLLAMA_MODEL })
        return { text: ollama.text, provider: 'ollama', model: ollama.model }
      }
    } catch (e: unknown) {
      const err = e as Error & { status?: number }
      lastError = err.message || String(e)
      // Rate limits: try next provider in chain.
      if (err.status === 429) continue
      // Missing key / auth: try next.
      if (err.status === 401 || err.status === 403) continue
      // Other errors on this provider — still try fallbacks.
      continue
    }
  }

  throw new Error(lastError)
}

export async function llmPing(): Promise<{
  ok: boolean
  provider?: string
  model?: string
  chain: string[]
  error?: string
}> {
  const chain = providerChain()
  try {
    const result = await llmComplete({
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      max_tokens: 8,
      temperature: 0,
    })
    return { ok: result.text.toLowerCase().includes('ok'), provider: result.provider, model: result.model, chain }
  } catch (e: unknown) {
    return { ok: false, chain, error: e instanceof Error ? e.message : String(e) }
  }
}
