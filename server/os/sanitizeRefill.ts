// PS-REFILL-01 (2026-07-21) — daily auto-refill of the sendable pool. PS-REFILL-02: pull-until-cap.
//
// THE GAP this closes: the l4-era pipeline sanitized the sendable pool EXACTLY ONCE, via a manual
// one-off script (the untracked `_import.mts`), and was never wired to a cron. Nothing in the repo
// writes `sanitized_at` — so as the daily send drew the pool down it depleted and never topped up.
// This module is the missing step, scheduled BEFORE the 0 7 send.
//
// It tops the sendable pool up to the daily cap by AMF-verifying candidates from the raw pool and
// promoting ONLY explicitly-valid ones (AMF `valid_emails` + live MX; catchall/role/unknown never
// promoted). Fail-closed: no AMF key => promote nothing.
//
// PS-REFILL-02 — pull-until-cap-met: it does NOT stop at a fixed batch. It keeps pulling fresh
// candidates and verifying until it has enough VALID to fill the cap, bounded only by (a) the pool,
// (b) a per-run lookup ceiling, and (c) the function time budget. Every candidate it checks is
// stamped `refill_checked_at` (valid or not) so the NEXT run skips it and progresses through the
// pool instead of re-verifying the same dead domains forever. AMF charges only on a hit (a miss is
// free), so the credit cost ≈ the number promoted, not the number checked.
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { hasMx, domainOf } from './mxGate'
import { dailySendCap } from './sequences'
import { sendTelegram } from './telegram'

const GEO = ['US', 'GB', 'AU'] as const
const MAX_LOOKUPS_PER_RUN = 500 // sane spend/volume ceiling — verify at most this many candidates/run
const CONCURRENCY = 10 // parallel AMF+MX lookups, to fit the function budget
const TIME_BUDGET_MS = 240_000 // stop launching new lookups after 4 min (buffer under the 300s limit)

