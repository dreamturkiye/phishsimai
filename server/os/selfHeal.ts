import { randomUUID } from 'crypto'
import { getSql } from './conn'
import { sendTelegram } from './telegram'
import { ensureMemoryTable } from './memory'
import { COMPANY_ID } from './version'

async function ensureArchitectColumns() {
  const sql = getSql()
  await sql`ALTER TABLE os_architect_tasks ADD COLUMN IF NOT EXISTS bug_id UUID`.catch(() => {})
  await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_applied TEXT`.catch(() => {})
  await sql`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_confirmed BOOLEAN DEFAULT false`.catch(() => {})
}

export async function isAlertOpen(key: string, companyId = COMPANY_ID): Promise<boolean> {
  const sql = getSql()
  await ensureMemoryTable()
  const rows = await sql`
    SELECT id FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${'system_alert:' + key}
    LIMIT 1
  `
  return (rows as any[]).length > 0
}

const ALERT_NOTIFY_COOLDOWN_MS = 4 * 60 * 60 * 1000

async function getLastAlertNotifyMs(key: string, companyId: string): Promise<number> {
  const sql = getSql()
  await ensureMemoryTable()
  const rows = await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${'alert_notify:' + key}
    LIMIT 1
  `.catch(() => [])
  const v = (rows as any[])[0]?.value
  const ts = v ? Date.parse(String(v)) : 0
  return Number.isFinite(ts) ? ts : 0
}

async function markAlertNotified(key: string, companyId: string) {
  const sql = getSql()
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', ${'alert_notify:' + key}, ${new Date().toISOString()}, 1, 'janet')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${new Date().toISOString()}, updated_at=NOW()
  `.catch(() => {})
}

export async function openSystemAlert(key: string, detail: string, companyId = COMPANY_ID) {
  await ensureMemoryTable()
  const wasOpen = await isAlertOpen(key, companyId)
  const sql = getSql()
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', ${'system_alert:' + key}, ${detail}, 1, 'janet')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${detail}, updated_at=NOW()
  `.catch(() => {})
  const lastNotify = await getLastAlertNotifyMs(key, companyId)
  const cooldownOk = Date.now() - lastNotify > ALERT_NOTIFY_COOLDOWN_MS
  if (!wasOpen && cooldownOk) {
    await markAlertNotified(key, companyId)
    await sendTelegram(
      `🚨 <b>JANET — SYSTEM ISSUE</b>\n` +
      `${key}: ${detail}\n` +
      `Marcus dispatched autonomously if code fix is needed.`
    )
  }
}

export async function resolveSystemAlert(key: string, detail: string, companyId = COMPANY_ID) {
  const wasOpen = await isAlertOpen(key, companyId)
  if (!wasOpen) return
  const sql = getSql()
  await sql`
    DELETE FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${'system_alert:' + key}
  `.catch(() => {})
  await sendTelegram(`✅ <b>JANET — RESOLVED</b>\n${key}: ${detail}`)
}

export async function queueJanetArchitectTask(opts: {
  task: string
  bugId?: string
  notes?: string
}): Promise<string | null> {
  try {
    await ensureArchitectColumns()
    const sql = getSql()

    if (opts.bugId) {
      const existing = await sql`
        SELECT id FROM os_architect_tasks
        WHERE bug_id=${opts.bugId}::uuid
          AND status IN ('queued','pending','approved','running')
        ORDER BY created_at ASC LIMIT 1
      `
      if ((existing as any[])[0]?.id) return (existing as any[])[0].id as string
    }

    const id = randomUUID()
    await sql`
      INSERT INTO os_architect_tasks (id, task, source, status, notes, bug_id)
      VALUES (${id}, ${opts.task.slice(0, 4000)}, 'janet', 'queued', ${opts.notes || 'Janet → Marcus: autonomous self-heal'}, ${opts.bugId || null})
    `

    await sendTelegram(
      `<b>JANET → MARCUS</b>\n` +
      `Marcus (Architect) queued autonomously.\n` +
      `Task: ${opts.task.slice(0, 300)}\n\n` +
      `Pipeline: dev → QA → prod. No approval needed.`
    )
    return id
  } catch (e: any) {
    await sendTelegram(`ARCHITECT QUEUE FAILED: ${String(e.message).slice(0, 200)}`)
    return null
  }
}

export async function resolveLinkedBug(
  taskId: string,
  success: boolean,
  deployNotes: string,
  commitSha?: string,
  opts?: { notify?: boolean }
): Promise<{ resolved: boolean; alreadyResolved?: boolean }> {
  const notify = opts?.notify !== false
  const sql = getSql()
  const tasks = await sql`SELECT bug_id, task FROM os_architect_tasks WHERE id=${taskId}::uuid LIMIT 1`
  const task = (tasks as any[])[0]
  if (!task?.bug_id) return { resolved: false }

  const bugs = await sql`SELECT * FROM bug_reports WHERE id=${task.bug_id} LIMIT 1`
  const bug = (bugs as any[])[0]
  if (!bug) return { resolved: false }

  if (success) {
    if (bug.status === 'resolved' && bug.fix_confirmed) {
      return { resolved: true, alreadyResolved: true }
    }
    await sql`
      UPDATE bug_reports SET status='resolved', fix_confirmed=true, fix_applied=${deployNotes.slice(0, 500)}, last_seen=NOW()
      WHERE id=${task.bug_id}
    `
    if (notify) {
      await sendTelegram(
        `✅ <b>BUG RESOLVED — PhishSim AI</b>\n` +
        `Page: ${bug.url_path}\n` +
        `Error: ${String(bug.error_message).slice(0, 120)}\n` +
        (commitSha ? `Commit: ${commitSha}\n` : '') +
        `Status: live on production after QA`
      )
    }
    return { resolved: true, alreadyResolved: false }
  }

  if (bug.status === 'fix_failed') return { resolved: false, alreadyResolved: true }
  await sql`UPDATE bug_reports SET status='fix_failed', last_seen=NOW() WHERE id=${task.bug_id}`
  if (notify) {
    await sendTelegram(`🚨 <b>BUG FIX FAILED</b>\n${deployNotes.slice(0, 200)}`)
  }
  return { resolved: false, alreadyResolved: false }
}
