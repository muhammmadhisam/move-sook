# Deploy (production VPS)

The live deployment runs from `/root/movesook/` on the VPS (`samdev` = `root@103.99.11.68`),
docker compose project **`movesook`**, external network **`ky-networks`**.

> The repo-root `docker-compose.yml` is an older/dev variant and does **not** match production.
> `deploy/compose.yaml` here is the real production topology — keep them from drifting.

## Topology

| Service | Container | Image | Exposure |
|---------|-----------|-------|----------|
| `db` | movesook-postgres | postgres:16-alpine | internal only (ky-networks) |
| `redis` | movesook-redis | redis:7-alpine | internal only (ky-networks) |
| `api` | movesook-api | devpala/move-sook-api | publishes 8787 (behind nginx) |
| `admin` | movesook-admin | devpala/move-sook-admin | publishes 3001 (behind nginx) |
| `backup` | movesook-backup | built from `deploy/backup/` | none |

Postgres data is a bind mount at `./movesook_pgdata`, redis at `./movesook_redisdata`,
backups land in `./db-backups`. A sibling `.env` (not committed) holds `R2_*`, `LINE_*`,
`DATABASE_URL`, etc.

**Security:** `db` and `redis` deliberately have **no `ports:` mapping** — they are reached only
over `ky-networks`. Do not re-add a published port (that exposes Postgres/Redis to the internet).

## Backups → Cloudflare R2 (offsite)

The `backup` service is `postgres:16-alpine` + `rclone` + busybox `crond` (TZ Asia/Bangkok).
Nightly at **03:00** it dumps the DB over the network, gzips to `./db-backups/`, and uploads to
`R2:<bucket>/backups/postgres/`. Retention: local 7 days / remote 8 days. R2 creds come from `.env`.

```bash
# deploy / update the backup service
cd /root/movesook && docker compose up -d --build backup

# run a backup right now
docker exec movesook-backup /usr/local/bin/backup.sh

# logs
docker exec movesook-backup cat /backups/backup.log
```

### Restore

```bash
# into the live DB (DANGER: overwrites)
gunzip -c db-backups/movesook-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i movesook-postgres psql -U movesook -d movesook

# safe drill into a scratch DB
docker exec movesook-postgres psql -U movesook -d postgres -c "CREATE DATABASE restore_test;"
gunzip -c db-backups/<file>.sql.gz | docker exec -i movesook-postgres psql -U movesook -d restore_test
docker exec movesook-postgres psql -U movesook -d postgres -c "DROP DATABASE restore_test;"
```
