// ─────────────────────────────────────────────────────────────────────────────
//  PS-MIA-CALLWINDOW-01 — "9am" is not a time. Resolve it, or do not promise a call.
//
//  THE FAILURE THIS PREVENTS
//    A customer types "9am". Stored bare, that string is unusable: 9am where? Kaan reads it in
//    Eastern, calls at 9am Eastern, and reaches a Pacific customer at 6am. The request was captured
//    perfectly and the callback still fails — a correct record producing a wrong action.
//
//    So the window is resolved to an ABSOLUTE INSTANT at capture time, using the timezone the
//    browser reported, and rendered in BOTH zones everywhere a human reads it.
//
//  THE TIMEZONE IS CAPTURED, NOT GUESSED FROM THE IP
//    Intl.DateTimeFormat().resolvedOptions().timeZone is what the user's own machine believes, which
//    is right far more often than a geo-IP lookup, and it is free. The form shows it back to them so
//    they can correct it — a VPN user in London reporting America/New_York is exactly who needs the
//    override.
//
//  UNRESOLVABLE IS A FIRST-CLASS OUTCOME
//    If we cannot parse the time or the zone, resolved is null and the Telegram says so plainly.
//    Mia must not promise a call at a time nobody can compute; an unresolved window is surfaced as
//    "no window given — ask them" rather than silently rendered in Kaan's zone as though it were.
// ─────────────────────────────────────────────────────────────────────────────

/** Kaan's zone. Overridable, because a founder who moves should not silently get wrong times. */
export const KAAN_TZ = process.env.FOUNDER_TZ || 'America/New_York'

export type CallWindow = {
  /** What the user typed, verbatim. Always kept — it is the ground truth if parsing was wrong. */
  raw: string
  /** IANA zone as reported by the browser (or corrected by the user). */
  timezone: string | null
  /** The resolved absolute instant, ISO. null when the input could not be resolved. */
  iso: string | null
  /** "9:00 AM PDT" — the customer's own clock. */
  userLocal: string | null
  /** "12:00 PM EDT" — Kaan's clock, so he calls at the right hour without doing arithmetic. */
  founderLocal: string | null
  /** One line for the Telegram and the standup. Always safe to print. */
  display: string
}

/** Milliseconds that `tz` is ahead of UTC at `date`. Standard Intl round-trip technique. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  // Intl renders midnight as hour 24 in some engines; normalise before arithmetic.
  const hour = p.hour === '24' ? 0 : Number(p.hour)
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second))
  return asUTC - date.getTime()
}

/** The UTC instant at which local wall-clock time in `tz` is the given Y/M/D H:M. */
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const off1 = tzOffsetMs(new Date(guess), tz)
  let t = guess - off1
  // One correction pass handles a DST boundary landing between the guess and the real instant.
  const off2 = tzOffsetMs(new Date(t), tz)
  if (off2 !== off1) t = guess - off2
  return new Date(t)
}

export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Parse a human time expression into hour/minute. Returns null when it cannot be read — which is a
 * result, not a failure to paper over.
 *
 * Handles "9am", "9 AM", "09:00", "3pm", "15:30", and the vague-but-common "morning"/"afternoon"/
 * "evening", which are mapped to a conventional hour and MARKED as approximate by the caller via
 * the raw string being preserved.
 */
export function parseTimeExpression(input: string): { hour: number; minute: number } | null {
  const s = (input ?? '').trim().toLowerCase()
  if (!s) return null

  const hhmm = s.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/)
  if (hhmm) {
    let h = Number(hhmm[1])
    const min = Number(hhmm[2])
    const mer = hhmm[3]
    if (mer === 'pm' && h < 12) h += 12
    if (mer === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) return null
    return { hour: h, minute: min }
  }

  const hOnly = s.match(/\b(\d{1,2})\s*(am|pm)\b/)
  if (hOnly) {
    let h = Number(hOnly[1])
    const mer = hOnly[2]
    if (h > 12) return null
    if (mer === 'pm' && h < 12) h += 12
    if (mer === 'am' && h === 12) h = 0
    return { hour: h, minute: 0 }
  }

  if (/\bmorning\b/.test(s)) return { hour: 9, minute: 0 }
  if (/\b(afternoon|lunch)\b/.test(s)) return { hour: 14, minute: 0 }
  if (/\b(evening|tonight|after work)\b/.test(s)) return { hour: 18, minute: 0 }
  if (/\b(any ?time|whenever|asap|now)\b/.test(s)) return null // genuinely unconstrained, not 9am
  return null
}

function fmt(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(date)
}

/**
 * Resolve a stated preference into an absolute instant plus both renderings.
 *
 * `now` is injectable so the resolution is testable without freezing the clock globally.
 */
export function resolveCallWindow(
  rawTime: string,
  timezone: string | null | undefined,
  now: Date = new Date(),
  founderTz: string = KAAN_TZ,
): CallWindow {
  const raw = (rawTime ?? '').trim()
  const tz = isValidTimeZone(timezone) ? (timezone as string) : null

  const base: CallWindow = {
    raw, timezone: tz, iso: null, userLocal: null, founderLocal: null,
    display: raw
      ? tz
        ? `"${raw}" in ${tz} — could not resolve to a specific time; ask them to confirm`
        : `"${raw}" — NO TIMEZONE CAPTURED, so this cannot be resolved; ask them`
      : 'no call window given — ask them',
  }

  if (!raw || !tz) return base
  const parsed = parseTimeExpression(raw)
  if (!parsed) return base

  // Next occurrence of that local hour in the customer's zone, today if still ahead, else tomorrow.
  const p: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false, hour: '2-digit',
  }).formatToParts(now)) p[part.type] = part.value

  let target = zonedToUtc(Number(p.year), Number(p.month), Number(p.day), parsed.hour, parsed.minute, tz)
  if (target.getTime() <= now.getTime()) {
    const nextDay = new Date(target.getTime() + 24 * 3600_000)
    const q: Record<string, string> = {}
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(nextDay)) q[part.type] = part.value
    target = zonedToUtc(Number(q.year), Number(q.month), Number(q.day), parsed.hour, parsed.minute, tz)
  }

  const userLocal = fmt(target, tz)
  const founderLocal = fmt(target, founderTz)

  return {
    raw,
    timezone: tz,
    iso: target.toISOString(),
    userLocal,
    founderLocal,
    // Both zones, always — this is the line that stops a 9am Pacific call being made at 6am.
    display: `${userLocal} (${founderLocal} your time)`,
  }
}
