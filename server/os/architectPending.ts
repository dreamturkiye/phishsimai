import { Request, Response } from 'express'
import { getSql } from './conn'
import { isValidArchitectTask } from './architectTasks'
import { recordWatcherHeartbeat } from './marcusPipelineHealth'

const HQ = process.env.HQ_SECRET

function okHQ(req: Request): boolean {
  const secret = (req.headers['x-os-secret'] as string) || (req.query.secret as string)
  return !!HQ && secret === HQ
}

async function ensureTaskColumns() {
  const sql = getSql()
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS qwen_output TEXT`.catch(() => {})
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS files_changed TEXT[]`.catch(() => {})
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS bug_id UUID`.catch(() => {})
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS notes TEXT`.catch(() => {})
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`.catch(() => {})
}

async function runQueueCleanup() {
  const sql = getSql()
  let dupCancelled = 0
  try {
    const dup = await sql`
      UPDATE os_architect_tasks older
      SET status='cancelled',
          notes='Duplicate — superseded by earlier task for same bug',
          updated_at=NOW()
      WHERE older.status IN ('queued','pending','approved','running')
        AND older.bug_id IS NOT NULL
        AND older.id <> (
          SELECT id FROM os_architect_tasks keeper
          WHERE keeper.bug_id = older.bug_id
            AND keeper.status IN ('queued','pending','approved','running','done')
          ORDER BY
            CASE keeper.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'pending' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
            keeper.created_at ASC
          LIMIT 1
        )
      RETURNING older.id
    `
    dupCancelled = (dup as any[]).length
  } catch { /* non-fatal */ }
  return { dupCancelled }
}

export async function architectPending(req: Request, res: Response) {
  if (!okHQ(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    await ensureTaskColumns()
    const sql = getSql()
    await recordWatcherHeartbeat('phishsimai')
    const peek = req.query.peek === '1'
    const cleanup = req.query.cleanup === '1'

    if (peek) {
      let cleanupResult: { dupCancelled: number } | undefined
      if (cleanup) cleanupResult = await runQueueCleanup()
      if (req.query.retry) {
        const ids = String(req.query.retry).split(',').map(s => s.trim()).filter(Boolean)
        if (ids.length) {
          try {
            const retryResult = await sql`
              UPDATE os_architect_tasks SET status='queued',
                notes='Manually requeued — root cause confirmed resolved', updated_at=NOW()
              WHERE id::text = ANY(${ids}::text[]) AND status IN ('failed','cancelled')
              RETURNING id
            `
            console.log('retry updated:', (retryResult as any[]).length, ids)
          } catch (e) {
            console.log('retry error:', e)
          }
        }
      }
      if (req.query.cancel_stale_probes === '1') {
        await sql`
          UPDATE os_architect_tasks SET status='cancelled',
            notes='Cancelled — stale health-probe noise task', updated_at=NOW()
          WHERE task ILIKE '%health probe%' AND status IN ('failed','queued','pending','approved')
        `.catch(() => {})
      }
      if (req.query.requeue_running === '1') {
        await sql`
          UPDATE os_architect_tasks
          SET status='queued', notes='Requeued after stuck run', updated_at=NOW()
          WHERE status='running'
        `.catch(() => {})
      }
      const tasks = await sql`
        SELECT id, task, status, source, bug_id, created_at, left(notes, 80) as notes
        FROM os_architect_tasks ORDER BY created_at DESC LIMIT 10
      `.catch(() => [] as any[])
      const queued = await sql`
        SELECT count(*)::int as n FROM os_architect_tasks
        WHERE status IN ('queued','pending','approved')
      `.catch(() => [{ n: 0 }])
      res.json({
        peek: true,
        queued_count: (queued as any[])[0]?.n ?? 0,
        tasks,
        cleanup: cleanupResult,
        timestamp: new Date().toISOString(),
      })
      return
    }

    await runQueueCleanup()

    await sql`
      UPDATE os_architect_tasks
      SET status='cancelled', notes='Rejected — malformed task', updated_at=NOW()
      WHERE status IN ('queued','pending','approved','running')
        AND (length(trim(task)) < 12 OR trim(task) IN ('**','*','***'))
    `.catch(() => {})

    const picked = await sql`
      UPDATE os_architect_tasks
      SET status='running',
          notes='Autonomous execution started — dev branch pipeline',
          updated_at=NOW()
      WHERE id IN (
        SELECT id FROM os_architect_tasks
        WHERE status IN ('queued','pending','approved')
        ORDER BY created_at ASC
        LIMIT 5
      )
      RETURNING id, task, status, source, created_at, bug_id
    `.catch(() => [] as any[])

    const tasks = (picked as any[]).filter(t => isValidArchitectTask(t.task))
    res.json({
      tasks,
      count: tasks.length,
      autonomy: 'no_approval_required',
      timestamp: new Date().toISOString(),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg, tasks: [], count: 0 })
  }
}
