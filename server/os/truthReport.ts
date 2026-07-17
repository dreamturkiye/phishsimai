/**
 * PS-TRUTH-REPORT-01 — the daily instrument that cannot lie.
 *
 * Three rules, each bought with a real incident:
 *
 *  1. REPORT OUTPUT, NOT STATUS. "The cron ran" is what a curl exiting 0 says; it is what
 *     /api/os/sequence said every day for a week while throwing a 500. "The cron produced
 *     0 rows" is the truth. Every cron below is measured by the table it WRITES INTO, never
 *     by its own return value.
 *
 *  2. UNMEASURABLE IS NOT ZERO. A zero asserts that a measurement happened. `bounced = 0`
 *     meant "nothing ever wrote this column" for weeks while 45 real bounces sat in Resend
 *     and the breaker read perfect health. Anything we cannot measure says NOT MEASURED.
 *     If you cannot see it, say you cannot see it.
 *
 *  3. A SILENT HEALTH REPORT IS THE DISEASE. If this report cannot be built, it must shout.
 *     It must never fail quietly, because a report that no-ops looks exactly like a green day.
 */

import { getSql } from './conn'
import { getSequenceHealth, PAUSE_ON_BOUNCE_RATE } from './sequences'
import { sendTelegram } from './telegram'

/** The endpoint prod is REQUIRED to be on. A local file that says otherwise is the bug, not this. */
export const EXPECTED_DB_ENDPOINT = 'ep-spring-leaf'

const RED = '🔴'
const OK = '🟢'

/** Value we could not measure. Never render this as 0 — see rule 2. */
const NOT_MEASURED = 'NOT MEASURED'

type Line = string

function pct(n: number, d: number): string {
  if (d === 0) return NOT_MEASURED
  return ((n / d) * 100).toFixed(1) + '%'
}

/**
 * Each cron is proven by the rows it produced, not by an HTTP status.
 * table = where this cron's output lands. If max(created_at) is stale, the cron is dead
 * no matter what its last invocation returned.
 */
const CRON_OUTPUT: { cron: string; schedule: string; table: string; col: string }[] = [
  // Measured on the touch timestamps, NOT stage_updated_at: this cron's output is EMAIL SENT.
  // stage_updated_at moves on any row edit (a backfill, a manual quarantine), so it reports
  // green on days nothing was sent. The signal must be the thing the cron exists to produce.
  {
    cron: '/api/os/sequence',
    schedule: '0 7 * * *',
    table: 'ps_outreach_leads',
    col: 'GREATEST(touch1_sent_at, touch2_sent_at, touch3_sent_at, touch4_sent_at)',
  },
  { cron: '/api/os/researcher', schedule: '*/30 * * * *', table: 'lead_research_queue', col: 'created_at' },
  { cron: '/api/os/janet', schedule: '0 8 * * *', table: 'janet_memory', col: 'created_at' },
  { cron: '/api/os/metrics-snapshot', schedule: '0 6 * * *', table: 'metrics_daily', col: 'created_at' },
  { cron: '/api/os/founder-brief', schedule: '0 21 * * *', table: 'founder_briefs', col: 'created_at' },
  { cron: '/api/os/heartbeat', schedule: '0 * * * *', table: 'agent_health', col: 'updated_at' },
  { cron: '/api/os/qa-smoke', schedule: '0 */6 * * *', table: 'qa_runs', col: 'created_at' },
  { cron: '/api/os/escalation-notify', schedule: '*/15 * * * *', table: 'escalations', col: 'created_at' },
  { cron: '/api/os/sarah-social', schedule: '0 10,16 * * *', table: 'os_social_queue', col: 'created_at' },
]

