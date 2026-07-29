// ─────────────────────────────────────────────────────────────────────────────
//  Kaan AI OS 7.4 — Governance & Self-Audit (GSA) layer
//  §2.1 GSA-ENGINE types. Universal (OS-level) — no company logic in this file.
//
//  The problem 7.4 exists for: the agents optimise WITHIN the machine and never
//  audit whether the machine is BUILT CORRECTLY, so architecturally-wrong-but-
//  running conditions pass silently because they never throw an error. Nothing
//  here reasons about a specific market; a company contributes FACTS (an adapter)
//  and its own extra assertions (a plugin), never engine behaviour.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §2.1(2). UNVERIFIABLE is first-class and is NOT a pass.
 *
 * This is the whole reply-capture lesson encoded in a type: "0 replies recorded"
 * and "we cannot receive replies" produce the same number, and a two-state
 * pass/fail forces that ambiguity into one bucket or the other. Both choices are
 * wrong — PASS hides a dead channel, DEVIATION cries wolf at a quiet one. The
 * third state is the only honest answer, so the type makes it unavoidable.
 */
export type Outcome = 'PASS' | 'DEVIATION' | 'UNVERIFIABLE'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

/**
 * §2.1(3). No assertion without proof. Every result carries what was actually
 * read and where it came from, so a finding can be re-checked by hand and a
 * digest can never become another unsourced number — the NO-FABRICATION standard
 * applied to the auditor itself.
 */
export interface Evidence {
  /** What the check actually observed, rendered for a human. */
  actual: string
  /** The SQL, file path, or probe that produced it. `file:line` where applicable. */
  source: string
  /** Optional detail: why this value means what the check says it means. */
  note?: string
}

/**
 * §2.1.1. The blast-radius axis, kept SEPARATE from reversibility on purpose.
 *
 * Enabling a follow-up sequence is a one-line, perfectly reversible config change
 * — and it puts thousands of emails into the world against a warming domain. If
 * tier were decided on reversibility alone, that change classifies Tier A and the
 * engine autonomously starts sending. The spec calls this out as the test of the
 * classifier, so blast radius is modelled as its own dimension and either axis
 * alone can force Tier B.
 */
export type BlastRadius =
  | 'none'                // touches nothing outside the audit log
  | 'internal'            // changes what WE see (a tag, a count, an annotation)
  | 'external-recipients' // causes contact with people outside the company
  | 'money'               // touches payment, pricing, billing, or spend
  | 'irreversible'        // cannot be undone by the engine (DDL, deletes)

/**
 * Declared kind of change a remediation performs. A closed set on purpose: the
 * classifier maps kind → tier, and an unrecognised kind is Tier B by §2.1.1's
 * fail-safe (unknown ⇒ Tier B). A new remediation type must be classified
 * deliberately by a human editing this union, not absorbed silently.
 */
export type ChangeKind =
  // — candidate Tier A: reversible, bounded, nothing leaves the building —
  | 'metric-tagging'        // label a number with its provenance
  | 'exclusion-list'        // add/remove a known internal/test account
  | 'display-annotation'    // change what a report says, not what the system does
  | 'cache-header'          // make a read live rather than stale
  | 'internal-config-flag'  // a flag with no external side effect
  // — always Tier B —
  | 'sends-email'           // any change that causes outbound contact
  | 'payment-pricing'       // payment flow, pricing, billing, subscription logic
  | 'auth-security-gate'    // authentication / authorisation / send gates
  | 'schema-ddl'            // migrations, DDL
  | 'delete-data'           // DELETE or destructive UPDATE
  | 'spends-money'          // anything that moves funds
  | 'unknown'               // explicitly unclassifiable ⇒ Tier B

export type Tier =
  | 'A'      // autonomous: fix now, log before/after, report
  | 'B'      // propose + approve: human sees blast radius first
  | 'NONE'   // nothing to remediate (PASS), or must not be remediated (UNVERIFIABLE)

/**
 * A proposed fix for a DEVIATION. The engine classifies this — a standard never
 * declares its own tier. A standard that could name its own tier could name the
 * wrong one, and the classifier is the single place that decision is auditable.
 */
export interface Remediation {
  /** Human-readable: exactly what would change. */
  description: string
  changeKind: ChangeKind
  blastRadius: BlastRadius
  /** Can the ENGINE itself put it back? Not "could a human eventually undo it". */
  reversible: boolean
  /**
   * Standards that must PASS before this fix may run. An unmet dependency forces
   * Tier B regardless of the other axes: multi-touch depends on reply capture
   * being verified, because enabling follow-ups while inbound capture is dead
   * means emailing people who already replied.
   */
  dependsOn?: string[]
  /** Prior value, captured for rollback. Required for any Tier A application. */
  prior?: unknown
  /** The value that would be written. */
  next?: unknown
}

