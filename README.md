# MoveSook

เรียกคนขับขนย้ายใกล้คุณ แบบ on-demand (two-sided on-demand moving marketplace).

A Turborepo + pnpm monorepo: **web** (USER & DRIVER via LINE/LIFF), **admin** (email/password),
and a shared **Hono** API with end-to-end type-safe RPC.

## Stack

| Layer        | Tech                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| Monorepo     | Turborepo + pnpm workspaces                                             |
| `apps/web`   | Next.js (App Router) · shadcn/ui · Zustand · TanStack Query · LIFF      |
| `apps/admin` | Next.js (App Router) · shadcn/ui · Zustand · TanStack Query (desktop)   |
| `apps/api`   | Hono.js (`@hono/node-server`) · Zod · `@hono/zod-validator`             |
| DB           | PostgreSQL + Prisma                                                      |
| Auth         | LINE Login/LIFF (USER/DRIVER) · email+password (ADMIN) · self-signed JWT |
| RPC          | `hono/client` (`hc<AppType>()`) — typed web/admin ↔ api                  |

## Workspace layout

```
apps/
  web/      USER & DRIVER (LIFF)        → :3000
  admin/    ADMIN (desktop)            → :3001
  api/      Hono + Prisma              → :8787
packages/
  db/       Prisma schema + client singleton + seed
  shared/   Zod schemas, enums, DTOs, job state machine, constants
  auth/     LINE verify · password hash · JWT · RBAC (unit-tested)
  ui/       shared shadcn components (web + admin)
  config/   tsconfig / eslint / prettier / tailwind presets
```

## Roles (RBAC)

`USER` (customer) · `DRIVER` (mover) · `ADMIN` (ops) · `SYSTEM` (webhooks/cron via `x-system-key`).
Roles live in the DB enum **and** the JWT claim. `admin/*` routes are enforced at the API middleware,
and web/admin use **separate cookie names** so sessions never mix.

## Getting started

### 1. Prerequisites

- Node ≥ 20, pnpm 10, Docker (for local Postgres)

### 2. Install & configure env

```bash
pnpm install
cp .env.example .env                       # fill JWT_SECRET, LINE_CHANNEL_ID, SYSTEM_API_KEY
cp apps/web/.env.local.example   apps/web/.env.local
cp apps/admin/.env.local.example apps/admin/.env.local
```

Generate a JWT secret: `openssl rand -base64 48`.

### 3. Database

```bash
docker compose up -d postgres              # local Postgres on :5432
pnpm --filter @movesook/db db:generate     # prisma client
pnpm --filter @movesook/db db:migrate       # create schema (first run: prisma migrate dev)
pnpm --filter @movesook/db db:seed          # admin + commission + drivers + sample job
```

Seeded admin: **admin@movesook.local / changeme123** (change immediately).

### 4. Run all three apps

```bash
pnpm dev                # turbo runs api + web + admin together
# or individually:
pnpm --filter @movesook/api  dev   # http://localhost:8787
pnpm --filter @movesook/web  dev   # http://localhost:3000
pnpm --filter @movesook/admin dev  # http://localhost:3001
```

## Useful commands

```bash
pnpm typecheck          # tsc across every package/app
pnpm lint               # eslint across the repo
pnpm --filter @movesook/auth test   # auth unit tests (vitest)
pnpm --filter @movesook/db db:studio
```

## API surface

```
POST /auth/line                 USER/DRIVER login (LINE id_token → user cookie)
POST /auth/admin/login          ADMIN login (email+password → admin cookie, rate-limited)
POST /auth/logout
GET  /me                        current user + role

POST  /jobs                     (USER) create & publish a job
GET   /jobs                     (DRIVER) open jobs in service area · (USER) own jobs
POST  /jobs/:id/accept          (DRIVER) accept — snapshots commissionPct
PATCH /jobs/:id/status          (DRIVER) advance via state machine; DELIVERED writes a Transaction
POST  /jobs/:id/review          (USER) rate the driver after DELIVERED (1/job)
POST  /drivers/apply            apply to become a driver (sets serviceProvince)
PATCH /drivers/me/availability  (DRIVER) toggle online/offline

GET   /admin/stats              dashboard numbers
GET   /admin/drivers?status=    verification queue
POST  /admin/drivers/:id/verify APPROVE | REJECT
GET   /admin/users · /admin/jobs
PATCH /admin/users/:id/ban
PATCH /admin/jobs/:id           intervene / cancel
GET   /admin/transactions       commission ledger · PATCH /:id to mark PAID/REFUNDED
GET   /admin/settings/commission · PUT to update

POST  /webhooks/line            (SYSTEM) via x-system-key
```

## Conventions

- TypeScript **strict** everywhere; no unnecessary `any`.
- All env is read through a Zod-validated config that **fails fast** if anything is missing.
- Job status changes flow through the shared state machine only (no illegal jumps).
- `commissionPct` defaults from `AppSetting` (12%) and is **snapshotted onto the Job at accept time**.
- New admins are created via seed/CLI or invite by an existing admin — never public self-signup.
