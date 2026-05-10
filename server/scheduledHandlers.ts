import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getCampaignByTaskUid, updateCampaign } from "./db";

/**
 * POST /api/scheduled/campaign
 * Heartbeat handler for recurring phishing campaigns.
 * The platform POSTs here on the configured cron schedule.
 */
export async function scheduledCampaignHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "Forbidden: cron only" });
    }

    const taskUid = user.taskUid;
    if (!taskUid) {
      return res.status(400).json({ error: "Missing taskUid" });
    }

    const campaign = await getCampaignByTaskUid(taskUid);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found for taskUid" });
    }

    // Mark campaign as active for this run
    await updateCampaign(campaign.id, campaign.orgId, {
      status: "active",
    });

    // In a real deployment, this is where you would:
    // 1. Resolve all target emails from campaign.targetIds / campaign.targetDepartmentIds
    // 2. Send phishing simulation emails via your email provider
    // 3. Create campaign_results rows with tracking tokens
    // 4. Mark status back to "scheduled" when done
    //
    // For this simulation platform, we log the trigger and keep status active.
    console.log(`[Scheduled Campaign] Triggered campaign ${campaign.id}: "${campaign.name}" (org ${campaign.orgId})`);

    return res.json({
      success: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
      triggeredAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Scheduled Campaign] Error:", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