// One-time additive column: tracks which raw-pool leads the refill has already AMF-checked, so a run
// resumes where the last one stopped rather than re-verifying rejected candidates. Idempotent.
async function ensureRefillColumn(sql: any): Promise<void> {
  try {
    await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS refill_checked_at TIMESTAMPTZ`
  } catch {
    /* best-effort */
  }
}

// AMF: find an explicitly-VALID personal email for a domain. valid-only — returns null unless AMF
// puts an address in `valid_emails`. 404 = no valid email (a free miss); non-ok = vendor failure
// (skip, never treat as a miss). Its own 20s abort so one slow lookup can't stall the batch.
async function amfValidEmail(domain: string): Promise<string | null> {
  const key = process.env.ANYMAILFINDER_API_KEY?.trim()
  if (!key) return null
  try {
    const res = await fetch('https://api.anymailfinder.com/v5.1/find-email/company', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, email_type: 'personal' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      console.error(`[refill/amf] ${domain} status=${res.status} — vendor failure, not a miss`)
      return null
    }
    const d = JSON.parse((await res.text()) || '{}') as { valid_emails?: string[] }
    const valid = d.valid_emails?.[0]
    return valid ? String(valid).trim().toLowerCase() : null // ignore the looser `emails` fallback
  } catch (e: any) {
    console.error(`[refill/amf] ${domain} threw: ${String(e?.message || e).slice(0, 140)}`)
    return null
  }
}

export interface RefillResult {
  cap: number
  sendableBefore: number
  needed: number
  checked: number
  promoted: number
  promotedLeads: Array<{ id: string; email: string; domain: string }>
  reason: string
}

// Top the sendable pool up to `cap`. Pulls-until-cap-met (not a fixed batch), bounded by pool size,
// the per-run lookup ceiling, and the time budget. Idempotent when already at/above cap.
export async function refillSendablePool(sqlOverride?: any, now: Date = new Date()): Promise<RefillResult> {
  const sql = sqlOverride ?? getSql()
  await ensureRefillColumn(sql)
  const cap = dailySendCap(now)
  const before = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads
     WHERE sanitized_at IS NOT NULL AND touch1_sent_at IS NULL AND country = ANY(${GEO})
       AND bounced = false AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')`) as Array<{ n: number }>
  const sendableBefore = Number(before[0]?.n ?? 0)
  const needed = Math.max(0, cap - sendableBefore)
  const base = { cap, sendableBefore, needed, checked: 0, promoted: 0, promotedLeads: [] as RefillResult['promotedLeads'] }

  if (needed === 0) return { ...base, reason: 'pool already at cap — no refill needed' }
  if (!process.env.ANYMAILFINDER_API_KEY?.trim()) {
    return { ...base, reason: 'ANYMAILFINDER_API_KEY unset — verification disabled, promoted 0 (fail closed)' }
  }

  // Fresh, not-yet-refill-checked candidates from the raw pool. Ordered oldest-first; capped at the
  // per-run lookup ceiling. refill_checked_at excludes anything a prior run already rejected.
  const candidates = (await sql`SELECT id, email FROM ps_outreach_leads
     WHERE sanitized_at IS NULL AND refill_checked_at IS NULL AND touch1_sent_at IS NULL
       AND country = ANY(${GEO}) AND bounced = false AND unsubscribed = false
       AND pipeline_stage NOT IN ('dead','customer')
     ORDER BY created_at ASC LIMIT ${MAX_LOOKUPS_PER_RUN}`) as Array<{ id: string; email: string }>

  const started = Date.now()
  let idx = 0
  let checked = 0
  let promoted = 0
  let timedOut = false
  const promotedLeads: RefillResult['promotedLeads'] = []

  async function worker(): Promise<void> {
    while (true) {
      if (promoted >= needed) return // cap met
      if (Date.now() - started >= TIME_BUDGET_MS) { timedOut = true; return }
      const i = idx++
      if (i >= candidates.length) return // pool slice exhausted
      const lead = candidates[i]
      checked++
      const domain = domainOf(lead.email)
      // Mark checked regardless of outcome so the next run skips this lead. Valid leads additionally
      // get sanitized_at + the AMF-verified address.
      if (!domain || !(await hasMx(domain))) {
        await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
        continue
      }
      const valid = await amfValidEmail(domain) // valid-only
      if (!valid || promoted >= needed) {
        await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
        continue
      }
      try {
        await sql`UPDATE ps_outreach_leads
           SET email = ${valid}, sanitized_at = now(), sanitize_reason = 'amf_valid', refill_checked_at = now()
           WHERE id = ${lead.id} AND sanitized_at IS NULL`
        promoted++
        promotedLeads.push({ id: String(lead.id), email: valid, domain })
      } catch {
        // unique-email collision / race — mark checked, skip
        await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) || 1 }, () => worker()))

  const reason =
    promoted >= needed
      ? 'refilled to cap'
      : timedOut
        ? `hit ${TIME_BUDGET_MS / 1000}s time budget at ${promoted}/${needed} valid (checked ${checked}) — resumes next run`
        : checked >= MAX_LOOKUPS_PER_RUN
          ? `hit per-run lookup ceiling ${MAX_LOOKUPS_PER_RUN} at ${promoted}/${needed} valid — resumes next run`
          : `raw pool exhausted at ${promoted}/${needed} valid (checked ${checked}) — supply-limited, needs more discovery`
  return { cap, sendableBefore, needed, checked, promoted, promotedLeads, reason }
}

// Cron body. Scheduled BEFORE the 0 7 send. Same secret-gate as the other os crons. Emits ONE
// Telegram line with the outcome. Never throws past a 500.
export async function cronSanitizeRefill(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  const okCron = !!secret && req.headers?.authorization === `Bearer ${secret}`
  const okHq = !!process.env.HQ_SECRET && req.query?.secret === process.env.HQ_SECRET
  if (!okCron && !okHq) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const r = await refillSendablePool(getSql())
    await sendTelegram(
      `🔁 <b>PhishSim pool refill</b> (${COMPANY_ID})\n` +
        `cap ${r.cap} · sendable ${r.sendableBefore}→${r.sendableBefore + r.promoted} · promoted ${r.promoted}/${r.needed} (checked ${r.checked})\n` +
        `${r.reason}`,
    ).catch(() => {})
    return res.json({ ok: true, ...r })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
