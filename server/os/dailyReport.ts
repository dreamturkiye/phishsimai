import { Request, Response } from 'express'
import { getSql } from './conn'
import { sendTelegram } from './telegram'

/**
 * PS-DIGEST-01 — daily signup digest to Telegram. 21:00 UTC.
 *
 * HEADER AUTH ONLY. Vercel cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically, so this needs no query-string secret — and deliberately does
 * not accept one. A `?secret=` lands in Vercel's request logs on every
 * scheduled run.
 *
 * This does NOT use okCronOrHq. That helper is shared by eight existing crons;
 * changing it to satisfy one new endpoint would put all of them at risk.
 * Retiring the query-string path there is a separate, deliberate pass.
 *
 * Unauthenticated callers get 404, not 401 — the route does not confirm its
 * own existence.
 *
 * Column naming note: PhishSim's schema is camelCase ("createdAt"), NOT
 * snake_case. Unquoted identifiers fold to lowercase in Postgres, so the
 * quotes are load-bearing — `created_at` fails outright on this database.
 */
function authorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const header = req.headers['authorization']
  return typeof header === 'string' && header === 'Bearer ' + cronSecret
}

export async function cronDailyReport(req: Request, res: Response) {
  if (!authorized(req)) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const sql = getSql()
  try {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE)                      AS today,
        COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE - INTERVAL '1 day'
                           AND "createdAt" <  CURRENT_DATE)                      AS yesterday,
        COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_DATE - INTERVAL '7 days')  AS last_7d,
        COUNT(*)                                                                 AS total
      FROM organizations
    `
    const s: any = rows[0] || {}

    // Paid plans — its own try/catch so a schema difference degrades ONE line
    // rather than losing the whole digest.
    let paid: number | null = null
    try {
      const p = await sql`
        SELECT COUNT(*) AS n FROM organizations WHERE COALESCE(plan, 'free') <> 'free'
      `
      paid = Number((p[0] as any)?.n ?? 0)
    } catch {
      paid = null
    }

    // Seats, same treatment.
    let members: number | null = null
    try {
      const m = await sql`SELECT COUNT(*) AS n FROM org_members`
      members = Number((m[0] as any)?.n ?? 0)
    } catch {
      members = null
    }

    const lines = [
      '🎣 *PhishSim — daily*',
      `Orgs signed up today: ${s.today ?? 0}`,
      `Yesterday: ${s.yesterday ?? 0}`,
      `Last 7d: ${s.last_7d ?? 0}`,
      `Total orgs: ${s.total ?? 0}`,
      paid !== null ? `Paid orgs: ${paid}` : null,
      members !== null ? `Members: ${members}` : null,
      '_Visitors: not tracked — @vercel/analytics not installed._',
    ].filter(Boolean) as string[]

    await sendTelegram(lines.join('\n'))

    res.json({
      ok: true,
      today: Number(s.today ?? 0),
      yesterday: Number(s.yesterday ?? 0),
      last_7d: Number(s.last_7d ?? 0),
      total: Number(s.total ?? 0),
      paid,
      members,
    })
  } catch (e: any) {
    // Announce the failure. A digest that silently stops arriving is
    // indistinguishable from a quiet day, and that hides for weeks.
    await sendTelegram(
      `⚠️ PhishSim daily report failed: ${String(e?.message).slice(0, 160)}`,
    ).catch(() => {})
    res.status(500).json({ ok: false, error: String(e?.message).slice(0, 200) })
  }
}
