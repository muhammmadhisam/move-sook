#!/usr/bin/env bash
# SSH local port forward — MoveSook Postgres
# Reads Host alias "samdev" from ~/.ssh/config (103.99.11.68, User root)
#
# Usage:  ./scripts/ssh-forward-db.sh
#
# After running, connect locally with:
#   psql postgresql://movesook:movesook@localhost:5432/movesook
#   DATABASE_URL=postgresql://movesook:movesook@localhost:5432/movesook

set -euo pipefail

SSH_HOST="samdev"        # Host alias in ~/.ssh/config
LOCAL_PORT=5432          # port on your local machine
REMOTE_PORT=8176         # Docker host port on the server

echo "Forwarding localhost:${LOCAL_PORT} → ${SSH_HOST}:${REMOTE_PORT}"
echo "Press Ctrl+C to stop."
echo ""
echo "Connect with:"
echo "  psql postgresql://movesook:movesook@localhost:${LOCAL_PORT}/movesook"
echo "  DATABASE_URL=postgresql://movesook:movesook@localhost:${LOCAL_PORT}/movesook"
echo ""

ssh -N -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "${SSH_HOST}"
