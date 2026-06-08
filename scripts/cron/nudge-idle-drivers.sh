#!/usr/bin/env bash
#
# MoveSook — idle-driver re-engagement nudge (cron job).
#
# Calls the SYSTEM-only endpoint POST /webhooks/nudge-idle-drivers, which notifies
# approved drivers who have gone offline and inactive beyond DRIVER_IDLE_NUDGE_DAYS.
# Auth is the static x-system-key header (SYSTEM_API_KEY from the repo-root .env).
#
# Usage:
#   bash scripts/cron/nudge-idle-drivers.sh            # hit local API (PORT from .env, default 8778)
#   MOVESOOK_API_URL=https://api.movesook.com \
#     bash scripts/cron/nudge-idle-drivers.sh          # hit a deployed API (production cron)
#
# Install as a daily cron job (10:00):
#   pnpm cron:install-nudge
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[nudge] missing env file: $ENV_FILE" >&2
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
API_URL="${MOVESOOK_API_URL:-http://localhost:${PORT:-8778}}"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

if [ -z "$SYSTEM_API_KEY" ]; then
  echo "[$TS] nudge FAILED: SYSTEM_API_KEY not set in $ENV_FILE" >&2
  exit 1
fi

if RESP="$(curl -fsS -X POST "$API_URL/webhooks/nudge-idle-drivers" \
  -H "x-system-key: $SYSTEM_API_KEY" 2>&1)"; then
  echo "[$TS] nudge ok ($API_URL): $RESP"
else
  echo "[$TS] nudge FAILED ($API_URL): $RESP" >&2
  exit 1
fi
