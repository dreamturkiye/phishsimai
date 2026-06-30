import { neon } from '@neondatabase/serverless'

export function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return neon(url)
}

export function formatOsError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : ''
    return [error.message, cause].filter(Boolean).join(' | ') || String(error)
  }
  return String(error)
}

export async function ensureHqTables() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS ps_outreach_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    company TEXT DEFAULT '',
    title TEXT DEFAULT '',
    industry TEXT DEFAULT 'technology',
    source TEXT DEFAULT 'manual',
    pipeline_stage TEXT DEFAULT 'prospect',
    touch1_sent_at TIMESTAMPTZ,
    touch2_sent_at TIMESTAMPTZ,
    touch3_sent_at TIMESTAMPTZ,
    touch4_sent_at TIMESTAMPTZ,
    replied BOOLEAN DEFAULT false,
    bounced BOOLEAN DEFAULT false,
    unsubscribed BOOLEAN DEFAULT false,
    bounced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    stage_updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS os_architect_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task TEXT NOT NULL,
    source TEXT DEFAULT 'janet',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    component_name TEXT,
    user_action TEXT,
    url_path TEXT,
    user_email TEXT,
    browser TEXT,
    severity TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    occurrence_count INT DEFAULT 1,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    diagnosis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS architect_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_signature TEXT NOT NULL UNIQUE,
    root_cause TEXT NOT NULL,
    file_affected TEXT,
    function_affected TEXT,
    fix_description TEXT NOT NULL,
    times_applied INT DEFAULT 1,
    confidence FLOAT DEFAULT 0.9,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_applied TIMESTAMPTZ DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS qa_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type TEXT DEFAULT 'bug_fix',
    trigger_ref TEXT,
    tests_run INT DEFAULT 0,
    tests_passed INT DEFAULT 0,
    tests_failed INT DEFAULT 0,
    test_results JSONB DEFAULT '[]',
    duration_ms INT,
    status TEXT DEFAULT 'running',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`
  await sql`CREATE TABLE IF NOT EXISTS ab_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_key TEXT NOT NULL,
    variant TEXT NOT NULL,
    event TEXT NOT NULL,
    lead_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`
}
