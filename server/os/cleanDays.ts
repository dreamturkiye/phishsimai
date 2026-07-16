// SqlLike is inlined rather than imported from ./selfLearning (ScrollFuel-only module).
// It is a type-only contract -- a tagged-template SQL function -- so there is nothing to
// vendor. Both Neon and the drizzle sql helper satisfy it.
export type SqlLike = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

export async function ensureCleanDayTables(sql: SqlLike): Promise<void> {
  try {
    await sql`CREATE TABLE IF NOT EXISTS autonomy_clean_days (
      product_id TEXT NOT NULL,
      day DATE NOT NULL,
      clean BOOLEAN NOT NULL,
      violations JSONB NOT NULL DEFAULT '[]',
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, day)
    )`;
  } catch {}
  try {
    await sql`CREATE TABLE IF NOT EXISTS autonomy_incidents (
      id BIGSERIAL PRIMARY KEY,
      product_id TEXT NOT NULL,
      day DATE NOT NULL,
      description TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  } catch {}
}

export async function recordIncident(sql: SqlLike, productId: string, description: string, recordedBy: string): Promise<void> {
  await ensureCleanDayTables(sql);
  await sql`INSERT INTO autonomy_incidents (product_id, day, description, recorded_by) VALUES (${productId}, CURRENT_DATE, ${description}, ${recordedBy})`;
}

export async function computeCleanDay(sql: SqlLike, productId: string, dayIso: string): Promise<{ clean: boolean; violations: string[] }> {
  await ensureCleanDayTables(sql);

  let violations: string[] = [];

  try {
    // PS-LADDER-01 2026-07-16: SCOPED BY product_id. This query was unscoped while
    // deploy_verifications and autonomy_incidents below both filter by product -- a leftover
    // from when architect_tasks was single-product. PhishSim and ScrollFuel share one Neon
    // database, so unscoped this would have voided PhishSim's clean day using ScrollFuel's 31
    // failed tasks: a ladder unclimbable for reasons belonging to a different product.
    // architect_tasks.product_id added the same day and backfilled to 'scrollfuel' (all 124
    // rows verified as ScrollFuel's by source), DEFAULT 'scrollfuel' so legacy writers keep
    // working and keep meaning what they meant.
    const taskFailures = (await sql`SELECT id FROM architect_tasks WHERE product_id = ${productId} AND status = 'failed' AND updated_at::date = ${dayIso}`) as any[];
    for (const row of taskFailures) {
      violations.push(`unhandled task failure: ${row.id}`);
    }
  } catch (error) {
    violations.push(`clean-day check could not verify task failures: ${String(error)}`);
  }

  try {
    const deployMismatches = (await sql`SELECT expected_domain FROM deploy_verifications WHERE product_id = ${productId} AND match = false AND checked_at::date = ${dayIso}`) as any[];
    for (const row of deployMismatches) {
      violations.push(`deploy-target mismatch: expected ${row.expected_domain}`);
    }
  } catch (error) {
    violations.push(`clean-day check could not verify deploy mismatches: ${String(error)}`);
  }

  try {
    const incidents = (await sql`SELECT description FROM autonomy_incidents WHERE product_id = ${productId} AND day = ${dayIso}`) as any[];
    for (const row of incidents) {
      violations.push(`incident: ${row.description}`);
    }
  } catch (error) {
    violations.push(`clean-day check could not verify incidents: ${String(error)}`);
  }

  const clean = violations.length === 0;
  await sql`INSERT INTO autonomy_clean_days (product_id, day, clean, violations) VALUES (${productId}, ${dayIso}, ${clean}, ${JSON.stringify(violations)}) ON CONFLICT (product_id, day) DO UPDATE SET clean = EXCLUDED.clean, violations = EXCLUDED.violations, computed_at = now()`;
  return { clean, violations };
}

export async function getCleanStreak(sql: SqlLike, productId: string): Promise<{ streakDays: number; lastComputedDay: string | null }> {
  await ensureCleanDayTables(sql);
  const rows = (await sql`SELECT day, clean FROM autonomy_clean_days WHERE product_id = ${productId} ORDER BY day DESC LIMIT 30`) as any[];
  const toIso = (d: any): string => new Date(d).toISOString().split('T')[0];
  const lastComputedDay: string | null = rows.length > 0 ? toIso(rows[0].day) : null;
  let streakDays = 0;
  let prevMs: number | null = null;
  for (const row of rows) {
    if (!row.clean) break;
    const ms = new Date(toIso(row.day)).getTime();
    if (prevMs !== null && prevMs - ms !== 24 * 60 * 60 * 1000) break;
    streakDays++;
    prevMs = ms;
  }
  return { streakDays, lastComputedDay };
}

export async function getBreakerHandledCount(sql: SqlLike, productId: string, sinceDayIso: string): Promise<number> {
  try {
    const sinceDay = new Date(sinceDayIso);
    const rows = (await sql`SELECT COUNT(*) FROM circuit_breaker_state WHERE product_id = ${productId} AND state = 'closed' AND opened_at IS NOT NULL AND opened_at >= ${sinceDay}`) as any[];
    return Number(rows[0].count);
  } catch {
    return 0;
  }
}

export async function getAutonomyLevel(sql: SqlLike, productId: string): Promise<{ level: string; streakDays: number; handledTrips: number; gate: string }> {
  const streak = await getCleanStreak(sql, productId);
  if (streak.streakDays >= 5) {
    const sinceDay = new Date(new Date(streak.lastComputedDay as string).getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const handledTrips = await getBreakerHandledCount(sql, productId, sinceDay);
    if (handledTrips >= 1) {
      return { level: 'L5.7', streakDays: streak.streakDays, handledTrips, gate: 'passed: 5 clean days + breaker trip handled' };
    } else {
      return { level: 'L5.6', streakDays: streak.streakDays, handledTrips, gate: 'blocked: 5 clean days but no handled breaker trip in window -- inject one per Section A' };
    }
  } else {
    return { level: 'L5.6', streakDays: streak.streakDays, handledTrips: 0, gate: `building: ${streak.streakDays} of 5 consecutive clean days` };
  }
}
