// ─────────────────────────────────────────────────────────────────────────────
//  PS-DECOMMISSION-01 — an agent that produces nothing for N days is flagged for decommission.
//
//  Gap 11 (the "$100k employee jobless in 90 days" rule), built on the HONEST verdict from
//  PS-KPI-OWNERSHIP-01. "Zero measurable contribution" is defined as DEGRADED — did not run, or ran
//  and produced no verdict. It is NOT defined as "the number didn't move": an agent honestly
//  reporting AWAITING_DATA over an empty funnel is contributing (it ran and told the truth), and
//  must never be decommissioned for a number the funnel cannot yet produce. That distinction is the
//  whole point — without it, every correctly-armed agent gets fired the day the funnel is empty.
//
//  DETECT + PROPOSE, never auto-pause. Decommissioning an agent is a significant, founder-owned
//  action (asymmetric safety: the destructive direction never auto-applies). This flags a candidate
//  to Janet/Kaan with the evidence; the actual pause is the founder's call.
//
//  FAIL-HONEST on thin history: an agent with fewer than N recorded days is NEVER a candidate —
//  "we have not watched it long enough" is not "it contributed nothing", the n<30 discipline applied
//  to a time window.
// ─────────────────────────────────────────────────────────────────────────────

import type { KpiVerdict } from './kpiOwnership'

/** The window. 90 days = the "3 months to contribute or be decommissioned" rule. */
export const DECOMMISSION_DAYS = 90

export type DecommissionVerdict = {
  agentId: string
  /** Consecutive most-recent days the agent was DEGRADED. */
  consecutiveDegraded: number
  /** Days of history we actually have for this agent. */
  daysObserved: number
  /** True only when there is enough history AND the entire window is DEGRADED. */
  candidate: boolean
  reason: string
}

/**
 * @param history verdicts most-recent-FIRST. A DELIVERING or AWAITING_DATA day breaks the streak —
 *                only an unbroken run of DEGRADED days counts as "producing nothing".
 */
export function evaluateDecommission(agentId: string, history: KpiVerdict[], windowDays = DECOMMISSION_DAYS): DecommissionVerdict {
  const daysObserved = history.length

  // Count the leading DEGRADED streak (most recent first).
  let consecutiveDegraded = 0
  for (const v of history) {
    if (v === 'DEGRADED') consecutiveDegraded++
    else break
  }

  if (daysObserved < windowDays) {
    return {
      agentId, consecutiveDegraded, daysObserved, candidate: false,
      reason: `only ${daysObserved}/${windowDays} days observed — not watched long enough to decommission (insufficient history is not zero contribution)`,
    }
  }

  const candidate = consecutiveDegraded >= windowDays
  return {
    agentId, consecutiveDegraded, daysObserved, candidate,
    reason: candidate
      ? `DEGRADED for ${consecutiveDegraded} consecutive days (>= ${windowDays}) — produced no verdict the whole window. PROPOSE decommission (founder decides; not auto-paused).`
      : `contributed within the last ${windowDays} days (last non-DEGRADED ${consecutiveDegraded} day(s) ago) — healthy, not a candidate`,
  }
}

export type DecommissionSweep = { candidates: DecommissionVerdict[]; line: string }

/** Roll the per-agent verdicts into the one line Janet reports. Candidates are named; a clean sweep
 *  says so. AWAITING_DATA never appears as a candidate — the empty funnel is not a firing offence. */
export function summariseDecommission(verdicts: DecommissionVerdict[]): DecommissionSweep {
  const candidates = verdicts.filter((v) => v.candidate)
  const line = candidates.length
    ? `⚠️ DECOMMISSION PROPOSALS (${candidates.length}): ${candidates.map((c) => `${c.agentId} (${c.consecutiveDegraded}d DEGRADED)`).join(', ')} — produced no verdict for ${DECOMMISSION_DAYS}+ days. Founder decides; not auto-paused. AWAITING_DATA agents are NOT here — an empty funnel is not a firing offence.`
    : `Agent contribution: all owners produced a verdict within ${DECOMMISSION_DAYS} days (or have too little history to judge). No decommission proposals.`
  return { candidates, line }
}
