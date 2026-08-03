// ─────────────────────────────────────────────────────────────────────────────
//  PS-REFLECT-01 — one reflection capability, inherited by all eight agents.
//
//  WHAT THIS IS
//    A shared function every agent calls over ITS OWN recorded outcomes. Not a meta-agent that
//    watches the others (that is a ghost with a supervisor's title), and not eight copies that
//    drift apart. One implementation, eight scopes.
//
//  THE RULE THAT GOVERNS IT
//    REFLECTION MAY NOT LEARN FROM NOTHING. Under the threshold it emits no adjustment and records
//    "insufficient data" — the same discipline as a metric over an empty denominator, applied to
//    the thing that PERSISTS. A fabricated metric misleads one reader of one brief; a fabricated
//    lesson is recalled forever and steers every later decision. It is the costlier organ.
//
//    Tonight that means nearly the whole roster reflects nothing: 0 replies, 0 trials, 0
//    conversions. That is the correct output, not a failure of the loop.
//
//  WHY TWO THRESHOLDS
//    MIN_OUTCOMES gates the AGENT (is there anything to look at?) and gates each KEY independently
//    (is there enough to judge THIS variant?). Both are needed. 29 wins against 29 losses across
//    two variants is 58 outcomes and still cannot rank them — comparing two under-powered keys is
//    precisely how noise promotes a losing variant. Law #2 lives here too: no rate under n=30.
//
//  WHAT IT MAY AND MAY NOT CHANGE
//    Tactics — variant, cadence, source weighting — are reversible and auto-apply with a stated
//    revert condition. Pricing, brand voice, honesty rules and guardrails are constitutional: no
//    volume of evidence unlocks them, because the failure mode is an agent that has "learned" its
//    way out of a guardrail. Evidence is the wrong currency for those.
//
//  Lessons go to os_agent_lessons — PRODUCT-OWNED. Never kaan-os-core; CI rejects it, and a lesson
//  learned from PhishSim's funnel is not a fact about ScrollFuel or VellaChat.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentLevel } from '../agentLevels'

/**
 * The levels at which a Tier-A adjustment may auto-apply. 7.3 §O.17 defines exactly two earned
 * levels; everything else is 'below', including ungraded. The floor is deliberately L4 and not
 * 'below' — the ladder is the promotion path, and n<30 is the fabrication floor UNDERNEATH it.
 */
const AUTO_APPLY_LEVELS: readonly AgentLevel[] = ['L4', 'L5']

/** The minimum real outcomes before anything may be concluded. Law #2's n=30, applied to learning. */
export const MIN_OUTCOMES = 30

/**
 * Dimensions reflection may NEVER adjust, at any autonomy level, on any amount of evidence.
 * These are constitutional, not thresholds — "the numbers said so" is exactly the argument that
 * must not work here. Pricing is frozen by founder decision; the rest are the honesty rails this
 * whole codebase exists to hold.
 */
export const PROTECTED_DIMENSIONS = [
  'pricing', 'price', 'discount',
  'brand_voice', 'tone',
  'honesty', 'disclosure', 'compliance', 'guardrail', 'safety',
] as const

/** Dimensions a reflection may auto-apply, because each is reversible in one action. */
const TACTICAL_DIMENSIONS = ['variant', 'cadence', 'source', 'weighting', 'template', 'subject'] as const

/**
 * Outcome kinds, ranked by how close they sit to money. Revenue and conversion outrank a task
 * score deliberately: an agent that scored well on the task of sending a losing message has
 * learned nothing worth keeping.
 */
export type OutcomeKind = 'revenue' | 'conversion' | 'engagement' | 'task_score'
const KIND_WEIGHT: Record<OutcomeKind, number> = {
  revenue: 1.0,
  conversion: 0.8,
  engagement: 0.4,
  task_score: 0.15,
}

export type Outcome = {
  /** What is being judged: 'variant' | 'cadence' | 'source' | ... */
  dimension: string
  /** Which one: the variant id, the source name, the cadence label. */
  key: string
  kind: OutcomeKind
  /** Did this single trial succeed? */
  won: boolean
}

