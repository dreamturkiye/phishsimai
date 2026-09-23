// PS-REFILL-01/02/03 (2026-07-21) — auto-refill of the sendable pool.
//
// THE GAP this closes: the sendable pool was sanitized ONCE by a manual one-off script and never
// wired to a cron, so it depleted as sends drew it down. This tops it up before the send cron.
//
// PS-REFILL-03 — VERIFY-ONLY, NEVER FIND. Every lead in ps_outreach_leads ALREADY has an email
// (6,127/6,127 populated). AMF's *finder* is for domain-only leads (that path lives in the
// researcher, over lead_research_queue). Running AMF here re-found emails we already had — pure
// wasted spend. This module now VERIFIES the existing address and NEVER calls AMF:
//   • QEV when QEV_API_KEY is set (canonical mailbox fallback — verifierClient.ts);
//   • MyEmailVerifier when MYEMAILVERIFIER_API_KEY is a NON-EMPTY value — empty string (Vercel
//     name-exists-value-empty, measured 2026-09-17) is unset. Live fire: MEV checked 23, promoted 0.
//     When both keys are set, MEV runs first; QEV is the fallback on empty/fail/unknown
//     only (mode mev_qev). MEV catch-all is terminal. Live 2026-09-23: 0 valid, ~3615 role
//     and ~2312 catchall already DISQUALIFIED; 59 inconclusive QEV passes promoted 0.
//     New sendable supply is a personal-mailbox find on role-only domains, not this loop.
//   • else a free MX check (domain-level) — which CANNOT detect catch-all, so it is OFF unless the
//     operator opts in with REFILL_ALLOW_MX_ONLY=1 (accepting that ~82% of this list is catch-all
//     and MX alone will pass them, risking bounces). SMTP RCPT is not usable — Vercel blocks port 25.
// PS-T1-STARVE-01 (2026-09-17): fail-closed with empty MEV + unused QEV emptied sanitized eligible
// on 2026-09-12 while 6435 GEO never-touched remained. QEV is now wired. Last-resort maps personal
// MX bridge (NOT REFILL_ALLOW_MX_ONLY) can promote google_maps/mymsphub personal inboxes when both
// mailbox keys are missing AND the sanitized pool is already 0.
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { hasMx, domainOf } from './mxGate'
import { dailySendCap } from './sequences'
import { sendTelegram } from './telegram'
import { verifyViaService, type VerifierVerdict } from './verifierClient'
import {
  mailboxVerifierKeys,
  verifierEmptyAlertMessage,
  sendablePoolEmptyAlertMessage,
  GEO_ALLOWLIST,
} from './touch1Health'

const GEO = GEO_ALLOWLIST
const MAX_LOOKUPS_PER_RUN = 500 // per-run verification ceiling
const CONCURRENCY = 10
const TIME_BUDGET_MS = 240_000
/** 3-day sanitized buffer so one missed refill cannot starve hourly T1 (PS-RAMP-HOLD-01 lesson). */
export const SANITIZE_BUFFER_DAYS = 3
export const MAPS_SOURCES = ['google_maps', 'mymsphub'] as const

export function sendablePoolTarget(cap: number): number {
  return Math.max(cap, cap * SANITIZE_BUFFER_DAYS)
}

export function isMapsSourced(source: string | null | undefined): boolean {
  return (MAPS_SOURCES as readonly string[]).includes(String(source || '').toLowerCase())
}

/** Last-resort: MX for personal Maps/MSP-hub leads when BOTH mailbox verifiers are empty and pool is 0. */
export function shouldUseMapsMxBridge(opts: {
  hasMailboxVerifier: boolean
  allowMxOnly: boolean
  sendableBefore: number
}): boolean {
  if (opts.hasMailboxVerifier) return false
  if (opts.allowMxOnly) return false
  return opts.sendableBefore <= 0
}

