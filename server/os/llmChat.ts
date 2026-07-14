import { groqComplete, GROQ_DEFAULT_MODEL, type GroqMessage } from './groqChat'

export type LlmMessage = GroqMessage

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_CHAT_MODEL?.trim() || 'gemini-2.5-flash'
/** Ollama Cloud — Z.ai GLM-5.2 via https://ollama.com/v1 (see ollama.com/library/glm-5.2:cloud) */
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || 'glm-5.2:cloud'
const OLLAMA_MODEL_FALLBACKS = ['glm-5.2:cloud', 'glm-5.2', 'qwen3.5'] as const
const OLLAMA_CHAT_URL = `${(process.env.OLLAMA_BASE_URL?.trim() || 'https://ollama.com').replace(/\/$/, '')}/v1/chat/completions`

/** Cerebras — OpenAI-compatible surface. Free tier: 5 RPM / 30K TPM / 1M tokens per day. */
const CEREBRAS_CHAT_URL = 'https://api.cerebras.ai/v1/chat/completions'
const DEFAULT_CEREBRAS_MODEL = process.env.CEREBRAS_CHAT_MODEL?.trim() || 'zai-glm-4.7'
/** Free-tier context ceiling. Oversized calls are skipped to DeepInfra rather than 400ing. */
const CEREBRAS_CONTEXT_LIMIT = 8_192
const CEREBRAS_TIMEOUT_MS = 30_000

/**
 * reasoning_effort:'none' suppresses GLM's reasoning block so `content` arrives populated.
 *
 * MODEL-SPECIFIC, NOT FAMILY-WIDE — 'none' is only accepted by zai-glm-4.7.
 * Cerebras' other free-tier model, gpt-oss-120b, accepts low|medium|high ONLY, and
 * rejects 'none'. Because an unknown-parameter 400 falls through the chain silently,
 * sending it to the wrong model would make Cerebras skip on every call and quietly
 * dump 100% of load on DeepInfra. So we send it only for models known to accept it.
 * If you add a model here, check its accepted values first:
 * https://inference-docs.cerebras.ai/capabilities/reasoning
 *
 * (Do NOT switch to the older `disable_reasoning: true` — deprecated, removed 2026-07-21.)
 */
const CEREBRAS_MODELS_ACCEPTING_NO_REASONING = new Set(['zai-glm-4.7'])

/** DeepInfra — OpenAI-compatible surface. Paid from the first call; 200 concurrent req/account. */
const DEEPINFRA_CHAT_URL = 'https://api.deepinfra.com/v1/openai/chat/completions'
const DEFAULT_DEEPINFRA_MODEL = process.env.DEEPINFRA_CHAT_MODEL?.trim() || 'meta-llama/Llama-3.3-70B-Instruct'
/**
 * DeepInfra gets its OWN timeout, deliberately not the shared one. A 70B model answering
 * a long prompt routinely needs more wall-clock than Groq/Ollama do; a short shared timeout
 * aborts client-side before DeepInfra ever responds, which reads as a broken vendor rather
 * than as our own misconfiguration. Keep this independent of DEFAULT_TIMEOUT_MS.
 */
const DEEPINFRA_TIMEOUT_MS = 60_000

const DEFAULT_TIMEOUT_MS = 60_000

/** Default order. Groq is retained below but off the default chain — re-add via LLM_PROVIDER_CHAIN. */
const DEFAULT_CHAIN = 'cerebras,deepinfra,ollama'

export type LlmUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null
}

function ollamaApiKey(): string | null {
  return process.env.OLLAMA_API_KEY?.trim() || null
}

function cerebrasApiKey(): string | null {
  return process.env.CEREBRAS_API_KEY?.trim() || null
}

function deepinfraApiKey(): string | null {
  return process.env.DEEPINFRA_API_KEY?.trim() || null
}

/**
 * NOTE: LLM_PROVIDER_CHAIN unconditionally overrides DEFAULT_CHAIN. If it is set in Vercel
 * to a stale chain, new providers added here sit unused. Check the env before assuming a
 * default-chain change has taken effect in production.
 */
