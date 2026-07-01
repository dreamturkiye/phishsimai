/**
 * Frontend asset smoke checks — catches missing CSS/JS (unstyled homepage regressions).
 */

export type FrontendSmokeOptions = {
  brandMarker: string
  minCssBytes?: number
  minJsBytes?: number
}

const DEFAULT_MIN_CSS = 32_000
const DEFAULT_MIN_JS = 100_000

export function resolveUrl(base: string, href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  return new URL(href, base.endsWith('/') ? base : base + '/').toString()
}

export function extractStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = []
  const re = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
    if (href) hrefs.push(href)
  }
  return hrefs
}

export function extractModuleScriptSrcs(html: string): string[] {
  const srcs: string[] = []
  const re = /<script[^>]+type=["']module["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const src = tag.match(/src=["']([^"']+)["']/i)?.[1]
    if (src) srcs.push(src)
  }
  return srcs
}

/** App bundle CSS only — excludes Google Fonts etc. */
export function filterAppStylesheets(hrefs: string[]): string[] {
  return hrefs.filter((h) =>
    /\/assets\/[^"']+\.css/.test(h) ||
    /\/_next\/static\/css\/[^"']+\.css/.test(h)
  )
}

export function filterAppScripts(srcs: string[]): string[] {
  return srcs.filter((s) =>
    /\/assets\/[^"']+\.js/.test(s) ||
    /\/_next\/static\/chunks\/[^"']+\.js/.test(s)
  )
}

export async function fetchAssetSize(url: string): Promise<number> {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  if (head.ok) {
    const len = head.headers.get('content-length')
    if (len) return parseInt(len, 10)
  }
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) throw new Error(`Asset ${url} returned ${r.status}`)
  const buf = await r.arrayBuffer()
  return buf.byteLength
}

export async function assertHomepageStyled(baseUrl: string, opts: FrontendSmokeOptions): Promise<{
  html: string
  cssUrl: string
  jsUrl?: string
  cssBytes: number
}> {
  const root = baseUrl.replace(/\/$/, '')
  const r = await fetch(root, { redirect: 'follow' })
  if (!r.ok) throw new Error(`Homepage status ${r.status}`)
  const html = await r.text()
  if (!html.includes(opts.brandMarker)) {
    throw new Error(`Homepage missing brand marker: ${opts.brandMarker}`)
  }

  const appCss = filterAppStylesheets(extractStylesheetHrefs(html))
  if (appCss.length === 0) {
    throw new Error(
      'CRITICAL: Homepage has no app stylesheet link — site will render unstyled (check main.tsx imports ./index.css)'
    )
  }

  let totalCssBytes = 0
  let cssUrl = resolveUrl(root, appCss[0])
  for (const href of appCss) {
    const url = resolveUrl(root, href)
    totalCssBytes += await fetchAssetSize(url)
    cssUrl = url
  }

  const minCss = opts.minCssBytes ?? DEFAULT_MIN_CSS
  if (totalCssBytes < minCss) {
    throw new Error(
      `CRITICAL: App CSS too small (${totalCssBytes} bytes < ${minCss}) — likely empty or broken: ${cssUrl}`
    )
  }

  const appJs = filterAppScripts(extractModuleScriptSrcs(html))
  let jsUrl: string | undefined
  if (appJs.length > 0) {
    jsUrl = resolveUrl(root, appJs[0])
    const minJs = opts.minJsBytes ?? DEFAULT_MIN_JS
    const jsBytes = await fetchAssetSize(jsUrl)
    if (jsBytes < minJs) {
      throw new Error(`CRITICAL: App JS too small (${jsBytes} bytes < ${minJs}): ${jsUrl}`)
    }
  }

  return { html, cssUrl, jsUrl, cssBytes: totalCssBytes }
}

export type SmokeBugPayload = {
  product: string
  componentName: string
  errorMessage: string
  stackTrace: string
  urlPath: string
  severity?: 'critical' | 'high'
}

export async function insertSmokeBugReport(
  sql: { (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> },
  payload: SmokeBugPayload
): Promise<string | null> {
  const severity = payload.severity || 'critical'
  const dup = await sql`
    SELECT id FROM bug_reports
    WHERE error_message=${payload.errorMessage}
      AND component_name=${payload.componentName}
      AND last_seen > NOW() - interval '1 hour'
    LIMIT 1
  `.catch(() => [] as { id: string }[])

  const rows = dup as { id: string }[]
  if (rows[0]?.id) {
    await sql`
      UPDATE bug_reports SET occurrence_count=occurrence_count+1, last_seen=NOW(), severity=${severity}
      WHERE id=${rows[0].id}
    `.catch(() => {})
    return rows[0].id
  }

  const inserted = await sql`
    INSERT INTO bug_reports (error_message, stack_trace, component_name, user_action, url_path, severity, status)
    VALUES (
      ${payload.errorMessage},
      ${payload.stackTrace},
      ${payload.componentName},
      'qa_smoke_cron',
      ${payload.urlPath},
      ${severity},
      'open'
    )
    RETURNING id
  `
  const bugRows = inserted as { id: string }[]
  return bugRows[0]?.id?.toString() || null
}

export function isCriticalFrontendFailure(testName: string, error?: string): boolean {
  if (testName.toLowerCase().includes('css') || testName.toLowerCase().includes('styled')) return true
  if (testName.toLowerCase().includes('js bundle')) return true
  return !!(error && /CRITICAL:/i.test(error))
}
