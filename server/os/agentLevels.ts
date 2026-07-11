// ─────────────────────────────────────────────────────────────────────────────
//  O.17 — MEASURABLE AGENT L-LEVELS
//
//  A weekly cron scores every agent from Janet's REAL reviewed-task data
//  (agent_tasks.performance_score where status='reviewed') and assigns a level:
//
//    L4    = trailing-30 avg_score >= 7.0  AND  zero breaker fingerprints for the agent
//    L5    = trailing-50 avg_score >= 8.0  AND  >= 20% of completed tasks self-originated
//            AND zero honesty violations   (AND, for coherence, zero breaker fingerprints)
//    below = otherwise (INCLUDING no reviewed tasks yet — an ungraded agent is not L4/L5)
//
//  HONESTY: a genuinely-empty window → avg is NULL (uncomputable), never 0. A null
//  avg can never satisfy an L4/L5 threshold, so a no-data agent is 'below' with
//  window_stats recording taskCount:0 / avgScore:null — the level stays auditable
//  and no score is fabricated.
//
//  window_stats records the actual numbers that justify the level, so every level
//  is auditable. Levels only — the hire/fire replace/revise ladder is out of scope.
//
//  DARK: this reads scores and writes agent_levels rows. It does NOT enable any
//  agent and does NOT change the autonomy level.
// ─────────────────────────────────────────────────────────────────────────────
import { getSql } from './conn'
import { COMPANY_ID } from './version'
import { AGENTS, type AgentId } from '../lib/kaan_os_v4'
import { marcusFingerprint } from './marcusBreaker'

type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>

export type AgentLevel = 'L4' | 'L5' | 'below'

// Thresholds (single source of truth).
export const L4_MIN_AVG_30 = 7.0
export const L5_MIN_AVG_50 = 8.0
export const L5_MIN_SELF_ORIGINATED_PCT = 0.20

export interface AgentWindowStats {
  agentId: string
  taskCount30: number
  avgScore30: number | null // null = zero reviewed tasks in window (uncomputable)
  taskCount50: number
  avgScore50: number | null
  selfOriginatedCount: number
  selfOriginatedPct: number // 0..1
  breakerFingerprints: number // OPEN breaker circuits attributable to the agent
  honestyViolations: number
}

