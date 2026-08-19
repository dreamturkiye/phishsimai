// PS-DMARC-WATCH-01 (2026-07-25) — DMARC aggregate reports as a standing authentication signal.
//
// WHY THE OBVIOUS ALERT IS WRONG. The first instinct is "alert if pass rate < 100%". That alarm
// would fire EVERY DAY and be ignored inside a week. Measured on the first real report (Microsoft,
// 2026-07-23, 54 messages): 41 pass / 13 fail = 75.9%. All 13 failures were legitimate — recipients'
// own security gateways (INKY Phish Fence, Proofpoint Essentials, cloud-sec-av) re-injecting our
// mail after scanning it. Forwarding breaks SPF (the gateway's IP is not in our record) and breaks
// DKIM (the gateway rewrites links and adds banners, invalidating the body hash). That is permanent
// and expected background noise, not a fault.
//
// So the signal is NOT the overall pass rate. It is:
//   1. Pass rate among SES-ORIGIN messages — mail we actually sent. This should be 100%.
//      Anything below it means a real key/DNS/config break. THIS is the alert.
//   2. Any UNRECOGNISED sending IP — neither our SES infrastructure nor a known forwarding
//      gateway. That is possible spoofing. ALERT.
//   3. Silence otherwise, including on gateway forwarding failures.
//
// Plus liveness: these arrive daily. Absence of reports is itself a signal (the filter broke, or
// the rua address stopped receiving) — same discipline as the send-health tripwire.
import { getSql } from './conn'
import { sendTelegram } from './telegram'

export type Alignment = 'pass' | 'fail' | null

export interface DmarcSource {
  ip: string
  count: number
  disposition: string | null
  dkimAligned: Alignment
  spfAligned: Alignment
  envelopeFrom: string | null
  headerFrom: string | null
  dkimAuth: string[] // "domain(selector)=result"
  spfAuth: string[]  // "domain=result"
}

export interface DmarcReport {
  reportId: string
  orgName: string
  domain: string
  policyP: string | null
  begin: Date
  end: Date
  sources: DmarcSource[]
}

