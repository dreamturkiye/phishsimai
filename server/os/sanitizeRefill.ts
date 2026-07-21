// PS-REFILL-01/02/03 (2026-07-21) — daily auto-refill of the sendable pool.
//
// THE GAP this closes: the sendable pool was sanitized ONCE by a manual one-off script and never
// wired to a cron, so it depleted as sends drew it down. This tops it up before the 0 7 send.
//
// PS-REFILL-03 — VERIFY-ONLY, NEVER FIND. Every lead in ps_outreach_leads ALREADY has an email
// (6,127/6,127 populated). AMF's *finder* is for domain-only leads (that path lives in the
// researcher, over lead_research_queue). Running AMF here re-found emails we already had — pure
// wasted spend. This module now VERIFIES the existing address and NEVER calls AMF:
//   • MyEmailVerifier when MYEMAILVERIFIER_API_KEY is set — real per-mailbox check, detects catch-all;
//   • else a free MX check (domain-level) — which CANNOT detect catch-all, so it is OFF unless the
//     operator opts in with REFILL_ALLOW_MX_ONLY=1 (accepting that ~82% of this list is catch-all
//     and MX alone will pass them, risking bounces). SMTP RCPT is not usable — Vercel blocks port 25.
// Fail-closed: no verifier keyed and no opt-in => promote nothing (and never spend a finder credit).
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { hasMx, domainOf } from './mxGate'
import { dailySendCap } from './sequences'
import { sendTelegram } from './telegram'

const GEO = ['US', 'GB', 'AU'] as const
const MAX_LOOKUPS_PER_RUN = 500 // per-run verification ceiling
const CONCURRENCY = 10
const TIME_BUDGET_MS = 240_000

type Verdict = 'valid' | 'catchall' | 'invalid' | 'mx_ok' | 'no_mx' | 'unknown'

// Verify an EXISTING email. NEVER AMF's finder. MyEmailVerifier when keyed (per-mailbox + catch-all
// detection); else a free MX check (domain-level only). Returns a verdict; the caller decides.
async function verifyEmail(email: string): Promise<Verdict> {
  const domain = domainOf(email)
  if (!domain) return 'invalid'
  const key = process.env.MYEMAILVERIFIER_API_KEY?.trim()
  if (key) {
    try {
      const res = await fetch(
        `https://client.myemailverifier.com/verifysingle/${encodeURIComponent(key)}/${encodeURIComponent(email)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) },
      )
      if (res.ok) {
        const body = (await res.text()).toLowerCase()
        if (/catch[\s_-]?all/.test(body)) return 'catchall'
        if (/invalid|undeliverable|does not exist/.test(body)) return 'invalid'
        if (/\bvalid\b|deliverable|\bok\b/.test(body)) return 'valid'
        return 'unknown'
      }
      console.error(`[refill/mev] ${domain} status=${res.status} — vendor failure, not a verdict`)
    } catch (e: any) {
      console.error(`[refill/mev] ${domain} threw: ${String(e?.message || e).slice(0, 120)}`)
    }
    return 'unknown' // keyed but the call failed — don't guess, don't fall back to MX
  }
  // free fallback (no key): MX only — CANNOT detect catch-all.
  return (await hasMx(domain)) ? 'mx_ok' : 'no_mx'
}

export interface RefillResult {
  cap: number
  sendableBefore: number
  needed: number
  checked: number
  promoted: number
  promotedLeads: Array<{ id: string; email: string; verdict: Verdict }>
  reason: string
}

// Top the sendable pool up to `cap` by VERIFYING existing emails (never finding). Pulls-until-cap,
// bounded by the per-run ceiling + time budget. Idempotent when already at/above cap.
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

  const hasVerifier = !!process.env.MYEMAILVERIFIER_API_KEY?.trim()
  const allowMxOnly = process.env.REFILL_ALLOW_MX_ONLY === '1'
  if (!hasVerifier && !allowMxOnly) {
    return {
      ...base,
      reason:
        'no email verifier: set MYEMAILVERIFIER_API_KEY (recommended — detects catch-all), or ' +
        'REFILL_ALLOW_MX_ONLY=1 to promote on MX alone (WARNING: ~82% of this pool is catch-all, ' +
        'MX cannot detect it → bounce risk). Promoted 0. No AMF/finder spend either way.',
    }
  }

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
      if (promoted >= needed) return
      if (Date.now() - started >= TIME_BUDGET_MS) { timedOut = true; return }
      const i = idx++
      if (i >= candidates.length) return
      const lead = candidates[i]
      checked++
      const verdict = await verifyEmail(lead.email) // verify the EXISTING email — never AMF
      const promote = verdict === 'valid' || (verdict === 'mx_ok' && allowMxOnly)
      if (promote && promoted < needed) {
        try {
          // Keep the existing email — we verified it, we did not find a new one. Mark it checked.
          await sql`UPDATE ps_outreach_leads
             SET sanitized_at = now(), sanitize_reason = ${verdict === 'valid' ? 'mev_valid' : 'mx_only_unverified'}, refill_checked_at = now()
             WHERE id = ${lead.id} AND sanitized_at IS NULL`
          promoted++
          promotedLeads.push({ id: String(lead.id), email: lead.email, verdict })
        } catch {
          await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
        }
      } else if (verdict === 'unknown') {
        // Inconclusive (verifier call failed) — DON'T mark checked, so a later run re-verifies.
      } else {
        // Definitive reject (catchall / invalid / no_mx) — mark checked so we don't re-verify it.
        await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) || 1 }, () => worker()))

  const mode = hasVerifier ? 'MyEmailVerifier' : 'MX-only (catch-all NOT filtered)'
  const reason =
    promoted >= needed
      ? `refilled to cap via ${mode}`
      : timedOut
        ? `hit ${TIME_BUDGET_MS / 1000}s budget at ${promoted}/${needed} (${mode}) — resumes next run`
        : checked >= MAX_LOOKUPS_PER_RUN
          ? `hit ${MAX_LOOKUPS_PER_RUN}-lookup ceiling at ${promoted}/${needed} (${mode}) — resumes next run`
          : `pool exhausted at ${promoted}/${needed} verified-valid (${mode})`
  return { cap, sendableBefore, needed, checked, promoted, promotedLeads, reason }
}

// One-time additive column: which leads the refill has already verified, so runs resume instead of
// re-verifying. Idempotent.
async function ensureRefillColumn(sql: any): Promise<void> {
  try {
    await sql`ALTER TABLE ps_outreach_leads ADD COLUMN IF NOT EXISTS refill_checked_at TIMESTAMPTZ`
  } catch {
    /* best-effort */
  }
}

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
