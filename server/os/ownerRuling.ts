export const ENFORCEMENT_ORDER = ['manual', 'l2', 'l3', 'l4', 'l5'] as const
export type EnforcementLevel = (typeof ENFORCEMENT_ORDER)[number]

export const OWNER_RULING = {
  declaredBy: 'kaan',
  enforcementLevel: 'l5' as const,
  posture: 'l5_7' as const,
  reason: 'owner_ruling 2026-09-10: L5.7 unattended-safe. Janet runs the company. 20 verified free trials now.',
}

export function isEnforcementLevel(value: string | null | undefined): value is EnforcementLevel {
  return !!value && (ENFORCEMENT_ORDER as readonly string[]).includes(value)
}

/** One-rung steps the DB trigger will honour. Never skip. */
export function rungsFromTo(from: string, to: string): Array<{ from: EnforcementLevel; to: EnforcementLevel }> {
  const i = (ENFORCEMENT_ORDER as readonly string[]).indexOf(from)
  const j = (ENFORCEMENT_ORDER as readonly string[]).indexOf(to)
  if (i < 0 || j < 0 || j <= i) return []
  const out: Array<{ from: EnforcementLevel; to: EnforcementLevel }> = []
  for (let k = i; k < j; k++) {
    out.push({ from: ENFORCEMENT_ORDER[k], to: ENFORCEMENT_ORDER[k + 1] })
  }
  return out
}

export type OwnerRulingResult = {
  ok: boolean
  companyId: string
  from: string | null
  to: string
  posture: string
  trail: Array<{ from: string; to: string }>
  reason: string
  killFlag?: boolean
}

type SqlLike = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>

async function readLevel(sql: SqlLike, companyId: string): Promise<string | null> {
  const rows = (await sql`SELECT level FROM os_autonomy_state WHERE company_id=${companyId} LIMIT 1`.catch(() => [])) as any[]
  return rows[0]?.level ? String(rows[0].level) : null
}

async function killFlagActive(sql: SqlLike, companyId: string): Promise<boolean> {
  try {
    const rows = (await sql`SELECT 1 FROM os_kill_flags WHERE company_id=${companyId} AND active=true LIMIT 1`) as any[]
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * Walk os_autonomy_state one rung at a time with matching autonomy_grants tokens.
 * The trigger refuses skips and refuses a raise with no fresh unconsumed grant.
 */
export async function walkEnforcementRungs(
  sql: SqlLike,
  companyId: string,
  target: EnforcementLevel,
  opts: { createdBy: string; reason: string },
): Promise<{ ok: boolean; from: string | null; to: string; trail: Array<{ from: string; to: string }>; reason: string }> {
  await sql`INSERT INTO os_autonomy_state (company_id, level, trust, clean_day_streak, updated_at)
    VALUES (${companyId}, 'manual', 0, 0, NOW())
    ON CONFLICT (company_id) DO NOTHING`.catch(() => {})

  let current = (await readLevel(sql, companyId)) || 'manual'
  const trail: Array<{ from: string; to: string }> = []
  const from0 = current
  for (const step of rungsFromTo(current, target)) {
    await sql`INSERT INTO autonomy_grants (company_id, from_level, to_level, direction, reason, clean_days, trust, created_by)
      VALUES (${companyId}, ${step.from}, ${step.to}, 'promote', ${opts.reason}, 0, 1,
              ${opts.createdBy})`
    await sql`UPDATE os_autonomy_state SET level=${step.to}, trust=1, updated_at=NOW()
      WHERE company_id=${companyId}`
    const after = await readLevel(sql, companyId)
    if (after !== step.to) {
      return {
        ok: false,
        from: from0,
        to: after || current,
        trail,
        reason: `raise_refused at ${step.from}->${step.to}; stored=${after}`,
      }
    }
    trail.push(step)
    current = step.to
  }
  return { ok: true, from: from0, to: current, trail, reason: trail.length ? 'walked' : 'already_at_target' }
}

export async function applyOwnerAutonomyRuling(
  sql: SqlLike,
  companyId: string,
  declarePosture: (sql: SqlLike, productId: string, to: 'l5_7', declaredBy: string, opts: { force: boolean }) => Promise<{ ok: boolean; reason: string }>,
  opts: { declaredBy?: string } = {},
): Promise<OwnerRulingResult> {
  const declaredBy = (opts.declaredBy || OWNER_RULING.declaredBy).trim() || OWNER_RULING.declaredBy
  if (await killFlagActive(sql, companyId)) {
    const stored = await readLevel(sql, companyId)
    return {
      ok: false,
      companyId,
      from: stored,
      to: OWNER_RULING.enforcementLevel,
      posture: OWNER_RULING.posture,
      trail: [],
      reason: 'kill_flag_active — emergency stop still wins. Clear the kill flag, then re-apply the owner ruling.',
      killFlag: true,
    }
  }

  const walked = await walkEnforcementRungs(sql, companyId, OWNER_RULING.enforcementLevel, {
    createdBy: declaredBy,
    reason: OWNER_RULING.reason,
  })

  let postureReason = 'not_declared'
  try {
    await sql`INSERT INTO os_posture_state (product_id, posture, declared_by, entered_at, updated_at)
      VALUES (${companyId}, 'pre_l5_7', ${declaredBy}, NOW(), NOW())
      ON CONFLICT (product_id) DO NOTHING`.catch(() => {})
    const declared = await declarePosture(sql, companyId, OWNER_RULING.posture, declaredBy, { force: true })
    postureReason = declared.reason
  } catch (e: any) {
    postureReason = `posture_failed:${String(e?.message || e).slice(0, 120)}`
  }

  await sql`INSERT INTO audit_log (actor, action, target, detail)
    VALUES (${declaredBy}, 'owner_autonomy_ruling', ${companyId},
            ${JSON.stringify({
              from: walked.from,
              to: walked.to,
              trail: walked.trail,
              posture: OWNER_RULING.posture,
              reason: OWNER_RULING.reason,
              walked: walked.reason,
              postureReason,
            })}::jsonb)`.catch(() => {})

  return {
    ok: walked.ok,
    companyId,
    from: walked.from,
    to: walked.to,
    posture: OWNER_RULING.posture,
    trail: walked.trail,
    reason: walked.ok
      ? `owner ruling applied: enforcement ${walked.from}->${walked.to}, posture ${OWNER_RULING.posture} (${postureReason})`
      : walked.reason,
  }
}
