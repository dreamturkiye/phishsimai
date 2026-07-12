// ─────────────────────────────────────────────────────────────────────────────
//  PII / SECRET SCRUB — shared by the Sentry beforeSend filter and the
//  Sentry → bug_reports bridge, so an error payload is redacted exactly ONCE, the
//  same way, no matter which path it travels.
//
//  Error messages and stack traces routinely carry the things we least want to
//  ship to a third party or persist in our own DB: a user's email in a "no such
//  user" message, a bearer token in a logged request header, a DSN with a password
//  in a connection error. This module strips them.
//
//  Pure and DB-free — exhaustively unit-testable, no I/O.
//
//  Doctrine: FAIL-CLOSED ON REDACTION. If a pattern is uncertain, redact it. A
//  scrubbed-too-hard stack trace is a debugging inconvenience; a leaked token is
//  an incident.
// ─────────────────────────────────────────────────────────────────────────────

export const REDACTED = '[redacted]'

// Ordered: longest/most-specific patterns first, so a JWT is not half-eaten by the
// generic long-token rule before it is recognised as a JWT.
const PATTERNS: Array<{ name: string; re: RegExp; to: string }> = [
  // Connection strings with inline credentials: postgres://user:pass@host
  { name: 'db_url_password', re: /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s]+):[^@\s]+@/gi, to: `$1:${REDACTED}@` },

  // JWTs — three base64url segments. Before the generic token rule.
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, to: REDACTED },

  // Authorization headers / bearer tokens.
  { name: 'bearer', re: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: `$1 ${REDACTED}` },
  { name: 'authz_header', re: /\b(authorization|proxy-authorization)\s*[:=]\s*\S+/gi, to: `$1: ${REDACTED}` },

  // Cookies / set-cookie.
  { name: 'cookie', re: /\b(set-cookie|cookie)\s*[:=]\s*[^\n\r]+/gi, to: `$1: ${REDACTED}` },

  // Known secret-ish key/value shapes: api_key=..., password: "...", token=...
  {
    name: 'secret_kv',
    re: /\b([a-z0-9_.-]*(?:api[_-]?key|secret|passwd|password|token|auth|credential|session[_-]?id|dsn)[a-z0-9_.-]*)\s*[:=]\s*"?[^"\s,;&)}\]]{4,}"?/gi,
    to: `$1=${REDACTED}`,
  },

  // Vendor key formats we actually use (Groq/OpenAI-style, Google, Slack, Stripe).
  { name: 'vendor_key', re: /\b(sk|pk|rk|gsk|xox[abps]|AIza)[-_][A-Za-z0-9_-]{10,}\b/g, to: REDACTED },

  // Email addresses — the single most common PII in our error text.
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, to: REDACTED },
]

// Redact secrets and PII from a free-text blob (error message, stack, notes).
// Returns '' for nullish input so callers never persist "undefined".
export function scrubText(input: string | null | undefined): string {
  if (input === null || input === undefined) return ''
  let out = String(input)
  for (const p of PATTERNS) out = out.replace(p.re, p.to)
  return out
}

// Query strings carry emails and tokens (?email=..&token=..). Keep the path,
// drop the entire query and fragment — we never need them to locate a bug.
export function scrubUrl(input: string | null | undefined): string {
  if (!input) return ''
  const noQuery = String(input).split(/[?#]/)[0]
  return scrubText(noQuery)
}

// Deep-scrub an arbitrary structure (a Sentry event, a request body). Redacts
// string leaves, drops keys whose NAME alone marks them sensitive, and bounds
// recursion so a cyclic or pathological object cannot hang the error path.
const SENSITIVE_KEYS =
  /^(authorization|cookie|set-cookie|password|passwd|token|access_token|refresh_token|id_token|api_key|apikey|secret|client_secret|session|session_id|dsn|email|user_email|x-os-secret|hq_secret|architect_secret)$/i

export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return scrubText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 100).map(v => scrubDeep(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? REDACTED : scrubDeep(v, depth + 1)
    }
    return out
  }
  return REDACTED // functions, symbols, bigints — not worth shipping
}
