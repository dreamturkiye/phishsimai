// Mark a Marcus task completed only after merge, deployment and canary proof.
import { neon } from '@neondatabase/serverless';

const id = process.env.TASK_ID;
if (!id) { console.log('no TASK_ID; nothing to mark'); process.exit(0); }

const required = [
  'DATABASE_URL',
  'MERGED_COMMIT_SHA',
  'DEPLOYMENT_ID',
  'DEPLOYMENT_URL',
  'DEPLOYMENT_STATE',
  'DEPLOYMENT_VERIFIED_AT',
  'CANARY_STATUS',
  'CANARY_URL',
  'CANARY_EVIDENCE',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`completion evidence missing: ${missing.join(', ')}`);
  process.exit(1);
}

const sha = process.env.MERGED_COMMIT_SHA;
if (!/^[0-9a-f]{40}$/i.test(sha)) {
  console.error('MERGED_COMMIT_SHA must be a full 40-character commit SHA');
  process.exit(1);
}
if (process.env.DEPLOYMENT_STATE !== 'READY') {
  console.error(`deployment is not READY: ${process.env.DEPLOYMENT_STATE}`);
  process.exit(1);
}
if (process.env.CANARY_STATUS !== 'passed') {
  console.error(`canary did not pass: ${process.env.CANARY_STATUS}`);
  process.exit(1);
}
if (!Number.isFinite(Date.parse(process.env.DEPLOYMENT_VERIFIED_AT))) {
  console.error('DEPLOYMENT_VERIFIED_AT must be an ISO timestamp');
  process.exit(1);
}

let canary;
try {
  canary = JSON.parse(process.env.CANARY_EVIDENCE);
} catch {
  console.error('CANARY_EVIDENCE must be valid JSON');
  process.exit(1);
}

const evidence = {
  merged_commit_sha: sha,
  deployment: {
    id: process.env.DEPLOYMENT_ID,
    url: process.env.DEPLOYMENT_URL,
    state: process.env.DEPLOYMENT_STATE,
    verified_at: process.env.DEPLOYMENT_VERIFIED_AT,
  },
  canary: {
    status: process.env.CANARY_STATUS,
    url: process.env.CANARY_URL,
    evidence: canary,
  },
};

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  UPDATE agent_tasks
  SET status='completed',
      completed_at=NOW(),
      updated_at=NOW(),
      merged_commit_sha=${sha},
      completion_evidence=${JSON.stringify(evidence)}::jsonb
  WHERE id=${id} AND status='in_progress'
  RETURNING id`;
if (!rows.length) {
  console.error('task was not in_progress; completion was not recorded');
  process.exit(1);
}
console.log('task', id, 'marked completed with merged/deployment/canary proof');