// ── XML parsing (no dependency; aggregate reports are a small, flat, well-known schema) ─────────
const tag = (s: string, t: string): string | null => {
  const m = s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))
  return m ? m[1].trim() : null
}
const all = (s: string, t: string): string[] =>
  [...s.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map(m => m[1])

export function parseDmarcXml(xml: string): DmarcReport {
  const meta = tag(xml, 'report_metadata') ?? ''
  const pol = tag(xml, 'policy_published') ?? ''
  const range = tag(meta, 'date_range') ?? ''

  const sources: DmarcSource[] = all(xml, 'record').map(r => {
    const row = tag(r, 'row') ?? ''
    const pe = tag(row, 'policy_evaluated') ?? ''
    const ident = tag(r, 'identifiers') ?? ''
    const auth = tag(r, 'auth_results') ?? ''
    const align = (v: string | null): Alignment => (v === 'pass' ? 'pass' : v ? 'fail' : null)
    return {
      ip: tag(row, 'source_ip') ?? '',
      count: Number(tag(row, 'count') ?? 0),
      disposition: tag(pe, 'disposition'),
      dkimAligned: align(tag(pe, 'dkim')),
      spfAligned: align(tag(pe, 'spf')),
      envelopeFrom: tag(ident, 'envelope_from'),
      headerFrom: tag(ident, 'header_from'),
      dkimAuth: all(auth, 'dkim').map(d => `${tag(d, 'domain')}(${tag(d, 'selector') ?? '-'})=${tag(d, 'result')}`),
      spfAuth: all(auth, 'spf').map(s => `${tag(s, 'domain')}=${tag(s, 'result')}`),
    }
  })

  return {
    reportId: tag(meta, 'report_id') ?? '',
    orgName: tag(meta, 'org_name') ?? 'unknown',
    domain: tag(pol, 'domain') ?? '',
    policyP: tag(pol, 'p'),
    begin: new Date(Number(tag(range, 'begin') ?? 0) * 1000),
    end: new Date(Number(tag(range, 'end') ?? 0) * 1000),
    sources,
  }
}

// ── Source classification ───────────────────────────────────────────────────────────────────────
export type SourceKind = 'ses' | 'gateway' | 'unknown'

// Our own sending infrastructure. Resend delivers via Amazon SES; every genuine send carries a
// DKIM signature from BOTH d=phishsimai.com (s=resend) and d=amazonses.com.
const SES_DKIM = /amazonses\.com/i
const RESEND_DKIM = /\(resend\)/i

// Known forwarding gateways — recipient-side security products that re-inject scanned mail.
// Matched on the DKIM/SPF evidence pattern rather than PTR, so it works without a DNS round-trip
// at parse time. Extend as new vendors appear in reports.
const KNOWN_GATEWAY_PTR = /(inkyphishfence|ppe-hosted|proofpoint|cloud-sec-av|mimecast|barracuda|messagelabs|trendmicro)/i

/** PTR of Amazon SES output nodes, e.g. a9-9.smtp-out.amazonses.com. */
const SES_PTR = /\.smtp-out\.amazonses\.com\.?$/i

/**
 * Classify a source. ORIGIN IS DECIDED BY THE IP, NOT BY ALIGNMENT — that ordering matters.
 *
 * An earlier version classified 'ses' only when alignment passed, which created a silent
 * false-negative: if our own SPF record and DKIM key both broke, genuine sends from real SES IPs
 * would fail alignment, get bucketed as "gateway forwarding", and never alert — the exact break
 * this watcher exists to catch. Resolving the PTR first makes an SES IP an SES IP whether it
 * passed or not, so `evaluate()` can count it as a real failure.
 *
 * `ptr` is resolved by resolvePtrs() in the ingest path. Without it we fall back to DKIM-signature
 * evidence, which is weaker but still separates "carries our signature" from "nothing of ours".
 */
export function classifySource(s: DmarcSource, ptr?: string | null): SourceKind {
  // 1. Authoritative: reverse DNS says this is our sending infrastructure.
  if (ptr && SES_PTR.test(ptr)) return 'ses'
  // 2. Authoritative: reverse DNS says this is a known recipient-side security gateway.
  if (ptr && KNOWN_GATEWAY_PTR.test(ptr)) return 'gateway'

  // 3. No usable PTR — fall back to signature evidence.
  const carriesOurDkim = s.dkimAuth.some(d => SES_DKIM.test(d) || RESEND_DKIM.test(d))
  const aligned = s.dkimAligned === 'pass' || s.spfAligned === 'pass'
  if (carriesOurDkim && aligned) return 'ses'      // genuine delivery straight to the recipient
  if (carriesOurDkim) return 'gateway'             // our mail, broken in transit => forwarding
  return 'unknown'                                  // nothing links this to our infrastructure
}

/**
 * Reverse-resolve the distinct source IPs in a report. A report has a few dozen at most, so this
 * is cheap, and it is what makes classification authoritative rather than inferred.
 */
export async function resolvePtrs(ips: string[]): Promise<Record<string, string | null>> {
  const { reverse } = await import('dns/promises')
  const out: Record<string, string | null> = {}
  await Promise.all(
    [...new Set(ips)].map(async ip => {
      out[ip] = await reverse(ip).then(n => n[0] ?? null).catch(() => null)
    }),
  )
  return out
}

export interface DmarcVerdict {
  reportId: string
  orgName: string
  domain: string
  window: string
  total: number
  sesTotal: number
  sesPass: number
  gatewayTotal: number
  unknownTotal: number
  unknownIps: string[]
  sesFailIps: string[]
  alert: boolean
  reasons: string[]
}

/** The whole judgement, in one place, so the alert threshold cannot drift from the analysis. */
export function evaluate(report: DmarcReport, ptrLookup?: Record<string, string | null>): DmarcVerdict {
  let sesTotal = 0, sesPass = 0, gatewayTotal = 0, unknownTotal = 0
  const unknownIps: string[] = []
  const sesFailIps: string[] = []

  for (const s of report.sources) {
    const kind = classifySource(s, ptrLookup?.[s.ip])
    const aligned = s.dkimAligned === 'pass' || s.spfAligned === 'pass'
    if (kind === 'ses') {
      sesTotal += s.count
      if (aligned) sesPass += s.count
      else if (!sesFailIps.includes(s.ip)) sesFailIps.push(s.ip)
    } else if (kind === 'gateway') {
      gatewayTotal += s.count
    } else {
      unknownTotal += s.count
      if (!unknownIps.includes(s.ip)) unknownIps.push(s.ip)
    }
  }

  const reasons: string[] = []
  // (1) Real break: mail we sent, from our own infrastructure, failing alignment.
  if (sesTotal > 0 && sesPass < sesTotal) {
    reasons.push(`${sesTotal - sesPass}/${sesTotal} SES-origin messages FAILED DMARC alignment (${sesFailIps.join(', ')}) — key/DNS/config break`)
  }
  // (2) Possible spoofing: a sender with no link to our infrastructure.
  if (unknownIps.length > 0) {
    reasons.push(`${unknownIps.length} UNRECOGNISED sending IP(s) claiming ${report.domain}: ${unknownIps.join(', ')} (${unknownTotal} msgs) — possible spoofing`)
  }
  // Gateway forwarding failures are deliberately NOT a reason. See the header comment.

  return {
    reportId: report.reportId,
    orgName: report.orgName,
    domain: report.domain,
    window: `${report.begin.toISOString().slice(0, 16)} → ${report.end.toISOString().slice(0, 16)}`,
    total: report.sources.reduce((n, s) => n + s.count, 0),
    sesTotal, sesPass, gatewayTotal, unknownTotal, unknownIps, sesFailIps,
    alert: reasons.length > 0,
    reasons,
  }
}

// ── Persistence + alerting ──────────────────────────────────────────────────────────────────────
export async function ensureDmarcTables(sql = getSql()): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS dmarc_reports (
    report_id TEXT PRIMARY KEY,
    org_name TEXT NOT NULL,
    domain TEXT NOT NULL,
    policy_p TEXT,
    window_begin TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    total_msgs INT NOT NULL,
    ses_total INT NOT NULL,
    ses_pass INT NOT NULL,
    gateway_total INT NOT NULL,
    unknown_total INT NOT NULL,
    unknown_ips TEXT,
    alerted BOOLEAN NOT NULL DEFAULT false,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`.catch(() => {})
}

/** Idempotent on report_id — providers retry, and a duplicate must not re-alert. */
export async function ingestDmarcReport(xml: string, sql = getSql()): Promise<DmarcVerdict & { duplicate: boolean }> {
  await ensureDmarcTables(sql)
  const report = parseDmarcXml(xml)
  // Resolve PTRs so classification is authoritative (see classifySource) — a genuine SES IP must
  // be recognised as ours even when it is FAILING, or the real-break alert can never fire.
  const ptrs = await resolvePtrs(report.sources.map(s => s.ip)).catch(() => ({}))
  const v = evaluate(report, ptrs)

  const claim = (await sql`
    INSERT INTO dmarc_reports (report_id, org_name, domain, policy_p, window_begin, window_end,
      total_msgs, ses_total, ses_pass, gateway_total, unknown_total, unknown_ips, alerted)
    VALUES (${report.reportId}, ${report.orgName}, ${report.domain}, ${report.policyP},
      ${report.begin.toISOString()}, ${report.end.toISOString()},
      ${v.total}, ${v.sesTotal}, ${v.sesPass}, ${v.gatewayTotal}, ${v.unknownTotal},
      ${v.unknownIps.join(',')}, ${v.alert})
    ON CONFLICT (report_id) DO NOTHING RETURNING report_id`) as Array<{ report_id: string }>

  const duplicate = claim.length === 0
  if (!duplicate && v.alert) {
    await sendTelegram(
      `🚨 <b>DMARC — ${v.domain}</b> (${v.orgName}, ${v.window})\n` +
      v.reasons.map(r => `• ${r}`).join('\n') +
      `\n\nSES ${v.sesPass}/${v.sesTotal} aligned · gateway-forwarded ${v.gatewayTotal} (expected) · unknown ${v.unknownTotal}`,
    ).catch(() => {})
  }
  return { ...v, duplicate }
}

/**
 * Liveness. Reports arrive daily; silence means the pipe broke, not that authentication is fine.
 * Deliberately separate from the per-report alert — absence has no report to hang off.
 */
export async function checkDmarcFeedLiveness(sql = getSql(), maxAgeHours = 48): Promise<{ ok: boolean; lastAt: string | null; ageHours: number | null }> {
  await ensureDmarcTables(sql)
  const rows = (await sql`SELECT max(received_at) AS t FROM dmarc_reports`) as Array<{ t: string | null }>
  const t = rows[0]?.t
  if (!t) return { ok: false, lastAt: null, ageHours: null }
  const ageHours = (Date.now() - new Date(t).getTime()) / 3_600_000
  if (ageHours > maxAgeHours) {
    await sendTelegram(`🚨 <b>DMARC feed dark</b> — no aggregate report in ${ageHours.toFixed(0)}h (expected daily). The rua filter or mailbox route may have broken.`).catch(() => {})
  }
  return { ok: ageHours <= maxAgeHours, lastAt: t, ageHours }
}
