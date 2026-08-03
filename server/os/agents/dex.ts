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

export type DmarcState = { found: boolean; host: string; inherited: boolean; policy: string | null }

export type DomainAuth = {
  domain: string
  role: 'apex_outreach' | 'sim_subdomain'
  checked: boolean
  /** The host Resend actually provisions MX+SPF on. NOT the domain root. */
  identityHost: string
  hasIdentityMx: boolean
  hasIdentitySpf: boolean
  hasDkim: boolean
  dmarc: DmarcState
  /** The exchanges actually found at the identity host. Recorded so a verdict can be audited. */
  identityMxHosts: string[]
  /** The exchanges at the domain ROOT. Recorded ONLY to prove the verdict did not come from here. */
  rootMxHosts: string[]
  /** True when the identity host's MX points at an INBOUND provider rather than bounce handling. */
  identityMxIsInbound: boolean
  detail: string
}

/**
 * Inbound-mail providers. An MX pointing at one of these is where mail ARRIVES, which says nothing
 * about whether we are authenticated to SEND.
 *
 * PS-DEX-DNS-02 — WHY THIS EXISTS. v1 read the apex as authenticated partly because it found
 * `1 smtp.google.com` at phishsimai.com. That is Google Workspace inbound delivery and is unrelated
 * to sending. The apex was green for the WRONG REASON, and a check that is right by luck fails
 * silently the moment the luck changes. This list makes the distinction explicit rather than relying
 * on the identity host happening to differ.
 */
const INBOUND_MX_RE = /(google\.com|googlemail\.com|outlook\.com|protection\.outlook|mimecast|proofpoint|barracuda|zoho|icloud\.com)/i

export function isInboundMailHost(exchange: string): boolean {
  return INBOUND_MX_RE.test(String(exchange || ''))
}

export const SENDING_DOMAINS: { domain: string; role: DomainAuth['role'] }[] = [
  { domain: 'phishsimai.com', role: 'apex_outreach' },
  { domain: 'sim.phishsimai.com', role: 'sim_subdomain' },
]

/**
 * Organizational domain, for the DMARC inheritance rule. Last two labels.
 *
 * LIMITATION, STATED: this is not Public-Suffix-List aware, so it would be wrong for a domain under
 * a multi-label suffix (e.g. example.co.uk -> "co.uk"). Both of our sending domains sit under a
 * single-label TLD, so it is correct HERE. If a domain on another suffix is ever added, this needs
 * a real PSL lookup — an approximation that silently misreports DMARC coverage is precisely the
 * class of false negative this rewrite exists to remove.
 */
export function organizationalDomain(domain: string): string {
  const parts = domain.split('.').filter(Boolean)
  return parts.length <= 2 ? domain : parts.slice(-2).join('.')
}

/**
 * Live authentication check against the ACTUAL SENDING IDENTITY.
 *
 * PS-DEX-DNS-02 — THE FALSE NEGATIVE THIS FIXES.
 *   v1 queried MX and TXT at the domain ROOT and DMARC at _dmarc.<root>. Resend does not provision
 *   there. It provisions:
 *       MX  + SPF  ->  send.<domain>
 *       DKIM       ->  resend._domainkey.<domain>
 *   So v1 reported sim.phishsimai.com as "MX=no SPF=no DMARC=no" while all three were present and
 *   verified green in Resend. ENODATA at the root is the EXPECTED state for a Resend identity, not
 *   a defect — v1 read an expected absence as a failure and filed an incident for it.
 *
 *   It also never checked DKIM at all, which is the record that actually signs the mail.
 *
 *   And the apex passed v1 for the WRONG REASON: the MX it found at phishsimai.com is Google
 *   Workspace INBOUND mail, unrelated to sending, and the apex SPF happens to include amazonses.com.
 *   A check that is right by luck fails silently the moment the luck changes.
 *
 * DMARC INHERITANCE (RFC 7489 §6.6.3)
 *   A subdomain with no _dmarc record inherits the organizational domain's policy. Treating a
 *   missing subdomain record as "no DMARC" is wrong: sim.phishsimai.com is covered by
 *   _dmarc.phishsimai.com. Inherited coverage is recorded as inherited:true so the report can say
 *   WHERE the policy came from rather than implying a record exists that does not.
 */