export type AgentScope = {
  agentId: string
  /** THIS agent's outcomes only. Never another's — see the scope tests. */
  outcomes: Outcome[]
  /**
   * The agent's earned level on the 7.3 §O.17 ladder (L4 = trailing-30 avg >= 7.0 + zero
   * attributable breaker trips; L5 = trailing-50 avg >= 8.0 + >=20% self-originated + zero honesty
   * violations), computed by server/os/agentLevels.ts.
   *
   * Omitted means UNGRADED, which §O.17 treats as 'below' — not a neutral default. An agent that
   * has never been graded has not earned the right to change its own playbook unattended.
   */
  level?: AgentLevel
}

/**
 * PS-REFLECT-01 §evidence — 7.4 §2.1 L51: "attach evidence to every result (the actual value read,
 * the query, the file:line) — never an assertion without proof."
 *
 * Added ADDITIVELY: the fields that already existed (n, wins, score) are unchanged, and this
 * carries the provenance beside them so a reader can re-derive the claim rather than trust it.
 */
export type Evidence = {
  /** The measurement itself, as read. */
  observed: string
  /** Where it came from, so it can be re-run. */
  source: string
  /** The window the measurement covers. */
  window: string
}

/**
 * 7.4 §2.1.1 remediation tiers, applied to reflection adjustments.
 *   Tier A — reversible, bounded, non-financial → may act, then report (L60-63).
 *   Tier B — irreversible, destructive or money-touching → propose only, never autonomous (L65-69).
 * "unknown ⇒ Tier B, fail-safe" (L67) is the default here too: anything not explicitly tactical
 * lands in B.
 */
export type RemediationTier = 'A' | 'B'

export type Adjustment = {
  agentId: string
  dimension: string
  key: string
  action: 'promote' | 'retire' | 'reweight'
  /** Trials behind this proposal. Always >= MIN_OUTCOMES; a proposal without evidence is a guess. */
  n: number
  wins: number
  score: number
  reversible: boolean
  /** 7.4 §2.1.1. Tier B is the fail-safe default. */
  tier: RemediationTier
  /**
   * Tier A AND the agent has earned it on the 7.3 §O.17 ladder. An ungraded agent is not L4/L5, so
   * a no-data agent proposes rather than acts — fail-closed, same as agentLevels.ts treats it.
   */
  autoApply: boolean
  /** Why autoApply came out the way it did — never a bare boolean. */
  autoApplyReason: string
  /** The condition that undoes this without a human, so a wrong call self-heals. */
  revertIf: string
  reason: string
  evidence: Evidence
}

export type Reflection = {
  agentId: string
  n: number
  /** Did the AGENT clear the threshold? Keys are gated separately. */
  sufficient: boolean
  adjustments: Adjustment[]
  /** Constitutional refusals, recorded rather than silently dropped. */
  refusals: string[]
  lesson: string
  signature: string
}

function isProtected(dimension: string): boolean {
  const d = dimension.toLowerCase()
  return (PROTECTED_DIMENSIONS as readonly string[]).some((p) => d === p || d.includes(p))
}
function isTactical(dimension: string): boolean {
  return (TACTICAL_DIMENSIONS as readonly string[]).includes(dimension.toLowerCase())
}

/**
 * Reflect over one agent's outcomes. PURE — no DB, no clock, no network — so the guarantee can be
 * asserted directly. Persistence is a separate step by design: the thing that must never fabricate
 * is the JUDGEMENT, and a pure judgement is one that can be fully tested.
 */
