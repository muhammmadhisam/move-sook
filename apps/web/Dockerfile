# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/web/Dockerfile -t movesook-web .

# ─────────────── build: install + next build (standalone output) ───────────────
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile
# Web imports @movesook/api types → which reference the Prisma client types.
RUN pnpm --filter @movesook/db exec prisma generate

# NEXT_PUBLIC_* are inlined at build time; override with --build-arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ARG NEXT_PUBLIC_LIFF_ID=
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @movesook/web build

# ─────────────── runtime: standalone server only ───────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tzdata
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Bangkok
RUN addgroup -S app && adduser -S app -G app

# Standalone is traced from the monorepo root, so it mirrors the repo layout.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static

USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