export type Verdict = 'valid' | 'catchall' | 'invalid' | 'mx_ok' | 'no_mx' | 'unknown'

export function mapQevToRefillVerdict(v: Pick<VerifierVerdict, 'status' | 'catchAll' | 'reached'>): Verdict {
  if (!v.reached) return 'unknown'
  if (v.catchAll || v.status === 'risky') return 'catchall'
  if (v.status === 'valid') return 'valid'
  if (v.status === 'invalid') return 'invalid'
  return 'unknown'
}

// PS-REFILL-04 (2026-07-22) — measured on prod: of 5,529 unverified candidates, 4,944 (89%) had
// ALREADY been labelled unusable by an earlier sanitization pass, and the old `ORDER BY created_at
// ASC` walked them OLDEST-FIRST. The first 500 rows the refill touched were 368 role_account + 100
// catchall (94% known-bad) and contained ZERO of the 253 fresh AMF-found leads — every one of which
// was a personal mailbox. So AMF's good output was stranded at the back of the queue while MEV
// credits were spent re-deriving rejections already recorded in the row. Two fixes below:
//   1. ORDER BY created_at DESC — verify the freshest (highest-yield) leads first.
//   2. Skip labels that mean DISQUALIFIED. Labels meaning INCONCLUSIVE (unverified_unknown /
//      _timeout / _blank, and NULL) stay eligible — those were never actually decided.
export const DISQUALIFIED_LABELS = [
  'role_account', 'role_strict', 'catchall', 'unverified_catchall', 'no_mx', 'mev_invalid',
  'edu_gov_domain', 'domain_cap', 'deprioritized_generic', 'initials_greeting', 'generic_greeting',
  // QEV-confirmed terminal labels. Catch-all (MEV or QEV) is not re-queued.
  'qev_catchall', 'qev_invalid',
]

/** Role / generic inboxes. A domain that holds only these can still have a named person. */
export const ROLE_ONLY_FINDER_LABELS = [
  'role_account', 'role_strict', 'deprioritized_generic', 'generic_greeting', 'initials_greeting',
]

/** Catch-all is a domain property. Re-finding another address there will not yield a QEV-valid mailbox. */
export const CATCHALL_TERMINAL_LABELS = ['catchall', 'unverified_catchall', 'qev_catchall']

/** Previously checked but never decided. QEV may retry these after 7 days, not every hour. */
export const INCONCLUSIVE_LABELS = [
  'unverified_unknown', 'unverified_timeout', 'unverified_blank',
]

/**
 * True when holding this address is a reason to skip a paid finder.
 * Org inboxes, DISQUALIFIED labels, and already-checked inconclusive rows are NOT skippable.
 * Live 2026-09-23: 0 valid; role + catchall are disqualified; 59 inconclusive were QEV'd and
 * promoted 0. An unchecked null is still refill's job (do not pay the finder for it).
 */
export function isPromotableHeldAddress(email: string, sanitizeReason?: string | null): boolean {
  if (!email || isOrgInbox(email)) return false
  const label = String(sanitizeReason || '').trim()
  if (!label) return true
  if ((INCONCLUSIVE_LABELS as readonly string[]).includes(label)) return false
  if ((DISQUALIFIED_LABELS as readonly string[]).includes(label)) return false
  return true
}

export type HeldAddress = { email: string; sanitizeReason?: string | null }

/**
 * Why the finder must not spend a credit on this domain.
 * `sendable` — a promotable or unchecked personal is already held (refill owns it).
 * `catchall` — catch-all is terminal; another address on the same domain will not verify.
 * `open` — role-only, org-inbox-only, or empty. A named personal find is worth paying for.
 */
export function heldDomainBlocksFinder(held: HeldAddress[]): 'sendable' | 'catchall' | 'open' {
  const labels = held.map((h) => String(h.sanitizeReason ?? '').trim())
  if (held.some((h) => isPromotableHeldAddress(h.email, h.sanitizeReason))) return 'sendable'
  if (labels.some((label) => (CATCHALL_TERMINAL_LABELS as readonly string[]).includes(label))) return 'catchall'
  return 'open'
}