function providerChain(): string[] {
  const raw = process.env.LLM_PROVIDER_CHAIN?.trim() || DEFAULT_CHAIN
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

/** Coarse token estimate (~4 chars/token) — only used for pre-emptive size guards. */
function estimateTokens(messages: LlmMessage[]): number {
  const chars = messages.reduce((n, m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    return n + text.length
  }, 0)
  return Math.ceil(chars / 4)
}

async function openAiStyleComplete(
  url: string,
  apiKey: string,
  model: string,
  opts: {
    messages: LlmMessage[]
    max_tokens?: number
    temperature?: number
    response_format?: { type: 'json_object' }
    /** Provider-specific params. Scoped per-call so they never leak into another provider's body. */
    extraBody?: Record<string, unknown>
    timeoutMs?: number
    /** Label for logs only. */
    provider?: string
  },
): Promise<{ text: string; usage?: LlmUsage }> {
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
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
      ...(opts.extraBody ?? {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string; reasoning?: string; reasoning_content?: string } }>
    usage?: LlmUsage
    error?: { message?: string }
  }
  const message = data.choices?.[0]?.message
  const text = message?.content?.trim()
  if (res.ok && text) return { text, usage: data.usage }

  // Reasoning-suppression safety net: a reasoning model that ignored (or was never sent)
  // the suppression param returns its answer in `reasoning`/`reasoning_content` with an
  // EMPTY `content`. Recovering here keeps the call alive, and the warning is the signal
  // that suppression is NOT working — a clean run should never print this.
  const reasoning = (message?.reasoning || message?.reasoning_content)?.trim()
  if (res.ok && reasoning) {
    console.warn(`[llm] recovered from reasoning field (${opts.provider || 'unknown'}/${model}) — reasoning suppression is not working`)
    return { text: reasoning, usage: data.usage }
  }

  const err = new Error(data.error?.message || `HTTP ${res.status}`) as Error & { status?: number }
  err.status = res.status
  throw err
}

/**
 * Cerebras (free tier). Suppresses reasoning so `content` is populated; skips itself when the
 * call cannot fit the free-tier context window, so the chain moves on instead of hard-failing.
 */
async function cerebrasComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  response_format?: { type: 'json_object' }
  model?: string
}): Promise<{ text: string; model: string; usage?: LlmUsage }> {
  const key = cerebrasApiKey()
  if (!key) throw new Error('CEREBRAS_API_KEY not configured')
  const model = opts.model || DEFAULT_CEREBRAS_MODEL

  const needed = estimateTokens(opts.messages) + (opts.max_tokens ?? 400)
  if (needed > CEREBRAS_CONTEXT_LIMIT) {
    const err = new Error(
      `Cerebras skipped: ~${needed} tokens exceeds free-tier context limit of ${CEREBRAS_CONTEXT_LIMIT}`,
    ) as Error & { status?: number }
    err.status = 413
    throw err
  }

  const extraBody: Record<string, unknown> = {}
  if (CEREBRAS_MODELS_ACCEPTING_NO_REASONING.has(model)) {
    extraBody.reasoning_effort = 'none'
  } else {
    // Not an error — but this model will reason, so expect the recovery warning above.
    console.warn(`[llm] cerebras model "${model}" is not known to accept reasoning_effort:'none' — omitting it`)
  }

  const { text, usage } = await openAiStyleCompleteJson(CEREBRAS_CHAT_URL, key, model, {
    ...opts,
    extraBody,
    timeoutMs: CEREBRAS_TIMEOUT_MS,
    provider: 'cerebras',
  })
  return { text, model, usage }
}

/** DeepInfra (paid). Own timeout — see DEEPINFRA_TIMEOUT_MS. */
async function deepinfraComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  response_format?: { type: 'json_object' }
  model?: string
}): Promise<{ text: string; model: string; usage?: LlmUsage }> {
  const key = deepinfraApiKey()
  if (!key) throw new Error('DEEPINFRA_API_KEY not configured')
  const model = opts.model || DEFAULT_DEEPINFRA_MODEL

  const { text, usage } = await openAiStyleCompleteJson(DEEPINFRA_CHAT_URL, key, model, {
    ...opts,
    timeoutMs: DEEPINFRA_TIMEOUT_MS,
    provider: 'deepinfra',
  })
  return { text, model, usage }
}

/**
 * openAiStyleComplete + a response_format escape hatch.
 *
 * Both Cerebras and DeepInfra advertise `response_format: {type:'json_object'}`, but a provider
 * that rejects it would 400 — and a 400 falls through the chain SILENTLY, taking the provider
 * out of service without an obvious error. So on a 4xx we retry once without it and let the
 * caller's own JSON parsing handle the (prompt-guided) output, matching how Gemini/Ollama
 * already behave. Never send json_schema — it is not supported across the chain.
 */
