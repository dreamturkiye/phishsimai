import { timingSafeEqual } from 'node:crypto'

type CronRequest = {
  headers?: Record<string, string | string[] | undefined>
}

type CronResponse = {
  status(code: number): { json(body: unknown): unknown }
}

function equalSecret(actual: string, expected: string | undefined): boolean {
  if (!expected) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function bearerToken(req: CronRequest): string | null {
  const header = req.headers?.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length)
  return token.length > 0 ? token : null
}

/**
 * Vercel cron requests use `Authorization: Bearer $CRON_SECRET`. The
 * x-vercel-cron header is only metadata and is intentionally never trusted.
 * HQ callers may use a bearer token or x-hq-secret, both header-only.
 */
export function isTrustedCronRequest(req: CronRequest): boolean {
  const bearer = bearerToken(req)
  if (bearer && (
    equalSecret(bearer, process.env.CRON_SECRET) ||
    equalSecret(bearer, process.env.HQ_SECRET)
  )) return true

  const hqHeader = req.headers?.['x-hq-secret']
  return typeof hqHeader === 'string' && equalSecret(hqHeader, process.env.HQ_SECRET)
}

export function requireTrustedCron(req: CronRequest, res: CronResponse): boolean {
  if (isTrustedCronRequest(req)) return true
  res.status(401).json({ error: 'Unauthorized' })
  return false
}
