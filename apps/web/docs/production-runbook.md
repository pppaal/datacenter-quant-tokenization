# Production Runbook

This runbook covers the operational gates that the platform-readiness audit
flagged as missing for full production deployment. It is paired with:

- `apps/web/DEPLOYMENT.md` — initial Vercel scaffold
- `apps/web/docs/operations-runbook.md` — day-to-day ops (cron, source refresh)
- `apps/web/docs/hardening-plan.md` — broader hardening backlog

The goal of this document is to make the platform safely shippable for real
LP / external traffic, not just demo traffic.

---

## 1. Production preflight (`npm run prod:preflight`)

Run this locally or in CI **with the production env loaded** before promoting
a deployment to production traffic. The script hard-fails when any of the
following is missing:

| Class            | Required                                                   |
| ---------------- | ---------------------------------------------------------- |
| Database         | `DATABASE_URL`                                             |
| App URL          | `APP_BASE_URL`                                             |
| Sessions         | `ADMIN_SESSION_SECRET` (>= 32 chars, not the dev placeholder) |
| Cron auth        | `OPS_CRON_TOKEN` (>= 24 chars)                             |
| Document storage | `DOCUMENT_STORAGE_BUCKET` (S3-compatible)                  |
| Blockchain       | `BLOCKCHAIN_RPC_URL` + `BLOCKCHAIN_PRIVATE_KEY` + `BLOCKCHAIN_REGISTRY_ADDRESS` (mock mode forbidden) |
| Escape hatches   | `PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=false`, `ADMIN_ALLOW_UNBOUND_BROWSER_SESSION` unset |

Warnings (not failures) are emitted for missing OIDC, missing IP allowlists,
missing alert / error webhooks, and basic-auth fallback usage.

---

## 2. Secret rotation

Secrets that must be rotated on a fixed schedule (90 days unless otherwise
noted) and on any suspected compromise:

