// ─────────────────────────────────────────────────────────────────────────────
//  PS-REX-01 — Rex, Revenue Operations. The agent that makes the other seven trustworthy.
//
//  WHY REX IS BUILT FIRST
//    Every other expert reasons on funnel data. If that data is contaminated they do not merely
//    report wrong — they ACT wrong, confidently, at whatever autonomy level they have earned. Rex is
//    the agent that would have caught the kaanari@mac.com self-test row before it entered the reply
//    rate. Build the thing that makes the others trustworthy before the others.
//
//  HIS DOCTRINE, IN ONE LINE
//    "No read surface without a live writer, and no metric over a denominator that does not exist."
//    In this file that is not a slogan — it is three detectors that fail a build and file an
//    incident.
//
//  WHAT MAKES HIM DIFFERENT FROM A LINTER
//    A linter finds code smells. Rex finds FALSE NUMBERS REACHING A HUMAN. The severity ladder is
//    written in those terms: `critical` means a fabricated value is being rendered into Janet's
//    standup right now, not that a file is untidy.
//
//  NOT CHECKED IS A FIRST-CLASS OUTCOME (inherited from competitorIntel)
//    Rex's static detectors read repository source. On a bundled serverless deploy those files may
//    not exist at runtime. An unreadable file is reported NOT CHECKED — never "clean". A scanner
//    that reports success when it scanned nothing is itself the blind-gate defect it exists to find,
//    and that failure mode would be invisible precisely because it looks like a green run.
//
//  ANTI-FABRICATION
//    Rex reports what he read. Zero incidents over an empty scan is "insufficient data — nothing
//    scanned", never "funnel integrity green".
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { getSql } from '../conn'
import { runCurrencyLoop, type CurrencyRun, type TrustedSource } from './currency'

const COMPANY = 'phishsimai'

// ─── DOCTRINE: THE STAGE MACHINE ─────────────────────────────────────────────
// The enforced definitions. A stage not in this list cannot be reasoned about, so it is a defect.

export const STAGES = ['unsanitized', 'prospect', 'engaged', 'trial', 'customer', 'dead', 'internal_test'] as const
export type Stage = (typeof STAGES)[number]

/**
 * Legal forward transitions. Deliberately NOT symmetric: `dead` is terminal by design because
 * resurrection is how a suppressed prospect gets contacted again, and that is the one funnel error
 * with a legal consequence rather than a reporting one.
 *
 * `internal_test` is terminal too — it is not a pipeline stage, it is a quarantine label. A row
 * leaving it would re-enter the metrics it was excluded from.
 */
export const LEGAL_TRANSITIONS: Record<Stage, Stage[]> = {
  unsanitized: ['prospect', 'dead', 'internal_test'],
  prospect: ['engaged', 'trial', 'customer', 'dead'],
  engaged: ['trial', 'customer', 'dead'],
  trial: ['customer', 'dead'],
  customer: ['dead'],
  dead: [],
  internal_test: [],
}

export function isLegalTransition(from: string, to: string): boolean {
  if (from === to) return true
  const allowed = LEGAL_TRANSITIONS[from as Stage]
  if (!allowed) return false
  return allowed.includes(to as Stage)
}

/**
 * THE EXCLUSION PREDICATE — Rex owns it, per spec.
 *
 * It lives here and is imported by every consumer, so there is exactly ONE definition of "not us".
 * salesReplies.ts carries its own copy inline for a deliberate reason (it must be provable at the
 * SELECT level in that file's own test), and Rex asserts the two agree — a divergence between them
 * is itself an integrity incident, because it would mean two different answers to "is this row
 * ours".
 */
export const INTERNAL_EXCLUSION_SQL = `
      AND l.pipeline_stage <> 'internal_test'
      AND lower(l.email) <> ALL (ARRAY['kaanari@mac.com','asadbek.munasar@forliion.com'])
      AND lower(split_part(l.email, '@', 2)) <> 'phishsimai.com'`

