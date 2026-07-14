/** Kaan AI OS — Telegram alerts (PhishSim AI edition, mirrors ScrollFuel lib/telegram.ts) */

import { evaluateTelegramWiring } from './kaan-os-core/telegramWiring'

export const TELEGRAM_PRODUCT = 'PhishSim AI'
const PRODUCT_ID = 'phishsimai'

/**
 * Credentials are PRODUCT-PREFIXED. The generic TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID pair
 * is legacy: this repo shares a Vercel team with ScrollFuel, and a generic name is exactly
 * how one product ends up alerting on another product's channel. telegramWiring.ts treats
 * the generic vars as a defect (usesLegacyGenericEnv), so they are still READ for backwards
 * compatibility but are reported as a wiring issue rather than silently accepted.
 *
 * Prod currently sets only PHISHSIM_TELEGRAM_* — the generic names are unset, which is why
 * every send silently no-op'd before this.
 */
type Creds = {
  token: string | null
  chatId: string | null
  usesLegacyGenericEnv: boolean
  envKeys: string[]
}

function resolveCreds(): Creds {
  const pToken = process.env.PHISHSIM_TELEGRAM_BOT_TOKEN?.trim()
  const pChat = process.env.PHISHSIM_TELEGRAM_CHAT_ID?.trim()
  if (pToken && pChat) {
    return {
      token: pToken,
      chatId: pChat,
      usesLegacyGenericEnv: false,
      envKeys: ['PHISHSIM_TELEGRAM_BOT_TOKEN', 'PHISHSIM_TELEGRAM_CHAT_ID'],
    }
  }
  const gToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const gChat = process.env.TELEGRAM_CHAT_ID?.trim()
  if (gToken && gChat) {
    return {
      token: gToken,
      chatId: gChat,
      usesLegacyGenericEnv: true,
      envKeys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    }
  }
  return { token: null, chatId: null, usesLegacyGenericEnv: false, envKeys: [] }
}

export function getTelegramConfig() {
  const c = resolveCreds()
  return {
    product: TELEGRAM_PRODUCT,
    configured: !!(c.token && c.chatId),
    hasToken: !!c.token,
    hasChatId: !!c.chatId,
    usesLegacyGenericEnv: c.usesLegacyGenericEnv,
    envKeys: c.envKeys,
  }
}

export type TelegramVerification = {
  ok: boolean
  detail: string
  botUsername?: string | null
  /** Destination — getMe proves WHO sends, never WHERE it lands. These are separate checks. */
  chat?: { id?: number | string; type?: string; title?: string; username?: string } | null
  chatError?: string
}

let cachedVerification: TelegramVerification | null = null

/**
 * Two independent checks, because they answer different questions:
 *   getMe()   — is the configured token genuinely @Phishsimaibot, and NOT a forbidden
 *               cross-product bot (e.g. ScrollFuel's @Fanagentio_bot)?
 *   getChat() — does the configured chat id resolve to a real chat we can reach?
 * A correct bot posting into the wrong chat is still a leak, so neither check subsumes the other.
 */
export async function verifyTelegram(force = false): Promise<TelegramVerification> {
  if (cachedVerification && !force) return cachedVerification

  const c = resolveCreds()
  if (!c.token || !c.chatId) {
    cachedVerification = {
      ok: false,
      detail: 'Telegram not configured — set PHISHSIM_TELEGRAM_BOT_TOKEN and PHISHSIM_TELEGRAM_CHAT_ID',
    }
    return cachedVerification
  }

  let botUsername: string | null = null
  try {
    const res = await fetch(`https://api.telegram.org/bot${c.token}/getMe`, { signal: AbortSignal.timeout(10_000) })
    const data = await res.json() as any
    if (!data?.ok) {
      cachedVerification = { ok: false, detail: `getMe failed: ${data?.description || res.statusText}` }
      return cachedVerification
    }
    botUsername = data.result?.username ?? null
  } catch (e: any) {
    cachedVerification = { ok: false, detail: `getMe error: ${e?.message || e}` }
    return cachedVerification
  }

  const wiring = evaluateTelegramWiring({
    productId: PRODUCT_ID,
    configured: true,
    botUsername,
    usesLegacyGenericEnv: c.usesLegacyGenericEnv,
    envKeys: c.envKeys,
  })

  let chat: TelegramVerification['chat'] = null
  let chatError: string | undefined
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${c.token}/getChat?chat_id=${encodeURIComponent(c.chatId)}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    const data = await res.json() as any
    if (data?.ok) {
      chat = { id: data.result?.id, type: data.result?.type, title: data.result?.title, username: data.result?.username }
    } else {
      chatError = data?.description || res.statusText
    }
  } catch (e: any) {
    chatError = e?.message || String(e)
  }

  const dest = chatError
    ? `destination UNVERIFIED: ${chatError}`
    : chat
      ? `destination ${chat.type} ${chat.title || (chat.username ? '@' + chat.username : '') || chat.id}`
      : 'destination unknown'

  cachedVerification = {
    ok: wiring.ok && !!chat && !chatError,
    detail: `${wiring.detail} | ${dest}`,
    botUsername,
    chat,
    chatError,
  }
  return cachedVerification
}

function prefixMessage(text: string): string {
  if (/^(<b>)?🛡️?\s*PhishSim|PHISHSIM|FOUNDER|JANET|MARCUS|☀️|🌅|📋|✅|🚨/i.test(text)) {
    return text
  }
  return `<b>${TELEGRAM_PRODUCT}</b>\n${text}`
}

export async function sendTelegram(
  text: string,
  keyboard?: { text: string; callback_data: string }[][]
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const c = resolveCreds()
  if (!c.token || !c.chatId) {
    return { ok: false, skipped: true, error: 'Telegram not configured (PHISHSIM_TELEGRAM_*)' }
  }

  // FAIL CLOSED on bot identity. If the token is not PhishSim's own bot — in particular if it
  // is another product's bot — refuse to send rather than leak this product's internals into
  // someone else's channel. A destination that merely could not be READ back (getChat failing
  // on, say, a private chat) is reported but does not block: sendMessage itself will reject a
  // genuinely bad chat_id, so blocking on it would silence real alerts for no safety gain.
  const v = await verifyTelegram()
  if (v.botUsername && !v.ok && /expected @|cross-product leak/.test(v.detail)) {
    console.error(`[telegram] REFUSING to send — bot identity check failed: ${v.detail}`)
    return { ok: false, skipped: true, error: `identity check failed: ${v.detail}` }
  }

  const body: Record<string, unknown> = {
    chat_id: c.chatId,
    text: prefixMessage(text.slice(0, 4000)),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }
  if (keyboard?.length) {
    body.reply_markup = { inline_keyboard: keyboard }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = (data as any)?.description || res.statusText
      console.error(`[telegram] send failed: ${error}`)
      return { ok: false, error }
    }
    return { ok: true }
  } catch (e: any) {
    console.error(`[telegram] send error: ${e.message}`)
    return { ok: false, error: e.message }
  }
}

/** Send a test ping — used by /api/os/telegram/test */
export async function sendTelegramTest(): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return sendTelegram(
    `✅ <b>Telegram connected</b>\n${TELEGRAM_PRODUCT} · Kaan AI OS\nAlerts: bugs, replies, Janet briefs, architect deploys, QA.`
  )
}

export async function registerTelegramWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  const { token } = resolveCreds()
  if (!token) return { ok: false, error: 'PHISHSIM_TELEGRAM_BOT_TOKEN not set' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query'] }),
    })
    const data = await res.json()
    if (!data.ok) return { ok: false, error: data.description }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