export interface CheckResult {
  id: string
  outcome: Outcome
  severity: Severity
  /** One sentence: what is true, in the affirmative. */
  summary: string
  evidence: Evidence[]
  /** Present only for DEVIATION. A PASS has nothing to fix; see `tier`. */
  remediation?: Remediation
  /** Assigned by the engine's classifier, never by the standard. */
  tier?: Tier
  /** Why the classifier chose that tier — shown in the digest, kept in the log. */
  tierReason?: string
}

/**
 * A named, testable assertion about what "correct" looks like (§2.2).
 * `scope` decides where a lesson lives: universal truths propagate to every
 * company; company-shaped ones stay in that plugin.
 */
export interface Standard {
  id: string
  scope: 'universal' | 'company'
  description: string
  severity: Severity
  /** Origin lesson — kept so a future reader knows what this was bought with. */
  origin?: string
  run(facts: CompanyFacts): Promise<CheckResult> | CheckResult
}

// ── Facts a company adapter supplies ────────────────────────────────────────
//
// A universal standard cannot query a specific schema, so the company supplies
// FACTS and the standard supplies JUDGEMENT. A probe returning `null` means
// "this company cannot answer that question", which becomes UNVERIFIABLE — never
// PASS. That asymmetry is the point: silence must never be read as health.

export interface OutreachFacts {
  /** Number of touches CONFIGURED in the sequence, including touch 1. */
  touchesConfigured: number
  /** Number actually able to send right now (arming flags, approval gates). */
  touchesEnabled: number
  /** Where the configuration lives, for evidence. */
  source: string
  /** Lifetime first-touch sends — the denominator that makes the gap concrete. */
  contactedEver?: number
  /** Sends beyond touch 1 — 3% of 523 is what single-touch looks like in data. */
  followUpsSentEver?: number
}

export interface ReplyCaptureFacts {
  /** Is an inbound endpoint deployed and reachable? null = could not probe. */
  endpointReachable: boolean | null
  /** Inbound events ever received. 0 with sends outstanding ⇒ UNVERIFIABLE. */
  inboundEventsEver: number
  /** Outbound sends awaiting a reply — 0 replies over 0 sends proves nothing. */
  outboundAwaitingReply: number
  source: string
}

export interface MetricsFacts {
  /** Funnel events attributable to genuinely external recipients. */
  externalEvents: number
  /** Events from the founder's own org or known test accounts. */
  internalEvents: number
  /** Events whose owner could not be determined — counted, never assumed either way. */
  unknownEvents: number
  /** Does the reporting surface LABEL the internal/external split? */
  provenanceLabelled: boolean
  source: string
}

export interface RevenueFacts {
  /** Does every reported revenue figure trace to a payment record? */
  tracesToPaymentRecord: boolean | null
  /** Figures derived from a price table rather than a payment. */
  derivedFigures: number
  source: string
}

export interface PipelineFacts {
  /** Raw count of orgs/leads before exclusions. */
  rawCount: number
  /** Known internal/test accounts currently excluded. */
  excludedCount: number
  /** Does the reported count apply the exclusion? */
  exclusionApplied: boolean
  /** Accounts that LOOK internal/test but are not on the list — the list going stale. */
  suspectedUnexcluded: string[]
  source: string
}

export interface FabricationFacts {
  /** Reported numbers reaching agents without a stated source. */
  unsourcedFigures: string[]
  source: string
}

export interface DeployFacts {
  /** Is CI wired so prod serves current code? */
  ciWired: boolean | null
  /** Commits on the deploy branch not yet live, if knowable. */
  undeployedCommits: number | null
  source: string
}

export interface CacheFacts {
  /** Liveness-critical read paths served without a no-store/no-cache guarantee. */
  staleReadPaths: string[]
  source: string
}

export interface OpenTrackingFacts {
  /** Is open tracking instrumented on cold outreach? */
  instrumented: boolean
  source: string
}

/**
 * Every probe is optional and returns `null` when the company cannot answer.
 * Absent probe ⇒ UNVERIFIABLE, never PASS.
 */
export interface CompanyFacts {
  companyId: string
  /** When the facts were gathered, for the audit log. */
  gatheredAt: string
  outreach?: OutreachFacts | null
  replyCapture?: ReplyCaptureFacts | null
  metrics?: MetricsFacts | null
  revenue?: RevenueFacts | null
  pipeline?: PipelineFacts | null
  fabrication?: FabricationFacts | null
  deploy?: DeployFacts | null
  cache?: CacheFacts | null
  openTracking?: OpenTrackingFacts | null
}

export interface GsaRun {
  companyId: string
  startedAt: string
  /** 'read-only' performs no remediation at all, whatever the tier says. */
  mode: 'read-only' | 'tier-a-enabled'
  results: CheckResult[]
  applied: AppliedFix[]
}

export interface AppliedFix {
  standardId: string
  description: string
  before: unknown
  after: unknown
  ok: boolean
  rolledBack?: boolean
  error?: string
}
