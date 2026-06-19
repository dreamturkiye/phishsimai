import { getCampaigns, updateCampaign } from "./db";

export async function scheduledCampaignHandler(req: any, res: any) {
  try {
    // SECURITY: CRON_SECRET mandatory — fail closed
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[Cron] FATAL: CRON_SECRET not set. Rejecting request.");
      return res.status(500).json({ error: "Server misconfiguration: CRON_SECRET not set" });
    }
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log(`[Scheduled Campaign] Cron triggered at ${new Date().toISOString()}`);
    return res.json({ success: true, triggeredAt: new Date().toISOString() });
  } catch (err: any) {
    console.error("[Scheduled Campaign] Error:", err);
    return res.status(500).json({ error: err?.message ?? "Internal error" });
  }
}
