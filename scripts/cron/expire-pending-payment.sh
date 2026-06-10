#!/usr/bin/env bash
#
# MoveSook — expire abandoned unpaid jobs (cron job).
#
# Calls the SYSTEM-only endpoint POST /webhooks/expire-pending-payment, which
# auto-cancels PENDING_PAYMENT jobs with no slip uploaded after the
# pending_payment_expire_days window (admin-configurable, 0 = disabled).
# Auth is the static x-system-key header (SYSTEM_API_KEY from the repo-root .env).
#
# Usage:
#   bash scripts/cron/expire-pending-payment.sh        # hit local API (PORT from .env, default 8787)
#   MOVESOOK_API_URL=https://api.movesook.com \
#     bash scripts/cron/expire-pending-payment.sh      # hit a deployed API (production cron)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[expire] missing env file: $ENV_FILE" >&2
  exit 1
fi

# Pull a single KEY=value from .env, matching dotenv: strip a trailing inline
# `# comment`, trim whitespace, and remove optional surrounding quotes.
read_env() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | sed -E \
    "s/^[^=]+=//; s/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

SYSTEM_API_KEY="$(read_env SYSTEM_API_KEY)"
PORT="$(read_env PORT)"
API_URL="${MOVESOOK_API_URL:-http://localhost:${PORT:-8787}}"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

if [ -z "$SYSTEM_API_KEY" ]; then
  echo "[$TS] expire FAILED: SYSTEM_API_KEY not set in $ENV_FILE" >&2
  exit 1
fi

RESPONSE="$(curl -sS -X POST "$API_URL/webhooks/expire-pending-payment" \
  -H "x-system-key: $SYSTEM_API_KEY" \
  -H "Content-Type: application/json")"

echo "[$TS] expire-pending-payment → $RESPONSE"
