// ─────────────────────────────────────────────────────────────────────────────
//  PS-DEX-01 — Dex, Deliverability & Infrastructure. The seat that replaces Max.
//
//  WHY THIS SEAT AND NOT A CHIEF OF STAFF
//    Coordination is Janet's job; a second coordinator duplicates her and owns no domain. Nobody
//    owned whether email PHYSICALLY ARRIVES, and every avoidable failure this quarter lived in that
//    gap: sends against the wrong database, a 5% bounce measured against a threshold set 4x too
//    high, simulations sending from the reputation-critical apex, and MX gates on some send paths
//    but not others.
//
//  HIS DEFINING DOCTRINE: NO PATH EXEMPT
//    The partial gate is this system's most expensive recurring bug. It has now appeared three
//    times — MX on the outreach path but not the simulation path; the internal-address exclusion at
//    the query level in one file and downstream in another; and the one Dex was built on, where
//    suppression was checked in touch2Eligible() and NOWHERE ELSE, leaving touch-1 and touch-3/4/5
//    filtering on `unsubscribed` alone.
//
//    A partial gate is worse than no gate, because it reads as "we have a gate" in every review.
//    So Dex does not check that a gate EXISTS — he enumerates every send path and checks that each
//    one carries every rail it is required to carry, and an unlisted path is itself a finding.
//
//  EXEMPTIONS ARE DECLARED, NEVER INFERRED
//    Some paths legitimately skip the consent gate: the weekly report to the founder's own inbox is
//    not a prospect send. Those are marked `internal` in the registry WITH a reason. An exemption
//    you have to write down is one someone can argue with; an exemption that is merely the absence
//    of a check is invisible.
//
//  HE REPORTS THRESHOLDS, HE DOES NOT TUNE THEM
//    Per spec: any change to a send-path gate or threshold is surfaced to Kaan. Deliverability
//    settings are reputation-critical, and an agent that quietly widens its own bounce breaker to
//    stop tripping is the failure mode that ends a sending domain.
// ─────────────────────────────────────────────────────────────────────────────
import { resolveTxt, resolveMx } from 'node:dns/promises'
import { getSql } from '../conn'
import { readSource, type SourceFile, type Incident, type Severity } from './rex'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

// ─── THE SEND PATH REGISTRY ──────────────────────────────────────────────────

export type PathClass = 'prospect' | 'internal' | 'disabled'

export type SendPath = {
  key: string
  file: string
  /** Human description of where in the file. */
  where: string
  cls: PathClass
  /** Why an internal/disabled path is exempt from the consent rails. Required for those classes. */
  exemptionReason?: string
}

/**
 * Every place in this codebase that can put mail on the wire. Adding a sender without adding it
 * here is the defect `detectUnregisteredSenders` exists to catch.
 */
export const SEND_PATHS: SendPath[] = [
  { key: 'touch1', file: 'server/os/sequences.ts', where: 'runFullSequence touch-1 loop', cls: 'prospect' },
  { key: 'touch2_batch', file: 'server/os/sequences.ts', where: 'runTouch2Batch (PS-TOUCH2-PRICE-01)', cls: 'prospect' },
  { key: 'touch3_5', file: 'server/os/sequences.ts', where: 'runFullSequence touchDefs loop (touch 2-5)', cls: 'prospect' },
  {
    key: 'reply_send',
    file: 'server/os/replyParser.ts',
    where: 'reply handling',
    cls: 'internal',
    exemptionReason:
      'replies to a human who wrote to US first. Consent is established by their inbound message; ' +
      'the suppression gate governs unsolicited outbound, not answering a person who emailed you.',
  },
  {
    key: 'janet_report',
    file: 'server/os/janetReport.ts',
    where: 'weekly CGO report',
    cls: 'internal',
    exemptionReason: "goes to the founder's own inbox (REPORT_EMAIL), never to a prospect.",
  },
  {
    key: 'raw_outreach',
    file: 'server/outreach/outreachSequence.ts',
    where: 'sendEmail() raw sender',
    cls: 'disabled',
    exemptionReason:
      'PS-BYPASS-CLOSE-01 disabled this at the source — it throws before the Resend call, so it is ' +
      'structurally incapable of sending. Dex audits that the throw is still there.',
  },
]