export function reflectOnOutcomes(scope: AgentScope): Reflection {
  const { agentId } = scope
  const all = scope.outcomes ?? []
  const signature = `phishsim:reflect:${agentId}`

  // ── THE CLIFF ──────────────────────────────────────────────────────────────
  // Below the threshold nothing is concluded. The count is reported as a COUNT, never as a rate:
  // "4 outcomes" is honest, "0% win rate" over 4 is not, and over 0 it is fiction.
  if (all.length < MIN_OUTCOMES) {
    return {
      agentId,
      n: all.length,
      sufficient: false,
      adjustments: [],
      refusals: [],
      lesson:
        `insufficient data — no adjustment. ${all.length} recorded outcome(s), ` +
        `below the ${MIN_OUTCOMES} required to conclude anything. Nothing was learned this cycle ` +
        `and nothing was changed.`,
      signature,
    }
  }

  // ── CONSTITUTIONAL FILTER — before any counting, so protected data never even ranks ──
  const refusals: string[] = []
  const seenProtected = new Set<string>()
  const permitted = all.filter((o) => {
    if (!isProtected(o.dimension)) return true
    if (!seenProtected.has(o.dimension)) {
      seenProtected.add(o.dimension)
      refusals.push(
        `REFUSED to reflect on '${o.dimension}' — constitutionally protected. No volume of ` +
        `evidence unlocks it; a human decides this.`,
      )
    }
    return false
  })

  // ── Group by dimension+key, and gate each key on its OWN n ──
  type Agg = { dimension: string; key: string; n: number; wins: number; weight: number }
  const groups = new Map<string, Agg>()
  for (const o of permitted) {
    const id = `${o.dimension} ${o.key}`
    const g = groups.get(id) ?? { dimension: o.dimension, key: o.key, n: 0, wins: 0, weight: 0 }
    g.n++
    if (o.won) g.wins++
    g.weight += KIND_WEIGHT[o.kind] ?? 0
    groups.set(id, g)
  }

  const judgeable = [...groups.values()].filter((g) => g.n >= MIN_OUTCOMES)
  if (!judgeable.length) {
    return {
      agentId,
      n: all.length,
      sufficient: true,
      adjustments: [],
      refusals,
      lesson:
        `${all.length} outcome(s) recorded, but no key reached the ${MIN_OUTCOMES} needed to be ` +
        `judged on its own. Comparing under-powered keys is how noise promotes a loser, so no ` +
        `adjustment was proposed.`,
      signature,
    }
  }

  // Weighted score: win rate scaled by how close the evidence sits to money. A task-score win
  // cannot outrank a revenue result — that ordering is the whole point of the weighting.
  const scored = judgeable
    .map((g) => ({ ...g, rate: g.wins / g.n, score: (g.wins / g.n) * (g.weight / g.n) }))
    .sort((a, b) => b.score - a.score)

  const adjustments: Adjustment[] = []
  const level: AgentLevel = scope.level ?? 'below'
  const earned = AUTO_APPLY_LEVELS.includes(level)

  const make = (g: (typeof scored)[number], action: Adjustment['action']): Adjustment => {
    // 7.4 §2.1.1: tactical + reversible => Tier A. Everything else, including anything the
    // classifier is unsure of, => Tier B. Unknown is never treated as safe.
    const tier: RemediationTier = isTactical(g.dimension) ? 'A' : 'B'
    // Both gates must pass: the ACTION must be reversible (7.4) and the AGENT must have earned it
    // (7.3 §O.17). Either one failing downgrades to a proposal.
    const autoApply = tier === 'A' && earned
    const autoApplyReason =
      tier !== 'A'
        ? `Tier B (${g.dimension} is not in the tactical set) — proposal only, never autonomous`
        : earned
          ? `Tier A and agent is ${level} on the O.17 ladder — may apply, reversibly, and report`
          : `Tier A but agent is '${level}' (ungraded or below L4 per O.17) — proposal only until the ladder is earned`
    return {
      agentId,
      dimension: g.dimension,
      key: g.key,
      action,
      n: g.n,
      wins: g.wins,
      score: Math.round(g.score * 1000) / 1000,
      reversible: true,
      tier,
      autoApply,
      autoApplyReason,
      revertIf: `the targeted metric for '${g.dimension}' worsens vs the ${g.n}-trial baseline — revert automatically, no human needed`,
      reason: `${g.wins}/${g.n} won (${(g.rate * 100).toFixed(1)}%), weighted score ${(g.score).toFixed(3)}`,
      evidence: {
        observed: `${g.wins}/${g.n} won (${(g.rate * 100).toFixed(1)}%), weighted score ${g.score.toFixed(3)}`,
        source: `os_agent_lessons WHERE agent_id='${agentId}' — dimension '${g.dimension}', key '${g.key}'`,
        window: `${g.n} trials, most recent first (cap 500)`,
      },
    }
  }

  // One promote, one retire — the two moves that are unambiguous. Middle performers are left
  // alone rather than reweighted on thin separation.
  const best = scored[0]
  const worst = scored[scored.length - 1]
  if (best) adjustments.push(make(best, 'promote'))
  if (worst && worst !== best && worst.score < best.score) adjustments.push(make(worst, 'retire'))

  const lesson =
    `${all.length} outcome(s) over ${scored.length} judgeable key(s). ` +
    `Best: ${best.key} (${best.wins}/${best.n}). ` +
    (worst !== best ? `Worst: ${worst.key} (${worst.wins}/${worst.n}). ` : '') +
    `${adjustments.length} proposal(s)${refusals.length ? `, ${refusals.length} refused as protected` : ''}.`

  return { agentId, n: all.length, sufficient: true, adjustments, refusals, lesson, signature }
}

