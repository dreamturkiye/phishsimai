/**
 * Marcus watcher + architect queue health — PhishSimAI edition.
 */
import { getSql } from './conn'
import { sendTelegram } from './telegram'

const WATCHER_STALE_MINUTES = 2
const QUEUE_STUCK_MINUTES = 5
const TABLE = 'os_architect_tasks'

export async function recordWatcherHeartbeat(companyId: string): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', 'watcher_heartbeat', ${new Date().toISOString()}, 1, 'marcus_watcher')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${new Date().toISOString()}, updated_at=NOW()
  `.catch(() => {})
}

export async function getWatcherHeartbeatAgeMinutes(companyId: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key='watcher_heartbeat'
    LIMIT 1
  `.catch(() => [])
  const raw = (rows as { value?: string }[])[0]?.value
  if (!raw) return null
  const age = (Date.now() - Date.parse(String(raw))) / 60000
  return Number.isFinite(age) ? age : null
}

export type MarcusHealthIssue = { kind: 'watcher_stale' | 'queue_stuck'; detail: string }

export async function checkMarcusPipelineHealth(companyId: string) {
  const sql = getSql()
  const issues: MarcusHealthIssue[] = []
  const watcherAgeMin = await getWatcherHeartbeatAgeMinutes(companyId)

  if (watcherAgeMin === null || watcherAgeMin > WATCHER_STALE_MINUTES) {
    issues.push({
      kind: 'watcher_stale',
      detail: watcherAgeMin === null
        ? 'Marcus Mac watcher has never pinged — launchd com.kaanos.architect may be down'
        : `Marcus watcher last seen ${Math.round(watcherAgeMin)}m ago (>${WATCHER_STALE_MINUTES}m)`,
    })
  }

  let stuckQueued = 0
  try {
    const stuck = await sql`
      SELECT count(*)::int as n FROM os_architect_tasks
      WHERE status IN ('queued','pending')
        AND created_at < NOW() - (${QUEUE_STUCK_MINUTES} || ' minutes')::interval
    `
    stuckQueued = Number((stuck as { n: number }[])[0]?.n || 0)
  } catch { /* ok */ }

  if (stuckQueued > 0) {
    issues.push({
      kind: 'queue_stuck',
      detail: `${stuckQueued} architect task(s) queued >${QUEUE_STUCK_MINUTES}m`,
    })
  }

  return { ok: issues.length === 0, issues, watcherAgeMin, stuckQueued }
}

export async function alertMarcusPipelineIssues(companyId: string, productLabel: string): Promise<MarcusHealthIssue[]> {
  const sql = getSql()
  const { issues } = await checkMarcusPipelineHealth(companyId)
  if (!issues.length) return []

  const notifyKey = 'marcus_pipeline:' + issues.map(i => i.kind).join(',')
  const recent = await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${notifyKey}
    LIMIT 1
  `.catch(() => [])
  const last = (recent as { value?: string }[])[0]?.value
  if (last && Date.now() - Date.parse(String(last)) < 4 * 60 * 60 * 1000) return issues

  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', ${notifyKey}, ${new Date().toISOString()}, 1, 'marcus_health')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${new Date().toISOString()}, updated_at=NOW()
  `.catch(() => {})

  await sendTelegram(
    `🚨 MARCUS PIPELINE — ${productLabel}\n` +
    issues.map(i => `• ${i.detail}`).join('\n') +
    '\n\nFix: reload Marcus daemon — bash scripts/setup-marcus-watcher.sh',
  ).catch(() => {})

  return issues
}

export { TABLE as ARCHITECT_TABLE }
