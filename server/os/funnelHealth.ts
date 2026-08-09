import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { COMPANY_ID } from './version'
import { recordIncident } from './cleanDays'

// PS-FUNNEL-HEALTH-01 — the check that would have caught "269 clicks, 0 signups".
//
// No unit test catches a funnel that DELIVERS and CLICKS but never converts, because nothing in
// the code is broken — the /register CTA pointed logged-out prospects at an org-first login wall
// (fixed in #146/#147). 927 emails, ~269 clicks, 0 signups went unnoticed for weeks. This guard
// measures the live OUTCOME, not code health: emails sent vs. accounts created over a rolling
// window. If we sent real volume and got zero signups, it alerts LOUD and records an incident so
// the clean-day clock goes dirty — a dead funnel is not a clean day.
//
// Columns verified live 2026-08-09: ps_outreach_leads.touch{1,2}_sent_at, .replied/.replied_at;
// organizations."createdAt" (camelCase). Signal is DB-native (no dependency on Resend's API or
// on the agent loop that itself failed to catch this).

const WINDOW_DAYS = 7
// Below this many sends the window is too thin to conclude anything — silence is not a break.
const MIN_SENDS_TO_JUDGE = 50

export type FunnelHealth = {
    measured: boolean
    sent: number
    signups: number
    replies: number
    broken: boolean
    windowDays: number
    detail: string
}

export async function checkFunnelHealth(sqlOverride?: any): Promise<FunnelHealth> {
    const sql = sqlOverride ?? getSql()
    const iv = `${WINDOW_DAYS} days`

  const rows = await sql`
      SELECT
            (SELECT count(*) FROM ps_outreach_leads
                     WHERE touch1_sent_at > now() - ${iv}::interval
                                 OR touch2_sent_at > now() - ${iv}::interval) AS sent,
                                       (SELECT count(*) FROM organizations
                                                WHERE "createdAt" > now() - ${iv}::interval) AS signups,
                                                      (SELECT count(*) FROM ps_outreach_leads
                                                               WHERE replied = true AND replied_at > now() - ${iv}::interval) AS replies
                                                                 `
    const sent = Number(rows[0]?.sent ?? 0)
    const signups = Number(rows[0]?.signups ?? 0)
    const replies = Number(rows[0]?.replies ?? 0)

  const measured = sent >= MIN_SENDS_TO_JUDGE
    // BROKEN = we sent real volume and NOBODY got through. Zero signups AND zero replies over a
  // measured window is the exact signature of the dead-end funnel. (A reply with zero signups is
  // still a soft warning, but not a hard "broken" — a human at least reached us.)
  const broken = measured && signups === 0 && replies === 0

  const detail = !measured
      ? `not measured: ${sent} sends in ${WINDOW_DAYS}d (< ${MIN_SENDS_TO_JUDGE})`
        : broken
        ? `FUNNEL FLATLINE: ${sent} emails sent in ${WINDOW_DAYS}d -> ${signups} signups, ${replies} replies. Post-click conversion is 0. Check the signup path (should be /login?mode=register).`
          : `ok: ${sent} sent, ${signups} signups, ${replies} replies (${WINDOW_DAYS}d)`

  return { measured, sent, signups, replies, broken, windowDays: WINDOW_DAYS, detail }
}

// Called by the daily cron. Alerts + records an incident ONLY on a measured flatline. An
// unmeasured window is silence, not a break — it does not dirty the clean-day clock (the
// 2026-07 lesson: a monitor over zero data must fail closed WITHOUT crying wolf).
export async function runFunnelHealthCheck(sqlOverride?: any): Promise<FunnelHealth> {
    const sql = sqlOverride ?? getSql()
    const h = await checkFunnelHealth(sql)

  if (h.broken) {
        await sendTelegram(
                `\u{1F6A8} <b>PHISHSIM FUNNEL FLATLINE</b>\n` +
                `${h.sent} emails sent in ${h.windowDays}d \u2192 <b>${h.signups} signups</b>, ${h.replies} replies.\n` +
                `People are being emailed but nobody is converting. Verify the signup path is /login?mode=register ` +
                `and that /register + /setup redirect logged-out visitors to it.`
              ).catch(() => {})
        await recordIncident(sql, COMPANY_ID, `funnel flatline: ${h.sent} sent / ${h.signups} signups (${h.windowDays}d)`, 'funnel-health').catch(() => {})
  }

  return h
}
