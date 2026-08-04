// ─────────────────────────────────────────────────────────────────────────────
//  PS-HUMAN-RISK-01 — the Human Risk Score, as an HONEST composite.
//
//  getOrgPostureScore is a single component (average phishing risk). #12 asked to roll phishing +
//  training + department into one number. This does that WITHOUT fabricating a dimension that has no
//  data behind it — the posture-50 discipline, applied to a composite.
//
//  A dimension with no data reads null and is EXCLUDED from the average; the result is labelled
//  "N of M dimensions measured". A composite over zero measured dimensions is null — "not enough
//  data yet" — never an invented number. Adding a fabricated dimension to reach a fuller-looking
//  score is exactly the defect this guards against.
//
//  DEPARTMENT is deliberately absent for now. targets.departmentId EXISTS, so this is a
//  scoring-MODEL decision, not a schema gap: a defensible "department contributes X to an
//  individual's risk" model is not something to invent at build time. Omitted honestly (the score
//  reads "2 of 3"), to be added as a real dimension when its model is defined.
// ─────────────────────────────────────────────────────────────────────────────

export type RiskDimension = {
  key: 'phishing' | 'training' | 'department'
  /** 0 = safe, 100 = high risk. null = no data for this dimension (excluded from the composite). */
  risk: number | null
  /** Why it reads what it reads — evidence or the reason it is unmeasured. */
  note: string
}

export type HumanRisk = {
  /** null when NO dimension was measurable — rendered "not enough data yet", never 0 or 50. */
  score: number | null
  measured: number
  total: number
  dimensions: RiskDimension[]
  line: string
}

/** All dimensions the composite CAN include. `total` is measured against this, so an omitted
 *  dimension shows as "N of 3", never silently shrinking the denominator to look complete. */
export const ALL_DIMENSIONS: RiskDimension['key'][] = ['phishing', 'training', 'department']

/**
 * Combine the measured dimensions into one score. Pure — no DB — so the honesty rule is directly
 * testable. Equal-weighted mean over the dimensions that have data; the others are excluded, and
 * the count of what was measured travels with the number so a reader knows how complete it is.
 */
export function computeHumanRisk(dimensions: RiskDimension[]): HumanRisk {
  const measured = dimensions.filter((d) => d.risk !== null)
  const total = ALL_DIMENSIONS.length

  if (measured.length === 0) {
    return {
      score: null,
      measured: 0,
      total,
      dimensions,
      line: `Human Risk Score: not enough data yet (0 of ${total} dimensions measured). No score asserted.`,
    }
  }

  const score = Math.round(measured.reduce((s, d) => s + (d.risk as number), 0) / measured.length)
  const parts = measured.map((d) => `${d.key} ${d.risk}`).join(', ')
  const omitted = dimensions.filter((d) => d.risk === null).map((d) => d.key)
  const omittedNote = omitted.length ? ` · not measured: ${omitted.join(', ')}` : ''
  return {
    score,
    measured: measured.length,
    total,
    dimensions,
    line:
      `Human Risk Score: ${score}/100 (${measured.length} of ${total} dimensions: ${parts})${omittedNote}. ` +
      `${measured.length < total ? 'Partial composite — honestly labelled, not an invented full score.' : 'All dimensions measured.'}`,
  }
}

// ─── The dimension builders — each returns null when its data is absent ───────

/** Phishing dimension: average per-target risk (gamificationScores, 0 safe .. 100 risk). */
export function phishingDimension(scored: { riskScore: number }[]): RiskDimension {
  if (scored.length === 0) {
    return { key: 'phishing', risk: null, note: 'no scored targets — no simulation has been run or measured' }
  }
  const avg = Math.round(scored.reduce((s, r) => s + r.riskScore, 0) / scored.length)
  return { key: 'phishing', risk: avg, note: `avg risk over ${scored.length} scored target(s)` }
}

/**
 * Training dimension: risk RISES with non-completion. risk = 100 * (1 - completed/assigned).
 * Null when there are no assignments at all — no remediation has been triggered, so there is
 * nothing to measure, and a full completion rate over zero assignments would be a fabrication.
 */
export function trainingDimension(assigned: number, completed: number): RiskDimension {
  if (assigned <= 0) {
    return { key: 'training', risk: null, note: 'no training assignments yet — nothing to measure' }
  }
  const completionRate = Math.min(1, completed / assigned)
  const risk = Math.round((1 - completionRate) * 100)
  return { key: 'training', risk, note: `${completed}/${assigned} assigned modules completed` }
}

/** Department dimension: not modelled yet. Always null — honestly absent, never a placeholder. */
export function departmentDimension(): RiskDimension {
  return {
    key: 'department',
    risk: null,
    note: 'not modelled yet — targets.departmentId exists, but a defensible department-risk model is not defined; omitted rather than invented',
  }
}
