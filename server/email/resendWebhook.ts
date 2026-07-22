// 1b — Resend delivery webhooks. This is what lets "sent" mean "delivered".
//
// sendCampaignEmail can only know the provider ACCEPTED a message synchronously; whether it was
// actually delivered, bounced, or suppressed arrives later, asynchronously, as a webhook. This
// endpoint receives those events and writes them onto the matching campaign_results row (matched
// by providerMessageId = the Resend email id we stored at send time).
//
// SECURITY: Resend signs webhooks with Svix. We verify the signature over the RAW body before
// trusting anything — an unverified POST could forge "delivered" for mail that bounced. No svix
// dependency: the scheme is a documented HMAC-SHA256, implemented here with node:crypto. Registered
// BEFORE the JSON body parser (like the Stripe webhook) because signature verification needs the
// exact bytes.
import type { Express, Request, Response } from "express";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { captureServerError } from "../os/sentryServer";

const TOLERANCE_MS = 5 * 60 * 1000; // reject events whose timestamp is older/newer than 5 min

// Verify a Svix signature. Returns true only on an authentic, in-tolerance message.
// signedContent = `${id}.${timestamp}.${rawBody}`; the header carries space-separated `v1,<b64>`
// entries; the secret is `whsec_<base64>`. Any listed signature matching ours passes.
export function verifySvix(raw: Buffer, headers: Record<string, string | undefined>, secret: string, nowMs: number): boolean {
  const id = headers["svix-id"];
  const ts = headers["svix-timestamp"];
  const sigHeader = headers["svix-signature"];
  if (!id || !ts || !sigHeader || !secret) return false;

  const tsNum = Number(ts) * 1000;
  if (!Number.isFinite(tsNum) || Math.abs(nowMs - tsNum) > TOLERANCE_MS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${ts}.${raw.toString("utf8")}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest(); // raw bytes

  // Header form: "v1,<b64> v1,<b64> ...". Compare in constant time against every candidate.
  for (const part of sigHeader.split(" ")) {
    const comma = part.indexOf(",");
    const b64 = comma >= 0 ? part.slice(comma + 1) : part;
    let got: Buffer;
    try { got = Buffer.from(b64, "base64"); } catch { continue; }
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

type ResendEvent = { type?: string; data?: { email_id?: string; bounce?: { type?: string; subType?: string }; reason?: string } };

// Apply one verified event to the matching row. Idempotent: a re-delivered webhook just re-stamps
// the same timestamp. Never throws into the response — a failed write must still 200 so Resend
// doesn't retry-storm, but it IS logged + captured so a silent DB failure can't hide.
export async function applyResendEvent(evt: ResendEvent, nowIso: string): Promise<{ matched: boolean; type: string }> {
  const type = evt.type ?? "unknown";
  const emailId = evt.data?.email_id;
  if (!emailId) return { matched: false, type };
  const db = await getDb();
  if (!db) return { matched: false, type };

  const bounceType = evt.data?.bounce?.type || evt.data?.bounce?.subType || null;
  let q;
  switch (type) {
    case "email.delivered":
      q = sql`UPDATE campaign_results SET "deliveredAt" = COALESCE("deliveredAt", ${nowIso}::timestamptz) WHERE "providerMessageId" = ${emailId}`;
      break;
    case "email.bounced":
      q = sql`UPDATE campaign_results SET "bouncedAt" = COALESCE("bouncedAt", ${nowIso}::timestamptz), "bounceType" = COALESCE("bounceType", ${bounceType}) WHERE "providerMessageId" = ${emailId}`;
      break;
    case "email.complained":
      q = sql`UPDATE campaign_results SET "complainedAt" = COALESCE("complainedAt", ${nowIso}::timestamptz) WHERE "providerMessageId" = ${emailId}`;
      break;
    default:
      // sent / delivery_delayed / opened / clicked etc. — not tracked here (opens/clicks come from
      // our own pixel + redirect so the landing page still works). Acknowledged, not an error.
      return { matched: false, type };
  }

  const res: any = await db.execute(q);
  const matched = Number(res?.rowCount ?? res?.count ?? 0) > 0;
  return { matched, type };
}

export function registerResendWebhook(app: Express): void {
  app.post("/api/webhooks/resend", express.raw({ type: "*/*" }), async (req: Request, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    if (!secret) {
      // Fail closed but loudly: without a secret we cannot trust any event, so we reject rather
      // than silently accept forgeries. This is a config gap, not a runtime error.
      console.error("[resend-webhook] RESEND_WEBHOOK_SECRET unset — rejecting event (cannot verify)");
      return res.status(503).json({ error: "webhook not configured" });
    }
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    const headers = req.headers as Record<string, string | undefined>;
    if (!verifySvix(raw, headers, secret, Date.now())) {
      return res.status(401).json({ error: "invalid signature" });
    }
    try {
      const evt = JSON.parse(raw.toString("utf8")) as ResendEvent;
      const out = await applyResendEvent(evt, new Date().toISOString());
      // Always 200 a verified event so Resend stops retrying; report match state for observability.
      return res.status(200).json({ ok: true, ...out });
    } catch (e) {
      console.error("[resend-webhook] handler error:", e);
      captureServerError(e, { scope: "resendWebhook" });
      return res.status(200).json({ ok: false }); // verified but unprocessable — don't trigger retries
    }
  });
}
