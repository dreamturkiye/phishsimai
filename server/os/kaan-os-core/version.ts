/** Kaan AI OS v5.0 — unified version for all product editions */

export const KAAN_OS_VERSION = '5.0.0'
export const KAAN_OS_SPEC = '5.0.0'
export const KAAN_OS_AUTONOMY: 'L5' = 'L5'

export const KAAN_OS_LABEL = `Kaan AI OS v${KAAN_OS_VERSION}`

export function osVersionForCompany(companyId: string): string {
  if (companyId === 'phishsimai') return `${KAAN_OS_LABEL} — PhishSimAI Edition`
  if (companyId === 'vellachat') return `${KAAN_OS_LABEL} — VellaChat Edition`
  return `${KAAN_OS_LABEL} — ScrollFuel Edition`
}

export const KAAN_OS_SYSTEM = `${KAAN_OS_LABEL} — Janet CEO Supervisor + Hierarchical L5 Autonomy`
