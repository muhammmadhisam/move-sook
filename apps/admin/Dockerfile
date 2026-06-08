# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/admin/Dockerfile -t movesook-admin .

# ─────────────── build: install + next build (standalone output) ───────────────
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
# Admin imports @movesook/api types → which reference the Prisma client types.
RUN pnpm --filter @movesook/db exec prisma generate

# NEXT_PUBLIC_* are inlined at build time; override with --build-arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @movesook/admin build

# ─────────────── runtime: standalone server only ───────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app

# Standalone is traced from the monorepo root, so it mirrors the repo layout.
COPY --from=build --chown=app:app /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/admin/.next/static ./apps/admin/.next/static

USER app
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
