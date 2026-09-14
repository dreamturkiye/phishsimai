export function isDatabaseUnavailable(err: unknown): boolean {
  const msg = String((err as { message?: string } | undefined)?.message || err)
  return /neon|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection (refused|terminated|ended)|too many connections|password authentication failed|database/i.test(msg)
}

export type TrialResult = { orgId: number; name: string; created: boolean } | null

export function registerResponseBody(
  user: { id: number; email: string | null; name: string | null },
  trial: TrialResult,
) {
  return {
    ok: true as const,
    success: true as const,
    user: { id: user.id, email: user.email, name: user.name },
    trial: trial
      ? { ok: true as const, orgId: trial.orgId, name: trial.name, created: trial.created }
      : { ok: false as const, reason: 'trial_org_not_created' },
  }
}
