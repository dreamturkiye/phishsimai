// ─────────────────────────────────────────────────────────────────────────────
//  PS-TEMPLATE-MERGE-01 — the ONE place that knows which placeholders the engine fills.
//
//  THE DEFECT THIS PREVENTS
//    A template authored with {{FirstName}} or {{SignInLocation}} that the send path does not
//    interpolate ships the literal token into the recipient's inbox — "Hi {{FirstName}},". In a
//    phishing SIMULATION that is a worse tell than the amateur copy we set out to fix: it screams
//    "automated test" in the first line. The send path historically filled only {{TRACKING_LINK}},
//    so every other merge field was a latent version of this bug.
//
//  WHY A SINGLE SOURCE OF TRUTH
//    KNOWN_PLACEHOLDERS is consumed by BOTH the interpolator (what actually gets replaced) and the
//    build guard (what a template is allowed to reference). If the two lists could drift, the guard
//    would bless a token the engine ignores — the exact gap. One constant, two readers, no drift.
//
//  FABRICATION LINE
//    A placeholder may exist here ONLY if the engine fills it from REAL data. {{FirstName}} comes
//    from targets.firstName, which exists and is notNull. {{SignInLocation}} / {{SignInDevice}} /
//    {{SignInTime}} are deliberately ABSENT: that data does not exist, so merge-fielding it would be
//    per-recipient invention. Static generic phrasing belongs in the template copy, never a token
//    the engine would fill with a guess.
// ─────────────────────────────────────────────────────────────────────────────

/** The complete set of placeholders the send path interpolates. Adding one here is a promise the
 *  engine keeps it filled from real data — see the fabrication line above. */
export const KNOWN_PLACEHOLDERS = ['TRACKING_LINK', 'FirstName'] as const
export type KnownPlaceholder = (typeof KNOWN_PLACEHOLDERS)[number]

export type MergeData = {
  trackingLink: string
  /** From targets.firstName. Falls back to a neutral, NON-fabricated greeting when absent. */
  firstName?: string | null
}

/**
 * A greeting that is honest when we have no name. Not "Hi ," and not an invented name — a real,
 * generic salutation that a legitimate bulk email also uses.
 */
export const FIRST_NAME_FALLBACK = 'there'

/** Replace every KNOWN placeholder. Unknown tokens are left untouched here and caught by the guard
 *  at build time, so they can never reach a send in the first place. */
export function interpolate(html: string, data: MergeData): string {
  return html
    .replace(/\{\{TRACKING_LINK\}\}/g, data.trackingLink)
    .replace(/\{\{FirstName\}\}/g, (data.firstName && data.firstName.trim()) || FIRST_NAME_FALLBACK)
}

/** Every `{{Token}}` present in the text, deduped, in first-seen order. */
export function placeholdersIn(html: string): string[] {
  const seen = new Set<string>()
  for (const m of html.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) seen.add(m[1])
  return [...seen]
}

/** Placeholders a template references that the engine does NOT fill — each would ship literally.
 *  The build guard fails on any non-empty result. */
export function unknownPlaceholders(html: string): string[] {
  const known = new Set<string>(KNOWN_PLACEHOLDERS)
  return placeholdersIn(html).filter((p) => !known.has(p))
}
