#!/bin/bash
# MoveSook Postgres -> R2 backup. Runs inside the compose 'backup' service.
# Connects to the db service over the ky-networks docker network (no docker socket).
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="movesook-${STAMP}.sql.gz"
PREFIX="backups/postgres"
mkdir -p /backups
echo "===== $(date -u +%FT%TZ) start ${FILE} ====="

# 1) dump + gzip (over network to db service)
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${PGHOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner \
  | gzip > "/backups/${FILE}"
echo "dump ok ($(du -h /backups/${FILE} | cut -f1))"

# 2) upload to R2 via rclone (creds come from env_file ./.env)
#    R2 tokens are bucket-scoped, so --s3-no-check-bucket is required (avoids 403 CreateBucket).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

rclone copyto "/backups/${FILE}" "R2:${R2_BUCKET}/${PREFIX}/${FILE}" --s3-no-check-bucket
echo "uploaded -> R2:${R2_BUCKET}/${PREFIX}/${FILE}"

# 3) retention: local 7d / remote 8d
find /backups -name 'movesook-*.sql.gz' -mtime +7 -delete
rclone delete "R2:${R2_BUCKET}/${PREFIX}/" --min-age 8d --s3-no-check-bucket || true
echo "===== $(date -u +%FT%TZ) done ====="
