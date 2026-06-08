#!/usr/bin/env bash
#
# Install (or remove) the MoveSook idle-driver nudge as a real crontab job.
# Idempotent: re-running replaces the existing entry rather than duplicating it.
#
# Install (default 10:00 daily):   bash scripts/cron/install-nudge-cron.sh
# Custom schedule:                 NUDGE_CRON_SCHEDULE="0 9 * * 1-5" bash scripts/cron/install-nudge-cron.sh
# Remove:                          bash scripts/cron/install-nudge-cron.sh uninstall
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKER="# movesook:nudge-idle-drivers"
SCHEDULE="${NUDGE_CRON_SCHEDULE:-0 10 * * *}"
LOG="${NUDGE_CRON_LOG:-/tmp/movesook-nudge.log}"
LINE="$SCHEDULE cd $ROOT && /bin/bash scripts/cron/nudge-idle-drivers.sh >> $LOG 2>&1 $MARKER"

ACTION="${1:-install}"

# Existing crontab minus any prior movesook entry (and blank lines).
EXISTING="$(crontab -l 2>/dev/null | grep -vF "$MARKER" | grep -v '^[[:space:]]*$' || true)"

if [ "$ACTION" = "uninstall" ]; then
  if [ -n "$EXISTING" ]; then printf '%s\n' "$EXISTING" | crontab -; else crontab -r 2>/dev/null || true; fi
  echo "[cron] removed MoveSook nudge job"
  exit 0
fi

printf '%s\n%s\n' "$EXISTING" "$LINE" | grep -v '^[[:space:]]*$' | crontab -
echo "[cron] installed MoveSook idle-driver nudge:"
echo "       $LINE"
echo "[cron] verify:  crontab -l | grep movesook"
echo "[cron] logs:    tail -f $LOG"
echo "[cron] remove:  pnpm cron:uninstall-nudge"
echo
echo "NOTE: the local job targets http://localhost:${PORT:-8778} and only fires when the"
echo "      API is running. For production, set MOVESOOK_API_URL to the deployed API URL."