async function openAiStyleCompleteJson(
  url: string,
  apiKey: string,
  model: string,
  opts: Parameters<typeof openAiStyleComplete>[3],
): Promise<{ text: string; usage?: LlmUsage }> {
  try {
    return await openAiStyleComplete(url, apiKey, model, opts)
  } catch (e: unknown) {
    const err = e as Error & { status?: number }
    const rejectedFormat = opts.response_format && err.status && err.status >= 400 && err.status < 500
    if (!rejectedFormat) throw err
    console.warn(`[llm] ${opts.provider || 'provider'}/${model} rejected response_format — retrying without it`)
    return await openAiStyleComplete(url, apiKey, model, { ...opts, response_format: undefined })
  }
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
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  const nativeData = await nativeRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  const nativeText = nativeData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim()
  if (nativeRes.ok && nativeText) return nativeText

  // Fallback: OpenAI-compatible surface (some keys only work here).
  try {
    const { text } = await openAiStyleComplete(GEMINI_OPENAI_URL, key, model, { ...opts, provider: 'gemini' })
    return text
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
}): Promise<{ text: string; model: string; usage?: LlmUsage }> {
  const key = ollamaApiKey()
  if (!key) throw new Error('OLLAMA_API_KEY not configured')

  const preferred = opts.model || DEFAULT_OLLAMA_MODEL
  const models = [...new Set([preferred, ...OLLAMA_MODEL_FALLBACKS])]
  let lastError = 'Ollama returned no completion'

  for (const model of models) {
    try {
      const { text, usage } = await openAiStyleComplete(OLLAMA_CHAT_URL, key, model, { ...opts, provider: 'ollama' })
      return { text, model, usage }
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

export type LlmProvider = 'cerebras' | 'deepinfra' | 'gemini' | 'groq' | 'ollama'

export type LlmCompleteResult = {
  text: string
  provider: LlmProvider
  model: string
  usage?: LlmUsage
}

/**
 * Janet + OS agents. Default chain: Cerebras (free) -> DeepInfra (cheap paid) -> Ollama Cloud.
 * Groq and Gemini remain implemented and reachable via LLM_PROVIDER_CHAIN, but are off the
 * default chain.
 */
export async function llmComplete(opts: {
  messages: LlmMessage[]
  max_tokens?: number
  temperature?: number
  /** Override provider order, e.g. ['ollama','cerebras'] for live demos */
  providers?: string[]
  /** Best-effort structured output. Honoured by Cerebras/DeepInfra/Groq (json_object);
   *  Gemini/Ollama ignore it and rely on the prompt. Callers must still parse/validate. */
  response_format?: { type: 'json_object' }
}): Promise<LlmCompleteResult> {
  const chain = opts.providers ?? providerChain()
  let lastError = 'No LLM provider succeeded'

  for (const provider of chain) {
    try {
      if (provider === 'cerebras') {
        if (!cerebrasApiKey()) continue
        const r = await cerebrasComplete(opts)
        return { text: r.text, provider: 'cerebras', model: r.model, usage: r.usage }
      }
      if (provider === 'deepinfra') {
        if (!deepinfraApiKey()) continue
        const r = await deepinfraComplete(opts)
        return { text: r.text, provider: 'deepinfra', model: r.model, usage: r.usage }
      }
      if (provider === 'gemini') {
        if (!geminiApiKey()) continue
        const model = DEFAULT_GEMINI_MODEL
        const text = await geminiComplete({ ...opts, model })
        return { text, provider: 'gemini', model }
      }
      if (provider === 'groq') {
        if (!process.env.GROQ_API_KEY?.trim()) continue
        const text = await groqComplete(opts)
        return { text, provider: 'groq', model: GROQ_DEFAULT_MODEL }
      }
      if (provider === 'ollama') {
        if (!ollamaApiKey()) continue
        const ollama = await ollamaComplete({ ...opts, model: DEFAULT_OLLAMA_MODEL })
        return { text: ollama.text, provider: 'ollama', model: ollama.model, usage: ollama.usage }
      }
    } catch (e: unknown) {
      const err = e as Error & { status?: number }
      lastError = err.message || String(e)
      // A provider failing for ANY reason (rate limit, auth, oversized prompt, vendor error)
      // is not fatal — that is the point of the chain. Log so a provider that is permanently
      // skipping is visible rather than silently absorbed by the next one down.
      console.warn(`[llm] provider ${provider} failed: ${lastError}`)
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
