import type { SqlLike } from './selfLearning'
import type { ProductId } from './types'

export type AbExperiment = {
  id: string
  companyId: string
  name: string
  hypothesis: string
  variantA: string
  variantB: string
  status: 'draft' | 'running' | 'winner_a' | 'winner_b' | 'cancelled'
  minSamples: number
  samplesA: number
  samplesB: number
  conversionsA: number
  conversionsB: number
  autonomyLevel: 'L4' | 'L5'
  createdAt: string
}

export async function ensureAbExperimentTable(sql: SqlLike): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS os_ab_experiments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hypothesis TEXT,
      variant_a TEXT NOT NULL,
      variant_b TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      min_samples INTEGER DEFAULT 50,
      samples_a INTEGER DEFAULT 0,
      samples_b INTEGER DEFAULT 0,
      conversions_a INTEGER DEFAULT 0,
      conversions_b INTEGER DEFAULT 0,
      autonomy_level TEXT DEFAULT 'L5',
      winner TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {})
}

export async function createAutonomousExperiment(
  sql: SqlLike,
  companyId: string,
  opts: { name: string; hypothesis: string; variantA: string; variantB: string; minSamples?: number },
): Promise<string | null> {
  await ensureAbExperimentTable(sql)
  const rows = await sql`
    INSERT INTO os_ab_experiments (company_id, name, hypothesis, variant_a, variant_b, status, min_samples, autonomy_level)
    VALUES (
      ${companyId},
      ${opts.name.slice(0, 120)},
      ${opts.hypothesis.slice(0, 500)},
      ${opts.variantA.slice(0, 500)},
      ${opts.variantB.slice(0, 500)},
      'running',
      ${opts.minSamples ?? 50},
      'L5'
    )
    RETURNING id
  `.catch(() => [])
  const id = (rows as any[])[0]?.id
  return id ? String(id) : null
}

/** L5: auto-declare winner when min samples reached and lift > threshold */
export async function evaluateExperimentAutonomy(
  sql: SqlLike,
  experimentId: string,
  liftThreshold = 0.15,
): Promise<{ action: 'none' | 'promote_a' | 'promote_b'; reason: string }> {
  await ensureAbExperimentTable(sql)
  const rows = await sql`SELECT * FROM os_ab_experiments WHERE id=${experimentId}::uuid LIMIT 1`.catch(() => [])
  const exp = (rows as any[])[0]
  if (!exp || exp.status !== 'running') return { action: 'none', reason: 'not running' }

  const rateA = exp.samples_a > 0 ? exp.conversions_a / exp.samples_a : 0
  const rateB = exp.samples_b > 0 ? exp.conversions_b / exp.samples_b : 0
  const total = exp.samples_a + exp.samples_b
  if (total < exp.min_samples) {
    return { action: 'none', reason: `need ${exp.min_samples - total} more samples` }
  }

  if (rateB - rateA >= liftThreshold) {
    await sql`UPDATE os_ab_experiments SET status='winner_b', winner='b', updated_at=NOW() WHERE id=${experimentId}::uuid`.catch(() => {})
    return { action: 'promote_b', reason: `B wins ${(rateB * 100).toFixed(1)}% vs ${(rateA * 100).toFixed(1)}%` }
  }
  if (rateA - rateB >= liftThreshold) {
    await sql`UPDATE os_ab_experiments SET status='winner_a', winner='a', updated_at=NOW() WHERE id=${experimentId}::uuid`.catch(() => {})
    return { action: 'promote_a', reason: `A wins ${(rateA * 100).toFixed(1)}% vs ${(rateB * 100).toFixed(1)}%` }
  }
  return { action: 'none', reason: 'no significant lift yet' }
}

export async function listRunningExperiments(sql: SqlLike, companyId: string): Promise<AbExperiment[]> {
  await ensureAbExperimentTable(sql)
  const rows = await sql`
    SELECT * FROM os_ab_experiments WHERE company_id=${companyId} AND status='running' ORDER BY created_at DESC LIMIT 10
  `.catch(() => [])
  return (rows as any[]).map(r => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    hypothesis: r.hypothesis,
    variantA: r.variant_a,
    variantB: r.variant_b,
    status: r.status,
    minSamples: r.min_samples,
    samplesA: r.samples_a,
    samplesB: r.samples_b,
    conversionsA: r.conversions_a,
    conversionsB: r.conversions_b,
    autonomyLevel: r.autonomy_level,
    createdAt: r.created_at,
  }))
}