export interface AgentLevelResult {
  agentId: string
  level: AgentLevel
  window_stats: {
    trailing30: { taskCount: number; avgScore: number | null }
    trailing50: { taskCount: number; avgScore: number | null; selfOriginated: number; selfOriginatedPct: number }
    breakerFingerprints: number
    honestyViolations: number
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

// ── PURE — the level boundaries. Fully unit-testable, no I/O. ────────────────
export function computeAgentLevel(s: AgentWindowStats): AgentLevelResult {
  const window_stats = {
    trailing30: { taskCount: s.taskCount30, avgScore: s.avgScore30 },
    trailing50: {
      taskCount: s.taskCount50,
      avgScore: s.avgScore50,
      selfOriginated: s.selfOriginatedCount,
      selfOriginatedPct: round2(s.selfOriginatedPct),
    },
    breakerFingerprints: s.breakerFingerprints,
    honestyViolations: s.honestyViolations,
  }

  const l4 =
    s.avgScore30 != null && s.avgScore30 >= L4_MIN_AVG_30 && s.breakerFingerprints === 0
  const l5 =
    s.avgScore50 != null && s.avgScore50 >= L5_MIN_AVG_50 &&
    s.selfOriginatedPct >= L5_MIN_SELF_ORIGINATED_PCT &&
    s.honestyViolations === 0 && s.breakerFingerprints === 0

  const level: AgentLevel = l5 ? 'L5' : l4 ? 'L4' : 'below'
  return { agentId: s.agentId, level, window_stats }
}

// ── DB gathering (per agent) ─────────────────────────────────────────────────
// The most recent 50 reviewed+scored tasks; trailing-30 is the first 30 of those.
// self-originated = a task the agent issued to itself (issued_by === agent_id),
// vs Janet-assigned (issued_by === 'janet').
export async function gatherAgentStats(
  sql: Sql,
  companyId: string,
  agentId: string,
  opts?: { honestyViolations?: number },
): Promise<AgentWindowStats> {
  let rows: Array<{ score: number; issued_by: string }> = []
  try {
    rows = (await sql`
      SELECT performance_score AS score, issued_by
      FROM agent_tasks
      WHERE company_id = ${companyId} AND agent_id = ${agentId}
        AND status = 'reviewed' AND performance_score IS NOT NULL
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 50
    `) as any
  } catch {
    rows = []
  }

  const scores = rows.map((r) => Number(r.score))
  const first30 = scores.slice(0, 30)
  const avg = (a: number[]): number | null => (a.length ? round1(a.reduce((x, y) => x + y, 0) / a.length) : null)
  const selfOriginated = rows.filter((r) => r.issued_by === agentId).length
  const pct = rows.length ? selfOriginated / rows.length : 0

  // Breaker fingerprints attributable to the agent: only Marcus has an execution
  // circuit today (marcusFingerprint). Others have none → 0 (honest).
  let breakerFingerprints = 0
  try {
    const fps = agentId === 'marcus' ? [marcusFingerprint(companyId)] : []
    if (fps.length) {
      const b = await sql`SELECT count(*)::int AS n FROM circuit_breaker_state WHERE state = 'open' AND fingerprint = ANY(${fps})`
      breakerFingerprints = Number(b[0]?.n ?? 0)
    }
  } catch {
    breakerFingerprints = 0
  }

  return {
    agentId,
    taskCount30: first30.length,
    avgScore30: avg(first30),
    taskCount50: scores.length,
    avgScore50: avg(scores),
    selfOriginatedCount: selfOriginated,
    selfOriginatedPct: pct,
    breakerFingerprints,
    honestyViolations: opts?.honestyViolations ?? 0, // no honesty-violation source wired yet → 0
  }
}

export async function computeAllAgentLevels(sql: Sql, companyId: string = COMPANY_ID): Promise<AgentLevelResult[]> {
  const ids = Object.keys(AGENTS) as AgentId[]
  const out: AgentLevelResult[] = []
  for (const id of ids) {
    out.push(computeAgentLevel(await gatherAgentStats(sql, companyId, id)))
  }
  return out
}

// Append-only history — one row per agent per weekly run (so the founder brief can
// detect "below L5 for 2 consecutive weeks").
export async function writeAgentLevels(sql: Sql, results: AgentLevelResult[]): Promise<number> {
  let n = 0
  for (const r of results) {
    await sql`
      INSERT INTO agent_levels (agent_id, level, window_stats)
      VALUES (${r.agentId}, ${r.level}, ${JSON.stringify(r.window_stats)}::jsonb)
    `
    n += 1
  }
  return n
}

export interface AgentLevelsRunResult {
  computed: number
  written: number
  levels: Array<{ agent: string; level: AgentLevel; avg30: number | null; avg50: number | null; tasks: number }>
  stored: boolean
  error?: string
}

// Weekly cron body. Computes from real reviewed-task data and appends rows. A
// store failure (e.g. agent_levels not yet migrated) does not lose the computed
// result — it's still returned.
export async function runAgentLevels(companyId: string = COMPANY_ID, sqlOverride?: Sql): Promise<AgentLevelsRunResult> {
  const sql = sqlOverride ?? (getSql() as unknown as Sql)
  const results = await computeAllAgentLevels(sql, companyId)
  let written = 0
  let stored = false
  let error: string | undefined
  try {
    written = await writeAgentLevels(sql, results)
    stored = true
  } catch (e: any) {
    error = String(e?.message ?? e).slice(0, 200) // agent_levels table likely not migrated yet
  }
  return {
    computed: results.length,
    written,
    stored,
    error,
    levels: results.map((r) => ({
      agent: r.agentId,
      level: r.level,
      avg30: r.window_stats.trailing30.avgScore,
      avg50: r.window_stats.trailing50.avgScore,
      tasks: r.window_stats.trailing50.taskCount,
    })),
  }
}

// For the founder brief: agents whose two most recent weekly levels are both
// below L5. Returns [] if agent_levels isn't available yet.
export async function agentsBelowL5TwoWeeks(sql: Sql, companyId: string = COMPANY_ID): Promise<string[]> {
  const flagged: string[] = []
  try {
    for (const id of Object.keys(AGENTS)) {
      const rows = (await sql`
        SELECT level FROM agent_levels WHERE agent_id = ${id} ORDER BY computed_at DESC LIMIT 2
      `) as Array<{ level: string }>
      if (rows.length >= 2 && rows.every((r) => r.level !== 'L5')) flagged.push(id)
    }
  } catch {
    return []
  }
  return flagged
}

export function makeAgentLevelsSql(): Sql {
  return getSql() as unknown as Sql
}
