export const KAAN_OS_VERSION = '4.0'

export const KAAN_OS_LABEL = `Kaan AI OS v${KAAN_OS_VERSION}`

export function osVersionForCompany(companyId: string): string {
  if (companyId === 'phishsimai') return `${KAAN_OS_LABEL} — PhishSimAI Edition`
  return `${KAAN_OS_LABEL} — ScrollFuel Edition`
}

export const KAAN_OS_SYSTEM = `${KAAN_OS_LABEL} — Janet CGO + 8 Specialists`
