// ─────────────────────────────────────────────────────────────────────────────
//  PS-KPI-OWNERSHIP-01 — each agent owns ONE exclusive primary KPI, scored HONESTLY.
//
//  Gap 8. Every domain agent is accountable for exactly one primary KPI. The weekly self-score
//  Janet reads is NOT "did the number move" — over an empty funnel (0 leads, 0 customers) an agent
//  that is correctly ARMED and honestly reporting "insufficient data" has done its job, and must not
//  be marked failing for a number the funnel cannot yet produce.
//
//  THE HONEST VERDICT (the whole point):
//    DELIVERING    — the agent's owned work RAN and produced a verdict over REAL data.
//    AWAITING_DATA — owned work ran and produced an HONEST verdict, but the funnel has no data to
//                    score a number yet. Not a failure. This is the empty-funnel state today.
//    DEGRADED      — owned work did NOT run, or ran and produced no verdict (error / NOT_CHECKED).
//
//  There is NO numeric 0–100 score here on purpose. A fabricated number over an empty funnel is the
//  posture-50 defect; the verdict is the honest unit. "Did owned work run and produce a verdict",
//  never "did a metric improve".
// ─────────────────────────────────────────────────────────────────────────────

export type AgentId = 'rex' | 'dex' | 'aria' | 'mason' | 'finn' | 'vera' | 'nova' | 'scout'
export type KpiVerdict = 'DELIVERING' | 'AWAITING_DATA' | 'DEGRADED'

/** One exclusive primary KPI per agent — grounded in what each actually owns. No two share a KPI. */
export const KPI_REGISTRY: Record<AgentId, { kpi: string; description: string }> = {
  rex:   { kpi: 'funnel_integrity',        description: 'integrity incidents caught before they entered a reported metric' },
  dex:   { kpi: 'deliverability',          description: 'true bounce rate + send-path gate coverage (no path exempt)' },
  aria:  { kpi: 'message_performance',     description: 'positive reply rate by message/channel variant' },
  // PS-GOAL-ALIGN-01: the binding constraint is TOP OF FUNNEL, not conversion (real_pipeline
  // founder fact: the denominator is 1). Mason now OWNS acquisition so the incentive map rewards
  // filling the funnel — nobody optimised that before. Conversion is intentionally unowned while
  // the funnel is near-empty; it cannot move revenue at a denominator of 1 and returns as an owned
  // KPI only when acquisition has produced a pipeline worth converting.
  mason: { kpi: 'msp_acquisition',         description: 'new qualified MSPs contacted into the top of the funnel (funnel growth)' },
  finn:  { kpi: 'revenue_truth',           description: 'MRR reconciled to live Stripe, never a constant' },
  vera:  { kpi: 'activation_retention',    description: 'trial activation rate and time-to-first-campaign' },
  nova:  { kpi: 'product_activation',      description: 'in-product activation funnel drop-off' },
  scout: { kpi: 'market_intel_provenance', description: 'share of market findings that are source-verified (not fabricated)' },
}

export const KPI_AGENTS = Object.keys(KPI_REGISTRY) as AgentId[]

/**
 * The one normalized signal the score turns on. Each agent already exposes these facts in its report;
 * the caller (Janet's brief, which holds the reports) maps its report to this shape. Keeping the
 * scorer PURE over this signal is what makes the honest-verdict rule fully testable.
 */
export type KpiSignal = {
  /** The agent's run produced a report at all (not null / not thrown). */
  ran: boolean
  /** The report carries a real verdict — not NOT_CHECKED, not an error stub. */
  producedVerdict: boolean
  /** There is real funnel/domain data behind the verdict (vs an honest empty-funnel "insufficient"). */
  hasRealData: boolean
}

export type KpiScore = {
  agentId: AgentId
  kpi: string
  verdict: KpiVerdict
  evidence: string
}

export function scoreAgentKpi(agentId: AgentId, signal: KpiSignal): KpiScore {
  const kpi = KPI_REGISTRY[agentId].kpi
  if (!signal.ran) {
    return { agentId, kpi, verdict: 'DEGRADED', evidence: 'owned work did NOT run this cycle' }
  }
  if (!signal.producedVerdict) {
    return { agentId, kpi, verdict: 'DEGRADED', evidence: 'ran but produced no verdict (NOT_CHECKED or error)' }
  }
  if (!signal.hasRealData) {
    // The honest empty-funnel state — an ARMED agent reporting insufficient data is NOT failing.
    return { agentId, kpi, verdict: 'AWAITING_DATA', evidence: 'owned work ran and reported honestly; no real data to score yet (not a failure)' }
  }
  return { agentId, kpi, verdict: 'DELIVERING', evidence: 'owned work ran and produced a verdict over real data' }
}

export type KpiSummary = {
  scores: KpiScore[]
  delivering: number
  awaiting: number
  degraded: number
  line: string
}

/**
 * The line Janet renders. DEGRADED agents are named (a KPI owner that did not run is the one thing a
 * reader must act on); AWAITING_DATA is reported as the honest empty-funnel state, never as failure;
 * DELIVERING is counted. No invented number anywhere.
 */
export function summariseKpiOwnership(scores: KpiScore[]): KpiSummary {
  const delivering = scores.filter((s) => s.verdict === 'DELIVERING')
  const awaiting = scores.filter((s) => s.verdict === 'AWAITING_DATA')
  const degraded = scores.filter((s) => s.verdict === 'DEGRADED')
  const total = scores.length
  const degradedPart = degraded.length
    ? ` · DEGRADED (KPI owner not producing): ${degraded.map((s) => `${s.agentId}/${s.kpi}`).join(', ')}`
    : ''
  const line =
    `KPI ownership: ${delivering.length}/${total} delivering, ${awaiting.length} awaiting data ` +
    `(honest — empty funnel, not failing)${degradedPart}. ` +
    `Verdicts are "owned work ran + produced a verdict", never a fabricated score.`
  return { scores, delivering: delivering.length, awaiting: awaiting.length, degraded: degraded.length, line }
}
