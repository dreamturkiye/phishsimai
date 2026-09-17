// PS-ACTIVATE-01: unused TRUE-trial activation. Separate from D14/D18/D25/D30 billing.
// Vera no_campaign_14d: send the 3-click first-campaign path; offer to run the first one.
// Day-4 is one-shot; standing crisis re-sends the same copy on 182/183/184 at 48h.
// Not a warm-CTA blast — do not reopen 90/91/92 or add a fourth warm touch.
import { getSql } from "./conn";
import { sendTelegram } from "./telegram";
import { sendTrialActivation } from "../email/janet";
import { isNonCustomerOrg, measureTrueOrgCounts } from "./trueTrials";
import { isOperatingCrisis } from "./cgoMandate";

export const ACTIVATION_NUDGE_DAY = 4;
export const ACTIVATION_MIN_AGE_DAYS = 3;
export const ACTIVATION_BATCH_CAP = 5;
/** Crisis re-sends of the same 3-click copy. Distinct from billing 14/18/25/30/181. */
export const ACTIVATION_CRISIS_NUDGE_DAYS = [182, 183, 184] as const;
export const ACTIVATION_CRISIS_HOURS = 48;
export const ORG_LIFECYCLE_MIN_HOURS = 24;

const DAY_MS = 86_400_000;
const ACTIVATION_FAMILY = new Set<number>([ACTIVATION_NUDGE_DAY, ...ACTIVATION_CRISIS_NUDGE_DAYS]);

export type ActivationOrg = {
  id: number
  name: string
  adminEmail?: string | null
  admin_email?: string | null
  campaignCount?: number
  campaign_count?: number
  createdAt: string
  planActivatedAt?: string | null
  planExpiresAt: string | null
}

export type ActivationSend = (to: string, orgName: string) => Promise<boolean>

export type ActivationNudgeResult = {
  scanned: number
  sent: Array<{ orgId: number; nudge: number }>
  skipped: number
}

function adminEmailOf(org: ActivationOrg): string | null {
  return org.adminEmail ?? org.admin_email ?? null
}

function campaignCountOf(org: ActivationOrg): number {
  return Number(org.campaignCount ?? org.campaign_count ?? 0)
}

export function activationStartAt(org: { createdAt: string; planActivatedAt?: string | null }): Date {
  if (org.planActivatedAt) return new Date(org.planActivatedAt)
  return new Date(org.createdAt)
}

/** Live TRUE unused trial, ≥3 days old. No upper age — Grey Box at ~day 23 still qualifies once. */
export function isActivationEligible(org: ActivationOrg, now = new Date()): boolean {
  const email = adminEmailOf(org)
  if (isNonCustomerOrg({ name: org.name, adminEmail: email, orgId: org.id })) return false
  if (!email) return false
  if (campaignCountOf(org) > 0) return false
  if (!org.planExpiresAt || new Date(org.planExpiresAt).getTime() <= now.getTime()) return false
  const ageDays = (now.getTime() - activationStartAt(org).getTime()) / DAY_MS
  return ageDays >= ACTIVATION_MIN_AGE_DAYS
}

export function selectActivationCandidates(orgs: ActivationOrg[], now = new Date(), cap = ACTIVATION_BATCH_CAP): ActivationOrg[] {
  const limit = Math.max(0, Math.min(ACTIVATION_BATCH_CAP, Math.floor(Number(cap) || 0) || ACTIVATION_BATCH_CAP))
  return orgs.filter((o) => isActivationEligible(o, now)).slice(0, limit)
}

export function nextCrisisActivationDay(claimedDays: Iterable<number>): number | null {
  const set = new Set([...claimedDays].map(Number))
  for (const d of ACTIVATION_CRISIS_NUDGE_DAYS) {
    if (!set.has(d)) return d
  }
  return null
}

function sqlRows(result: unknown): any[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object' && Array.isArray((result as any).rows)) return (result as any).rows
  return []
}

export function hoursSince(sentAt: string | Date | null | undefined, now = new Date()): number | null {
  if (!sentAt) return null
  const t = new Date(sentAt).getTime()
  if (!Number.isFinite(t)) return null
  return (now.getTime() - t) / 3_600_000
}

