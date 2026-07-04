import { useEffect } from 'react'
import { installGlobalErrorHandlers } from '@/lib/errorTelemetry'

export function GlobalErrorHandler() {
  useEffect(() => {
    installGlobalErrorHandlers()
  }, [])
  return null
}
