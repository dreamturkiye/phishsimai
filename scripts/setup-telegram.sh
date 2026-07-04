#!/usr/bin/env bash
# Kaan AI OS — Telegram setup for PhishSim AI (mirrors ScrollFuel pattern)
# Usage:
#   ./scripts/setup-telegram.sh
#   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy ./scripts/setup-telegram.sh --vercel
set -euo pipefail

PRODUCT="PhishSim AI"
WEBHOOK_BASE="${WEBHOOK_BASE:-https://phishsimai.com}"
HQ_SECRET="${HQ_SECRET:-ps-hq-2026}"

echo "=== Kaan AI OS Telegram Setup — ${PRODUCT} ==="
echo ""
echo "1. Open Telegram → @BotFather → /newbot (or use existing bot)"
echo "2. Copy the bot token (format: 123456789:ABC...)"
echo "3. Message your bot once, then run:"
echo "   curl https://api.telegram.org/bot<TOKEN>/getUpdates"
echo "   Use message.chat.id as TELEGRAM_CHAT_ID"
echo ""

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  read -rsp "TELEGRAM_BOT_TOKEN: " TELEGRAM_BOT_TOKEN
  echo ""
fi
if [[ -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  read -rp "TELEGRAM_CHAT_ID: " TELEGRAM_CHAT_ID
fi

if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]]; then
  echo "Error: token and chat id required" >&2
  exit 1
fi

echo ""
echo "Sending test message..."
curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "{\"chat_id\":\"${TELEGRAM_CHAT_ID}\",\"text\":\"✅ ${PRODUCT} Telegram connected — Kaan AI OS\",\"parse_mode\":\"HTML\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else d)" 

WEBHOOK_URL="${WEBHOOK_BASE}/api/os/webhook/telegram"
echo ""
echo "Registering webhook: ${WEBHOOK_URL}"
curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"allowed_updates\":[\"message\",\"callback_query\"]}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Webhook OK' if d.get('ok') else d)"

if [[ "${1:-}" == "--vercel" ]]; then
  echo ""
  echo "Setting Vercel production env..."
  printf '%s' "$TELEGRAM_BOT_TOKEN" | npx vercel env add TELEGRAM_BOT_TOKEN production
  printf '%s' "$TELEGRAM_CHAT_ID" | npx vercel env add TELEGRAM_CHAT_ID production
  echo "Redeploy for env to take effect: npx vercel --prod"
fi

echo ""
echo "Verify live: curl \"${WEBHOOK_BASE}/api/os/telegram/test?secret=${HQ_SECRET}\""
echo "Done."
