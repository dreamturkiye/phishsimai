/**
 * Instant Marcus wake — v4.5.8 (PhishSimAI edition)
 */
import { getSql } from './conn'

export const MARCUS_WAKE_KEY = 'marcus_wake'

export async function recordMarcusWake(companyId: string, taskId?: string): Promise<string> {
  const sql = getSql()
  const payload = JSON.stringify({
    at: new Date().toISOString(),
    taskId: taskId || null,
  })
  await sql`
    INSERT INTO janet_memory (company_id, type, key, value, confidence, source)
    VALUES (${companyId}, 'operating', ${MARCUS_WAKE_KEY}, ${payload}, 1, 'janet')
    ON CONFLICT (company_id, type, key) DO UPDATE SET value=${payload}, updated_at=NOW()
  `.catch(() => {})
  return payload
}

export async function getMarcusWakeAt(companyId: string): Promise<string | null> {
  const sql = getSql()
  const rows = await sql`
    SELECT value FROM janet_memory
    WHERE company_id=${companyId} AND type='operating' AND key=${MARCUS_WAKE_KEY}
    LIMIT 1
  `.catch(() => [])
  const raw = (rows as { value?: string }[])[0]?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(String(raw)) as { at?: string }
    return parsed.at || String(raw)
  } catch {
    return String(raw)
  }
}

export async function pingMarcusWakeUrl(product?: string): Promise<boolean> {
  const base = process.env.MARCUS_WAKE_URL?.trim()
  if (!base) return false
  const secret =
    process.env.MARCUS_WAKE_SECRET ||
    process.env.HQ_SECRET
  const url = base.includes('?') ? `${base}&secret=${secret}` : `${base}?secret=${secret}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Marcus-Secret': secret,
      },
      body: JSON.stringify({ product: product || 'all', source: 'janet_queue' }),
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function dispatchMarcusWake(
  companyId: string,
  opts?: { taskId?: string; product?: string },
): Promise<void> {
  await recordMarcusWake(companyId, opts?.taskId)
  void pingMarcusWakeUrl(opts?.product || companyId)
}
