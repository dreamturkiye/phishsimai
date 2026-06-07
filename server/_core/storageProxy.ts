// Storage proxy stub — no longer needed since Vercel Blob returns direct CDN URLs.
// Kept as a no-op to avoid breaking imports.
import type { Express } from "express";

export function registerStorageProxy(_app: Express) {
  // No-op: Vercel Blob URLs are direct public CDN URLs, no proxy needed.
}
