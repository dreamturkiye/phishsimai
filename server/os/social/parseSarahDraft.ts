import type { SarahMarketingImageSpec } from './sarahLinkedInImage'

export type ParsedSarahDraft = {
  hook: string
  body: string
  hashtags: string[]
  marketingImage: Partial<SarahMarketingImageSpec>
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function extractJsonStringField(raw: string, field: string): string | null {
  const key = `"${field}"`
  const idx = raw.indexOf(key)
  if (idx < 0) return null
  const colon = raw.indexOf(':', idx + key.length)
  if (colon < 0) return null
  let i = colon + 1
  while (i < raw.length && /\s/.test(raw[i])) i++
  if (raw[i] !== '"') return null
  i++
  let out = ''
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next === 'n') out += '\n'
      else if (next === 't') out += '\t'
      else if (next === '"') out += '"'
      else if (next === '\\') out += '\\'
      else out += next || ''
      i += 2
      continue
    }
    if (ch === '"') break
    out += ch
    i++
  }
  return out.trim() || null
}

function extractHashtags(raw: string): string[] | null {
  const m = raw.match(/"hashtags"\s*:\s*\[([\s\S]*?)\]/)
  if (!m) return null
  try {
    const parsed = JSON.parse(`[${m[1]}]`)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch { /* ignore */ }
  return null
}

function looksLikeJsonPayload(text: string): boolean {
  const t = text.trim()
  return t.startsWith('{') && (t.includes('"hook"') || t.includes('"body"') || t.includes('"hashtags"'))
}

function stripDelimiterMarkers(text: string): string {
  return text
    .replace(/---HOOK---/gi, '')
    .replace(/---BODY---/gi, '')
    .replace(/---HASHTAGS---/gi, '')
    .replace(/---IMAGE---/gi, '')
    .trim()
}

function normalizeBody(body: string, hook: string): string {
  let b = stripDelimiterMarkers(body)
  if (looksLikeJsonPayload(b)) {
    const extracted = extractJsonStringField(b, 'body')
    if (extracted) b = extracted
    else if (hook && !looksLikeJsonPayload(hook)) b = hook
    else b = ''
  }
  b = b.replace(/\n*(#[A-Za-z0-9_]+\s*)+$/g, '').trim()
  return b
}

function cleanHook(hook: string, topicFallback: string): string {
  let h = stripDelimiterMarkers(hook).trim()
  if (!h || h.startsWith('---') || /^HOOK$/i.test(h)) return topicFallback
  return h.split('\n')[0].trim() || topicFallback
}

function parseImageBlock(block: string): Partial<SarahMarketingImageSpec> {
  const line = (key: string) => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
    return m ? m[1].trim() : undefined
  }
  const featuresRaw = line('features')
  return {
    headline: line('headline'),
    subheadline: line('subheadline'),
    leftPanel: line('leftPanel'),
    rightPanel: line('rightPanel'),
    features: featuresRaw ? featuresRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  }
}

function parseDelimiterFormat(raw: string, topicFallback: string): ParsedSarahDraft | null {
  if (!/---HOOK---/i.test(raw)) return null

  const tagsSplit = raw.split(/---HASHTAGS---/i)
  const tagsSection = tagsSplit[1] || ''
  const imageSplit = tagsSection.split(/---IMAGE---/i)
  const tagsRaw = imageSplit[0] || ''
  const imageRaw = imageSplit[1] || ''

  const hashtags = tagsRaw
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)

  const main = tagsSplit[0]
  const bodySplit = main.split(/---BODY---/i)
  const hookRaw = (bodySplit[0] || '').split(/---HOOK---/i).pop() || ''
  let hook = cleanHook(hookRaw, topicFallback)
  let body = normalizeBody((bodySplit.slice(1).join('\n\n') || ''), hook)

  if (!body && hookRaw.trim()) {
    const lines = hookRaw.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      hook = cleanHook(lines[0], topicFallback)
      body = normalizeBody(lines.slice(1).join('\n\n'), hook)
    } else {
      body = normalizeBody(hookRaw, hook)
      hook = cleanHook(body.split('\n')[0] || topicFallback, topicFallback)
      body = normalizeBody(body.split('\n').slice(1).join('\n\n') || body, hook)
    }
  }

  return {
    hook,
    body: body || hook,
    hashtags: hashtags.length ? hashtags : ['MSP', 'CyberSecurity', 'Compliance'],
    marketingImage: imageRaw ? parseImageBlock(imageRaw) : {},
  }
}

