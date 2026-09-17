// PS-NUDGE-01: daily trial-conversion nudges. The trial (PS-TRIAL-01) is real now, but a trial
// that dies silently converts nobody — sendTrialDay7/12/14 existed only as dead code until this
// wired them to a cron. Runs daily, finds orgs mid-trial, picks the right nudge by days-left,
// pulls REAL account numbers, and sends once (idempotent).
import { getSql } from "./conn";
import { sendTelegram } from "./telegram";
import { sendTrialDay14, sendTrialDay25, sendTrialDay30, type TrialStats } from "../email/janet";
import { isNonCustomerOrg, measureTrueOrgCounts } from "./trueTrials";
import { isPaidConversionCrisis } from "./cgoMandate";
import { runTrialActivationNudges, runCrisisActivationNudges, hoursSinceLastTrialNudge, ORG_LIFECYCLE_MIN_HOURS, type ActivationNudgeResult } from "./trialActivation";

export const GREY_BOX_ORG_NAME = "Grey Box Consulting";
export const GREY_BOX_ORG_IDS = [11] as const;
export const GREY_BOX_CRISIS_NUDGE_HOURS = 24;
export const GREY_BOX_CRISIS_NUDGE_MEMORY = "greybox_crisis_nudge_at";
export const GREY_BOX_CRISIS_NUDGE_DAY = 181;

export function isGreyBoxOrg(name?: string | null, orgId?: number | null): boolean {
  if (orgId != null && GREY_BOX_ORG_IDS.some((id) => id === Number(orgId))) return true;
  const n = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return /\bgrey\s*box\b/.test(n) || n.replace(/\s+/g, "").includes("greybox");
}

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
export function nudgeFor(daysLeft: number): 14 | 18 | 25 | 30 | null {
  if (daysLeft <= 0) return 30;
  if (daysLeft <= 6) return 25;
  // D18: mid-trial upgrade using existing D25 checkout copy. Grey Box at ~10 days left
  // was sitting in the D14-already-sent / wait-for-D25 gap.
  if (daysLeft <= 12) return 18;
  if (daysLeft <= 20) return 14;
  return null; // first ~10 days of the trial
}

