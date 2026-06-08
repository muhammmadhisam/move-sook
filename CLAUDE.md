# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MoveSook is an **on-demand** two-sided moving marketplace: customers post jobs and nearby available drivers claim them (no pre-declared trips). Turborepo + pnpm monorepo. UI copy is Thai; code/comments are English.

## Code search & indexing (SocratiCode)

This repo is indexed with SocratiCode. Follow this workflow:

- **Finding code** — use `codebase_search` (semantic) / the code graph instead of blind `grep`/file scanning when locating where a feature, type, or function lives. Fall back to grep/Read only for exact-string lookups or to read a known file.
- **After editing code** — once a code change is complete, refresh the index with `codebase_update` (incremental, only changed files) so search stays accurate. The file watcher usually does this automatically; run it manually if the watcher is inactive or after a batch of edits.

## Commands

```bash
pnpm install
pnpm dev                         # turbo: api + web + admin together
pnpm typecheck                   # tsc --noEmit across all 9 workspaces (3 apps + 6 packages) — the primary gate
pnpm lint                        # eslint flat config across the repo
pnpm format                      # prettier write

# Per-app dev (ports): api 8787, web 3000, admin 3001
pnpm --filter @movesook/api dev
pnpm --filter @movesook/web dev
pnpm --filter @movesook/admin dev

# Database (packages/db)
docker compose up -d postgres
pnpm --filter @movesook/db db:generate    # after ANY schema.prisma edit
pnpm --filter @movesook/db db:migrate     # prisma migrate dev
pnpm --filter @movesook/db db:seed        # admin@movesook.local / changeme123 + sample data
pnpm --filter @movesook/db db:studio

# Tests (auth is the only package with a suite — vitest)
pnpm --filter @movesook/auth test
pnpm --filter @movesook/auth test -- src/__tests__/jwt.test.ts   # single file
pnpm --filter @movesook/auth test:watch
```

After editing `packages/db/prisma/schema.prisma` you must re-run `db:generate` or every consumer's typecheck breaks (the generated client is what `@movesook/db` re-exports).

## Architecture

Three apps (`api`, `web`, `admin`) over six shared packages (`config`, `db`, `shared`, `auth`, `ui`, `thailand-provinces`). Dependency flow: `config` ← `db` ← `shared` ← `auth` ← `api` → consumed by `web`/`admin` (which also use `ui`). `thailand-provinces` is a leaf **data package** (Thai provinces/amphures/tambons/zip codes + address helpers) consumed by `shared` (province validation), `ui`, `web`, and `admin` — it exports source JSON + helpers, never the Prisma client.

**Type-safe RPC is the backbone.** `apps/api/src/app.ts` builds the entire Hono app as a **single method chain** (`.use().onError().get().route()...`) and exports `type AppType = typeof app`. Breaking that chain — assigning intermediate results to a variable, or mounting routes outside it — silently strips route types from the client. `apps/api/src/client.ts` exposes `createApiClient(baseUrl)` returning `hc<AppType>()`; web/admin import it from `@movesook/api/client` and call e.g. `api.jobs[':id'].accept.$post({ param })`. End-to-end types depend on this; verify with `pnpm --filter @movesook/web typecheck`.

**`@movesook/shared` is the contract.** Zod schemas/enums/DTOs live here and are the validation source of truth at the API boundary. Enum *values* are kept identical to the Prisma enums in `@movesook/db` so they map 1:1 (they are declared independently, not imported, so clients never pull in the Prisma client). The **job state machine** (`job-state-machine.ts`) is also here — both the API (enforces on `PATCH /jobs/:id/status`) and clients (decide which buttons to show) consume `canTransition()`. Constants like `DEFAULT_COMMISSION_PCT` and cookie/JWT TTLs live in `constants.ts`. Province schemas (`schemas/province.ts`) validate against the real Thai province list pulled from `@movesook/thailand-provinces` — the same source clients use for address pickers and the driver `serviceProvince` / job `originProvince` matching.

**Auth has two audiences with separate cookies.** USER/DRIVER authenticate via LINE id_token (`POST /auth/line`, verified against LINE with `aud`/`iss`/`exp` checks); ADMIN via email+password (`POST /auth/admin/login`, bcrypt + in-memory rate-limit/lockout). Both issue a self-signed JWT (`sub`+`role`, jose HS256) but in **differently-named httpOnly cookies** (`USER_COOKIE_NAME` vs `ADMIN_COOKIE_NAME`) so sessions never collide across the `app.`/`admin.` subdomains. `@movesook/auth` holds the framework-agnostic primitives (jwt, password, line, rbac) and is unit-tested; the Hono middleware that wraps them lives in `apps/api/src/middleware/auth.ts` as `authenticate('user'|'admin')`, `requireRole(...)`, and `requireSystem` (static `x-system-key` for webhooks/cron). **RBAC has no implicit hierarchy** — ADMIN is not automatically a DRIVER; each route lists exactly which roles pass. There is no `/me` for admins (it reads the user cookie); the admin UI gates on a probe to `/admin/stats` (`apps/admin/src/hooks/use-admin-session.ts`), but the API enforces RBAC regardless.

