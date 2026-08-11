// Tracked SQL migration runner for drizzle/pg/*.sql
// drizzle's _journal.json froze at 0006 while 0007..0028 were applied by running the .sql
// directly, with no tracking. This runner restores tracking so autonomous shipping can
// safely apply only new migrations.
// - records applied migrations in applied_sql_migrations
// - never runs anything <= BASELINE_TAG (legacy migrations already live): records only
// - runs + records only new migrations (> baseline) not yet applied, each in a transaction
// - fails non-zero on any error so the pipeline aborts (prod stays safe)
import { readFileSync, readdirSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';

if (!neonConfig.webSocketConstructor) {
  if (typeof WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = WebSocket;
  } else {
    const ws = await import('ws');
    neonConfig.webSocketConstructor = ws.default;
  }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
const BASELINE = process.env.BASELINE_TAG || '0027_psa_integrations';
const dir = 'drizzle/pg';
const files = readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query(`create table if not exists applied_sql_migrations (
    tag text primary key,
    applied_at timestamptz not null default now()
  )`);
  const { rows } = await client.query('select tag from applied_sql_migrations');
  const applied = new Set(rows.map(r => r.tag));

  let ran = 0, backfilled = 0;
  for (const f of files) {
    const tag = f.replace(/\.sql$/, '');
    if (applied.has(tag)) continue;
    if (tag <= BASELINE) {
      await client.query('insert into applied_sql_migrations(tag) values($1) on conflict (tag) do nothing', [tag]);
      backfilled++;
      continue;
    }
    const body = readFileSync(`${dir}/${f}`, 'utf8');
    console.log('APPLYING migration:', tag);
    await client.query('BEGIN');
    try {
      await client.query(body);
      await client.query('insert into applied_sql_migrations(tag) values($1) on conflict (tag) do nothing', [tag]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${tag} failed: ${e.message}`);
    }
    console.log('  applied + recorded:', tag);
    ran++;
  }
  console.log(`done. baseline<=${BASELINE} backfilled=${backfilled} applied_new=${ran} total_files=${files.length}`);
} finally {
  client.release();
  await pool.end();
}
