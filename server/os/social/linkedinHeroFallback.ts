/**
 * LinkedIn founder-preview hero fallback.
 *
 * storagePut returns url="" when BLOB_READ_WRITE_TOKEN is missing. Callers MUST
 * not persist that as image_url — empty string is falsy and becomes SQL NULL
 * (`${input.imageUrl || null}`), which makes /preview/social/:token render
 * "Hero image generating…" forever.
 */
export const REFERENCE_PUBLIC_URL = 'https://phishsimai.com/brand/sarah-linkedin-reference-v2.png'

/** Non-empty hero URL, or the public Sarah LinkedIn reference PNG. Never returns empty. */
export function linkedInHeroUrlOrReference(url?: string | null): string {
  const v = String(url || '').trim()
  return v || REFERENCE_PUBLIC_URL
}

export function isLinkedInHeroUrlMissing(url?: string | null): boolean {
  return !String(url || '').trim()
}
