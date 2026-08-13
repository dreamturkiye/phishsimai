import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const pend = await sql`SELECT id, category, payload, created_at FROM escalations
  WHERE product_id='phishsimai' AND category='marcus_dispatch' AND status='pending' ORDER BY created_at`;
for (const r of pend) {
  const ageH = Math.round((Date.now() - new Date(r.created_at).getTime()) / 3.6e6);
  console.log(`ESC #${r.id} age=${ageH}h payload=${JSON.stringify(r.payload).slice(0, 220)}`);
}
// Dismiss the stale (>6h) parked dispatches as rejected (superseded by this session's Marcus work).
const res = await sql`UPDATE escalations
  SET status='rejected', resolved_at=now(), resolved_via='stale-cleanup'
  WHERE product_id='phishsimai' AND category='marcus_dispatch' AND status='pending'
    AND created_at < now() - interval '6 hours' RETURNING id`;
console.log('DISMISSED_IDS=' + res.map((r) => r.id).join(','));
const remaining = await sql`SELECT count(*)::int AS n FROM escalations WHERE product_id='phishsimai' AND status='pending'`;
console.log('REMAINING_PENDING=' + remaining[0].n);
