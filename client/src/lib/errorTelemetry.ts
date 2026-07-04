export interface BugReport {
  error_message: string
  stack_trace: string
  component_name: string
  user_action: string
  url_path: string
  user_email?: string
  browser: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  session_id: string
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = sessionStorage.getItem('ps_session_id')
  if (!id) {
    id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    sessionStorage.setItem('ps_session_id', id)
  }
  return id
}

function scoreSeverity(error: Error, componentName: string): BugReport['severity'] {
  const msg = (error.message || '').toLowerCase()
  if (
    componentName.includes('Campaign') ||
    componentName.includes('Dashboard') ||
    componentName.includes('Targets') ||
    componentName.includes('MiaWidget') ||
    componentName.includes('Auth')
  ) return 'critical'
  if (msg.includes('cannot read') || msg.includes('undefined') || msg.includes('null')) return 'high'
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('404')) return 'medium'
  return 'low'
}

export async function reportBug(
  error: Error,
  componentName: string = 'Unknown',
  userAction: string = 'unknown'
): Promise<void> {
  try {
    const report: BugReport = {
      error_message: error.message || String(error),
      stack_trace: (error.stack || '').slice(0, 2000),
      component_name: componentName,
      user_action: userAction,
      url_path: typeof window !== 'undefined' ? window.location.pathname : 'ssr',
      browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : 'unknown',
      severity: scoreSeverity(error, componentName),
      session_id: getSessionId(),
    }

    await fetch('/api/os/bug-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    })
  } catch {
    // Never throw from error reporter
  }
}

export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    if (!event.error) return
    reportBug(
      event.error,
      'GlobalErrorHandler',
      `unhandled_error at ${event.filename}:${event.lineno}`
    )
  })

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason))
    reportBug(error, 'UnhandledPromise', 'unhandled_promise_rejection')
  })
}
