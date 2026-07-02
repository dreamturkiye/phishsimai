import type { SkillRecord } from './types'

export type SqlLike = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}

/** Ensure L5 self-learning tables (extends architect_memory) */
export async function ensureSelfLearningTables(sql: SqlLike): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS architect_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_signature TEXT NOT NULL UNIQUE,
    root_cause TEXT NOT NULL,
    file_affected TEXT,
    function_affected TEXT,
    fix_description TEXT NOT NULL,
    fix_worked BOOLEAN DEFAULT TRUE,
    times_applied INTEGER DEFAULT 1,
    confidence FLOAT DEFAULT 0.9,
    lesson TEXT,
    skill_tags TEXT[],
    embedding_hint TEXT,
    proactive_score FLOAT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {})

  await sql`ALTER TABLE architect_memory ADD COLUMN IF NOT EXISTS skill_tags TEXT[]`.catch(() => {})
  await sql`ALTER TABLE architect_memory ADD COLUMN IF NOT EXISTS embedding_hint TEXT`.catch(() => {})
  await sql`ALTER TABLE architect_memory ADD COLUMN IF NOT EXISTS proactive_score FLOAT DEFAULT 0`.catch(() => {})

  await sql`
    CREATE TABLE IF NOT EXISTS os_skill_library (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'architect_memory',
      signature TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence FLOAT DEFAULT 0.5,
      embedding_hint TEXT,
      times_used INTEGER DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, skill_id)
    )
  `.catch(() => {})
}

/** Simple text similarity for skill recall (no pgvector required) */
export function similarityScore(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  return inter / Math.max(ta.size, tb.size)
}

export function extractSkillTags(rootCause: string, fixDescription: string): string[] {
  const text = `${rootCause} ${fixDescription}`.toLowerCase()
  const tags: string[] = []
  const candidates = [
    'dashboard', 'mrr', 'metrics', 'hq', 'auth', 'stripe', 'api', 'react', 'nextjs',
    'self-heal', 'probe', 'convai', 'janet', 'deploy', 'qa', 'memory', 'pipeline',
  ]
  for (const c of candidates) {
    if (text.includes(c)) tags.push(c)
  }
  return [...new Set(tags)].slice(0, 8)
}

export async function upsertSkillFromArchitectMemory(
  sql: SqlLike,
  companyId: string,
  opts: {
    errorSignature: string
    rootCause: string
    fixDescription: string
    confidence: number
  },
): Promise<SkillRecord> {
  await ensureSelfLearningTables(sql)
  const skillId = `skill_${opts.errorSignature.slice(0, 48).replace(/[^a-z0-9]/g, '_')}`
  const tags = extractSkillTags(opts.rootCause, opts.fixDescription)
  const embeddingHint = tags.join(' ')

  await sql`
    INSERT INTO os_skill_library (company_id, skill_id, source, signature, description, confidence, embedding_hint, times_used, last_used_at)
    VALUES (
      ${companyId},
      ${skillId},
      'architect_memory',
      ${opts.errorSignature},
      ${opts.fixDescription.slice(0, 500)},
      ${opts.confidence},
      ${embeddingHint},
      1,
      NOW()
    )
    ON CONFLICT (company_id, skill_id) DO UPDATE SET
      description = EXCLUDED.description,
      confidence = LEAST(os_skill_library.confidence + 0.03, 1.0),
      embedding_hint = EXCLUDED.embedding_hint,
      times_used = os_skill_library.times_used + 1,
      last_used_at = NOW()
  `.catch(() => {})

  return {
    skillId,
    source: 'architect_memory',
    signature: opts.errorSignature,
    description: opts.fixDescription,
    confidence: opts.confidence,
    embeddingHint,
    timesUsed: 1,
    lastUsedAt: new Date().toISOString(),
  }
}

export async function recallRelevantSkills(
  sql: SqlLike,
  companyId: string,
  query: string,
  limit = 5,
): Promise<SkillRecord[]> {
  await ensureSelfLearningTables(sql)
  const rows = await sql`
    SELECT skill_id, source, signature, description, confidence, embedding_hint, times_used, last_used_at
    FROM os_skill_library
    WHERE company_id = ${companyId}
    ORDER BY last_used_at DESC NULLS LAST
    LIMIT 30
  `.catch(() => [])

  const scored = (rows as any[])
    .map(r => ({
      skillId: r.skill_id,
      source: r.source,
      signature: r.signature,
      description: r.description,
      confidence: Number(r.confidence),
      embeddingHint: r.embedding_hint,
      timesUsed: Number(r.times_used),
      lastUsedAt: r.last_used_at,
      score: similarityScore(query, `${r.signature} ${r.description} ${r.embedding_hint || ''}`),
    }))
    .filter(r => r.score > 0.08)
    .sort((a, b) => b.score * b.confidence - a.score * a.confidence)
    .slice(0, limit)

  return scored.map(({ score, ...rest }) => rest)
}

export async function proactiveSkillSuggestions(
  sql: SqlLike,
  companyId: string,
): Promise<string[]> {
  const skills = await recallRelevantSkills(sql, companyId, 'recurring bug pattern dashboard deploy', 3)
  return skills.map(
    s => `Proactive: pattern "${s.signature.slice(0, 60)}" — ${s.description.slice(0, 100)} (confidence ${Math.round(s.confidence * 100)}%)`,
  )
}

export function formatSkillsForPrompt(skills: SkillRecord[]): string {
  if (!skills.length) return 'SKILL LIBRARY: (empty — first occurrence)'
  return 'SKILL LIBRARY (recalled):\n' + skills.map(s => `- [${s.skillId}] ${s.description.slice(0, 120)}`).join('\n')
}