export async function hoursSinceLastTrialNudge(sql: any, orgId: number, now = new Date()): Promise<number | null> {
  const rows = sqlRows(await sql`
    SELECT max(sent_at) AS t FROM trial_nudges_sent WHERE org_id = ${orgId}
  `.catch(() => []))
  return hoursSince(rows[0]?.t, now)
}

export function shouldSendCrisisActivation(opts: {
  lastAnyNudgeHours: number | null
  lastActivationHours: number | null
  claimedActivationDays: Iterable<number>
  orgLifecycleMinHours?: number
  crisisHours?: number
}): { send: boolean; day: number | null; reason: string } {
  const minH = opts.orgLifecycleMinHours ?? ORG_LIFECYCLE_MIN_HOURS
  const crisisH = opts.crisisHours ?? ACTIVATION_CRISIS_HOURS
  const day = nextCrisisActivationDay(opts.claimedActivationDays)
  if (day == null) return { send: false, day: null, reason: 'activation crisis loop exhausted (3 sends)' }
  if (opts.lastAnyNudgeHours != null && opts.lastAnyNudgeHours < minH) {
    return { send: false, day, reason: `org lifecycle throttle (${Math.round(opts.lastAnyNudgeHours)}h/${minH}h)` }
  }
  if (opts.lastActivationHours != null && opts.lastActivationHours < crisisH) {
    return { send: false, day, reason: `activation cooling down (${Math.round(opts.lastActivationHours)}h/${crisisH}h)` }
  }
  return { send: true, day, reason: 'due' }
}

