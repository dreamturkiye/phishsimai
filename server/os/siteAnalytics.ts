import { createHash } from 'crypto'
import { getSql } from './conn'

export type AnalyticsIngest = {
  company_id: string
  path: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  session_id?: string
  event_type?: string
  event_name?: string
  device?: string
  browser?: string
  ip?: string
  user_agent?: string
}

export async function ensureAnalyticsTables() {
  const sql = getSql()
  await sql`CREATE TABLE IF NOT EXISTS os_site_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'pageview',
    event_name TEXT,
    path TEXT NOT NULL,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    visitor_hash TEXT,
    session_id TEXT,
    device TEXT,
    browser TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {})
  await sql`CREATE INDEX IF NOT EXISTS idx_os_analytics_company_time ON os_site_analytics (company_id, created_at DESC)`.catch(() => {})
  await sql`CREATE INDEX IF NOT EXISTS idx_os_analytics_path ON os_site_analytics (company_id, path)`.catch(() => {})
}

function visitorHash(companyId: string, ip: string, ua: string): string {
  const salt = process.env.ANALYTICS_SALT || 'kaan-os-analytics-v4.5'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${salt}:${companyId}:${day}:${ip}:${ua}`).digest('hex').slice(0, 16)
}

function parseBrowser(ua = ''): string {
  if (/bot|crawl|spider|slurp/i.test(ua)) return 'bot'
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Chrome/i.test(ua)) return 'Chrome'
  if (/Safari/i.test(ua)) return 'Safari'
  if (/Firefox/i.test(ua)) return 'Firefox'
  return 'Other'
}

function parseDevice(ua = ''): string {
  if (/bot|crawl|spider/i.test(ua)) return 'bot'
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile'
  if (/Tablet|iPad/i.test(ua)) return 'tablet'
  return 'desktop'
}

export async function ingestAnalyticsEvent(input: AnalyticsIngest): Promise<{ ok: boolean; skipped?: string }> {
  if (!input.path || input.path.startsWith('/api')) return { ok: true, skipped: 'api' }
  if (parseBrowser(input.user_agent) === 'bot') return { ok: true, skipped: 'bot' }

  await ensureAnalyticsTables()
  const sql = getSql()
  const vHash = visitorHash(input.company_id, input.ip || '0', input.user_agent || '')

  await sql`
    INSERT INTO os_site_analytics (
      company_id, event_type, event_name, path, referrer,
      utm_source, utm_medium, utm_campaign, visitor_hash, session_id, device, browser
    ) VALUES (
      ${input.company_id}, ${input.event_type || 'pageview'}, ${input.event_name || null},
      ${input.path.slice(0, 500)}, ${input.referrer?.slice(0, 500) || null},
      ${input.utm_source || null}, ${input.utm_medium || null}, ${input.utm_campaign || null},
      ${vHash}, ${input.session_id || null},
      ${input.device || parseDevice(input.user_agent)}, ${input.browser || parseBrowser(input.user_agent)}
    )
  `
  return { ok: true }
}

export type AnalyticsView = {
  live30m: number
  today: { pageviews: number; visitors: number }
  last7d: { pageviews: number; visitors: number }
  last30d: { pageviews: number; visitors: number }
  daily: Array<{ day: string; pageviews: number; visitors: number }>
  topPages: Array<{ path: string; views: number }>
  topReferrers: Array<{ referrer: string; views: number }>
  topUtm: Array<{ source: string; medium: string; campaign: string; views: number }>
  devices: Array<{ device: string; views: number }>
  browsers: Array<{ browser: string; views: number }>
}

export async function buildAnalyticsView(companyId: string): Promise<AnalyticsView> {
  await ensureAnalyticsTables()
  const sql = getSql()

  const [liveRow] = await sql`
    SELECT count(*)::int as n FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '30 minutes'
  `.catch(() => [{ n: 0 }])

  const [todayRow] = await sql`
    SELECT count(*)::int as pageviews, count(distinct visitor_hash)::int as visitors
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
  `.catch(() => [{ pageviews: 0, visitors: 0 }])

  const [w7] = await sql`
    SELECT count(*)::int as pageviews, count(distinct visitor_hash)::int as visitors
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '7 days'
  `.catch(() => [{ pageviews: 0, visitors: 0 }])

  const [d30] = await sql`
    SELECT count(*)::int as pageviews, count(distinct visitor_hash)::int as visitors
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '30 days'
  `.catch(() => [{ pageviews: 0, visitors: 0 }])

  const daily = await sql`
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') as day,
           count(*)::int as pageviews,
           count(distinct visitor_hash)::int as visitors
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '14 days'
    GROUP BY 1 ORDER BY 1
  `.catch(() => [] as any[])

  const topPages = await sql`
    SELECT path, count(*)::int as views FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '7 days'
    GROUP BY path ORDER BY views DESC LIMIT 12
  `.catch(() => [] as any[])

  const topReferrers = await sql`
    SELECT coalesce(nullif(referrer,''), '(direct)') as referrer, count(*)::int as views
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '7 days'
    GROUP BY 1 ORDER BY views DESC LIMIT 8
  `.catch(() => [] as any[])

  const topUtm = await sql`
    SELECT coalesce(utm_source,'(none)') as source, coalesce(utm_medium,'') as medium,
           coalesce(utm_campaign,'') as campaign, count(*)::int as views
    FROM os_site_analytics
    WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '30 days'
    AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
    GROUP BY 1,2,3 ORDER BY views DESC LIMIT 8
  `.catch(() => [] as any[])

  const devices = await sql`
    SELECT coalesce(device,'unknown') as device, count(*)::int as views
    FROM os_site_analytics WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '7 days'
    GROUP BY 1 ORDER BY views DESC
  `.catch(() => [] as any[])

  const browsers = await sql`
    SELECT coalesce(browser,'unknown') as browser, count(*)::int as views
    FROM os_site_analytics WHERE company_id=${companyId} AND event_type='pageview'
    AND created_at > NOW() - interval '7 days'
    GROUP BY 1 ORDER BY views DESC LIMIT 6
  `.catch(() => [] as any[])

  return {
    live30m: Number(liveRow?.n || 0),
    today: { pageviews: Number(todayRow?.pageviews || 0), visitors: Number(todayRow?.visitors || 0) },
    last7d: { pageviews: Number(w7?.pageviews || 0), visitors: Number(w7?.visitors || 0) },
    last30d: { pageviews: Number(d30?.pageviews || 0), visitors: Number(d30?.visitors || 0) },
    daily: (daily as any[]).map((r) => ({ day: r.day, pageviews: Number(r.pageviews), visitors: Number(r.visitors) })),
    topPages: (topPages as any[]).map((r) => ({ path: r.path, views: Number(r.views) })),
    topReferrers: (topReferrers as any[]).map((r) => ({ referrer: r.referrer, views: Number(r.views) })),
    topUtm: (topUtm as any[]).map((r) => ({ source: r.source, medium: r.medium, campaign: r.campaign, views: Number(r.views) })),
    devices: (devices as any[]).map((r) => ({ device: r.device, views: Number(r.views) })),
    browsers: (browsers as any[]).map((r) => ({ browser: r.browser, views: Number(r.views) })),
  }
}
