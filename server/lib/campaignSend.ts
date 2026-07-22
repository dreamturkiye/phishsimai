// The SINGLE guarded choke point for committing a campaign send.
// Every campaign_results INSERT must flow through here — enforced by
// noSecondCampaignResultsWriter.test.ts. Runs the compliance floor, audits EVERY
// verdict (allow + reject) to audit_log, and creates the row ONLY on allow.
// It sends nothing itself: the row is the enqueue; a send loop (not built) consumes it.
// NOT wired into any live cron.
import { sql } from "drizzle-orm";
import { getDb, getVerifiedDomains, createCampaignResult } from "../db";
import { checkSendAllowed, type SendVerdict } from "./complianceGuard";
import type { Target } from "../../drizzle/schema";

/** Best-effort append to audit_log. A failed audit never changes the compliance verdict. */
async function audit(actor: string, action: string, target: string, detail: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(
      sql`INSERT INTO audit_log (actor, action, target, detail) VALUES (${actor}, ${action}, ${target}, ${JSON.stringify(detail)}::jsonb)`,
    );
  } catch (err) {
    console.warn("[complianceGuard] audit write failed:", (err as Error)?.message);
  }
}

export type EnqueueTarget = Pick<Target, "id" | "orgId" | "email" | "isActive">;

/**
 * Gate one campaign send at the write boundary. Returns the verdict; the row is created
 * only when allowed. `trackingToken` is supplied by the caller so token generation stays
 * with the campaign loop.
 */
export type EnqueueOutcome = SendVerdict & { resultId?: number };

export async function enqueueCampaignSend(
  campaignId: number,
  target: EnqueueTarget,
  trackingToken: string,
): Promise<EnqueueOutcome> {
  const verifiedDomains = await getVerifiedDomains(target.orgId);
  const verdict = checkSendAllowed(target.orgId, target.email, verifiedDomains, {
    targetActive: target.isActive,
  });

  await audit(
    "compliance_guard",
    verdict.allowed ? "send_enqueue_allow" : "send_enqueue_reject",
    `campaign:${campaignId} target:${target.id}`,
    verdict.allowed
      ? { campaignId, targetId: target.id, orgId: target.orgId }
      : { campaignId, targetId: target.id, orgId: target.orgId, reason: verdict.reason, detail: verdict.detail },
  );

  if (!verdict.allowed) return verdict;

  // The insert below writes the 1b delivery columns, so they must exist first. Migrations aren't
  // auto-applied on deploy, so we ensure them at runtime (IF NOT EXISTS) exactly like the refill
  // column — otherwise the first send after deploy would insert into columns that aren't there yet.
  const db = await getDb();
  if (db) await ensureDeliveryColumns(db);

  // The enqueue: the ONLY campaign_results INSERT in the codebase.
  // PS-SEND-01: emailSentAt stays NULL here. This row is the ENQUEUE record — proof the send
  // was authorised, not proof it was delivered. It used to be stamped with now() before the
  // provider had even been called, so a Resend rejection still left a row asserting delivery
  // and getOrgAnalytics counted it as sent. The caller stamps it only on a confirmed send.
  const row = await createCampaignResult({
    campaignId,
    targetId: target.id,
    orgId: target.orgId,
    trackingToken,
    emailSentAt: null,
    emailOpenedAt: null,
    linkClickedAt: null,
    credentialSubmittedAt: null,
    reportedAt: null,
    trainingCompletedAt: null,
    ipAddress: null,
    userAgent: null,
    // 1b delivery-tracking columns — populated later: providerMessageId + emailSentAt at send
    // confirmation, deliveredAt/bouncedAt/complainedAt by the Resend webhook.
    providerMessageId: null,
    deliveredAt: null,
    bouncedAt: null,
    bounceType: null,
    complainedAt: null,
  });

  return { ...verdict, resultId: row.id };
}

/**
 * Stamp emailSentAt once the provider has CONFIRMED acceptance, and store the provider's message
 * id so the delivery webhook (server/email/resendWebhook.ts) can correlate later email.delivered /
 * email.bounced events back to this row. Separate from the enqueue so "a row exists", "it was
 * accepted", and "it was delivered" are three distinct, separately-recorded facts.
 */
export async function markCampaignResultSent(resultId: number, providerMessageId?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureDeliveryColumns(db);
  await db.execute(
    providerMessageId
      ? sql`UPDATE campaign_results SET "emailSentAt" = now(), "providerMessageId" = ${providerMessageId} WHERE id = ${resultId}`
      : sql`UPDATE campaign_results SET "emailSentAt" = now() WHERE id = ${resultId}`,
  );
}

// Idempotent guard so the delivery columns exist even before the 0011 migration is applied — same
// pattern as ensureRefillColumn. Cheap (IF NOT EXISTS) and only touches DDL that's already been
// authored as a migration.
let deliveryColumnsEnsured = false;
export async function ensureDeliveryColumns(db: any): Promise<void> {
  if (deliveryColumnsEnsured) return;
  try {
    await db.execute(sql`ALTER TABLE campaign_results
      ADD COLUMN IF NOT EXISTS "providerMessageId" varchar(128),
      ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "bouncedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "bounceType" varchar(64),
      ADD COLUMN IF NOT EXISTS "complainedAt" timestamptz`);
    deliveryColumnsEnsured = true;
  } catch {
    /* best-effort — the migration is the authoritative path */
  }
}