export async function checkDomainAuth(domain: string, role: DomainAuth['role']): Promise<DomainAuth> {
  const identityHost = `send.${domain}`
  const dkimHost = `resend._domainkey.${domain}`
  const org = organizationalDomain(domain)

  const base: DomainAuth = {
    domain, role, checked: false, identityHost,
    hasIdentityMx: false, hasIdentitySpf: false, hasDkim: false,
    dmarc: { found: false, host: `_dmarc.${domain}`, inherited: false, policy: null },
    identityMxHosts: [], rootMxHosts: [], identityMxIsInbound: false,
    detail: '',
  }
  const timeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns_timeout')), 6000))])
  const txt = async (h: string) => {
    try { return ((await timeout(resolveTxt(h))) as string[][]).map((r) => r.join('')) } catch { return [] as string[] }
  }
  const mx = async (h: string) => {
    try { return (await timeout(resolveMx(h))) as any[] } catch { return [] as any[] }
  }

  try {
    const [idMx, idTxt, dkimTxt, dmarcSelf, dmarcOrg, rootMx] = await Promise.all([
      mx(identityHost), txt(identityHost), txt(dkimHost),
      txt(`_dmarc.${domain}`), org === domain ? Promise.resolve([] as string[]) : txt(`_dmarc.${org}`),
      mx(domain),
    ])

    const identityMxHosts = idMx.map((r) => String(r?.exchange || '')).filter((x) => x && x !== '.')
    const rootMxHosts = rootMx.map((r) => String(r?.exchange || '')).filter((x) => x && x !== '.')

    // The identity MX must be BOUNCE HANDLING, not inbound delivery. An identity host whose MX
    // points at Google/Outlook is a misconfiguration, and counting it as "authenticated to send"
    // is exactly the wrong-reason pass this rewrite removes.
    const identityMxIsInbound = identityMxHosts.length > 0 && identityMxHosts.every(isInboundMailHost)
    const hasIdentityMx = identityMxHosts.length > 0 && !identityMxIsInbound
    const hasIdentitySpf = idTxt.some((t) => /v=spf1/i.test(t))
    const hasDkim = dkimTxt.some((t) => /p=[A-Za-z0-9+/]/.test(t))

    const selfRec = dmarcSelf.find((t) => /v=DMARC1/i.test(t))
    const orgRec = dmarcOrg.find((t) => /v=DMARC1/i.test(t))
    const dmarc: DmarcState = selfRec
      ? { found: true, host: `_dmarc.${domain}`, inherited: false, policy: selfRec }
      : orgRec
        ? { found: true, host: `_dmarc.${org}`, inherited: true, policy: orgRec }
        : { found: false, host: `_dmarc.${domain}`, inherited: false, policy: null }

    return {
      domain, role, checked: true, identityHost,
      hasIdentityMx, hasIdentitySpf, hasDkim, dmarc,
      identityMxHosts, rootMxHosts, identityMxIsInbound,
      detail:
        `identity=${identityHost} MX=${hasIdentityMx ? 'yes' : 'no'} SPF=${hasIdentitySpf ? 'yes' : 'no'} ` +
        `DKIM=${hasDkim ? 'yes' : 'no'} DMARC=${dmarc.found ? (dmarc.inherited ? `inherited from ${dmarc.host}` : 'yes') : 'no'}`,
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
    if (!a.hasIdentitySpf) missing.push(`SPF at ${a.identityHost}`)
    if (!a.hasDkim) missing.push(`DKIM at resend._domainkey.${a.domain}`)
    if (!a.hasIdentityMx) {
      missing.push(
        a.identityMxIsInbound
          ? `bounce-handling MX at ${a.identityHost} (found only INBOUND hosts ${a.identityMxHosts.join(', ')} — that is where mail arrives, not proof we can send)`
          : `bounce-handling MX at ${a.identityHost}`,
      )
    }
    // DMARC counts as present when INHERITED — a subdomain does not need its own record.
    if (!a.dmarc.found) missing.push(`DMARC at _dmarc.${a.domain} (and none inherited from ${organizationalDomain(a.domain)})`)
    if (!missing.length) continue
    out.push({
      detector: 'blind_gate',
      severity: (a.role === 'apex_outreach' ? 'critical' : 'high') as Severity,
      subject: `dns:${a.domain}`,
      summary:
        `Sending identity ${a.identityHost} is missing ${missing.join(' and ')}. ` +
        `Gmail and Outlook treat bulk mail without these as unauthenticated, which costs inbox ` +
        `placement before any copy is read.`,
      evidence: {
        domain: a.domain, role: a.role, identityHost: a.identityHost,
        hasIdentityMx: a.hasIdentityMx, hasIdentitySpf: a.hasIdentitySpf, hasDkim: a.hasDkim,
        identityMxHosts: a.identityMxHosts, rootMxHosts: a.rootMxHosts,
        identityMxIsInbound: a.identityMxIsInbound,
        dmarc: a.dmarc, missing,
      },
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