export async function runTrialNudges(sqlOverride?: any): Promise<{ scanned: number; sent: Array<{ orgId: number; nudge: number }>; greyBox: GreyBoxPaidNudgeResult | null; activation: ActivationNudgeResult | null; crisisActivation: ActivationNudgeResult | null }> {
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
  let scanned = 0;
  for (const org of orgs) {
    if (isNonCustomerOrg({ name: org.name, adminEmail: org.admin_email, orgId: org.id })) continue;
    scanned++;
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
        : nudge === 25 || nudge === 18 ? await sendTrialDay25(org.admin_email, org.name, stats, Math.max(1, daysLeft))
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
  // Unused TRUE trials: one-shot day-4 then 48h crisis activation BEFORE another Grey Box D25,
  // so idle orgs get the 3-click launch loop first. 24h org throttle then interleaves 181.
  const activation = await runTrialActivationNudges(sql).catch(() => null);
  if (activation?.sent?.length) {
    for (const s of activation.sent) sent.push(s);
  }
  const crisisActivation = await runCrisisActivationNudges(sql).catch(() => null);
  if (crisisActivation?.sent?.length) {
    for (const s of crisisActivation.sent) sent.push(s);
  }
  // Live 2026-09-14: scanned:2 sent:0 because D18 was already claimed and the crisis D25
  // loop was not on this cron. Always attempt Grey Box paid nudge from THIS function so
  // /api/os/trial-nudges actually sends while D18 sits claimed. Shared 24h org throttle
  // skips 181 when activation just sent.
  const greyBox = await runGreyBoxPaidNudge(sql).catch((e: any) => ({
    attempted: false, sent: false, reason: String(e?.message || e).slice(0, 160),
  } as GreyBoxPaidNudgeResult));
  if (greyBox.sent && greyBox.orgId != null) {
    sent.push({ orgId: greyBox.orgId, nudge: GREY_BOX_CRISIS_NUDGE_DAY });
  }
  return { scanned, sent, greyBox, activation, crisisActivation };
}

export type GreyBoxPaidNudgeResult = {
  attempted: boolean
  sent: boolean
  orgId?: number
  daysLeft?: number
  reason: string
}

/**
 * Personalized Grey Box → paid loop. Dual-crisis ticks re-send the existing D25
 * checkout copy every 24h even after D18 is claimed, so the only TRUE trial is
 * not left in a one-and-done nudge. No invented copy. Canary/test still excluded.
 */
export async function runGreyBoxPaidNudge(sqlOverride?: any): Promise<GreyBoxPaidNudgeResult> {
  const sql = sqlOverride ?? getSql();
  await sql`CREATE TABLE IF NOT EXISTS trial_nudges_sent (
    org_id INTEGER NOT NULL, nudge_day INTEGER NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, nudge_day))`.catch(() => {});

  let payingCrisis = true;
  try {
    const counts = await measureTrueOrgCounts(sql);
    payingCrisis = isPaidConversionCrisis({
      liveProductTrials: counts.trueLiveTrials,
      crmTrials: 0,
      payingCustomers: counts.truePaying,
    });
  } catch {
    payingCrisis = true;
  }
  if (!payingCrisis) {
    return { attempted: false, sent: false, reason: 'paying crisis not active — no extra Grey Box nudge' };
  }

  const orgs = (await sql`
    SELECT o.id, o.name, o."planExpiresAt",
      (SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
       WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
       ORDER BY m.id ASC LIMIT 1) AS admin_email
    FROM organizations o
    WHERE o.plan = 'free' AND o."planExpiresAt" IS NOT NULL AND o."planExpiresAt" > NOW()
      AND (
        o.id = ${GREY_BOX_ORG_IDS[0]}
        OR lower(o.name) LIKE '%grey%box%'
        OR lower(replace(o.name, ' ', '')) LIKE '%greybox%'
      )
    ORDER BY CASE WHEN o.id = ${GREY_BOX_ORG_IDS[0]} THEN 0 ELSE 1 END, o.id ASC
    LIMIT 1`) as Array<{ id: number; name: string; planExpiresAt: string; admin_email: string | null }>;

  const org = orgs[0];
  if (!org) return { attempted: false, sent: false, reason: 'Grey Box Consulting not a live TRUE trial org' };
  if (isNonCustomerOrg({ name: org.name, adminEmail: org.admin_email, orgId: org.id })) {
    return { attempted: false, sent: false, reason: 'Grey Box matched non-customer exclusion — refusing' };
  }
  if (!org.admin_email) return { attempted: false, sent: false, reason: 'Grey Box has no admin email' };

  const lastAnyH = await hoursSinceLastTrialNudge(sql, org.id).catch(() => null)
  if (lastAnyH != null && lastAnyH < ORG_LIFECYCLE_MIN_HOURS) {
    return {
      attempted: false, sent: false, orgId: org.id,
      reason: `Grey Box lifecycle throttle (${Math.round(lastAnyH)}h/${ORG_LIFECYCLE_MIN_HOURS}h) — activation loop may own unused orgs`,
    }
  }

  const last = (await sql`
    SELECT sent_at FROM trial_nudges_sent
    WHERE org_id = ${org.id} AND nudge_day = ${GREY_BOX_CRISIS_NUDGE_DAY}
    LIMIT 1
  `.catch(() => [])) as Array<{ sent_at: string }>;
  if (last[0]?.sent_at) {
    const ageH = (Date.now() - new Date(last[0].sent_at).getTime()) / 3_600_000;
    if (ageH < GREY_BOX_CRISIS_NUDGE_HOURS) {
      return {
        attempted: false, sent: false, orgId: org.id,
        reason: `Grey Box crisis nudge cooling down (${Math.round(ageH)}h/${GREY_BOX_CRISIS_NUDGE_HOURS}h)`,
      };
    }
  }

  const daysLeft = Math.ceil((new Date(org.planExpiresAt).getTime() - Date.now()) / DAY_MS);
  const row = (await sql`SELECT
    count(*) FILTER (WHERE "emailSentAt" IS NOT NULL)::int AS sent,
    count(*) FILTER (WHERE "emailOpenedAt" IS NOT NULL)::int AS opened,
    count(*) FILTER (WHERE "linkClickedAt" IS NOT NULL)::int AS clicked,
    count(*) FILTER (WHERE "reportedAt" IS NOT NULL)::int AS reported
    FROM campaign_results WHERE "orgId" = ${org.id}`) as Array<TrialStats>;
  const stats: TrialStats = row[0] ?? { sent: 0, opened: 0, clicked: 0, reported: 0 };

  try {
    const ok = await sendTrialDay25(org.admin_email, org.name, stats, Math.max(1, daysLeft));
    if (!ok) return { attempted: true, sent: false, orgId: org.id, daysLeft, reason: 'D25 checkout send returned false' };
    await sql`
      INSERT INTO trial_nudges_sent (org_id, nudge_day, sent_at)
      VALUES (${org.id}, ${GREY_BOX_CRISIS_NUDGE_DAY}, NOW())
      ON CONFLICT (org_id, nudge_day) DO UPDATE SET sent_at = NOW()
    `.catch(() => {});
    await sendTelegram(`✉️ Grey Box paid nudge (existing D25 checkout) — org ${org.id}, ${daysLeft}d left`).catch(() => {});
    return { attempted: true, sent: true, orgId: org.id, daysLeft, reason: 'sent existing D25 checkout copy to Grey Box' };
  } catch (e: any) {
    return { attempted: true, sent: false, orgId: org.id, daysLeft, reason: String(e?.message || e).slice(0, 160) };
  }
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
    return res.json({ ok: true, scanned: r.scanned, sent: r.sent, greyBox: r.greyBox, activation: r.activation, crisisActivation: r.crisisActivation });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