export async function runTrialActivationNudges(
  sqlOverride?: any,
  opts?: { now?: Date; send?: ActivationSend; cap?: number },
): Promise<ActivationNudgeResult> {
  const sql = sqlOverride ?? getSql()
  const now = opts?.now ?? new Date()
  const send = opts?.send ?? sendTrialActivation
  const cap = opts?.cap ?? ACTIVATION_BATCH_CAP

  await sql`CREATE TABLE IF NOT EXISTS trial_nudges_sent (
    org_id INTEGER NOT NULL, nudge_day INTEGER NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, nudge_day))`.catch(() => {})

  const orgs = (await sql`
    SELECT o.id, o.name, o."createdAt", o."planActivatedAt", o."planExpiresAt",
      (SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
       WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
       ORDER BY m.id ASC LIMIT 1) AS admin_email,
      (SELECT count(*)::int FROM campaigns c WHERE c."orgId" = o.id) AS campaign_count
    FROM organizations o
    WHERE o.plan = 'free' AND o."planExpiresAt" IS NOT NULL AND o."planExpiresAt" > NOW()
      AND COALESCE(o."planActivatedAt", o."createdAt") <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c."orgId" = o.id)
  `) as ActivationOrg[]

  const sent: Array<{ orgId: number; nudge: number }> = []
  const candidates = selectActivationCandidates(orgs, now, cap)
  let skipped = orgs.length - candidates.length
  for (const org of candidates) {
    const email = adminEmailOf(org)
    if (!email) { skipped++; continue }

    const claim = (await sql`INSERT INTO trial_nudges_sent (org_id, nudge_day) VALUES (${org.id}, ${ACTIVATION_NUDGE_DAY})
      ON CONFLICT (org_id, nudge_day) DO NOTHING RETURNING org_id`) as Array<{ org_id: number }>
    if (claim.length === 0) { skipped++; continue }

    try {
      const ok = await send(email, org.name)
      if (ok) sent.push({ orgId: org.id, nudge: ACTIVATION_NUDGE_DAY })
      else {
        await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${ACTIVATION_NUDGE_DAY}`.catch(() => {})
        skipped++
      }
    } catch {
      await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${ACTIVATION_NUDGE_DAY}`.catch(() => {})
      skipped++
    }
  }
  return { scanned: orgs.length, sent, skipped }
}

export async function runCrisisActivationNudges(
  sqlOverride?: any,
  opts?: { now?: Date; send?: ActivationSend; cap?: number },
): Promise<ActivationNudgeResult> {
  const sql = sqlOverride ?? getSql()
  const now = opts?.now ?? new Date()
  const send = opts?.send ?? sendTrialActivation
  const cap = opts?.cap ?? ACTIVATION_BATCH_CAP

  await sql`CREATE TABLE IF NOT EXISTS trial_nudges_sent (
    org_id INTEGER NOT NULL, nudge_day INTEGER NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, nudge_day))`.catch(() => {})

  let crisis = true
  try {
    const counts = await measureTrueOrgCounts(sql)
    crisis = isOperatingCrisis({
      liveProductTrials: counts.trueLiveTrials,
      crmTrials: 0,
      payingCustomers: counts.truePaying,
    })
  } catch {
    crisis = true
  }
  if (!crisis) return { scanned: 0, sent: [], skipped: 0 }

  const orgs = (await sql`
    SELECT o.id, o.name, o."createdAt", o."planActivatedAt", o."planExpiresAt",
      (SELECT u.email FROM org_members m JOIN users u ON u.id = m."userId"
       WHERE m."orgId" = o.id AND m.role = 'admin' AND u.email IS NOT NULL
       ORDER BY m.id ASC LIMIT 1) AS admin_email,
      (SELECT count(*)::int FROM campaigns c WHERE c."orgId" = o.id) AS campaign_count
    FROM organizations o
    WHERE o.plan = 'free' AND o."planExpiresAt" IS NOT NULL AND o."planExpiresAt" > NOW()
      AND COALESCE(o."planActivatedAt", o."createdAt") <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM campaigns c WHERE c."orgId" = o.id)
  `) as ActivationOrg[]

  const sent: Array<{ orgId: number; nudge: number }> = []
  const candidates = selectActivationCandidates(orgs, now, cap)
  let skipped = orgs.length - candidates.length

  for (const org of candidates) {
    const email = adminEmailOf(org)
    if (!email) { skipped++; continue }

    const history = sqlRows(await sql`
      SELECT nudge_day, sent_at FROM trial_nudges_sent WHERE org_id = ${org.id}
    `.catch(() => [])) as Array<{ nudge_day: number; sent_at: string }>
    const claimedActivationDays = history
      .map((r) => Number(r.nudge_day))
      .filter((d) => ACTIVATION_FAMILY.has(d))
    const lastAny = history.reduce<string | null>((acc, r) => {
      if (!acc) return r.sent_at
      return new Date(r.sent_at).getTime() > new Date(acc).getTime() ? r.sent_at : acc
    }, null)
    const lastAct = history
      .filter((r) => ACTIVATION_FAMILY.has(Number(r.nudge_day)))
      .reduce<string | null>((acc, r) => {
        if (!acc) return r.sent_at
        return new Date(r.sent_at).getTime() > new Date(acc).getTime() ? r.sent_at : acc
      }, null)

    const gate = shouldSendCrisisActivation({
      lastAnyNudgeHours: hoursSince(lastAny, now),
      lastActivationHours: hoursSince(lastAct, now),
      claimedActivationDays,
    })
    if (!gate.send || gate.day == null) { skipped++; continue }

    const claim = (await sql`INSERT INTO trial_nudges_sent (org_id, nudge_day) VALUES (${org.id}, ${gate.day})
      ON CONFLICT (org_id, nudge_day) DO NOTHING RETURNING org_id`) as Array<{ org_id: number }>
    if (claim.length === 0) { skipped++; continue }

    try {
      const ok = await send(email, org.name)
      if (ok) sent.push({ orgId: org.id, nudge: gate.day })
      else {
        await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${gate.day}`.catch(() => {})
        skipped++
      }
    } catch {
      await sql`DELETE FROM trial_nudges_sent WHERE org_id = ${org.id} AND nudge_day = ${gate.day}`.catch(() => {})
      skipped++
    }
  }
  return { scanned: orgs.length, sent, skipped }
}

export async function cronTrialActivation(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET
  if (!okCron && !okHq) return res.status(401).json({ error: "Unauthorized" })
  try {
    const r = await runTrialActivationNudges(getSql())
    if (r.sent.length > 0) {
      await sendTelegram(`✉️ <b>PhishSim trial activation</b> — sent ${r.sent.length}: ${r.sent.map((s) => `org ${s.orgId}`).join(", ")}`).catch(() => {})
    }
    return res.json({ ok: true, scanned: r.scanned, sent: r.sent, skipped: r.skipped })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
