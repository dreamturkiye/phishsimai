// Storage proxy stub — no longer needed since Vercel Blob returns direct CDN URLs.
// Kept as a no-op to avoid breaking imports.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerStorageProxy(_app: any) {
  // No-op: Vercel Blob URLs are direct public CDN URLs, no proxy needed.
}