/** Rails a prospect-facing path must carry. Each is a source-level signal. */
const REQUIRED_RAILS: { key: string; label: string; re: RegExp }[] = [
  { key: 'consent_gate', label: 'assertSendable() consent gate', re: /assertSendable\s*\(/ },
  { key: 'mx_gate', label: 'hasMx() pre-send MX check', re: /hasMx\s*\(/ },
  { key: 'suppression_sql', label: 'suppression NOT EXISTS in the eligibility SELECT', re: /ps_outreach_suppression/ },
]

export function auditSendPaths(files: SourceFile[]): { incidents: Incident[]; notChecked: string[]; covered: number } {
  const incidents: Incident[] = []
  const notChecked: string[] = []
  let covered = 0

  const byFile = new Map(files.map((f) => [f.relPath, f]))

  for (const p of SEND_PATHS) {
    const f = byFile.get(p.file)
    if (!f || f.text === null) {
      notChecked.push(p.file)
      continue
    }

    if (p.cls === 'disabled') {
      // The only thing that matters here: is the structural disable still present?
      const stillDisabled = /PS-BYPASS-CLOSE-01/.test(f.text) && /throw new Error\(/.test(f.text)
      if (!stillDisabled) {
        incidents.push({
          detector: 'blind_gate',
          severity: 'critical',
          subject: `${p.file}:${p.key}`,
          summary:
            `A send path declared DISABLED is no longer structurally disabled. ${p.exemptionReason} ` +
            `The guard is gone, which makes this a raw sender with no consent gate, no MX check and ` +
            `no CAN-SPAM footer.`,
          evidence: { path: p.key, file: p.file, expected: 'throw before the Resend call', found: 'guard missing' },
          signature: `send_path_disabled_guard:${p.key}`,
        })
      } else covered++
      continue
    }

    if (p.cls === 'internal') {
      covered++ // exempt BY DECLARATION, with a written reason — see the registry
      continue
    }

    const missing = REQUIRED_RAILS.filter((r) => !r.re.test(f.text as string))
    if (missing.length) {
      incidents.push({
        detector: 'blind_gate',
        severity: 'critical',
        subject: `${p.file}:${p.key}`,
        summary:
          `Prospect-facing send path is missing ${missing.length} required rail(s): ` +
          `${missing.map((m) => m.label).join(', ')}. A path without every rail is the partial-gate ` +
          `pattern — it reads as gated and leaks through the one check nobody listed.`,
        evidence: { path: p.key, where: p.where, missing: missing.map((m) => m.key) },
        signature: `send_path_rail_missing:${p.key}`,
      })
    } else covered++
  }

  return { incidents, notChecked, covered }
}

/**
 * A sender that is not in the registry at all.
 *
 * Scans for the Resend endpoint across the repo's known senders and flags any file that calls it
 * without a SEND_PATHS entry. This is what makes the registry self-policing rather than a list that
 * silently goes stale.
 */
export function detectUnregisteredSenders(files: SourceFile[]): { incidents: Incident[]; notChecked: string[] } {
  const incidents: Incident[] = []
  const notChecked: string[] = []
  const registered = new Set(SEND_PATHS.map((p) => p.file))

  for (const f of files) {
    if (f.text === null) {
      notChecked.push(f.relPath)
      continue
    }
    if (!/api\.resend\.com\/emails/.test(f.text)) continue
    if (registered.has(f.relPath)) continue
    incidents.push({
      detector: 'blind_gate',
      severity: 'critical',
      subject: f.relPath,
      summary:
        `This file can put mail on the wire (calls the Resend send endpoint) but is not in Dex's ` +
        `SEND_PATHS registry, so no rail coverage is being checked for it at all.`,
      evidence: { file: f.relPath, rule: 'every sender must be registered and classified' },
      signature: `unregistered_sender:${f.relPath}`,
    })
  }
  return { incidents, notChecked }
}

// ─── SEND HEALTH ─────────────────────────────────────────────────────────────

export type SendHealth = {
  checked: boolean
  contactedAllTime: number
  bouncedAllTime: number
  contacted7d: number
  bounced7d: number
  /** Rendered as integer/denominator. NEVER a bare percentage under n=30. */
  allTimeLine: string
  sevenDayLine: string
  breakerThreshold: number
  breakerVerdict: string
}

/** Measured bounce, external sends only — the internal exclusion is Rex's predicate. */
export async function measureSendHealth(sql: any, breakerThreshold: number): Promise<SendHealth> {
  const empty: SendHealth = {
    checked: false, contactedAllTime: 0, bouncedAllTime: 0, contacted7d: 0, bounced7d: 0,
    allTimeLine: 'Send health: NOT CHECKED (query failed).',
    sevenDayLine: 'Send health 7d: NOT CHECKED (query failed).',
    breakerThreshold, breakerVerdict: 'NOT CHECKED',
  }
  try {
    const r = (await sql.query(`
      SELECT
        count(*) FILTER (WHERE touch1_sent_at IS NOT NULL)::int AS contacted_all,
        count(*) FILTER (WHERE bounced)::int AS bounced_all,
        count(*) FILTER (WHERE touch1_sent_at > NOW() - interval '7 days')::int AS contacted_7d,
        count(*) FILTER (WHERE bounced AND bounced_at > NOW() - interval '7 days')::int AS bounced_7d
      FROM ps_outreach_leads l
      WHERE l.pipeline_stage <> 'internal_test'
        AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
        AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'`)) as any[]

    const contactedAllTime = Number(r[0]?.contacted_all ?? 0)
    const bouncedAllTime = Number(r[0]?.bounced_all ?? 0)
    const contacted7d = Number(r[0]?.contacted_7d ?? 0)
    const bounced7d = Number(r[0]?.bounced_7d ?? 0)

    return {
      checked: true,
      contactedAllTime, bouncedAllTime, contacted7d, bounced7d,
      allTimeLine: rateLine('Bounce (all-time)', bouncedAllTime, contactedAllTime),
      sevenDayLine: rateLine('Bounce (7d)', bounced7d, contacted7d),
      breakerThreshold,
      breakerVerdict: breakerVerdict(bouncedAllTime, contactedAllTime, breakerThreshold),
    }
  } catch {
    return empty
  }
}

/** Integer over denominator, always. No percentage below n=30 — the house rule. */
export function rateLine(label: string, num: number, den: number): string {
  if (den === 0) return `${label}: 0/0 — no sends, not measurable (N/A, n=0).`
  if (den < 30) return `${label}: ${num}/${den} — COUNTS ONLY, no percentage below n=30.`
  return `${label}: ${num}/${den} (${((num / den) * 100).toFixed(2)}%)`
}

/**
 * Is the breaker threshold set against the measured rate, or against an arbitrary constant?
 *
 * A threshold far ABOVE the measured rate can never trip, which means the breaker is decorative.
 * This is the "5% bounce against a threshold set 4x too high" failure, stated as a check. Dex
 * reports it and does NOT adjust it — thresholds are surfaced to Kaan, never auto-tuned.
 */
export function breakerVerdict(bounced: number, contacted: number, threshold: number): string {
  if (contacted < 30) return `n=${contacted} — too few sends to judge the threshold (no verdict below n=30).`
  const rate = bounced / contacted
  const pct = (rate * 100).toFixed(2)
  const thrPct = (threshold * 100).toFixed(2)
  if (rate >= threshold) return `TRIPPED-LEVEL: measured ${pct}% is at or above the ${thrPct}% breaker.`
  const headroom = threshold / rate
  if (headroom >= 1.5) {
    return (
      `LOOSE: measured ${pct}% vs a ${thrPct}% breaker — the threshold sits ${headroom.toFixed(1)}x above the ` +
      `real rate, so it would not trip until bounce roughly ${headroom.toFixed(1)}x-ed. That is a threshold ` +
      `set against a constant, not against measurement. SURFACED TO KAAN — Dex does not tune it.`
    )
  }
  return `OK: measured ${pct}% against a ${thrPct}% breaker (${headroom.toFixed(1)}x headroom).`
}

// ─── AUTHENTICATION / DNS ────────────────────────────────────────────────────

export type DomainAuth = {
  domain: string
  role: 'apex_outreach' | 'sim_subdomain'
  checked: boolean
  hasMx: boolean
  hasSpf: boolean
  hasDmarc: boolean
  detail: string
}

export const SENDING_DOMAINS: { domain: string; role: DomainAuth['role'] }[] = [
  { domain: 'phishsimai.com', role: 'apex_outreach' },
  { domain: 'sim.phishsimai.com', role: 'sim_subdomain' },
]

/** Live DNS. An unreachable resolver yields checked:false — NOT CHECKED, never "missing". */
export async function checkDomainAuth(domain: string, role: DomainAuth['role']): Promise<DomainAuth> {
  const base: DomainAuth = { domain, role, checked: false, hasMx: false, hasSpf: false, hasDmarc: false, detail: '' }
  const timeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns_timeout')), 6000))])
  try {
    const [mx, txt, dmarc] = await Promise.all([
      timeout(resolveMx(domain)).catch(() => [] as any[]),
      timeout(resolveTxt(domain)).catch(() => [] as string[][]),
      timeout(resolveTxt(`_dmarc.${domain}`)).catch(() => [] as string[][]),
    ])
    const flat = (t: string[][]) => t.map((r) => r.join('')).join(' | ')
    const hasSpf = /v=spf1/i.test(flat(txt as string[][]))
    const hasDmarc = /v=DMARC1/i.test(flat(dmarc as string[][]))
    const hasMxRec = Array.isArray(mx) && (mx as any[]).some((r) => r?.exchange && r.exchange !== '.')
    return {
      domain, role, checked: true, hasMx: hasMxRec, hasSpf, hasDmarc,
      detail: `MX=${hasMxRec ? 'yes' : 'no'} SPF=${hasSpf ? 'yes' : 'no'} DMARC=${hasDmarc ? 'yes' : 'no'}`,
    }
  } catch (e: any) {
    return { ...base, detail: `NOT CHECKED (${String(e?.message || e).slice(0, 40)})` }
  }
}

export function authIncidents(auths: DomainAuth[]): Incident[] {
  const out: Incident[] = []
  for (const a of auths) {
    if (!a.checked) continue // NOT CHECKED is reported in the line, never filed as a defect
    const missing: string[] = []
    if (!a.hasSpf) missing.push('SPF')
    if (!a.hasDmarc) missing.push('DMARC')
    if (!missing.length) continue
    out.push({
      detector: 'blind_gate',
      // The apex carries outreach reputation; a missing policy there is worse than on the sim
      // subdomain, which sends only into our own tenant.
      severity: (a.role === 'apex_outreach' ? 'critical' : 'high') as Severity,
      subject: `dns:${a.domain}`,
      summary:
        `Sending domain ${a.domain} (${a.role}) is missing ${missing.join(' and ')}. ` +
        `Gmail and Outlook treat bulk mail without these as unauthenticated, which costs inbox ` +
        `placement before any copy is read.`,
      evidence: { domain: a.domain, role: a.role, hasSpf: a.hasSpf, hasDmarc: a.hasDmarc, hasMx: a.hasMx },
      signature: `dns_auth_missing:${a.domain}`,
    })
  }
  return out
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────

export const DEX_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'google-postmaster-guidelines',
    name: 'Google — Email sender guidelines (Postmaster)',
    url: 'https://support.google.com/a/answer/81126',
    kind: 'vendor_doc',
    why: 'Gmail is the largest receiver in our list; its published thresholds ARE the bar, not an opinion about it.',
  },
  {
    slug: 'resend-deliverability',
    name: 'Resend — deliverability & domain reputation docs',
    url: 'https://resend.com/docs/dashboard/domains/introduction',
    kind: 'vendor_doc',
    why: 'Our actual sending provider — its throttling and suppression behaviour is what we experience.',
  },
  {
    slug: 'm3aawg-sending-practices',
    name: 'M3AAWG — sender best practices',
    url: 'https://www.m3aawg.org/published-documents',
    kind: 'standards_body',
    why: 'The industry body receivers align on; a standards-body claim outranks a vendor blog.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export const DEX_SCAN_TARGETS = [
  'server/os/sequences.ts',
  'server/os/replyParser.ts',
  'server/os/janetReport.ts',
  'server/outreach/outreachSequence.ts',
  'server/os/mxGate.ts',
  'server/os/sendGate.ts',
]

export type DexReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  pathsRegistered: number
  pathsCovered: number
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  health: SendHealth
  auth: DomainAuth[]
  notChecked: string[]
  currency: CurrencyRun | null
  line: string
}

export type DexOptions = {
  sql?: any
  root?: string
  breakerThreshold?: number
  skipCurrency?: boolean
  skipDns?: boolean
}

export async function runDexAgent(opts: DexOptions = {}): Promise<DexReport> {
  const sql = opts.sql ?? getSql()
  const root = opts.root ?? process.cwd()
  const threshold = opts.breakerThreshold ?? 0.08 // PAUSE_ON_BOUNCE_RATE in sequences.ts

  const files = DEX_SCAN_TARGETS.map((p) => readSource(p, root))
  const readable = files.filter((f) => f.text !== null).length

  const paths = auditSendPaths(files)
  const unreg = detectUnregisteredSenders(files)
  const health = await measureSendHealth(sql, threshold)
  const auth = opts.skipDns
    ? []
    : await Promise.all(SENDING_DOMAINS.map((d) => checkDomainAuth(d.domain, d.role)))

  const incidents = [...paths.incidents, ...unreg.incidents, ...authIncidents(auth)]
  const notChecked = [
    ...new Set([
      ...paths.notChecked.map((f) => `source:${f}`),
      ...unreg.notChecked.map((f) => `source:${f}`),
      ...(health.checked ? [] : ['send_health']),
      ...auth.filter((a) => !a.checked).map((a) => `dns:${a.domain}`),
    ]),
  ]

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0 }
  for (const i of incidents) bySeverity[i.severity]++

  const currency = opts.skipCurrency
    ? null
    : await runCurrencyLoop('dex', 'email deliverability, sender reputation and authentication', DEX_SOURCES, sql).catch(() => null)

  const status: DexReport['status'] = readable > 0 || health.checked ? 'ACTIVE' : 'INSUFFICIENT_DATA'
  const line = buildDexLine({ status, incidents, bySeverity, covered: paths.covered, total: SEND_PATHS.length, health, auth, notChecked })

  return {
    status,
    pathsRegistered: SEND_PATHS.length,
    pathsCovered: paths.covered,
    incidents,
    bySeverity,
    health,
    auth,
    notChecked,
    currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildDexLine(a: {
  status: DexReport['status']
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  covered: number
  total: number
  health: SendHealth
  auth: DomainAuth[]
  notChecked: string[]
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return (
      'Dex (Deliverability): insufficient data — no send path was readable and send health could not ' +
      'be measured. Gate coverage is UNKNOWN, which is not the same as covered. Playbook built and armed.'
    )
  }
  const nc = a.notChecked.length ? ` · NOT CHECKED: ${a.notChecked.join(', ')}` : ''
  const authLine = a.auth.length
    ? ` · auth: ${a.auth.map((x) => `${x.domain} ${x.checked ? x.detail : 'NOT CHECKED'}`).join(' | ')}`
    : ''
  const gate = a.incidents.length
    ? `${a.incidents.length} gate/auth defect(s) (${a.bySeverity.critical} critical)`
    : `all ${a.covered}/${a.total} send paths carry every required rail`
  return (
    `Dex (Deliverability): ${gate} · ${a.health.allTimeLine} ${a.health.sevenDayLine} ` +
    `Breaker ${a.health.breakerVerdict}${authLine}${nc}`
  )
}

/**
 * GET /api/os/dex — daily deliverability sweep at 05:50 UTC.
 *
 * Between Rex (05:45) and the metrics snapshot (06:00): Rex certifies the funnel data, Dex certifies
 * the paths that data was produced by, and both land before anything reads the numbers.
 */
export async function cronDex(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const report = await runDexAgent()
    return res.json({ success: true, ...report })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