/**
 * True when this domain should be put back on the finder for a named personal mailbox.
 * Role-only (and org-inbox-only) domains qualify. Catch-all, already-valid, unchecked
 * personal, and inconclusive rows do not — those are terminal or still the refill's job.
 */
export function domainNeedsPersonalFinder(held: HeldAddress[]): boolean {
  if (!held.length) return false
  if (heldDomainBlocksFinder(held) !== 'open') return false
  let sawRoleOrOrg = false
  for (const row of held) {
    const email = String(row.email || '').trim()
    if (!email) continue
    const label = String(row.sanitizeReason ?? '').trim()
    if (isOrgInbox(email)) {
      sawRoleOrOrg = true
      continue
    }
    if ((INCONCLUSIVE_LABELS as readonly string[]).includes(label)) return false
    if ((ROLE_ONLY_FINDER_LABELS as readonly string[]).includes(label)) {
      sawRoleOrOrg = true
      continue
    }
    // A decided personal (invalid, no MX, edu, domain cap) means a person was already tried.
    return false
  }
  return sawRoleOrOrg
}

// Generic ORG inboxes with no individual owner. Deliberately NOT the same list as abTest.ts's
// ROLE_LOCALPARTS: that one answers "can I greet this local part by name?" (so ceo/owner/it are
// role-ish there), while this one answers "is there a human decision-maker behind this address?"
// — and at a small MSP, ceo@/owner@/it@ reach exactly the buyer we want. Those stay eligible.
// The label filter above only protects rows an OLD pass already labelled; this catches a FRESH
// AMF-found info@ that has no label at all. 12 of the 50 sent on 2026-07-22 were these.
// PS-ICY-GUARD-01 follow-up (2026-07-24): this predicate now has a SECOND consumer — the finder
// guard in leadResearcher.ts skips a paid Icypeas lookup when we already hold an address it
// considers usable. So a gap here is no longer just "we send to an org inbox"; it is also "we
// DON'T pay to find the real human because a helpdesk@ address made the domain look covered".
// These three were found in the prod queue overlap on 2026-07-24 sitting on the wrong side of it.
// 'gscsupport' is the digit/separator-collapsed form of gsc-support@ — both are listed because
// isOrgInbox() checks the raw local part AND the collapsed base.
const ORG_INBOX_LOCALPARTS = new Set([
  'info', 'sales', 'support', 'contact', 'hello', 'help', 'office', 'team', 'service', 'enquiries',
  'enquiry', 'inquiries', 'billing', 'accounts', 'accounting', 'acctmgmt', 'marketing', 'careers',
  'jobs', 'noreply', 'noreply-', 'postmaster', 'webmaster', 'abuse', 'admin', 'general', 'inbox',
  'reception', 'mail', 'sysadmin', 'connect', 'hr', 'privacy', 'legal', 'compliance',
  'helpdesk', 'smartsell', 'gsc-support', 'gscsupport',
])

/** True if the local part is a generic org inbox (info@, sales@, billing@ …) — never promote. */
export function isOrgInbox(email: string): boolean {
  const local = (email.split('@')[0] || '').toLowerCase().trim()
  if (!local) return false
  // Collapse digits/separators so info2, info-uk and info.us all reduce to "info" (and no-reply
  // to noreply). A real name like "amelia.smith" collapses to "ameliasmith" and matches nothing.
  const base = local.replace(/[0-9._-]+/g, '')
  return ORG_INBOX_LOCALPARTS.has(local) || ORG_INBOX_LOCALPARTS.has(base)
}

export type RefillVerifyMode = 'qev' | 'mev' | 'mev_qev' | 'mx_opt_in' | 'maps_mx_bridge' | 'none'
export type VerifyVia = 'qev' | 'mev' | 'mx' | 'none'
export type VerifyHit = { verdict: Verdict; via: VerifyVia }

