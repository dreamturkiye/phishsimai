import type { GovernanceAuditEntry, SupervisorGraphState } from './types'

const COMPLETION_CLAIM_RE =
  /\b(deployed|deployment (is )?complete|it(?:'s| is) (done|live|fixed)|changes (are |have been )?live|marcus (confirmed|deployed|fixed|completed)|live and accurate|already (deployed|fixed|on vercel))\b/i

export function claimsDeployCompletion(text: string): boolean {
  return COMPLETION_CLAIM_RE.test(text)
}

export function appendGovernanceAudit(
  state: SupervisorGraphState,
  actor: string,
  action: string,
  detail: string,
  verified = false,
): GovernanceAuditEntry {
  const entry: GovernanceAuditEntry = {
    at: new Date().toISOString(),
    actor,
    action,
    detail: detail.slice(0, 500),
    verified,
  }
  state.auditLog.push(entry)
  return entry
}

/** L5 honesty gate — same rules as v4.5.7, plus audit trail */
export function l5HonestyCheck(opts: {
  response: string
  hasRecentDeployProof: boolean
  tasksQueuedThisTurn: number
}): { allowed: boolean; sanitizedResponse?: string; reason?: string } {
  if (!claimsDeployCompletion(opts.response)) {
    return { allowed: true }
  }
  if (opts.hasRecentDeployProof && opts.tasksQueuedThisTurn === 0) {
    return { allowed: true }
  }
  return {
    allowed: false,
    reason: 'completion_claim_without_proof',
    sanitizedResponse:
      'I have queued Marcus for this fix — it is not deployed yet. Track progress in HQ → Architect Log until status shows done with commit SHA.',
  }
}

export type SqlLike = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}

export async function persistGovernanceAudit(
  sql: SqlLike,
  companyId: string,
  entries: GovernanceAuditEntry[],
): Promise<void> {
  if (!entries.length) return
  for (const e of entries.slice(-10)) {
    await sql`
      INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
      VALUES (
        ${companyId},
        'operating',
        ${'governance_audit:' + e.at + ':' + e.action},
        ${JSON.stringify(e)},
        1,
        'l5_governance'
      )
      ON CONFLICT (company_id, type, key) DO UPDATE SET value=${JSON.stringify(e)}, updated_at=NOW()
    `.catch(() => {})
  }
}

export const L5_GOVERNANCE_RULES = `
L5 GOVERNANCE (mandatory):
- Never claim deploy complete without architect_tasks done + commit SHA in last 48h.
- All supervisor delegations logged to governance_audit in janet_memory.
- Department supervisors must not override Marcus on code/deploy decisions.
- Cross-company incidents escalate to Janet CEO node only.
`.trim()