| Secret                                | Rotate every | Effect of rotation                               |
| ------------------------------------- | ------------ | ------------------------------------------------ |
| `ADMIN_SESSION_SECRET`                | 90d          | Invalidates every active browser admin session.   |
| `OPS_CRON_TOKEN`                      | 90d          | Cron callers must update their bearer immediately. |
| `ADMIN_SCIM_TOKEN`                    | 90d          | IdP must re-issue the SCIM bearer.                |
| `BLOCKCHAIN_PRIVATE_KEY`              | 180d / on incident | Requires updating the registrar role onchain. |
| `DOCUMENT_STORAGE_SECRET_ACCESS_KEY`  | 90d          | Switch to fresh IAM access key, then disable old. |
| `*_API_KEY` (KOSIS, FRED, BLS, etc.)  | per provider | Refresh in vendor portal, rotate in Vercel.       |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`| 90d          | Use scoped project keys; revoke immediately on incident. |

Rotation procedure:

1. Generate the new secret (`openssl rand -hex 32` for `ADMIN_SESSION_SECRET`).
2. Add it as a new Vercel env var **alongside** the existing one (Production +
   Preview). For secrets read at runtime by external callers (e.g. the SCIM
   bearer), publish the new value to the IdP first.
3. Update Vercel to use the new variable name (or replace the value in place).
4. Redeploy.
5. Revoke the old secret at the source (IAM, IdP, vendor) once the new one is
   in service for at least one full traffic cycle.

Never commit real secrets to the repo. `.env.example` is the only `.env`-style
file in version control.

---

## 3. Backup & disaster recovery

The Postgres instance hosts every operator decision and must have:

- **PITR enabled** (Neon: WAL retention >= 7 days; Supabase: Pro tier PITR;
  RDS: enable continuous backup).
- **Daily logical dumps** via `pg_dump` from a hardened bastion or a managed
  backup service. Retain >= 30 days in encrypted object storage.
- **Quarterly restore test** into a scratch database, followed by
  `npm run prisma:migrate -- deploy` and `npm test` to confirm the dump is
  restorable end-to-end.
- **Read replicas** if reporting queries grow heavy enough to interfere with
  operator latency.

Document storage (`DOCUMENT_STORAGE_BUCKET`) must have:

- **Versioning enabled** so a corrupted upload can be rolled back.
- **Cross-region replication** if the deployment serves more than one region.
- **Object lock** (compliance mode) for immutable diligence packets — required
  for review packet manifests because they back the on-chain document hash.
- **Lifecycle rule**: transition to infrequent-access tier after 90 days,
  delete only if matching the legal-hold policy.

---

## 4. Incident response

| Severity | Trigger                                               | First response                                          |
| -------- | ----------------------------------------------------- | ------------------------------------------------------- |
| SEV-1    | Production outage, data exfiltration, key compromise   | Page on-call. Rotate suspected secrets immediately. Open an incident channel. |
| SEV-2    | Scheduled cron failing > 4 hours, partial DB outage    | Investigate via `/admin/security` ops alert log; replay or escalate. |
| SEV-3    | Single-asset workflow regression, non-blocking bug     | File ticket; fix in next deploy.                        |

For SEV-1 secret compromise:

1. Rotate `ADMIN_SESSION_SECRET` first — this terminates every admin browser
   session and forces re-auth.
2. Rotate `OPS_CRON_TOKEN` and `ADMIN_SCIM_TOKEN`. Inform the IdP / scheduler.
3. Rotate `BLOCKCHAIN_PRIVATE_KEY`. Transfer the registrar role on chain to a
   freshly-generated signer; mark the old signer as compromised in the
   audit log.
4. Rotate object-storage keys. Pre-warm the new keys in Vercel env, then
   disable the old keys in IAM.
5. Run `npm run audit:prune:dry` to check that retention windows still cover
   the incident window before any pruning runs.

---

## 5. Edge protection

`middleware.ts` enforces, in order:

1. **IP allowlist** for admin and ops surfaces (configurable via
   `ADMIN_IP_ALLOWLIST` and `OPS_IP_ALLOWLIST` — empty = no enforcement).
2. **Per-IP rate limit** for `/api/admin/*` (240/min default), `/api/ops/*`
   (60/min default), and `/api/*` (60/min default). Configurable via the
   `*_RATE_WINDOW_MS` and `*_RATE_MAX` env pair.
3. **Admin auth** via OIDC SSO or signed session cookie.
4. **Role gate** for protected paths (`getRequiredAdminRoleForPath`).

This is a defense-in-depth layer. For real-world traffic a managed WAF
(Vercel Firewall, Cloudflare) should still sit in front.

---

## 6. Observability

`lib/observability/logger.ts` provides a JSON-line logger and
`reportError(error, context)` helper.

- `LOG_LEVEL` controls verbosity. Default is `info` in production.
- `ERROR_REPORT_WEBHOOK_URL` forwards runtime errors to an external sink
  (Sentry's project DSN, a Datadog HTTP intake, or a Slack webhook).
- Source-refresh and research-sync runs already alert through
  `OPS_ALERT_WEBHOOK_URL` / `OPS_ALERT_FALLBACK_WEBHOOK_URL`.
- `npm run audit:prune` runs the retention pruner. Schedule it daily.

---

## 7. On-chain readiness gates

The on-chain registry is intentionally registry-only: documents, valuations,
and operator logic stay off chain. Before going live:

- Run `npm run contracts:compile` and `npm run contracts:export-abi` from the
  repo root after any contract change.
- Deploy the `DataCenterAssetRegistry` to the production chain. Set
  `BLOCKCHAIN_REGISTRY_ADDRESS` in Vercel.
- Configure `BLOCKCHAIN_RPC_URL` to a paid RPC tier with SLA. Avoid public
  endpoints; rate limits will eventually break readiness staging under load.
- Generate the registrar private key in a hardware module (or a dedicated
  Vercel-stored secret with strict access). Set `BLOCKCHAIN_PRIVATE_KEY`.
- Commission an external smart-contract audit before going live with any
  capital-bearing tokenization flows. The registry alone is in scope; the
  ERC-3643-style `AssetToken` + `IdentityRegistry` + `ModularCompliance`
  stack is **not** production-ready until audited.
- `BLOCKCHAIN_MOCK_MODE` is hard-blocked in production by
  `lib/services/readiness.ts`. The preflight script also rejects it.

---

## 8. Bundle size baseline

Measured 2026-04-28 against `npm run build`. First Load JS includes the
shared framework + React baseline (~99 KB) which every page inherits.

| Route                            | Page-specific | First Load |
| -------------------------------- | ------------- | ---------- |
| /admin                           | 164 B         | 106 KB     |
| /admin/assets/[id]               | **18 KB**     | **183 KB** |
| /admin/deals                     | 5.6 KB        | 166 KB     |
| /admin/deals/[id]                | **14.8 KB**   | **175 KB** |
| /admin/assets/explorer           | 3.4 KB        | 142 KB     |
| /admin/macro-profiles            | 3.7 KB        | 139 KB     |
| All other admin pages            | < 3 KB        | 100–115 KB |

`/admin/assets/[id]` and `/admin/deals/[id]` are the heaviest because
they eagerly mount 8+ client-side forms (`AssetIntakeForm`,
`DocumentUploadForm`, `CapexBookForm`, etc.). 175–183 KB First Load is
within the acceptable envelope for an admin console; tighten with
`next/dynamic` lazy imports if real user metrics show LCP regression.

---

## 9. Pre-deploy checklist

Before promoting a new deployment to production traffic:

```
[ ] git pull && npm ci --prefix apps/web
[ ] npm --prefix apps/web run prisma:generate
[ ] npm --prefix apps/web run typecheck
[ ] npm --prefix apps/web test
[ ] npm --prefix apps/web run build
[ ] (production env loaded) npm --prefix apps/web run prod:preflight
[ ] (staging) npm --prefix apps/web run e2e:hosted
[ ] Postgres: confirm `prisma migrate deploy` ran successfully against prod
[ ] Vercel: confirm env diff is intentional and matches the secret roster
```
