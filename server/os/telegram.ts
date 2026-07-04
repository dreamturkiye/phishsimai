/** Kaan AI OS — Telegram alerts (PhishSim AI edition, mirrors ScrollFuel lib/telegram.ts) */

export const TELEGRAM_PRODUCT = 'PhishSim AI'

export function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  return {
    product: TELEGRAM_PRODUCT,
    configured: !!(token && chatId),
    hasToken: !!token,
    hasChatId: !!chatId,
  }
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
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) {
    return { ok: false, skipped: true }
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: prefixMessage(text.slice(0, 4000)),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }
  if (keyboard?.length) {
    body.reply_markup = { inline_keyboard: keyboard }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as any)?.description || res.statusText }
    }
    return { ok: true }
  } catch (e: any) {
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
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }
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