async function lastOutput(sql: ReturnType<typeof getSql>, table: string, col: string): Promise<string> {
  // Identifiers cannot be parameterised; this list is a hardcoded constant above, never user input.
  // count(${col}) counts rows where the OUTPUT SIGNAL is non-null — not every row in the table.
  // count(*) would report a table full of rows this cron never touched as if it produced them.
  const rows = (await sql.query(`SELECT max(${col}) AS t, count(${col}) AS n FROM ${table}`)) as any[]
  const t = rows?.[0]?.t
  const n = Number(rows?.[0]?.n ?? 0)
  if (n === 0) return `${RED} 0 rows — has NEVER produced output`
  if (!t) return `${RED} ${n} rows but no timestamp — ${NOT_MEASURED}`
  const ageH = (Date.now() - new Date(t).getTime()) / 3_600_000
  const stamp = new Date(t).toISOString().slice(0, 16).replace('T', ' ')
  return `${ageH > 26 ? RED : OK} last output ${stamp} (${ageH.toFixed(0)}h ago, ${n} rows)`
}

/**
 * A column is only reportable if something writes it. `replied` is read by the sequence
 * gates but is written by the Resend inbound path; if that never fires, "0 replies" is a
 * lie and this must say NOT MEASURED instead.
 */
async function measurability(sql: ReturnType<typeof getSql>, col: string): Promise<boolean> {
  const rows = (await sql.query(
    `SELECT count(*) AS n FROM ps_outreach_leads WHERE ${col} IS NOT NULL AND ${col}::text NOT IN ('false')`,
  )) as any[]
  return Number(rows?.[0]?.n ?? 0) > 0
}

