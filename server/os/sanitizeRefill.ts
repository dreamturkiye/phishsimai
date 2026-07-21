// PS-REFILL-01 (2026-07-21) — daily auto-refill of the sendable pool.
//
// THE GAP this closes: the l4-era pipeline sanitized the sendable pool EXACTLY ONCE, via a manual
// one-off script (the untracked `_import.mts`), and was never wired to a cron. Nothing in the repo
// writes `sanitized_at` — so as the daily send drew the pool down (75 clean leads, ~20/day) it
// depleted and never topped back up. The discovery (Outscraper) and researcher (AMF) crons ADD/
// enrich raw leads but do NOT promote anything to sendable. This module is the missing step.
//
// It runs BEFORE the 0 7 send and tops the sendable pool up to the daily cap by AMF-verifying
// candidates drawn from the RAW (unsanitized) pool and promoting ONLY explicitly-valid ones:
//   valid-only  = AMF returns the address in `valid_emails` (its confirmed-deliverable list;
//                 a bare `emails` guess or a catchall does NOT qualify)  AND  a live MX record.
// Catchall / role / unknown are NEVER promoted — a lead can only become sendable through a real
// per-domain deliverability check, never by volume. Fail-closed: no AMF key => promote nothing.
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { hasMx, domainOf } from './mxGate'
import { dailySendCap } from './sequences'
import { sendTelegram } from './telegram'

const GEO = ['US', 'GB', 'AU'] as const

// AMF: find an explicitly-VALID personal email for a domain. valid-only — returns null unless AMF
// puts an address in `valid_emails`. 404 = no valid email (a free miss); non-ok = vendor failure
// (skip, never treat as "no email"). Its own 20s abort so one slow lookup can't stall the batch.
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

// Top the sendable pool up to `cap`. Verifies a bounded batch (AMF spend capped at 4× needed, max 60
// lookups/run) from the raw pool and promotes only AMF-valid + live-MX leads. Idempotent when full.
export async function refillSendablePool(sqlOverride?: any, now: Date = new Date()): Promise<RefillResult> {
  const sql = sqlOverride ?? getSql()
  const cap = dailySendCap(now)
  const before = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads
     WHERE sanitized_at IS NOT NULL AND touch1_sent_at IS NULL AND country = ANY(${GEO})
       AND bounced = false AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')`) as Array<{ n: number }>
  const sendableBefore = Number(before[0]?.n ?? 0)
  const needed = Math.max(0, cap - sendableBefore)
  const base = { cap, sendableBefore, needed, checked: 0, promoted: 0, promotedLeads: [] as RefillResult['promotedLeads'] }

  if (needed === 0) return { ...base, reason: 'pool already at cap' }
  if (!process.env.ANYMAILFINDER_API_KEY?.trim()) {
    return { ...base, reason: 'ANYMAILFINDER_API_KEY unset — verification disabled, nothing promoted (fail closed)' }
  }

  const batchLimit = Math.min(needed * 4, 60) // bound the AMF spend per run
  const candidates = (await sql`SELECT id, email FROM ps_outreach_leads
     WHERE sanitized_at IS NULL AND touch1_sent_at IS NULL AND country = ANY(${GEO})
       AND bounced = false AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')
     ORDER BY created_at ASC LIMIT ${batchLimit}`) as Array<{ id: string; email: string }>

  let checked = 0
  let promoted = 0
  const promotedLeads: RefillResult['promotedLeads'] = []
  for (const lead of candidates) {
    if (promoted >= needed) break
    checked++
    const domain = domainOf(lead.email)
    if (!domain) continue
    if (!(await hasMx(domain))) continue // dead / null-MX domain — never promote
    const valid = await amfValidEmail(domain) // valid-only gate
    if (!valid) continue // catchall / unknown / no confirmed-valid — not promoted
    try {
      // Promote using the AMF-confirmed valid address. Guarded on sanitized_at IS NULL so a
      // concurrent run can't double-promote; email is UNIQUE, so a dup throws and we skip.
      await sql`UPDATE ps_outreach_leads
         SET email = ${valid}, sanitized_at = now(), sanitize_reason = 'amf_valid'
         WHERE id = ${lead.id} AND sanitized_at IS NULL`
      promoted++
      promotedLeads.push({ id: String(lead.id), email: valid, domain })
    } catch {
      // unique-email collision or race — skip this lead, do not count it
    }
  }

  return {
    cap, sendableBefore, needed, checked, promoted, promotedLeads,
    reason:
      promoted >= needed
        ? 'refilled to cap'
        : `raw pool yielded only ${promoted}/${needed} AMF-valid in ${checked} checked — supply-limited (raw pool is role/catchall-heavy)`,
  }
}

// Cron body. Scheduled BEFORE the 0 7 send so the pool is topped up in time. Same secret-gate as the
// other os crons. Emits ONE Telegram line with the refill outcome. Never throws past a 500.
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
