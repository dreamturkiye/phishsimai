const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

export function extractProposalBugId(text: string): string | undefined {
  return text.match(UUID_RE)?.[0]
}

export type ProposalSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, any>[]>

/**
 * Carry a bugId on every agent→Marcus proposal so the autonomy/self-heal gate
 * has failing-signal evidence instead of dropping the work.
 */
export async function ensureMarcusProposalBugId(
  sql: ProposalSql,
  opts: { agentId: string; taskId?: string; proposal: string },
): Promise<string | undefined> {
  const extracted = extractProposalBugId(opts.proposal)
  if (extracted) return extracted
  const rows = await sql`
    INSERT INTO bug_reports (error_message, component_name, user_action, severity, status)
    VALUES (
      ${`agent proposal: ${opts.proposal.slice(0, 1500)}`},
      ${opts.agentId},
      ${opts.taskId ? `durable-task:${opts.taskId}` : 'agent-reason-act'},
      'medium',
      'open'
    )
    RETURNING id
  `.catch(() => [])
  return rows[0]?.id ? String(rows[0].id) : undefined
}