function parseMarketingImage(raw: string): Partial<SarahMarketingImageSpec> {
  try {
    const start = raw.indexOf('"marketingImage"')
    if (start < 0) return {}
    const sub = raw.slice(start)
    const objStart = sub.indexOf('{')
    if (objStart < 0) return {}
    let depth = 0
    for (let i = objStart; i < sub.length; i++) {
      if (sub[i] === '{') depth++
      if (sub[i] === '}') {
        depth--
        if (depth === 0) {
          const parsed = JSON.parse(sub.slice(objStart, i + 1))
          return typeof parsed === 'object' && parsed ? parsed : {}
        }
      }
    }
  } catch { /* ignore */ }
  return {
    headline: extractJsonStringField(raw, 'headline') || undefined,
    subheadline: extractJsonStringField(raw, 'subheadline') || undefined,
    leftPanel: extractJsonStringField(raw, 'leftPanel') || undefined,
    rightPanel: extractJsonStringField(raw, 'rightPanel') || undefined,
  }
}

/** Parse LLM draft — tolerant of truncated JSON and delimiter formatting quirks. */
export function parseSarahDraftResponse(text: string, topicFallback: string): ParsedSarahDraft {
  const raw = stripCodeFences(text)
  const defaults: ParsedSarahDraft = {
    hook: topicFallback,
    body: '',
    hashtags: ['MSP', 'CyberSecurity', 'Compliance'],
    marketingImage: {},
  }
  if (!raw) return defaults

  const delimiter = parseDelimiterFormat(raw, topicFallback)
  if (delimiter && delimiter.body && !looksLikeJsonPayload(delimiter.body)) {
    return delimiter
  }

  const jsonSlice = (() => {
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    return s >= 0 && e > s ? raw.slice(s, e + 1) : raw
  })()

  try {
    const json = JSON.parse(jsonSlice)
    const hook = cleanHook(String(json.hook || topicFallback), topicFallback)
    const body = normalizeBody(String(json.body || ''), hook)
    return {
      hook,
      body: body || hook,
      hashtags: Array.isArray(json.hashtags) ? json.hashtags.map(String) : defaults.hashtags,
      marketingImage: json.marketingImage && typeof json.marketingImage === 'object' ? json.marketingImage : {},
    }
  } catch { /* fall through */ }

  const hook = cleanHook(extractJsonStringField(raw, 'hook') || topicFallback, topicFallback)
  const body = normalizeBody(extractJsonStringField(raw, 'body') || '', hook)
  const hashtags = extractHashtags(raw) || defaults.hashtags

  if (body && !looksLikeJsonPayload(body)) {
    return { hook, body, hashtags, marketingImage: parseMarketingImage(raw) }
  }

  if (!looksLikeJsonPayload(raw)) {
    const cleaned = stripDelimiterMarkers(raw)
    const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean)
    return {
      hook: cleanHook(lines[0] || topicFallback, topicFallback),
      body: normalizeBody(lines.slice(1).join('\n\n') || cleaned, lines[0] || topicFallback),
      hashtags: defaults.hashtags,
      marketingImage: {},
    }
  }

  return { ...defaults, hook, body: hook }
}

/** Clean bodies already saved with raw JSON or delimiter artifacts. */
export function sanitizeStoredPostBody(body: string, title?: string | null): string {
  if (!body) return ''
  let b = stripDelimiterMarkers(body)
  if (looksLikeJsonPayload(b)) {
    const extracted = extractJsonStringField(b, 'body')
    if (extracted) b = extracted
    else if (title && !looksLikeJsonPayload(title)) return title
    else return 'Post copy unavailable — please regenerate this draft.'
  }
  return normalizeBody(b, title || '')
}
