import { getCampaigns, updateCampaign } from "./db";

/**
 * POST /api/scheduled/campaign
 * Vercel Cron handler for recurring phishing campaigns.
 * Vercel calls this endpoint on the schedule defined in vercel.json.
 * Protected by the CRON_SECRET environment variable (set in Vercel).
 */
export async function scheduledCampaignHandler(req: any, res: any) {
  try {
    // Verify Vercel Cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // Get all scheduled campaigns across all orgs
    // In a full implementation, query campaigns with status='scheduled' and isRecurring=true
    // For now, log the trigger
    console.log(`[Scheduled Campaign] Cron triggered at ${new Date().toISOString()}`);

    return res.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      message: "Cron handler executed successfully",
    });
  } catch (err: any) {
    console.error("[Scheduled Campaign] Error:", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