**API surface.** Routes live in `apps/api/src/routes/` and mount into the `app.ts` chain: `auth` (LINE + admin login), `me` (USER/DRIVER session, profile, in-app notifications), `jobs` (post / accept / `:id/status` / `:id/proof` / `:id/cancel` / `:id/review` + the driver feed), `drivers` (`/claim` to apply, `/me` profile, `/me/availability`, `/me/earnings`), `uploads`, `webhooks`, and a broad `admin` surface (stats/analytics, users & customers, jobs, transactions, payouts, disputes, settings — commission/pricing/system, service-areas, vehicle-pricing, promos, blacklist, audit-logs, admin invites, and PDPA consents/export/anonymize). Driver *verification* is an admin action (`admin/drivers/:id`), not a driver route. Cross-cutting helpers are in `apps/api/src/lib/`: `transactions` (commission ledger), `settings` (cached `AppSetting` reads), `notify` (in-app notifications), `audit` (`AuditLog` writes for admin actions), `rate-limit`, `paginate`, `serialize`, `cookies`, and `context` (Hono `AppEnv`/claims typing).
- **Uploads are local-disk for now.** `routes/uploads.ts` writes to `./uploads` (5 MB cap, jpg/png/webp) and serves them back at `GET /uploads/*`; it accepts *either* the user or admin cookie. Designed to swap to S3/MinIO by changing only that module + the static mount in `app.ts` — keep that boundary.
- **Webhooks & LINE push are stubs.** `POST /webhooks/line` is SYSTEM-only (`requireSystem` / `x-system-key`) and currently just logs; full channel-secret HMAC validation and event dispatch are follow-ups. Likewise `notify()` only creates in-app `Notification` rows (best-effort — a failure must never break the triggering action); LINE push via `lineUserId` is planned, not wired.

**Domain rules to preserve:**
- Customer job creation posts as `PENDING_PAYMENT` (hidden from drivers): the customer uploads a bank-transfer slip (`POST /jobs/:id/payment-slip`), then an admin approves it (`POST /admin/jobs/:id/payment/approve`) which flips it to `POSTED` and fans out `notifyNewJobToArea`. Rejecting (`/payment/reject`) clears the slip and bounces it back for re-upload, staying `PENDING_PAYMENT`. Admin-created jobs (`POST /admin/jobs`) skip the gate — they post directly as `POSTED`/`ACCEPTED` and just store the slip (marked approved) if attached. Acceptance uses a conditional `prisma.job.updateMany({ where: { status: 'POSTED', driverId: null } })` to win the claim race atomically — don't replace with read-then-write.
- `commissionPct` defaults from the `AppSetting` row (`commission_pct`, 12%) and is **snapshotted onto the Job at accept time** so later commission changes don't rewrite history.
- Driver job acceptance is gated on `verifyStatus === 'APPROVED'`; applying as a driver promotes the user's role to DRIVER but does not approve them.
- New admins come only from seed/CLI or invite by an existing admin — never a public endpoint.
- **Transaction is the commission ledger.** It is created inside the same `prisma.$transaction` that flips a job to `DELIVERED` (`apps/api/src/lib/transactions.ts`), is idempotent (one row per job via the `jobId` unique), and snapshots `grossAmount`/`commissionPct`. The split math lives once in `computeCommission()` in `@movesook/shared` — don't recompute inline.
- **Driver rating is denormalised.** `Driver.ratingAvg`/`ratingCount` are recomputed from `Review` aggregate in the same tx as each `POST /jobs/:id/review` (one review per delivered job, authored by the job's customer). Read these fields for display/matching; don't aggregate `Review` on every read.
- **On-demand matching drives the driver job feed.** `GET /jobs` for a DRIVER returns open (POSTED, unassigned) jobs whose `originProvince` matches the driver's `serviceProvince` (an explicit `originProvince` query overrides it). Drivers flip `isAvailable` via `PATCH /drivers/me/availability`. There are no pre-declared trips — first approved driver to `POST /jobs/:id/accept` wins the atomic claim race.

**Config & strictness:** All env is read through a Zod schema that **fails fast** (`apps/api/src/config.ts` calls `process.exit(1)` on missing/invalid vars; the API loads the repo-root `.env`). TypeScript is strict everywhere including `noUncheckedIndexedAccess` — Record/array lookups are `T | undefined`, so guard with `?? fallback` (this bites when reading `jobsByStatus[status]`). `no-explicit-any` is an error.

**Packages export source TS directly** (`"main": "./src/index.ts"`, no `dist`); Next apps transpile them via `transpilePackages` in `next.config.mjs`. `packages/ui` ships shadcn components + `globals.css` (design tokens); web/admin import the tokens via `@import '@movesook/ui/globals.css'` and share the Tailwind preset from `@movesook/config/tailwind` (their `tailwind.config.ts` adds `../../packages/ui/src` to `content`).
