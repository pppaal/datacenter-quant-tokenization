# Operations Runbook

Last updated: 2026-04-07

This runbook documents the repo-native controls that sit between the application and the managed infrastructure you
will still need in staging or production.

## 1. SCIM Seat Lifecycle

Available control paths:

- `/api/admin/scim/users`
- `/api/admin/scim/users/[id]`
- `/api/admin/scim/sync`

Recommended operating model:

1. push full seat snapshots from the IdP or provisioning bridge into `/api/admin/scim/sync`
2. keep `deprovisionMissing=true` for authoritative providers
3. let the app:
   - upsert canonical `User` seats
   - replace scoped `AdminAccessGrant` rows
   - deactivate missing seats
   - revoke persisted browser sessions for deprovisioned users

Minimum controls outside the repo:

- restrict `ADMIN_SCIM_TOKEN` to your provisioning bridge only
- log snapshot pushes in the IdP or bridge
- require a break-glass path before deprovisioning the final admin seat in production

## 2. Ops Worker Deployment

Repo-native worker entrypoints:

- batch worker: `npm run ops:worker`
- daemon worker: `npm run ops:worker:daemon`

Checked-in deployment skeletons:

- `compose.ops.yml`
- `deploy/ops-worker.service`

Recommended production pattern:

1. run one always-on worker process using the daemon entrypoint
2. keep GitHub Actions `ops-cycle.yml` as a backstop scheduler and run-history publisher
3. forward database, source, and OpenAI credentials through environment injection rather than baked files

Queue behavior today:

- queued work persists in `OpsWorkItem`
- attempts persist in `OpsWorkAttempt`
- repeated failures dead-letter after `OPS_QUEUE_MAX_ATTEMPTS`
- `/admin/security` can requeue dead-letter items after intervention

## 3. Pager / Alert Routing

Current alert channels:

- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_FALLBACK_WEBHOOK_URL`
- `OPS_ALERT_PAGER_WEBHOOK_URL`

Recommended routing:

- primary webhook -> Slack or team ops channel
- fallback webhook -> alternate chat workspace or integration bridge
- pager webhook -> PagerDuty, Opsgenie, or equivalent escalation target

The application stores masked destinations and persisted delivery attempts, but the actual on-call policy and
escalation tree still belong in your alerting platform.

## 4. Hosted Mutation Discipline

Hosted mutation coverage is intentionally guarded.

Required environment controls:

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS=true`
- `PLAYWRIGHT_ALLOWED_HOST_PATTERN=staging`

The guard script refuses to run mutation E2E unless the target hostname contains the allowed pattern. Keep mutation
browser coverage pointed at staging, not production.

Recommended release discipline:

1. deploy to staging
2. run hosted smoke
3. run hosted mutation suite manually or through gated dispatch
4. review artifacts
5. promote to production only after passing staging

## 5. Secret Rotation Checklist

Rotate on a fixed schedule:

- `ADMIN_SESSION_SECRET`
- `ADMIN_SCIM_TOKEN`
- `OPS_CRON_TOKEN`
- `OPS_ALERT_*` webhook credentials
- OIDC client secrets
- database and source-adapter credentials

Recommended rotation sequence:

1. add new secret in the host platform
2. update GitHub Actions environment secrets
3. redeploy staging
4. run `npm run env:preflight -- hosted-smoke`
5. run staged browser checks
6. redeploy production
7. revoke the old secret

## 6. What Is Still Outside This Repo

This repo now provides strong shells and operator controls, but these still require managed infrastructure:

- hosted Postgres backups / HA
- managed queue or worker platform
- real PagerDuty / Slack / email routing
- IdP-side SCIM bridge and group mapping
- deploy approvals and environment protection rules
