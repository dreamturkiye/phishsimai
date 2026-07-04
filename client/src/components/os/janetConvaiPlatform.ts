export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android/i.test(navigator.userAgent)
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

export function micPermissionHelp(): string {
  if (isAndroid()) return 'Microphone required. Chrome → Site settings → Microphone → Allow.'
  if (isIos()) return 'Microphone required. Settings → Safari → Microphone → Allow.'
  return 'Microphone permission denied. Allow mic in browser settings.'
}

export function connectionErrorHelp(detail?: string): string {
  const base = 'Connection failed. Tap to try again.'
  if (!detail) return base
  if (/denied|not-allowed|permission/i.test(detail)) return micPermissionHelp()
  return `${base} (${detail.slice(0, 80)})`
}
