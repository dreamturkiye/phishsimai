// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — credential encryption at rest.
//
//  PSA credentials (ConnectWise private key, Halo client secret) are secrets. There is no existing
//  DB-secret pattern in this repo — everything else reads from env — so this adds one, deliberately
//  minimal: AES-256-GCM, key derived from PSA_SECRET_KEY via scrypt, authenticated so tampering is
//  detected on decrypt.
//
//  HONESTY: if PSA_SECRET_KEY is not set we do NOT silently fall back to plaintext. encryptSecret
//  throws, the upsert fails loudly, and the admin is told to configure the key. Storing a private
//  key in the clear because a config value was missing is exactly the kind of quiet unsafe default
//  this codebase refuses.
// ─────────────────────────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
// Static salt for the KDF: the secret is PSA_SECRET_KEY, not the salt, and a per-value salt would
// have to be stored alongside the ciphertext anyway. A fixed salt keys the whole table off one env.
const KDF_SALT = "phishsim-psa-v1";

function keyFromEnv(): Buffer {
  const secret = process.env.PSA_SECRET_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "PSA_SECRET_KEY is not set (or too short). Set a strong PSA_SECRET_KEY in the environment before configuring PSA credentials — the server will not store integration secrets in the clear.",
    );
  }
  return scryptSync(secret, KDF_SALT, 32);
}

/** Returns whether a key is configured, WITHOUT throwing — for surfacing an honest UI/API state. */
export function psaSecretKeyConfigured(): boolean {
  const secret = process.env.PSA_SECRET_KEY?.trim();
  return !!secret && secret.length >= 16;
}

/** Encrypt a plaintext credential blob. Output format: v1.<iv>.<tag>.<ciphertext> (all base64url). */
export function encryptSecret(plaintext: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Decrypt a blob produced by encryptSecret. Throws on a bad key, tampering, or malformed input. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Malformed PSA secret blob");
  const key = keyFromEnv();
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ct = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
