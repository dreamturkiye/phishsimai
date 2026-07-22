// PS-NUDGE-01: daily trial-conversion nudges. The trial (PS-TRIAL-01) is real now, but a trial
// that dies silently converts nobody — sendTrialDay7/12/14 existed only as dead code until this
// wired them to a cron. Runs daily, finds orgs mid-trial, picks the right nudge by days-left,
// pulls REAL account numbers, and sends once (idempotent).
import { getSql } from "./conn";
import { sendTelegram } from "./telegram";
import { sendTrialDay7, sendTrialDay12, sendTrialDay14, type TrialStats } from "../email/janet";

const DAY_MS = 86_400_000;

// Windows (not exact equality) so a missed cron day or a send failure is still caught the next day;
// the idempotency table guarantees each nudge goes exactly once. Most-urgent-first.
export function nudgeFor(daysLeft: number): 7 | 12 | 14 | null {
  if (daysLeft <= 0) return 14;
  if (daysLeft <= 3) return 12;
  if (daysLeft <= 8) return 7;
  return null; // days 9–14 of the trial: too early to nudge
}

export async function runTrialNudges(sqlOverride?: any): Promise<{ scanned: number; sent: Array<{ orgId: number; nudge: number }> }> {
  const sql = sqlOverride ?? getSql();
  await sql`CREATE TABLE IF NOT EXISTS trial_nudges_sent (
    org_id INTEGER NOT NULL, nudge_day INTEGER NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, nudge_day))`.catch(() => {});

  // Trialing orgs only: free plan with a trial timer. Grandfathered (NULL expiry) and paid are excluded.
  const orgs = (await sql`
    SELECT o.id, o.name, o."planExpiresAt",
      (SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
       WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
       ORDER BY m.id ASC LIMIT 1) AS admin_email
    FROM organizations o
    WHERE o.plan = 'free' AND o."planExpiresAt" IS NOT NULL`) as Array<{ id: number; name: string; planExpiresAt: string; admin_email: string | null }>;

  const sent: Array<{ orgId: number; nudge: number }> = [];
  for (const org of orgs) {
    const daysLeft = Math.ceil((new Date(org.planExpiresAt).getTime() - Date.now()) / DAY_MS);
    const nudge = nudgeFor(daysLeft);
    if (!nudge || !org.admin_email) continue;

    // Already sent this nudge? (idempotent claim — try to record; if it's a dup, skip.)
    const claim = (await sql`INSERT INTO trial_nudges_sent (org_id, nudge_day) VALUES (${org.id}, ${nudge})
      ON CONFLICT (org_id, nudge_day) DO NOTHING RETURNING org_id`) as Array<{ org_id: number }>;
    if (claim.length === 0) continue;

    const row = (await sql`SELECT
      count(*) FILTER (WHERE "emailSentAt" IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE "emailOpenedAt" IS NOT NULL)::int AS opened,
      count(*) FILTER (WHERE "linkClickedAt" IS NOT NULL)::int AS clicked,
      count(*) FILTER (WHERE "reportedAt" IS NOT NULL)::int AS reported
      FROM campaign_results WHERE "orgId" = ${org.id}`) as Array<TrialStats>;
    const stats: TrialStats = row[0] ?? { sent: 0, opened: 0, clicked: 0, reported: 0 };

    try {
      const ok = nudge === 7 ? await sendTrialDay7(org.admin_email, org.name, stats)
        : nudge === 12 ? await sendTrialDay12(org.admin_email, org.name, stats, Math.max(1, daysLeft))
          : await sendTrialDay14(org.admin_email, org.name);
      if (ok) sent.push({ orgId: org.id, nudge });
      else {
        // Send failed — un-claim so tomorrow's run retries within the window.
        await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${nudge}`.catch(() => {});
      }
    } catch {
      await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${nudge}`.catch(() => {});
    }
  }
  return { scanned: orgs.length, sent };
}

export async function cronTrialNudges(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`;
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET;
  if (!okCron && !okHq) return res.status(401).json({ error: "Unauthorized" });
  try {
    const r = await runTrialNudges(getSql());
    if (r.sent.length > 0) {
      await sendTelegram(`✉️ <b>PhishSim trial nudges</b> — sent ${r.sent.length}: ${r.sent.map(s => `org ${s.orgId} (D${s.nudge})`).join(", ")}`).catch(() => {});
    }
    return res.json({ ok: true, ...r });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
