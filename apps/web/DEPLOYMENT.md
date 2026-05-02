# Deployment Guide - apps/web (Vercel)

This is a **non-production-hardened** scaffold for deploying the Next.js 15 +
Prisma + Postgres app under `apps/web` to Vercel. It gets you a working
preview/production deploy. Hardening (secret rotation, IP allowlists, real
SSO, WAF, DR, backups, audit retention, etc.) is explicitly out of scope and
must be layered on before any real production rollout.

---

## 1. Prerequisites

- **Node.js 20+** (the project's `engines` field requires `>=20.0.0`).
- **npm 11+** (matches `packageManager` in `apps/web/package.json`).
- **A managed Postgres database** reachable from Vercel's `icn1` region.
  Recommended: [Neon](https://neon.tech) or [Supabase](https://supabase.com).
- **Vercel CLI**: `npm i -g vercel` and run `vercel login`.
- **GitHub repo access** (optional, only if you wire up the Vercel Git integration).

---

## 2. Project shape (what Vercel will build)

- Monorepo root: `c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization`
- Deployable app: `apps/web`
- Framework: **Next.js 15** (App Router)
- Next build output directory: **`build`** (non-standard - set via `next.config.ts`'s `distDir: 'build'`)
- ORM: **Prisma 5** with `postgresql` datasource on `DATABASE_URL`
- Region: **`icn1` (Seoul)** - pinned in `vercel.json`

When importing the project into Vercel, set the **Root Directory** to
`apps/web`. The included `apps/web/vercel.json` will then apply.

---

## 3. Step-by-step deploy

### a. Provision a Postgres database

Pick one:

- **Neon** (serverless, recommended):

  ```
  postgresql://<user>:<password>@<project>-pooler.<region>.neon.tech/<db>?sslmode=require
  ```

  Use the **pooled** connection string (suffix `-pooler`) for the serverless
  runtime. Keep a direct connection string handy for running migrations.

- **Supabase**:
  ```
  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
  ```

### b. Run migrations against the prod DB

From a developer workstation (not from Vercel's build step):

```bash
cd apps/web
export DATABASE_URL="<your-direct-connection-string>"
npx prisma migrate deploy
```

Use a **direct** (non-pooled) connection string for `migrate deploy`. Once
migrations are applied, switch `DATABASE_URL` in Vercel back to the pooled URL.

Optional - seed baseline data:

```bash
npm run prisma:seed
```

### c. Configure Vercel environment variables

1. In the Vercel dashboard, open the project and go to
   **Settings -> Environment Variables**.
2. Add every variable from `apps/web/.env.example` that is relevant to your
   environment. The file is grouped for clarity:
   - **Database** - `DATABASE_URL` (required)
   - **Application base URL** - `APP_BASE_URL`
   - **Admin auth - sessions** - `ADMIN_SESSION_SECRET` (required, generate with
     `openssl rand -hex 32`), `ADMIN_SESSION_TTL_HOURS`, etc.
   - **Admin auth - OIDC** - set all `ADMIN_OIDC_*` for SSO
   - **Admin SCIM** - optional
   - **Document storage** - configure `DOCUMENT_STORAGE_*` for S3-compatible storage
   - **OpenAI** - optional
   - **Ops queue, cron & alerting** - `OPS_CRON_TOKEN` required if you enable cron routes
   - **Source cache & retry tuning** - safe defaults
   - **Valuation engine** - leave `VALUATION_ENGINE_MODE=auto` on Vercel
   - **Korea public data APIs / KOSIS** - optional integrations
   - **Global / US macro overlays** - optional
   - **Climate overlays** - optional
   - **Blockchain / tokenization** - keep `BLOCKCHAIN_MOCK_MODE=true` unless
     you have a real RPC + signer configured
   - **Playwright / E2E guards** - must be `false` in production
3. Apply each variable to the correct environments (Production, Preview, Development).
4. Never paste real secrets into `.env.example` or commit them.

### d. Deploy

From the repo root:

```bash
cd apps/web
vercel link           # first time only - attach this dir to a Vercel project
vercel --prod
```

Vercel will:

1. Run `npm install && npx prisma generate` (the `installCommand` from
   `vercel.json`) so the Prisma client is regenerated against the deployed
   `schema.prisma`.
2. Run `npm run build` which executes `tsx scripts/clean-next-build.ts && next build`.
3. Publish the `build/` output.
4. Deploy API routes with `maxDuration: 60s` so Prisma-backed routes have
   headroom for cold starts and longer queries.

---

## 4. Troubleshooting

### `PrismaClientInitializationError: environment variable not found: DATABASE_URL`

`DATABASE_URL` is missing or not exposed to the target environment. Double
check the Vercel dashboard env-var scope (Production vs Preview vs Development)
and redeploy. Prisma reads this at runtime, not just at build time.

### Admin login fails with `invalid session` or 500 on `/api/admin/session`

`ADMIN_SESSION_SECRET` is unset or differs between deployments. Set a stable
long random value in Vercel (`openssl rand -hex 32`). Rotating the secret
invalidates every existing browser session - expected behavior.

### `@prisma/client did not initialize yet` at runtime

The Prisma client wasn't regenerated during install. Confirm `vercel.json`'s
`installCommand` is `npm install && npx prisma generate`. If you override it in
the dashboard, the JSON file is ignored. A clean redeploy (clearing the build
cache) usually resolves it.

### Windows local build fails with `EINVAL: invalid argument, readlink`

This is a known OneDrive + Next.js interaction on Windows. The project path
(`C:\Users\pjyrh\OneDrive\Desktop\datacenter-quant-tokenization`) is inside
OneDrive, which uses reparse points that Node's `fs.readlink` chokes on. Fixes:

- Move the repo outside the OneDrive-synced folder (e.g. `C:\dev\...`), **or**
- Pause OneDrive sync for the folder before running `npm run build`, **or**
- Use WSL2 / Linux for local builds.

This only affects **local** builds; Vercel's Linux build runners are unaffected.

### API route times out at 10s

The default Vercel function timeout is 10s on the Hobby plan. `vercel.json`
raises API routes to 60s, but on **Hobby** this is capped at 10s regardless.
Upgrade to Pro or above to honor the 60s setting.

### Cron routes return 401

`/api/ops/*` cron endpoints require a bearer matching `OPS_CRON_TOKEN`. Set the
env var and configure Vercel Cron (or external scheduler) to send
`Authorization: Bearer <OPS_CRON_TOKEN>`.

---

## 5. Production preflight (`npm run prod:preflight`)

Before promoting a deployment to production traffic, run the production
preflight script with the production env loaded. It hard-fails when any of
the following is missing:

- core secrets (`DATABASE_URL`, `ADMIN_SESSION_SECRET`, `OPS_CRON_TOKEN`,
  `APP_BASE_URL`)
- `DOCUMENT_STORAGE_BUCKET` (S3-compatible storage is required in prod)
- a real RPC + signer (`BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`,
  `BLOCKCHAIN_REGISTRY_ADDRESS`); `BLOCKCHAIN_MOCK_MODE=true` is rejected
- `PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=false`,
  `ADMIN_ALLOW_UNBOUND_BROWSER_SESSION` unset

It also surfaces warnings for missing OIDC, missing IP allowlists, missing
alert webhooks, and basic-auth fallback usage.

The richer end-to-end production guide lives at
[`docs/production-runbook.md`](./docs/production-runbook.md), which covers
secret-rotation cadence, backup / DR, incident response, edge protection,
observability, and on-chain readiness gates.

## 6. Hardening built into this scaffold

The scaffold now ships with the following hardening enabled by default:

- **Edge IP allowlist + per-IP rate limiting** in `middleware.ts`
  (`ADMIN_IP_ALLOWLIST`, `OPS_IP_ALLOWLIST`, `*_RATE_WINDOW_MS`, `*_RATE_MAX`).
- **Security response headers** (`Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`) wired through `vercel.json`.
- **S3-compatible document storage adapter** (`DOCUMENT_STORAGE_BUCKET` →
  `createS3DocumentStorage`); local FS auto-selects only when the bucket is
  unset and the runtime is not production.
- **Structured JSON logger + Sentry-compatible error reporting** in
  `lib/observability/logger.ts` (`LOG_LEVEL`, `ERROR_REPORT_WEBHOOK_URL`).
- **Audit-log retention pruner** (`npm run audit:prune` /
  `audit:prune:dry`); configurable retention via `AUDIT_RETENTION_DAYS`,
  `OPS_ALERT_DELIVERY_RETENTION_DAYS`, `NOTIFICATION_RETENTION_DAYS`.
- **Production preflight** (`npm run prod:preflight`).
- **Mock-blockchain hard-block in production** (`isBlockchainMockMode`
  throws when `NODE_ENV=production`).
- **Hosted-mutation Playwright guard** is blocked when `NODE_ENV=production`.

## 7. What this scaffold still does NOT do

This is a **minimum-viable** deploy setup. Before serving real users you must:

- Rotate `ADMIN_SESSION_SECRET`, `OPS_CRON_TOKEN`, `ADMIN_SCIM_TOKEN`, and any
  `*_API_KEY` / `BLOCKCHAIN_PRIVATE_KEY` secrets on a regular schedule and
  store them in a real secret manager (Vercel secrets, Doppler, 1Password, KMS).
- Enforce IP allowlists / VPN on admin routes and the Postgres instance.
- Replace the basic-auth fallback with real OIDC SSO (`ADMIN_OIDC_*`) and
  SCIM provisioning from your IdP.
- Configure Vercel Cron (or external scheduler) for `/api/ops/*` jobs and wire
  `OPS_ALERT_*` webhooks into your on-call tooling.
- Set up Postgres PITR/backups, read replicas where appropriate, and a tested
  restore runbook.
- Commission an external smart-contract audit before going live with any
  capital-bearing tokenization flows.