// ─── COHORTS: CURRENT PIPELINE vs LEGACY ─────────────────────────────────────
//
//  WHY THIS EXISTS
//    The lead-generation and sanitization pipeline was REPLACED. Leads acquired before the
//    replacement went out without ever passing the sanitizer, and they bounce at a completely
//    different rate. Blending them into one number makes every deliverability metric a weighted
//    average of a live system and a dead one:
//
//        CURRENT pipeline (sanitized)   11/710  =  1.55%
//        LEGACY (pre-sanitizer)         27/223  = 12.11%
//        BLENDED                        38/933  =  4.07%   <- what was being reported
//
//    4.07% is not the sending health of anything that exists. It is an artifact of averaging.
//
//  THE DISCRIMINATOR IS sanitized_at, NOT source. THIS MATTERS.
//    The obvious implementation tags dead SOURCES (lead_researcher, resend_backfill) as legacy.
//    That would be WRONG, and the data says so: google_maps — the source still running today at
//    50/day — has 20 unsanitized rows from Jul 18, before the sanitizer covered it. A source-level
//    tag would have silently mixed those 20 into the current cohort and mis-tagged an active
//    source's own history.
//
//    sanitized_at IS NOT NULL is a per-LEAD structural fact: this address was put through the
//    current pipeline. It needs no hardcoded date, no source list, and no maintenance. A source
//    that resumes feeding sanitized leads rejoins the current cohort automatically.
//
//  LEGACY IS RETAINED, NOT DELETED
//    Those 223 sends really happened and really bounced. They stay visible as their own cohort so
//    the improvement is auditable — reporting only the flattering number would be its own
//    dishonesty. What they may not do is contaminate the live figure.

export type Cohort = 'current' | 'legacy'

/** A lead that went through the current sanitization pipeline. */
export const COHORT_CURRENT_SQL = `l.sanitized_at IS NOT NULL`
/** A lead acquired before the pipeline replacement. */
export const COHORT_LEGACY_SQL = `l.sanitized_at IS NULL`

export function cohortOf(lead: { sanitized_at?: unknown }): Cohort {
  return lead.sanitized_at ? 'current' : 'legacy'
}

export type CohortMetric = { cohort: Cohort; contacted: number; bounced: number; line: string }
export type CohortSplit = { current: CohortMetric; legacy: CohortMetric; blended: CohortMetric; checked: boolean }

/** Integer over denominator; no percentage below n=30. */
export function cohortLine(label: string, bounced: number, contacted: number): string {
  if (contacted === 0) return `${label}: 0/0 (N/A, n=0)`
  if (contacted < 30) return `${label}: ${bounced}/${contacted} (counts only, n<30)`
  return `${label}: ${bounced}/${contacted} (${((bounced / contacted) * 100).toFixed(2)}%)`
}

/**
 * Bounce split by cohort. Every deliverability consumer should read `current` — `blended` is
 * returned only so a report can show what the contaminated number WAS and why it differs.
 */
export async function measureCohorts(sql: any): Promise<CohortSplit> {
  const empty = (c: Cohort): CohortMetric => ({ cohort: c, contacted: 0, bounced: 0, line: `${c}: NOT CHECKED` })
  try {
    const r = (await sql.query(`
      SELECT (l.sanitized_at IS NOT NULL) AS is_current,
             count(*) FILTER (WHERE l.touch1_sent_at IS NOT NULL)::int AS contacted,
             count(*) FILTER (WHERE l.bounced)::int AS bounced
      FROM ps_outreach_leads l
      WHERE l.touch1_sent_at IS NOT NULL ${INTERNAL_EXCLUSION_SQL}
      GROUP BY 1`)) as any[]

    const cur = r.find((x) => x.is_current === true)
    const leg = r.find((x) => x.is_current === false)
    const cC = Number(cur?.contacted ?? 0), cB = Number(cur?.bounced ?? 0)
    const lC = Number(leg?.contacted ?? 0), lB = Number(leg?.bounced ?? 0)

    return {
      current: { cohort: 'current', contacted: cC, bounced: cB, line: cohortLine('Bounce (current pipeline)', cB, cC) },
      legacy: { cohort: 'legacy', contacted: lC, bounced: lB, line: cohortLine('Bounce (legacy, pre-sanitizer)', lB, lC) },
      blended: { cohort: 'current', contacted: cC + lC, bounced: cB + lB, line: cohortLine('Bounce (blended — do NOT quote)', cB + lB, cC + lC) },
      checked: true,
    }
  } catch {
    return { current: empty('current'), legacy: empty('legacy'), blended: empty('current'), checked: false }
  }
}

// ─── INCIDENT MODEL ──────────────────────────────────────────────────────────

export type Detector = 'fabricated_writer' | 'pricing_drift' | 'blind_gate' | 'stage_violation'
export type Severity = 'critical' | 'high' | 'medium'

export type Incident = {
  detector: Detector
  severity: Severity
  subject: string
  summary: string
  evidence: Record<string, unknown>
  signature: string
}

// ─── SOURCE READING ──────────────────────────────────────────────────────────

export type SourceFile = { relPath: string; text: string | null }

