// Mark a Marcus task completed. Env: DATABASE_URL, TASK_ID
import { neon } from '@neondatabase/serverless';
const id = process.env.TASK_ID;
if (!id) { console.log('no TASK_ID; nothing to mark'); process.exit(0); }
const sql = neon(process.env.DATABASE_URL);
await sql`update agent_tasks set status='completed', completed_at=now(), updated_at=now() where id=${id}`;
console.log('task', id, 'marked completed');
