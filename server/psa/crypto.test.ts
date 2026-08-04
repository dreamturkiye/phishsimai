// ─────────────────────────────────────────────────────────────────────────────
//  PS-PSA-01 — credential encryption: round-trips, detects tampering, and refuses to operate
//  without PSA_SECRET_KEY (honest failure instead of a silent plaintext fallback).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, psaSecretKeyConfigured } from "./crypto";

const KEY = "a-strong-test-key-1234567890";

describe("psa crypto", () => {
  const original = process.env.PSA_SECRET_KEY;
  beforeEach(() => { process.env.PSA_SECRET_KEY = KEY; });
  afterEach(() => { if (original === undefined) delete process.env.PSA_SECRET_KEY; else process.env.PSA_SECRET_KEY = original; });

  it("round-trips a credential blob", () => {
    const secret = JSON.stringify({ publicKey: "PUB", privateKey: "PRIV", clientId: "CID" });
    const blob = encryptSecret(secret);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("PRIV");            // ciphertext, not plaintext
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("detects tampering (GCM auth tag)", () => {
    const blob = encryptSecret("secret");
    const parts = blob.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("garbage").toString("base64url")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("refuses to encrypt when PSA_SECRET_KEY is unset — no silent plaintext fallback", () => {
    delete process.env.PSA_SECRET_KEY;
    expect(psaSecretKeyConfigured()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(/PSA_SECRET_KEY/);
  });

  it("refuses a too-short key", () => {
    process.env.PSA_SECRET_KEY = "short";
    expect(psaSecretKeyConfigured()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(/PSA_SECRET_KEY/);
  });
});
