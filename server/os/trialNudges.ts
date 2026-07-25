// PS-NUDGE-01: daily trial-conversion nudges. The trial (PS-TRIAL-01) is real now, but a trial
// that dies silently converts nobody — sendTrialDay7/12/14 existed only as dead code until this
// wired them to a cron. Runs daily, finds orgs mid-trial, picks the right nudge by days-left,
// pulls REAL account numbers, and sends once (idempotent).
import { getSql } from "./conn";
import { sendTelegram } from "./telegram";
import { sendTrialDay14, sendTrialDay25, sendTrialDay30, type TrialStats } from "../email/janet";

const DAY_MS = 86_400_000;

// Windows (not exact equality) so a missed cron day or a send failure is still caught the next day;
// the idempotency table guarantees each nudge goes exactly once. Most-urgent-first.
//
// PS-TRIAL-30-01: re-spaced from D7/D12/D14 to D14/D25/D30 for the 30-day trial. The three beats
// are unchanged in PURPOSE, only in timing:
//   • D14 (~16 days left) — value recap at the natural mid-point, once a first campaign cycle has
//     had time to complete. Firing this at day 7 of 30 would recap an empty account.
//   • D25 (~5 days left)  — loss-anchored urgency, the "near expiry" beat.
//   • D30 (expired)       — post-expiry recovery. Keyed to daysLeft <= 0 and NOT to day 29: its
//     copy says the trial "has ended" and the account is on the free plan, which is only true
//     once the gate has actually dropped. Sending it a day early would be a false statement.
export function nudgeFor(daysLeft: number): 14 | 25 | 30 | null {
  if (daysLeft <= 0) return 30;
  if (daysLeft <= 6) return 25;
  if (daysLeft <= 17) return 14;
  return null; // days 1–12 of the trial: too early to nudge
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
      const ok = nudge === 14 ? await sendTrialDay14(org.admin_email, org.name, stats)
        : nudge === 25 ? await sendTrialDay25(org.admin_email, org.name, stats, Math.max(1, daysLeft))
          : await sendTrialDay30(org.admin_email, org.name);
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