/** Read a repo file. null means UNREADABLE, which is reported, never treated as absent-and-fine. */
export function readSource(relPath: string, root = process.cwd()): SourceFile {
  try {
    return { relPath, text: fs.readFileSync(path.resolve(root, relPath), 'utf8') }
  } catch {
    return { relPath, text: null }
  }
}

// ─── DETECTOR 1: FABRICATED WRITERS ──────────────────────────────────────────
//
// THE STRUCTURAL SIGNAL, not a hardcoded list of known-bad files.
//   A module that writes "facts" into the memory/lesson store while reading NO data is asserting
//   things it did not measure. `rememberFact()` attaches a confidence to a claim; a module that
//   calls it without ever calling `getSql()` is attaching confidence to a literal that a developer
//   typed months ago. That is fabrication by construction, and it is detectable structurally, which
//   means this detector will catch the NEXT ghost as well as the current ones.
//
// A high stated confidence makes it worse, so it raises severity rather than being the trigger.

const REMEMBER_RE = /\brememberFact\s*\(/
const READS_DB_RE = /\bgetSql\s*\(/
const HIGH_CONF_RE = /confidence\s*:\s*(0\.[89]\d*|1(\.0+)?)\b/

export function detectFabricatedWriters(files: SourceFile[]): { incidents: Incident[]; notChecked: string[] } {
  const incidents: Incident[] = []
  const notChecked: string[] = []

  for (const f of files) {
    if (f.text === null) {
      notChecked.push(f.relPath)
      continue
    }
    if (!REMEMBER_RE.test(f.text)) continue // writes no facts — not this detector's business
    if (READS_DB_RE.test(f.text)) continue // reads real data before it speaks

    const conf = f.text.match(HIGH_CONF_RE)?.[1] ?? null
    incidents.push({
      detector: 'fabricated_writer',
      // critical: these modules are wired into Janet's 08:00 standup, so the fabricated value is
      // rendered to a human every morning.
      severity: 'critical',
      subject: f.relPath,
      summary:
        `Writes facts to the memory store but reads no data (calls rememberFact, never calls getSql). ` +
        `Its output is a hardcoded literal presented as a measurement` +
        (conf ? `, asserted at confidence ${conf}.` : '.'),
      evidence: {
        writesFacts: true,
        readsDatabase: false,
        statedConfidence: conf,
        rule: 'no read surface without a live writer — inverted: no asserted fact without a live read',
      },
      signature: `fabricated_writer:${f.relPath}`,
    })
  }
  return { incidents, notChecked }
}

// ─── DETECTOR 2: PRICING DRIFT ───────────────────────────────────────────────
//
// DOCTRINE, NOT COMPARISON, IS THE TRIGGER.
//   The permanent lesson `phishsim:pricing-frozen-live-stripe` says: never quote a price not read
//   from server/stripe/prices.ts. So a price-shaped literal bound to a revenue identifier is a
//   defect REGARDLESS of whether it happens to match Stripe today — matching by luck is still a
//   number that will silently go stale when Stripe changes.
//
//   This is why the detector needs no network and cannot report a false green when Stripe is
//   unreachable. When live prices ARE available they are attached as evidence, which upgrades the
//   finding from "hardcoded" to "hardcoded AND matches no live price" — strictly more damning, never
//   the thing the detection depends on.

// PER-UNIT PRICE identifiers only. `mrr` and `arr` are deliberately NOT here, and the reason is a
// real false positive this detector produced on its first live run: finance.ts contains a milestone
// ladder — { mrr: 500 }, { mrr: 2500 }, { mrr: 5000 }, { mrr: 10000 } — which are GOAL THRESHOLDS,
// not prices. Flagging them buried the one true finding (avgRevenue = 99) under four wrong ones.
//
// The tradeoff is deliberate and worth stating: a genuinely hardcoded MRR would now slip past this
// detector. That is acceptable because MRR is a computed aggregate rather than a quoted price — the
// doctrine being enforced is "never quote a price not read from Stripe" — and because a module that
// hardcodes its own MRR while reading no data is caught by detectFabricatedWriters instead. A
// detector that cries wolf four times out of five gets ignored, and an ignored detector protects
// nothing.
const PRICE_LITERAL_RE =
  /\b((?:avg|average)[_A-Za-z]*revenue|revenue[_A-Za-z]*per[_A-Za-z]*|[_A-Za-z]*price[_A-Za-z]*|[_A-Za-z]*per[_A-Za-z]*seat[_A-Za-z]*|monthly[_A-Za-z]*(?:rate|amount|cost|price)|unit[_A-Za-z]*amount)\s*[:=]\s*(\d{2,5})\b/gi

/** Identifiers that look price-ish but are counts/ids/limits, not money. */
const NOT_MONEY_RE = /(price_?id|priceid|_cents|cents|maxprice|price_?count|_ms\b|_idx|_limit)/i

export function detectPricingDrift(
  files: SourceFile[],
  livePricesUsd: number[] | null,
): { incidents: Incident[]; notChecked: string[] } {
  const incidents: Incident[] = []
  const notChecked: string[] = []

  for (const f of files) {
    if (f.text === null) {
      notChecked.push(f.relPath)
      continue
    }
    // The Stripe reader itself legitimately handles price values; it is the source of truth, not a
    // consumer of it.
    if (f.relPath.includes('server/stripe/')) continue

    const seen = new Set<string>()
    for (const m of f.text.matchAll(PRICE_LITERAL_RE)) {
      const ident = m[1]
      const value = Number(m[2])
      if (NOT_MONEY_RE.test(ident)) continue
      if (value < 10 || value > 20000) continue // out of plausible monthly-price range
      const key = `${ident}=${value}`
      if (seen.has(key)) continue
      seen.add(key)

      const matchesLive = livePricesUsd ? livePricesUsd.includes(value) : null
      incidents.push({
        detector: 'pricing_drift',
        // critical when we can prove it matches no live price; high when Stripe was unreachable and
        // we can only prove it is hardcoded.
        severity: matchesLive === false ? 'critical' : 'high',
        subject: `${f.relPath}:${ident}`,
        summary:
          `Hardcoded price-shaped literal \`${ident} = ${value}\` in revenue-computing code. ` +
          (matchesLive === false
            ? `This value matches NO live Stripe price — any figure derived from it is fabricated.`
            : matchesLive === true
              ? `It happens to match a live Stripe price today, but a copy is still drift waiting to happen.`
              : `Live Stripe prices were NOT CHECKED this run, so only the hardcoding is proven.`) +
          ` Doctrine: never quote a price not read from server/stripe/prices.ts.`,
        evidence: {
          identifier: ident,
          value,
          livePricesUsd: livePricesUsd ?? 'NOT CHECKED',
          matchesLivePrice: matchesLive,
          lesson: 'phishsim:pricing-frozen-live-stripe',
        },
        signature: `pricing_drift:${f.relPath}:${ident}`,
      })
    }
  }
  return { incidents, notChecked }
}

// ─── DETECTOR 3: BLIND GATES ─────────────────────────────────────────────────
//
// A read surface whose writer has never proven it fires. The classic shape: a table is created, a
// consumer is written against it, a cron is registered to fill it — and the cron has never
// successfully inserted a row, so every consumer silently reads an empty set and reports nothing
// wrong. This is the exact class that hid the autonomy ladder for weeks.

export type ReadSurface = {
  table: string
  /** Column proving a write happened; used for the freshness half of the check. */
  writtenAtColumn: string
  /** The route that is supposed to fill it. */
  writerRoute: string
  /** Human description of cadence, for the incident text. */
  cadence: string
  /** Who reads it. An empty surface with consumers is worse than one with none. */
  consumers: string[]
}

export const READ_SURFACES: ReadSurface[] = [
  {
    table: 'os_competitor_intel',
    writtenAtColumn: 'captured_at',
    writerRoute: '/api/os/competitor-intel',
    cadence: 'weekly, Mondays 05:30 UTC',
    consumers: ['Janet weekly brief (competitorIntelLine)', 'permanent lesson phishsim:competitor-pricing-study-2026 cross-check'],
  },
  {
    table: 'metrics_daily',
    writtenAtColumn: 'created_at',
    writerRoute: '/api/os/metrics-snapshot',
    cadence: 'daily 06:00 UTC',
    consumers: ['clean-day compute (posture check 8)', 'autonomy promotion'],
  },
  {
    table: 'os_agent_lessons',
    writtenAtColumn: 'created_at',
    writerRoute: 'seedPermanentLessons + agent outcome learning',
    cadence: 'on boot and per agent run',
    consumers: ['getAgentLessonsForPrompt (every agent context)'],
  },
  {
    table: 'outreach_reply_drafts',
    writtenAtColumn: 'created_at',
    writerRoute: 'replyCapture (Gmail/Resend inbound)',
    cadence: 'event-driven',
    consumers: ['Sales reply agent queue'],
  },
]

export type SurfaceState = { surface: ReadSurface; rows: number; lastWriteISO: string | null; checked: boolean }

export async function readSurfaceStates(sql: any, surfaces = READ_SURFACES): Promise<SurfaceState[]> {
  const out: SurfaceState[] = []
  for (const s of surfaces) {
    try {
      const r = (await sql.query(
        `SELECT count(*)::int AS n, max(${s.writtenAtColumn})::text AS last_write FROM ${s.table}`,
      )) as any[]
      out.push({ surface: s, rows: Number(r[0]?.n ?? 0), lastWriteISO: r[0]?.last_write ?? null, checked: true })
    } catch {
      // Table missing or column wrong — NOT CHECKED, never "0 rows". Those are different facts.
      out.push({ surface: s, rows: 0, lastWriteISO: null, checked: false })
    }
  }
  return out
}

export function detectBlindGates(states: SurfaceState[]): { incidents: Incident[]; notChecked: string[] } {
  const incidents: Incident[] = []
  const notChecked: string[] = []

  for (const st of states) {
    if (!st.checked) {
      notChecked.push(st.surface.table)
      continue
    }
    if (st.rows > 0) continue // the writer has proven it fires at least once

    incidents.push({
      detector: 'blind_gate',
      // high, not critical: an empty surface reports nothing rather than something false. It becomes
      // critical the moment a consumer starts treating "no rows" as "no change".
      severity: 'high',
      subject: st.surface.table,
      summary:
        `Read surface with an UNPROVEN writer: 0 rows, and the writer ${st.surface.writerRoute} ` +
        `(${st.surface.cadence}) has never successfully inserted. ` +
        `${st.surface.consumers.length} consumer(s) read this table and cannot distinguish ` +
        `"nothing happened" from "the writer never ran".`,
      evidence: {
        rows: 0,
        lastWrite: null,
        writerRoute: st.surface.writerRoute,
        cadence: st.surface.cadence,
        consumers: st.surface.consumers,
        rule: 'no read surface without a live writer',
      },
      signature: `blind_gate:${st.surface.table}`,
    })
  }
  return { incidents, notChecked }
}

// ─── DETECTOR 4: STAGE VIOLATIONS ────────────────────────────────────────────
//
// Impossible funnel states. Each is a SQL predicate that should return zero rows; a non-zero count
// means the stage machine and the timestamps disagree, and every downstream conversion metric
// inherits the disagreement.

export type StageCheck = { key: string; severity: Severity; why: string; sql: string }

export const STAGE_CHECKS: StageCheck[] = [
  {
    key: 'customer_without_customer_at',
    severity: 'critical',
    why: 'Marked customer with no customer_at — revenue attribution and cohort math both break silently.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads WHERE pipeline_stage='customer' AND customer_at IS NULL`,
  },
  {
    key: 'trial_without_trial_at',
    severity: 'high',
    why: 'Marked trial with no trial_at — trial→paid timing cannot be computed.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads WHERE pipeline_stage='trial' AND trial_at IS NULL`,
  },
  {
    key: 'converted_but_stage_stale',
    severity: 'critical',
    why: 'customer_at is set but the stage never advanced — the lead converted and the funnel does not know.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads WHERE customer_at IS NOT NULL AND pipeline_stage <> 'customer'`,
  },
  {
    key: 'suppressed_but_active_stage',
    severity: 'critical',
    why: 'Unsubscribed but still in an active stage — this row is eligible to be contacted again, which is the one funnel error with a legal consequence.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads WHERE unsubscribed=true AND pipeline_stage NOT IN ('dead','internal_test')`,
  },
  {
    key: 'suppression_not_reconciled',
    severity: 'high',
    why: 'A suppression row exists but the lead is not flagged unsubscribed — provider truth and DB state disagree.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_suppression s
          JOIN ps_outreach_leads l ON lower(l.email)=lower(s.email)
          WHERE l.unsubscribed = false`,
  },
  {
    key: 'replied_without_timestamp',
    severity: 'medium',
    why: 'replied=true with no replied_at — reply-latency and reply-rate windows silently exclude these.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads WHERE replied=true AND replied_at IS NULL`,
  },
  {
    key: 'unknown_stage',
    severity: 'high',
    why: 'A pipeline_stage outside the declared stage machine — no agent can reason about it, so it is invisible to every funnel metric.',
    sql: `SELECT count(*)::int AS n FROM ps_outreach_leads
          WHERE pipeline_stage IS NULL OR pipeline_stage <> ALL (ARRAY['unsanitized','prospect','engaged','trial','customer','dead','internal_test'])`,
  },
]

export async function detectStageViolations(
  sql: any,
  checks = STAGE_CHECKS,
): Promise<{ incidents: Incident[]; notChecked: string[] }> {
  const incidents: Incident[] = []
  const notChecked: string[] = []

  for (const c of checks) {
    let n: number | null = null
    try {
      const r = (await sql.query(c.sql)) as any[]
      n = Number(r[0]?.n ?? 0)
    } catch {
      notChecked.push(c.key)
      continue
    }
    if (!n) continue
    incidents.push({
      detector: 'stage_violation',
      severity: c.severity,
      subject: `ps_outreach_leads:${c.key}`,
      summary: `${n} row(s) in an impossible funnel state — ${c.why}`,
      evidence: { check: c.key, rows: n, predicate: c.sql.replace(/\s+/g, ' ').trim() },
      signature: `stage_violation:${c.key}`,
    })
  }
  return { incidents, notChecked }
}

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

/** Upsert by signature: re-finding a known defect refreshes last_seen, it does not re-file. */
export async function fileIncidents(sql: any, incidents: Incident[]): Promise<number> {
  let filed = 0
  for (const i of incidents) {
    try {
      await sql`INSERT INTO os_integrity_incidents
        (product_id, detector, severity, subject, summary, evidence, signature)
        VALUES (${COMPANY}, ${i.detector}, ${i.severity}, ${i.subject}, ${i.summary},
                ${JSON.stringify(i.evidence)}::jsonb, ${i.signature})
        ON CONFLICT (product_id, signature) DO UPDATE
          SET last_seen = NOW(), severity = EXCLUDED.severity,
              summary = EXCLUDED.summary, evidence = EXCLUDED.evidence,
              resolved_at = NULL`
      filed++
    } catch {
      /* a single failed insert must not abort the sweep */
    }
  }
  return filed
}

/**
 * Close incidents that this run did NOT re-detect — but only within detectors that actually ran.
 *
 * The `checkedDetectors` argument is the safety property: if the static scan could not read any
 * source files, its detectors did not run, and auto-resolving their open incidents would silently
 * mark every fabrication "fixed" because we went blind. Resolution is only ever inferred from a
 * detector that produced a real result.
 */
export async function resolveMissing(
  sql: any,
  found: Incident[],
  checkedDetectors: Detector[],
): Promise<number> {
  if (!checkedDetectors.length) return 0
  const sigs = found.map((i) => i.signature)
  try {
    const r = (await sql`UPDATE os_integrity_incidents
      SET resolved_at = NOW()
      WHERE product_id=${COMPANY}
        AND resolved_at IS NULL
        AND detector = ANY(${checkedDetectors}::text[])
        AND NOT (signature = ANY(${sigs}::text[]))
      RETURNING 1`) as any[]
    return r.length
  } catch {
    return 0
  }
}

/**
 * SELF-LEARNING: every incident becomes a permanent guard.
 *
 * The lesson is written to os_agent_lessons — the PRODUCT-OWNED store, never kaan-os-core (that
 * directory is a pinned vendored copy and CI rejects edits to it; see memory.ts:90). Idempotent by
 * signature, so a defect that persists for a month produces one guard, not thirty.
 *
 * success=false and a negative confidence_delta are the point: these are failures we paid for.
 */
export async function writeGuardLessons(sql: any, incidents: Incident[]): Promise<number> {
  let written = 0
  for (const i of incidents) {
    const signature = `phishsim:guard:${i.signature}`
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id=${COMPANY} AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) continue

    const lesson =
      `PERMANENT GUARD (Rex, ${i.detector}, severity ${i.severity}). SUBJECT: ${i.subject}. ` +
      `DEFECT: ${i.summary} ` +
      `EVIDENCE: ${JSON.stringify(i.evidence)}. ` +
      `RULE: this class of defect must be caught before it enters a reported metric — if this ` +
      `signature reappears after being resolved, it is a regression, not a new finding.`

    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES (${COMPANY}, 'rex', 'integrity_incident', ${signature}, ${lesson}, false, 0, -0.2)`
      .catch(() => {})
    written++
  }
  return written
}

// ─── CURRENCY LOOP ───────────────────────────────────────────────────────────

/** Rex's named trusted sources: RevOps practice and data-integrity engineering. */
export const REX_SOURCES: readonly TrustedSource[] = [
  {
    slug: 'dbt-data-quality',
    name: 'dbt Labs — data quality & testing guide',
    url: 'https://docs.getdbt.com/docs/build/data-tests',
    kind: 'vendor_doc',
    why: 'The reference implementation for assertion-based data testing; Rex\'s guard-per-incident rule is the same idea applied to a funnel.',
  },
  {
    slug: 'ga-data-quality-dimensions',
    name: 'Great Expectations — expectations & data-quality dimensions',
    url: 'https://docs.greatexpectations.io/docs/core/introduction/try_gx',
    kind: 'vendor_doc',
    why: 'Names the dimensions (completeness, validity, consistency) Rex scores stage accuracy against.',
  },
  {
    slug: 'stripe-billing-integrity',
    name: 'Stripe — subscription lifecycle & billing states',
    url: 'https://docs.stripe.com/billing/subscriptions/overview',
    kind: 'vendor_doc',
    why: 'Authoritative on the states a paying customer can be in; Rex reconciles Stripe truth against CRM stage.',
  },
]

// ─── THE AGENT ───────────────────────────────────────────────────────────────

export type RexReport = {
  status: 'ACTIVE' | 'INSUFFICIENT_DATA'
  scanned: { sourceFiles: number; readSurfaces: number; stageChecks: number }
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  filed: number
  resolved: number
  guardsWritten: number
  notChecked: string[]
  /** Which metrics the other agents may rely on this cycle, and which are suspect. */
  trustedMetrics: string[]
  suspectMetrics: string[]
  currency: CurrencyRun | null
  line: string
}

/** The modules Rex scans. Revenue-computing and fact-asserting code only — bounded and meaningful. */
export const SCAN_TARGETS = [
  'server/os/agents/aria.ts',
  'server/os/agents/product.ts',
  'server/os/agents/scout.ts',
  'server/os/agents/finance.ts',
  'server/os/agents/customerSuccess.ts',
  'server/os/agents/sales.ts',
  'server/os/agents/ea.ts',
  'server/os/janetReport.ts',
]

export type RexOptions = {
  sql?: any
  root?: string
  /** Live Stripe prices in whole dollars, or null when NOT CHECKED. */
  livePricesUsd?: number[] | null
  /** Skip the network currency loop (tests, and any run where egress is not wanted). */
  skipCurrency?: boolean
}

export async function runRexAgent(opts: RexOptions = {}): Promise<RexReport> {
  const sql = opts.sql ?? getSql()
  const root = opts.root ?? process.cwd()
  const livePrices = opts.livePricesUsd ?? null

  const files = SCAN_TARGETS.map((p) => readSource(p, root))
  const readable = files.filter((f) => f.text !== null).length

  const fab = detectFabricatedWriters(files)
  const drift = detectPricingDrift(files, livePrices)
  const states = await readSurfaceStates(sql)
  const blind = detectBlindGates(states)
  const stage = await detectStageViolations(sql)

  const incidents = [...fab.incidents, ...drift.incidents, ...blind.incidents, ...stage.incidents]
  const notChecked = [
    ...fab.notChecked.map((p) => `source:${p}`),
    ...blind.notChecked.map((t) => `table:${t}`),
    ...stage.notChecked.map((k) => `check:${k}`),
  ]
  // Deduped: fab and drift scan the same file list, so an unreadable file would otherwise appear twice.
  const uniqueNotChecked = [...new Set(notChecked)]

  // Only detectors that produced a real result may auto-resolve their own open incidents.
  const checkedDetectors: Detector[] = []
  if (readable > 0) checkedDetectors.push('fabricated_writer', 'pricing_drift')
  if (states.some((s) => s.checked)) checkedDetectors.push('blind_gate')
  if (stage.notChecked.length < STAGE_CHECKS.length) checkedDetectors.push('stage_violation')

  const filed = await fileIncidents(sql, incidents)
  const resolved = await resolveMissing(sql, incidents, checkedDetectors)
  const guardsWritten = await writeGuardLessons(sql, incidents)

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0 }
  for (const i of incidents) bySeverity[i.severity]++

  // Which metrics the other seven may rely on. Derived from what Rex actually found — a metric is
  // suspect because a detector says so, never because it "feels" risky.
  const suspectMetrics: string[] = []
  const trustedMetrics: string[] = []
  const has = (d: Detector) => incidents.some((i) => i.detector === d)

  if (has('fabricated_writer')) suspectMetrics.push('any figure sourced from a fabricated-writer module (see incidents)')
  if (has('pricing_drift')) suspectMetrics.push('MRR / revenue forecast (hardcoded price literal in the computation)')
  if (has('blind_gate')) suspectMetrics.push(...incidents.filter((i) => i.detector === 'blind_gate').map((i) => `${i.subject} (0 rows, unproven writer)`))
  if (has('stage_violation')) suspectMetrics.push('stage-derived conversion rates (stage machine and timestamps disagree)')

  if (!has('stage_violation') && stage.notChecked.length === 0) {
    trustedMetrics.push('funnel stage counts over ps_outreach_leads (stage machine consistent)')
    trustedMetrics.push('contacted / bounced / unsubscribed counts with the internal exclusion applied')
  }

  const currency = opts.skipCurrency ? null : await runCurrencyLoop('rex', 'revenue operations and data integrity', REX_SOURCES, sql).catch(() => null)

  // ANTI-FABRICATION: nothing scanned means insufficient data, NOT a green report.
  const scannedAnything = readable > 0 || states.some((s) => s.checked) || stage.notChecked.length < STAGE_CHECKS.length
  const status: RexReport['status'] = scannedAnything ? 'ACTIVE' : 'INSUFFICIENT_DATA'

  const line = buildRexLine({ status, incidents, bySeverity, readable, total: SCAN_TARGETS.length, notChecked: uniqueNotChecked, resolved })

  return {
    status,
    scanned: { sourceFiles: readable, readSurfaces: states.filter((s) => s.checked).length, stageChecks: STAGE_CHECKS.length - stage.notChecked.length },
    incidents,
    bySeverity,
    filed,
    resolved,
    guardsWritten,
    notChecked: uniqueNotChecked,
    trustedMetrics,
    suspectMetrics,
    currency,
    line: currency ? `${line} ${currency.line}` : line,
  }
}

export function buildRexLine(a: {
  status: RexReport['status']
  incidents: Incident[]
  bySeverity: Record<Severity, number>
  readable: number
  total: number
  notChecked: string[]
  resolved: number
}): string {
  if (a.status === 'INSUFFICIENT_DATA') {
    return (
      'Rex (RevOps): insufficient data — nothing was scannable this run (no source files readable, ' +
      'no tables reachable). Funnel trust level is UNKNOWN, which is NOT the same as green. ' +
      'Playbook built and armed; detectors will report on the next run that can read something.'
    )
  }
  const nc = a.notChecked.length ? ` · NOT CHECKED: ${a.notChecked.slice(0, 6).join(', ')}${a.notChecked.length > 6 ? ` (+${a.notChecked.length - 6})` : ''}` : ''
  const res = a.resolved ? ` · ${a.resolved} previously-open incident(s) no longer detected → resolved` : ''
  if (!a.incidents.length) {
    return (
      `Rex (RevOps): funnel trust GREEN — ${a.readable}/${a.total} modules scanned, stage machine ` +
      `consistent, every read surface has a proven writer. 0 integrity incidents${res}${nc}.`
    )
  }
  const top = a.incidents
    .filter((i) => i.severity === 'critical')
    .slice(0, 4)
    .map((i) => i.subject)
  return (
    `Rex (RevOps): funnel trust ${a.bySeverity.critical ? 'RED' : 'AMBER'} — ${a.incidents.length} integrity ` +
    `incident(s) (${a.bySeverity.critical} critical, ${a.bySeverity.high} high, ${a.bySeverity.medium} medium) ` +
    `across ${a.readable}/${a.total} modules scanned` +
    (top.length ? ` · critical: ${top.join(', ')}` : '') +
    `${res}${nc}. Every incident is filed and has a permanent guard lesson.`
  )
}

// ─── CRON ────────────────────────────────────────────────────────────────────

/**
 * GET /api/os/rex — daily integrity sweep.
 *
 * Scheduled at 05:45 UTC, deliberately BEFORE the 06:00 metrics snapshot: Rex's job is to say
 * whether today's numbers can be trusted, and a verdict that arrives after the number it judges has
 * already been written and consumed is a post-mortem, not a gate. This ordering is asserted in
 * cronOrdering.test.ts so it cannot drift.
 */
export async function cronRex(req: any, res: any) {
  const secret = req.query?.secret ?? req.headers?.['x-cron-secret']
  const okCron = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  const okHq = !!process.env.HQ_SECRET && secret === process.env.HQ_SECRET
  const viaVercel = !!req.headers?.['x-vercel-cron']
  if (!okCron && !okHq && !viaVercel) return res.status(401).json({ error: 'Unauthorized' })

  try {
    // Live Stripe prices strengthen the drift finding but are never required for it.
    let livePricesUsd: number[] | null = null
    try {
      const { loadPhishSimPrices } = await import('../../stripe/prices')
      const prices = await loadPhishSimPrices()
      livePricesUsd = prices
        .filter((p) => p.interval === 'monthly' && typeof p.unitAmount === 'number')
        .map((p) => Math.round((p.unitAmount as number) / 100))
    } catch {
      livePricesUsd = null // NOT CHECKED — the detector still fires on the hardcoding itself
    }

    const report = await runRexAgent({ livePricesUsd })
    return res.json({ success: true, ...report })
  } catch (e: any) {
    return res.status(500).json({ success: false, error: String(e?.message || e) })
  }
}
