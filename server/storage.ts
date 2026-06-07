// Storage helpers — backed by Vercel Blob (free tier).
// Set BLOB_READ_WRITE_TOKEN in Vercel environment variables.
// Falls back to a no-op stub when the token is not configured so the app
// still starts locally without blob storage.

import { put, del } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

function appendHashSuffix(relKey: string): string {
  const hash = Math.random().toString(36).slice(2, 10);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Upload a file to Vercel Blob.
 * Returns { key, url } where url is the public Vercel Blob CDN URL.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!TOKEN) {
    console.warn("[Storage] BLOB_READ_WRITE_TOKEN not set — skipping upload");
    return { key: relKey, url: "" };
  }
  const key = appendHashSuffix(relKey);
  // Vercel Blob requires Buffer, Blob, or ReadableStream — convert Uint8Array
  const body = data instanceof Uint8Array ? Buffer.from(data) : data;
  const blob = await put(key, body as Parameters<typeof put>[1], {
    access: "public",
    contentType,
    token: TOKEN,
  });
  return { key, url: blob.url };
}

/**
 * Return the public URL for a previously uploaded key.
 * With Vercel Blob the URL is the full CDN URL stored at upload time.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  return { key: relKey, url: relKey };
}

/**
 * Return a signed (or public) URL for a blob key.
 * Vercel Blob public blobs are already publicly accessible via their URL.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return relKey;
}

/**
 * Delete a blob by URL.
 */
export async function storageDelete(url: string): Promise<void> {
  if (!TOKEN) return;
  try {
    await del(url, { token: TOKEN });
  } catch (err) {
    console.warn("[Storage] Failed to delete blob:", err);
  }
}