export function mapMevBody(d: { Status?: string; catch_all?: number | string | boolean }): Verdict {
  const status = String(d.Status || '').toLowerCase().trim()
  // Vendor sends catch_all as "true"/"false", 1/0, or a boolean. "false" and 0 are not catch-all.
  const catchRaw = String(d.catch_all ?? '').toLowerCase().trim()
  const isCatchAll = catchRaw === '1' || catchRaw === 'true' || status.includes('catch')
  if (isCatchAll) return 'catchall'
  if (status === 'valid') return 'valid'
  if (status === 'invalid') return 'invalid'
  // Unknown, Grey-listed, empty Status — inconclusive. QEV decides when keyed.
  return 'unknown'
}

/**
 * Mailbox verify: MEV first when keyed; QEV (`verifyViaService`) as fallback when MEV is
 * empty, HTTP-fails, throws, or returns unknown. Live 2026-09-17: MEV checked 23, promoted 0.
 */
export async function verifyEmailDetailed(
  email: string,
  opts: { allowMx: boolean; qev: boolean; mev: boolean } = {
    allowMx: false,
    qev: mailboxVerifierKeys().qev,
    mev: mailboxVerifierKeys().mev,
  },
): Promise<VerifyHit> {
  const domain = domainOf(email)
  if (!domain) return { verdict: 'invalid', via: 'none' }

  if (opts.mev) {
    const key = process.env.MYEMAILVERIFIER_API_KEY?.trim()
    if (key) {
      try {
        const res = await fetch(
          `https://api.myemailverifier.com/api/validate_single.php?apikey=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`,
          { cache: 'no-store', signal: AbortSignal.timeout(20000) },
        )
        if (res.ok) {
          const d = JSON.parse((await res.text()) || '{}') as { Status?: string; catch_all?: number | string | boolean }
          const verdict = mapMevBody(d)
          // MEV valid / invalid / catch-all are terminal. Do not re-spend QEV on catch-all:
          // live 2026-09-23 the unsanitized pool is ~3615 role + ~2312 catchall, 0 valid.
          // Unknown still falls through to QEV. New sendable supply is the finder, not this loop.
          if (verdict === 'unknown' && opts.qev) {
            // fall through
          } else if (verdict === 'valid' || verdict === 'catchall' || verdict === 'invalid') {
            return { verdict, via: 'mev' }
          }
        } else {
          console.error(`[refill/mev] ${domain} status=${res.status} — vendor failure, falling back to QEV`)
        }
      } catch (e: any) {
        console.error(`[refill/mev] ${domain} threw: ${String(e?.message || e).slice(0, 120)} — falling back to QEV`)
      }
    }
  }

  if (opts.qev) {
    try {
      const verdict = mapQevToRefillVerdict(await verifyViaService(email))
      return { verdict, via: 'qev' }
    } catch (e: any) {
      console.error(`[refill/qev] ${domain} threw: ${String(e?.message || e).slice(0, 120)}`)
      return { verdict: 'unknown', via: 'qev' }
    }
  }

  if (opts.allowMx) return { verdict: (await hasMx(domain)) ? 'mx_ok' : 'no_mx', via: 'mx' }
  return { verdict: 'unknown', via: 'none' }
}

export async function verifyEmail(
  email: string,
  opts: { allowMx: boolean; qev: boolean; mev: boolean } = {
    allowMx: false,
    qev: mailboxVerifierKeys().qev,
    mev: mailboxVerifierKeys().mev,
  },
): Promise<Verdict> {
  return (await verifyEmailDetailed(email, opts)).verdict
}

function decisionLabel(verdict: Verdict, via: VerifyVia): string | null {
  if (verdict === 'catchall') return via === 'qev' ? 'qev_catchall' : 'catchall'
  if (verdict === 'invalid') return via === 'qev' ? 'qev_invalid' : 'mev_invalid'
  if (verdict === 'no_mx') return 'no_mx'
  return null
}

