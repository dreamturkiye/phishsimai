const COMPANY = 'phishsimai'
const ENDPOINT = '/api/os/analytics/collect'
const SESSION_KEY = 'kaan_os_sid'

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

function utmParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  try {
    const p = new URLSearchParams(window.location.search)
    return {
      utm_source: p.get('utm_source') || undefined,
      utm_medium: p.get('utm_medium') || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
    }
  } catch {
    return {}
  }
}

export function trackPageview(path = window.location.pathname + window.location.search) {
  if (path.startsWith('/api')) return
  const body = JSON.stringify({
    company_id: COMPANY,
    path,
    referrer: document.referrer || undefined,
    session_id: sessionId(),
    ...utmParams(),
  })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
    } else {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    }
  } catch { /* ignore */ }
}

export function initOsAnalytics() {
  if (typeof window === 'undefined') return () => {}
  trackPageview()
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  const onNav = () => trackPageview()
  history.pushState = (...args) => { origPush(...args); onNav() }
  history.replaceState = (...args) => { origReplace(...args); onNav() }
  window.addEventListener('popstate', onNav)
  return () => window.removeEventListener('popstate', onNav)
}