/**
 * Persist a reflection to os_agent_lessons.
 *
 * An INSUFFICIENT reflection is recorded too, deliberately. "We looked and there was not enough to
 * learn from" is a real finding, and the absence of a row is indistinguishable from the loop never
 * having run — which is the blind-gate shape this codebase keeps paying for.
 */
export async function recordReflection(sql: any, r: Reflection, weekKey: string): Promise<boolean> {
  const signature = `${r.signature}:${weekKey}`
  try {
    const existing = (await sql`SELECT 1 FROM os_agent_lessons
      WHERE company_id='phishsimai' AND signature=${signature} LIMIT 1`.catch(() => [])) as any[]
    if (existing.length) return false // idempotent: one reflection per agent per week

    await sql`INSERT INTO os_agent_lessons
      (company_id, agent_id, source, signature, lesson, success, score, confidence_delta)
      VALUES ('phishsimai', ${r.agentId}, 'reflection', ${signature},
              ${[r.lesson, ...r.refusals].join(' | ').slice(0, 4000)},
              ${r.sufficient}, ${r.sufficient ? r.adjustments.length : null},
              ${r.sufficient ? 0.02 : 0})`
    return true
  } catch {
    return false
  }
}

/** ISO week key, so a reflection is one-per-agent-per-week and re-runs are inert. */
export function weekKeyOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}W${String(week).padStart(2, '0')}`
}

/** The eight domain agents. Marcus/Janet are excluded: neither owns a tactical playbook. */
export const REFLECTING_AGENTS = ['aria', 'dex', 'finn', 'mason', 'nova', 'rex', 'scout', 'vera'] as const

/**
 * Read one agent's OWN recorded outcomes. os_agent_lessons is the store every agent already writes
 * to (agent_id, success, score), so this reflects on evidence that provably exists rather than on
 * tables invented for the occasion.
 *
 * KNOWN LIMIT, recorded not papered over: this yields task-grade outcomes. Revenue- and
 * conversion-grade outcomes need per-domain collectors, and at 0 paying customers there is nothing
 * for them to read yet — building them now would be building against zero. The weighting is
 * already in place for when they exist.
 */
export async function collectAgentOutcomes(sql: any, agentId: string): Promise<Outcome[]> {
  try {
    const rows = (await sql`SELECT success, score FROM os_agent_lessons
      WHERE company_id='phishsimai' AND agent_id=${agentId} AND source <> 'reflection'
      ORDER BY created_at DESC LIMIT 500`) as any[]
    return rows.map((r) => ({
      dimension: 'variant',
      key: 'recorded_outcome',
      kind: 'task_score' as OutcomeKind,
      won: r.success === true,
    }))
  } catch {
    return []
  }
}

export type WeeklyRun = { weekKey: string; reflected: number; insufficient: string[]; adjustments: number; line: string }

/** The weekly job. Every agent reflects on its own scope; none reads another's. */
export async function runWeeklyReflection(sql: any, now: Date, agents: readonly string[] = REFLECTING_AGENTS): Promise<WeeklyRun> {
  const weekKey = weekKeyOf(now)
  const insufficient: string[] = []
  let reflected = 0
  let adjustments = 0

  for (const agentId of agents) {
    const outcomes = await collectAgentOutcomes(sql, agentId)
    const r = reflectOnOutcomes({ agentId, outcomes })
    await recordReflection(sql, r, weekKey)
    if (!r.sufficient) insufficient.push(agentId)
    else { reflected++; adjustments += r.adjustments.length }
  }

  const line =
    insufficient.length === agents.length
      ? `Reflection ${weekKey}: NO agent had enough outcomes to learn from (${agents.length}/${agents.length} insufficient). No adjustments proposed — this is the honest result over an empty funnel, not a failure.`
      : `Reflection ${weekKey}: ${reflected}/${agents.length} agent(s) reflected, ${adjustments} proposal(s)` +
        (insufficient.length ? ` · insufficient data: ${insufficient.join(', ')}` : '') + '.'

  return { weekKey, reflected, insufficient, adjustments, line }
}
