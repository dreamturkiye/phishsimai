import { AGENT_REGISTRY, WORKER_AGENT_IDS, type AgentId } from '@kaan/os-core'
import { neon } from '@neondatabase/serverless'
import { AGENT_PROMPT_VERSION } from './roleContracts'

export const AGENT_KPIS = Object.freeze(
  Object.fromEntries(
    (Object.keys(AGENT_REGISTRY) as AgentId[]).map((id) => [
      id,
      AGENT_REGISTRY[id].kpi,
    ]),
  ) as Record<AgentId, (typeof AGENT_REGISTRY)[AgentId]['kpi']>,
)

export interface OutcomeTrace {
  companyId: string
  agentId: AgentId
  taskId?: string
  reportId?: string
  reasoningId?: string
  action?: string
  prUrl?: string
  deployedSha?: string
  businessOutcome?: string
  promptVersion?: string
  model?: string
  provider?: string
  tokens?: number
  latencyMs?: number
  fallback?: boolean
  schemaValid?: boolean
  unsupportedClaimCount?: number
  liveness: boolean
  usefulness: boolean
}

export function isUsefulOutcome(trace: Pick<OutcomeTrace, 'liveness' | 'usefulness' | 'schemaValid'>): boolean {
  return Boolean(trace.liveness && trace.usefulness && trace.schemaValid)
}

export async function persistOutcomeTrace(trace: OutcomeTrace): Promise<void> {
  if (!process.env.DATABASE_URL) return
  const sql = neon(process.env.DATABASE_URL)
  await sql`
    CREATE TABLE IF NOT EXISTS agent_outcome_traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      task_id TEXT,
      report_id TEXT,
      reasoning_id TEXT,
      action TEXT,
      pr_url TEXT,
      deployed_sha TEXT,
      business_outcome TEXT,
      prompt_version TEXT,
      model TEXT,
      provider TEXT,
      tokens INTEGER,
      latency_ms INTEGER,
      fallback BOOLEAN,
      schema_valid BOOLEAN,
      unsupported_claim_count INTEGER,
      liveness BOOLEAN NOT NULL,
      usefulness BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {})
  await sql`
    INSERT INTO agent_outcome_traces (
      company_id, agent_id, task_id, report_id, reasoning_id, action, pr_url,
      deployed_sha, business_outcome, prompt_version, model, provider, tokens,
      latency_ms, fallback, schema_valid, unsupported_claim_count, liveness, usefulness
    ) VALUES (
      ${trace.companyId}, ${trace.agentId}, ${trace.taskId ?? null}, ${trace.reportId ?? null},
      ${trace.reasoningId ?? null}, ${trace.action ?? null}, ${trace.prUrl ?? null},
      ${trace.deployedSha ?? null}, ${trace.businessOutcome ?? null},
      ${trace.promptVersion ?? AGENT_PROMPT_VERSION}, ${trace.model ?? null},
      ${trace.provider ?? null}, ${trace.tokens ?? null}, ${trace.latencyMs ?? null},
      ${trace.fallback ?? false}, ${trace.schemaValid ?? null},
      ${trace.unsupportedClaimCount ?? 0}, ${trace.liveness}, ${trace.usefulness}
    )
  `.catch(() => {})
}

export function workerKpiRoster(): readonly string[] {
  return WORKER_AGENT_IDS.map((id) => AGENT_KPIS[id].name)
}
