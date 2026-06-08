# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/api/Dockerfile -t movesook-api .

# ─────────────── build: install, generate Prisma, deploy prod tree ───────────────
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /repo

# Whole monorepo (.dockerignore trims node_modules/.next/etc.)
COPY . .

RUN pnpm install --frozen-lockfile
# Prisma client + musl query-engine, generated into packages/db/src/generated
RUN pnpm --filter @movesook/db exec prisma generate
# Self-contained prod deployment of just the API (workspace deps + Prisma copied in)
RUN pnpm --filter @movesook/api deploy --prod --legacy /app

# Prune dev-only packages that the legacy --prod deploy fails to strip from
# workspace dependencies, plus Prisma engines for databases we don't use.
RUN set -eux; \
    cd /app/node_modules/.pnpm 2>/dev/null && \
    rm -rf prisma@* typescript@* effect@* fast-check@* pure-rand@* \
           vitest@* @vitest+* @types+* tinypool@* tinyspy@* || true; \
    PC="$(find /app/node_modules/.pnpm -maxdepth 1 -type d -name '@prisma+client@*' | head -1)"; \
    if [ -n "$PC" ]; then \
      cd "$PC/node_modules/@prisma/client/runtime" && \
      rm -f query_engine_bg.cockroachdb.* query_engine_bg.mysql.* \
            query_engine_bg.sqlite.* query_engine_bg.sqlserver.* || true; \
    fi; \
    find /app/node_modules -name '*.wasm' -path '*generated*' -delete || true; \
    find /app/node_modules -type f \( -name '*.md' -o -name '*.map' \) -delete || true

# ─────────────── runtime: minimal Alpine, non-root, run TS via tsx ───────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app ./
USER app
EXPOSE 8787
# Required env at runtime: DATABASE_URL, JWT_SECRET, LINE_CHANNEL_ID, SYSTEM_API_KEY
CMD ["node_modules/.bin/tsx", "src/index.ts"]
