// Resolves the task for a Marcus run and writes `task` + `task_id` to $GITHUB_OUTPUT.
// - workflow_dispatch: use the provided inputs (manual single task)
// - schedule: apply safety rails, then pull + claim the oldest actionable queue task
//     * no-stacking: if a Marcus run is already active, output nothing
//     * circuit breaker: if recent Marcus runs are mostly failing, output nothing
//     * reaper: reclaim tasks stuck 'in_progress' past STALE_MIN (retry) or park (poison)
//     * poison limit: skip tasks attempted >= MAX_ATTEMPTS
// Env: EVENT, IN_TASK, IN_ID, DATABASE_URL, GH_REPO, GH_TOKEN
import { appendFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';

if (!neonConfig.webSocketConstructor) {
  if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket;
  else { const ws = await import('ws'); neonConfig.webSocketConstructor = ws.default; }
}

const out = (k, v) => appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<__EOF__\n${v ?? ''}\n__EOF__\n`);
const nothing = (why) => { console.log(why); out('task', ''); out('task_id', ''); process.exit(0); };

const MAX_ATTEMPTS = 2, STALE_MIN = 90;

if (process.env.EVENT === 'workflow_dispatch') {
  const task = (process.env.IN_TASK || '').trim();
  if (!task) nothing('Manual run with empty task.');
  console.log('Manual task provided.');
  out('task', task); out('task_id', process.env.IN_ID || '');
  process.exit(0);
}

// scheduled path
const REPO = process.env.GH_REPO, TOKEN = process.env.GH_TOKEN, DB = process.env.DATABASE_URL;
const runsRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/marcus.yml/runs?per_page=6`, {
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
});
const runs = (await runsRes.json()).workflow_runs || [];
// ignore this very run when checking for "active"
const others = runs.filter(r => String(r.id) !== String(process.env.GITHUB_RUN_ID));
if (others.some(r => r.status === 'in_progress' || r.status === 'queued')) nothing('A Marcus run is already active - skipping.');
const done = others.filter(r => r.conclusion).slice(0, 5);
const failed = done.filter(r => r.conclusion === 'failure').length;
if (done.length >= 3 && failed >= 3) nothing(`BREAKER OPEN: ${failed}/${done.length} recent runs failed.`);

const pool = new Pool({ connectionString: DB });
const c = await pool.connect();
try {
  const reaped = await c.query(
    `update agent_tasks set status='reviewed', updated_at=now()
     where agent_id='marcus' and status='in_progress'
       and updated_at < now() - ($1||' minutes')::interval and coalesce(attempts,0) < $2 returning id`,
    [String(STALE_MIN), MAX_ATTEMPTS]);
  const parked = await c.query(
    `update agent_tasks set status='cancelled', updated_at=now()
     where agent_id='marcus' and status='in_progress'
       and updated_at < now() - ($1||' minutes')::interval and coalesce(attempts,0) >= $2 returning id`,
    [String(STALE_MIN), MAX_ATTEMPTS]);
  if (reaped.rowCount) console.log('reaped ->reviewed:', reaped.rows.map(r => r.id));
  if (parked.rowCount) console.log('parked ->cancelled:', parked.rows.map(r => r.id));

  const { rows } = await c.query(
    `select id, title, description from agent_tasks
     where agent_id='marcus' and status in ('assigned','reviewed') and coalesce(attempts,0) < $1
     order by created_at asc limit 1`, [MAX_ATTEMPTS]);
  if (rows.length === 0) nothing('No actionable Marcus tasks. Idle.');

  const t = rows[0];
  await c.query(`update agent_tasks set status='in_progress', attempts=coalesce(attempts,0)+1, updated_at=now() where id=$1`, [t.id]);
  const task = ((t.title || '') + (t.description ? '\n\n' + t.description : '')).slice(0, 6000);
  console.log(`Claimed task ${t.id} - ${t.title}`);
  out('task', task); out('task_id', String(t.id));
} finally { c.release(); await pool.end(); }