export interface RefillResult {
  cap: number
  target: number
  sendableBefore: number
  needed: number
  checked: number
  promoted: number
  skippedOrgInbox: number
  promotedLeads: Array<{ id: string; email: string; verdict: Verdict }>
  reason: string
  verifier: { mev: boolean; qev: boolean; any: boolean }
  verifyMode: RefillVerifyMode
  verifierAlert: boolean
}

export type RefillOpts = { timeBudgetMs?: number; maxLookups?: number }

// Top the sendable pool up to a 3-day buffer by VERIFYING existing emails (never finding).
export async function refillSendablePool(
  sqlOverride?: any,
  now: Date = new Date(),
  opts: RefillOpts = {},
): Promise<RefillResult> {
  const sql = sqlOverride ?? getSql()
  await ensureRefillColumn(sql)
  const cap = dailySendCap(now)
  const target = sendablePoolTarget(cap)
  const timeBudgetMs = opts.timeBudgetMs ?? TIME_BUDGET_MS
  const maxLookups = opts.maxLookups ?? MAX_LOOKUPS_PER_RUN
  const before = (await sql`SELECT count(*)::int AS n FROM ps_outreach_leads
     WHERE sanitized_at IS NOT NULL AND touch1_sent_at IS NULL AND country = ANY(${GEO})
       AND bounced = false AND unsubscribed = false AND pipeline_stage NOT IN ('dead','customer')`) as Array<{ n: number }>
  const sendableBefore = Number(before[0]?.n ?? 0)
  const needed = Math.max(0, target - sendableBefore)
  const keys = mailboxVerifierKeys()
  const allowMxOnly = process.env.REFILL_ALLOW_MX_ONLY === '1'
  const mapsBridge = shouldUseMapsMxBridge({
    hasMailboxVerifier: keys.any,
    allowMxOnly,
    sendableBefore,
  })
  const verifyMode: RefillVerifyMode = keys.mev && keys.qev
    ? 'mev_qev'
    : keys.qev
      ? 'qev'
      : keys.mev
        ? 'mev'
        : allowMxOnly
          ? 'mx_opt_in'
          : mapsBridge
            ? 'maps_mx_bridge'
            : 'none'
  const base = {
    cap,
    target,
    sendableBefore,
    needed,
    checked: 0,
    promoted: 0,
    skippedOrgInbox: 0,
    promotedLeads: [] as RefillResult['promotedLeads'],
    verifier: keys,
    verifyMode,
    verifierAlert: !keys.any,
  }

  if (needed === 0) return { ...base, reason: 'pool already at cap — no refill needed' }

  if (verifyMode === 'none') {
    return {
      ...base,
      reason:
        'no email verifier: set QEV_API_KEY (canonical — detects catch-all), or a non-empty ' +
        'MYEMAILVERIFIER_API_KEY. Empty-string MEV is unset. Do not set REFILL_ALLOW_MX_ONLY=1 ' +
        '(~82% catch-all). Promoted 0.',
    }
  }

  const mapsOnly = verifyMode === 'maps_mx_bridge'
  const qevFallback = keys.qev
  // Two queries so a JS boolean is never bound into SQL (a bound `true` has thrown as text
  // under Neon and zeroed the candidate set while verifyMode still read mev_qev).
  const candidates = (mapsOnly
    ? await sql`SELECT id, email, source FROM ps_outreach_leads
     WHERE sanitized_at IS NULL AND touch1_sent_at IS NULL
       AND country = ANY(${GEO}) AND bounced = false AND unsubscribed = false
       AND pipeline_stage NOT IN ('dead','customer')
       AND lower(COALESCE(source, '')) = ANY(${[...MAPS_SOURCES]})
       AND (sanitize_reason IS NULL OR sanitize_reason <> ALL(${DISQUALIFIED_LABELS}))
     ORDER BY created_at DESC LIMIT ${maxLookups}`
    : qevFallback
      ? await sql`SELECT id, email, source FROM ps_outreach_leads
     WHERE sanitized_at IS NULL AND touch1_sent_at IS NULL
       AND country = ANY(${GEO}) AND bounced = false AND unsubscribed = false
       AND pipeline_stage NOT IN ('dead','customer')
       AND (sanitize_reason IS NULL OR sanitize_reason <> ALL(${DISQUALIFIED_LABELS}))
       AND (
         refill_checked_at IS NULL
         OR (
           (sanitize_reason IS NULL OR sanitize_reason = ANY(${INCONCLUSIVE_LABELS}))
           AND refill_checked_at < now() - interval '7 days'
         )
       )
     ORDER BY CASE WHEN refill_checked_at IS NULL THEN 0 ELSE 1 END,
              refill_checked_at ASC NULLS FIRST,
              created_at DESC
     LIMIT ${maxLookups}`
      : await sql`SELECT id, email, source FROM ps_outreach_leads
     WHERE sanitized_at IS NULL AND touch1_sent_at IS NULL
       AND country = ANY(${GEO}) AND bounced = false AND unsubscribed = false
       AND pipeline_stage NOT IN ('dead','customer')
       AND (sanitize_reason IS NULL OR sanitize_reason <> ALL(${DISQUALIFIED_LABELS}))
       AND refill_checked_at IS NULL
     ORDER BY created_at DESC
     LIMIT ${maxLookups}`) as Array<{ id: string; email: string; source?: string }>

  const allowMx = verifyMode === 'mx_opt_in' || verifyMode === 'maps_mx_bridge'
  const verifyOpts = {
    allowMx,
    qev: verifyMode === 'qev' || verifyMode === 'mev_qev',
    mev: verifyMode === 'mev' || verifyMode === 'mev_qev',
  }

  const started = Date.now()
  let idx = 0
  let checked = 0
  let promoted = 0
  let skippedOrgInbox = 0
  let timedOut = false
  const promotedLeads: RefillResult['promotedLeads'] = []

  function promoteReason(verdict: Verdict, via: VerifyVia): string {
    if (verdict === 'valid') return via === 'qev' ? 'qev_valid' : 'mev_valid'
    if (verifyMode === 'maps_mx_bridge') return 'mx_maps_personal_bridge'
    return 'mx_only_unverified'
  }

  async function worker(): Promise<void> {
    while (true) {
      if (promoted >= needed) return
      if (Date.now() - started >= timeBudgetMs) { timedOut = true; return }
      const i = idx++
      if (i >= candidates.length) return
      const lead = candidates[i]
      if (mapsOnly && !isMapsSourced(lead.source)) continue
      // PS-REFILL-04: reject org inboxes BEFORE spending a verifier credit — MEV will happily
      // confirm info@ exists, which is how 12 role accounts reached the send on 2026-07-22.
      if (isOrgInbox(lead.email)) {
        skippedOrgInbox++
        await sql`UPDATE ps_outreach_leads
           SET refill_checked_at = now(), sanitize_reason = COALESCE(sanitize_reason, 'role_account')
           WHERE id = ${lead.id} AND sanitized_at IS NULL`.catch(() => {})
        continue
      }
      checked++
      const hit = await verifyEmailDetailed(lead.email, verifyOpts)
      const verdict = hit.verdict
      const promote = verdict === 'valid' || (verdict === 'mx_ok' && allowMx)
      if (promote && promoted < needed) {
        try {
          await sql`UPDATE ps_outreach_leads
             SET sanitized_at = now(), sanitize_reason = ${promoteReason(verdict, hit.via)}, refill_checked_at = now()
             WHERE id = ${lead.id} AND sanitized_at IS NULL`
          promoted++
          promotedLeads.push({ id: String(lead.id), email: lead.email, verdict })
        } catch {
          await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
        }
      } else if (verdict === 'unknown') {
        // Stamp the check so the next run rotates past a QEV hold / grey-list instead of
        // re-spending the whole budget on the same newest rows. Keep an existing label.
        // Blank reason becomes inconclusive, not disqualified. Catch-all is written on
        // the decision path and is not re-queued.
        await sql`UPDATE ps_outreach_leads
           SET refill_checked_at = now(),
               sanitize_reason = CASE
                 WHEN sanitize_reason IS NULL OR btrim(sanitize_reason) = '' THEN 'unverified_unknown'
                 ELSE sanitize_reason
               END
           WHERE id = ${lead.id} AND sanitized_at IS NULL`.catch(() => {})
      } else {
        const label = decisionLabel(verdict, hit.via)
        if (label && hit.via === 'qev') {
          // Overwrite a MEV catchall with the QEV decision so qev_catchall cannot re-queue.
          await sql`UPDATE ps_outreach_leads
             SET refill_checked_at = now(), sanitize_reason = ${label}
             WHERE id = ${lead.id} AND sanitized_at IS NULL`.catch(() => {})
        } else if (label) {
          await sql`UPDATE ps_outreach_leads
             SET refill_checked_at = now(), sanitize_reason = COALESCE(sanitize_reason, ${label})
             WHERE id = ${lead.id}`.catch(() => {})
        } else {
          await sql`UPDATE ps_outreach_leads SET refill_checked_at = now() WHERE id = ${lead.id}`.catch(() => {})
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) || 1 }, () => worker()))

  const mode =
    verifyMode === 'qev' ? 'QEV'
      : verifyMode === 'mev' ? 'MyEmailVerifier'
        : verifyMode === 'mev_qev' ? 'MyEmailVerifier then QEV fallback'
        : verifyMode === 'maps_mx_bridge' ? 'maps personal MX bridge (not REFILL_ALLOW_MX_ONLY)'
          : 'MX-only opt-in (catch-all NOT filtered)'
  const reason =
    promoted >= needed
      ? `refilled to ${target} via ${mode}`
      : timedOut
        ? `hit ${timeBudgetMs / 1000}s budget at ${promoted}/${needed} (${mode}) — resumes next run`
        : checked >= maxLookups
          ? `hit ${maxLookups}-lookup ceiling at ${promoted}/${needed} (${mode}) — resumes next run`
          : `pool exhausted at ${promoted}/${needed} verified-valid (${mode})`
  return { ...base, needed, checked, promoted, skippedOrgInbox, promotedLeads, reason }
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
    if (r.verifierAlert) {
      await sendTelegram(verifierEmptyAlertMessage(r.verifier)).catch(() => {})
    }
    const sendableAfter = r.sendableBefore + r.promoted
    const emptyPool = sendablePoolEmptyAlertMessage(sendableAfter)
    if (emptyPool) {
      await sendTelegram(emptyPool).catch(() => {})
    }
    if (r.verifierAlert || sendableAfter === 0) {
      const { maybeQueueT1Marcus } = await import('./t1MarcusHandoff')
      await maybeQueueT1Marcus().catch(() => {})
    }
    await sendTelegram(
      `🔁 <b>PhishSim pool refill</b> (${COMPANY_ID})\n` +
        `mode ${r.verifyMode} · mev ${r.verifier.mev ? 'set' : 'empty'} · qev ${r.verifier.qev ? 'set' : 'empty'}\n` +
        `cap ${r.cap} · target ${r.target} · sendable ${r.sendableBefore}→${sendableAfter} · promoted ${r.promoted}/${r.needed} (verified ${r.checked}, org-inbox skipped ${r.skippedOrgInbox})\n` +
        `${r.reason}`,
    ).catch(() => {})
    return res.json({ ok: true, ...r })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
