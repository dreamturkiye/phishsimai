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
    // PS-LADDER-02 2026-07-18: query os_architect_tasks, NOT architect_tasks. `architect_tasks`
    // is ScrollFuel's table and DOES NOT EXIST in PhishSim's DB — so this query threw every day,
    // the catch below pushed a violation, and the ladder was stuck at 0: fail-closed, but for a
    // reason belonging to a table PhishSim never had. Marcus's real queue on PhishSim is
    // `os_architect_tasks` (productRegistry.ts:43). It has status + updated_at but NO product_id
    // column (PhishSim is single-product on this table), so the scope filter is dropped. Now the
    // check verifies PhishSim's actual architect failures instead of throwing on a phantom table.
    const taskFailures = (await sql`SELECT id FROM os_architect_tasks WHERE status = 'failed' AND updated_at::date = ${dayIso}`) as any[];
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

// ── PS-POSTURE-02: getBreakerHandledCount() REMOVED — its predicate was unsatisfiable.
//
//   WHERE state = 'closed' AND opened_at IS NOT NULL
//
// Closing a breaker sets openedAt: null together with state: 'closed' (circuitBreaker.ts
// applyOutcome on success, and manualClose). So a HANDLED trip stops matching the moment it is
// handled, and an UNHANDLED trip is still 'open' and never matched either. The predicate
// describes a row state the schema never holds: it returned 0 unconditionally.
//
// It also returned 0 on error, making "could not measure" indistinguishable from "none happened"
// — the same conflation this OS keeps paying for.
//
// Worse than wrong, it was wrong in the direction that punishes correct behaviour: the spec's
// L5.7 gate needs ≥1 breaker trip HANDLED CLEANLY, so doing exactly the right thing still scored
// zero and the gate could never be passed. Replaced by posture.handledTrips(), which counts the
// persistent evidence — the 'breaker_trip' escalation row, which survives the close — and returns
// null (blocking) rather than 0 when it cannot measure.

// ── PS-POSTURE-01: getAutonomyLevel() REMOVED — it was a third vocabulary that graded nothing.
//
// It returned the strings 'L5.6' and 'L5.7' and wrote them nowhere. Two problems, both fatal:
//
//   1. 'L5.6' DOES NOT EXIST. Grep KAAN_AI_OS_V7.3 (the governing architecture) for "L5.6":
//      zero hits. It was invented here as a name for "not yet L5.7". The spec defines exactly
//      two postures on this axis, L5.7 and L5.8, and reaching either is a declaration backed by
//      measured exit criteria — not a string a getter returns.
//   2. Nothing consumed it. It never wrote os_autonomy_state (and could not: the CHECK
//      constraint admits only manual|l2|l3|l4|l5), so the OS carried two ladders with different
//      vocabularies, one of which moved nothing. A level nobody enforces is decoration that
//      reads like governance — the exact failure mode this codebase keeps re-learning.
//
// The measurement primitives below (computeCleanDay, getCleanStreak, getBreakerHandledCount)
// were always the valuable part and are KEPT. What replaces the getter is `posture.ts`, which
// grades against the spec's real criteria, records WHICH criteria version judged each day, and
// reports eligibility for a human to declare. See evaluatePosture() / declarePosture().