export async function buildTruthReport(): Promise<string> {
  const sql = getSql()
  const L: Line[] = []
  const today = new Date().toISOString().slice(0, 10)

  // ---- DB: which database did we actually connect to? ----
  const dbRows = (await sql`SELECT current_setting('neon.endpoint_id', true) AS endpoint`) as any[]
  const endpoint = String(dbRows?.[0]?.endpoint ?? 'unknown')
  const dbOk = endpoint.includes(EXPECTED_DB_ENDPOINT)

  L.push(`PHISHSIM — ${today}`)
  L.push('')

  // ---- SENT / DELIVERED / BOUNCED / BREAKER ----
  const health = await getSequenceHealth(sql)
  const sentRows = (await sql`
    SELECT
      count(*) FILTER (WHERE touch1_sent_at::date = CURRENT_DATE) AS t1,
      count(*) FILTER (WHERE touch2_sent_at::date = CURRENT_DATE) AS t2,
      count(*) FILTER (WHERE touch3_sent_at::date = CURRENT_DATE) AS t3,
      count(*) FILTER (WHERE touch4_sent_at::date = CURRENT_DATE) AS t4
    FROM ps_outreach_leads`) as any[]
  const sentToday =
    Number(sentRows[0].t1) + Number(sentRows[0].t2) + Number(sentRows[0].t3) + Number(sentRows[0].t4)

  L.push(`SENT           ${sentToday === 0 ? 'ZERO emails today' : sentToday + ' emails today'}`)
  L.push(
    `BOUNCED        ${health.bounced} of ${health.sent} lifetime (${pct(health.bounced, health.sent)})`,
  )
  L.push(
    `BREAKER        ${health.paused ? RED + ' TRIPPED' : OK + ' armed'} — ${(health.rate * 100).toFixed(1)}% vs ${(PAUSE_ON_BOUNCE_RATE * 100).toFixed(0)}% threshold` +
      (health.paused ? ' — OUTBOUND HALTED' : ''),
  )

  // DELIVERED/OPENED/CLICKED live in Resend, not here. Open+click tracking are disabled on the
  // domain, so they are unknowable for every send to date. Rule 2: say so, do not print 0.
  L.push(`DELIVERED      ${NOT_MEASURED} — not mirrored into this DB (authoritative: Resend API)`)
  L.push(`OPENS/CLICKS   ${RED} ${NOT_MEASURED} — open_tracking + click_tracking DISABLED on domain`)

  const repliesMeasurable = await measurability(sql, 'replied')
  L.push(
    `REPLIES        ${repliesMeasurable ? String((await sql`SELECT count(*) AS n FROM ps_outreach_leads WHERE replied`)[0].n) : RED + ' ' + NOT_MEASURED + ' — nothing has ever written replied'}`,
  )

  // ---- LEADS: real vs fabricated vs unenriched ----
  const q = (await sql`
    SELECT
      count(*) FILTER (WHERE source = 'ai_discovery') AS fabricated,
      count(*) FILTER (WHERE source = 'google_maps') AS real_maps,
      count(*) FILTER (WHERE source NOT IN ('ai_discovery','google_maps')) AS other,
      count(*) FILTER (WHERE status = 'pending') AS unenriched
    FROM lead_research_queue`) as any[]
  const leads = (await sql`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE NOT bounced AND pipeline_stage <> 'dead') AS deliverable
    FROM ps_outreach_leads`) as any[]
  L.push('')
  L.push(
    `QUEUE          ${q[0].real_maps} real (google_maps) / ${RED}${q[0].fabricated} fabricated (ai_discovery)${RED} / ${q[0].other} other · ${q[0].unenriched} unenriched`,
  )
  L.push(
    `LEADS          ${leads[0].deliverable} deliverable of ${leads[0].total} ${Number(leads[0].deliverable) <= 1 ? RED : ''}`,
  )

  // ---- CRONS: proven by output, never by status ----
  L.push('')
  L.push('CRONS (measured by rows produced, not by HTTP 200)')
  for (const c of CRON_OUTPUT) {
    let v: string
    try {
      v = await lastOutput(sql, c.table, c.col)
    } catch (e: any) {
      v = `${RED} CHECK FAILED: ${e?.message?.slice(0, 60)}`
    }
    L.push(`  ${c.cron.padEnd(28)} ${v}`)
  }

  // ---- BACKUP ----
  // PS-BACKUP-127: com.phishsim.backup now records each run into backup_runs. Read the last
  // SUCCESSFUL dump; a table that exists but holds only failures (or nothing) is still RED.
  L.push('')
  try {
    const b = (await sql`SELECT ran_at, size_bytes FROM backup_runs WHERE ok = true ORDER BY ran_at DESC LIMIT 1`) as any[]
    if (b.length === 0) {
      L.push(`BACKUP         ${RED} 0 successful dumps recorded — backup is NOT running`)
    } else {
      const ageH = (Date.now() - new Date(b[0].ran_at).getTime()) / 3_600_000
      const mb = (Number(b[0].size_bytes) / 1_048_576).toFixed(1)
      L.push(
        `BACKUP         ${ageH > 26 ? RED : OK} last dump ${new Date(b[0].ran_at).toISOString().slice(0, 16).replace('T', ' ')} (${ageH.toFixed(0)}h ago, ${mb} MB)`,
      )
    }
  } catch {
    L.push(`BACKUP         ${RED} backup_runs unreadable — ${NOT_MEASURED}`)
  }

  // ---- DB ----
  L.push(
    `DB             ${dbOk ? OK : RED} ${endpoint}${dbOk ? '' : ` — EXPECTED ${EXPECTED_DB_ENDPOINT}, THIS IS THE WRONG DATABASE`}`,
  )

  return L.join('\n')
}

/**
 * Build and send. Rule 3: if the report cannot be built, that failure is itself the alert.
 * Never swallow — a quiet failure here is indistinguishable from a green day.
 */
export async function sendTruthReport(): Promise<{ ok: boolean; report?: string; error?: string }> {
  let report: string
  try {
    report = await buildTruthReport()
  } catch (e: any) {
    const msg = `${RED} PHISHSIM TRUTH REPORT FAILED TO BUILD: ${e?.message ?? String(e)}`
    console.error('[truthReport] build failed', e)
    await sendTelegram(msg)
    return { ok: false, error: e?.message ?? String(e) }
  }
  const sent = await sendTelegram(report)
  if (!sent) {
    // A report nobody receives is the disease this exists to cure.
    console.error('[truthReport] BUILT BUT NOT DELIVERED — telegram credentials unresolved')
    return { ok: false, report, error: 'telegram send returned falsy — credentials unresolved' }
  }
  return { ok: true, report }
}
