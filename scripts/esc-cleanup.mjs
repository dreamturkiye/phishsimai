import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const con = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='escalations_status_check'`;
console.log('CONSTRAINT=' + (con[0]?.def || 'none'));
const dist = await sql`SELECT DISTINCT status FROM escalations WHERE product_id='phishsimai'`;
console.log('EXISTING_STATUSES=' + dist.map((r) => r.status).join(','));
