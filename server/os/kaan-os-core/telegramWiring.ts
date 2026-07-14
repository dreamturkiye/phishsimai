/** Per-product Telegram isolation checks for L5 wiring audit */

const DEFAULT_EXPECTED_BOTS: Record<string, string> = {
  scrollfuel: 'Fanagentio_bot',
  phishsimai: 'Phishsimaibot',
  vellachat: 'Vellachatbot',
}

export function getExpectedTelegramBot(productId: string): string | undefined {
  const envMap: Record<string, string> = {
    scrollfuel: 'SCROLLFUEL_TELEGRAM_EXPECTED_BOT',
    phishsimai: 'PHISHSIM_TELEGRAM_EXPECTED_BOT',
    vellachat: 'VELLACHAT_TELEGRAM_EXPECTED_BOT',
  }
  const key = envMap[productId]
  if (key && process.env[key]) return process.env[key]
  return DEFAULT_EXPECTED_BOTS[productId]
}

/** Bots that must never alert on another product's channel */
export const CROSS_PRODUCT_FORBIDDEN_BOTS: Record<string, string[]> = {
  scrollfuel: ['Phishsimaibot'],
  phishsimai: ['Fanagentio_bot'],
  vellachat: ['Phishsimaibot', 'Fanagentio_bot'],
}

export type TelegramWiringInput = {
  productId: string
  configured: boolean
  botUsername?: string | null
  usesLegacyGenericEnv?: boolean
  envKeys?: string[]
}

export function evaluateTelegramWiring(input: TelegramWiringInput): {
  ok: boolean
  detail: string
  botUsername?: string | null
} {
  const expected = getExpectedTelegramBot(input.productId)
  const forbidden = CROSS_PRODUCT_FORBIDDEN_BOTS[input.productId] || []
  const user = input.botUsername?.replace(/^@/, '') || null

  if (!input.configured) {
    return { ok: false, detail: 'Telegram not configured — set product-specific env keys', botUsername: user }
  }

  const issues: string[] = []

  if (input.usesLegacyGenericEnv) {
    issues.push('uses legacy TELEGRAM_* — set product-prefixed keys')
  }

  if (expected && user && user.toLowerCase() !== expected.toLowerCase()) {
    issues.push(`expected @${expected}, got @${user}`)
  }

  for (const bad of forbidden) {
    if (user && user.toLowerCase() === bad.toLowerCase()) {
      issues.push(`cross-product leak: @${bad} on ${input.productId}`)
    }
  }

  if (issues.length) {
    return { ok: false, detail: issues.join('; '), botUsername: user }
  }

  const envHint = input.envKeys?.join(', ') || 'product telegram env'
  return {
    ok: true,
    detail: user ? `@${user} via ${envHint}` : `configured via ${envHint}`,
    botUsername: user,
  }
}
