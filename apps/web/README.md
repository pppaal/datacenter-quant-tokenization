# apps/web

`apps/web` is the active product root for the Korea real-estate investment-firm OS.

Current operating layers inside this app:

- research
- underwriting
- deal execution
- portfolio operations
- capital formation shell

Research is now a first-class workspace at `/admin/research`, not only a service layer. It uses shared `ResearchSnapshot`, `MarketUniverse`, `Submarket`, `CoverageTask`, `SourceCache`, `ResearchSyncRun`, and approved evidence data so underwriting, deals, portfolio, and fund workflows read the same provenance, freshness, sync-history, and optimization surfaces.
`/admin/sources` now complements that workspace with explicit source refresh controls, stale asset queue visibility, and persisted `SourceRefreshRun` audit history for operator and cron-triggered refresh jobs.

Registry-only remains explicit:

- files, extracted text, valuations, underwriting logic, portfolio KPI history, and investor records stay offchain
- only registry ids, hashes, and staged packet metadata are candidates for anchoring

Active product root for the Korea real estate underwriting and research OS.

Current positioning:

- `DATA_CENTER` remains a full vertical pack
- `OFFICE` is the first full non-data-center underwriting pack
- `INDUSTRIAL / LOGISTICS` is scaffolded on the same review-gated workflow

Use the repository root [`README.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/README.md) for setup and command entrypoints. This app contains the App Router UI, Prisma schema, source adapters, valuation engine, and tests.

For the current product operating map, use:

- [`apps/web/docs/investment-firm-os-overview.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/investment-firm-os-overview.md)
- [`apps/web/docs/demo-script.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/demo-script.md)
- [`apps/web/docs/platform-readiness-audit.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/platform-readiness-audit.md)
- [`apps/web/docs/hardening-plan.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/hardening-plan.md)
- [`apps/web/docs/operations-runbook.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/operations-runbook.md)

## Browser Mutation Coverage

Playwright now locks the seeded operator journeys across assets, review, research, deals, portfolio, and funds, including mutation-heavy paths:

- approve / reject evidence from `/admin/review`
- rerun valuation from the asset dossier
- upload a document and confirm history updates
- stage / register / anchor readiness actions
- archive / restore a deal
- map a seeded unresolved reviewer identity from `/admin/security`
- update a canonical operator seat from `/admin/security`

Run from `apps/web`:

```bash
npm run prisma:seed
npm run e2e
```

If you want a one-command local browser path with seeded Postgres on port `5434`:

```bash
npm run e2e:local
```

This suite now performs a preflight check first:

- database reachable
- reseeds the demo set for deterministic runs
- defaults browser E2E to `BLOCKCHAIN_MOCK_MODE=true` unless you explicitly provide a real registry configuration
- then Playwright runs

Development helpers:

```bash
npm run db:e2e:up
npm run db:e2e:down
```

Seeded Postgres CI coverage is also checked in at `.github/workflows/web-e2e.yml`.
Hosted smoke coverage is checked in at `.github/workflows/web-e2e-hosted.yml`, and manual hosted mutation coverage is checked in at `.github/workflows/web-e2e-hosted-mutations.yml`.

If you only want to confirm the registered browser suite without starting the app, use:

```bash
npm run e2e:list
```

For operator-grade maintenance loops:

```bash
npm run ops:cycle
npm run ops:preflight
npm run env:preflight -- ops-worker
```

- `ops:cycle` runs source refresh first, then research sync, and records both runs in the persisted audit/run history
- `ops:cycle` now retries transient source/research failures and emits a clearer attempt summary for scheduled runs
- `ops:cycle` can now push failure alerts, and optional retry-recovery alerts, to a generic webhook without changing the registry-only data boundary
- `ops:worker -- --enqueue-cycle` now drives the scheduled worker path by enqueueing `OPS_CYCLE` work and draining the persisted queue outside request handling
- `ops:worker:daemon` now provides an always-on poll loop for deployments that want a dedicated worker outside GitHub Actions
- `/admin/security` now surfaces intervention thresholds, recent failed/stale ops signals, and unresolved reviewer identity bindings so operators can act without digging through raw logs
- the same security surface now lets admins map unresolved SSO identities onto canonical `User` records, which makes reviewer attribution and operator analytics user-bound instead of identifier-only
- `/admin/security` also exposes canonical operator seats with active/inactive status, targeted session revocation, queued and dead-letter ops work with requeue actions, a replayable alert intervention queue, and recent ops alert delivery attempts, so seat lifecycle and webhook monitoring are visible in one place
- `ops:preflight` runs prisma generate, typecheck, unit tests, build, and browser suite registration in one command

## Session Access

Browser operators now enter through `/admin/login`.

- signed session cookies are the primary browser path
- env-configured OIDC / SSO can be enabled through the `/api/admin/sso/*` routes and the login page button
- SCIM-style provisioning can populate canonical operators through `/api/admin/scim/*`
- the SCIM shell now supports deprovisioning a canonical operator, which disables the seat, clears scoped grants, and revokes persisted browser sessions
- `/api/admin/scim/sync` can now reconcile a full provider snapshot and automatically deprovision missing operator seats for that provider
- shared basic auth is now reserved for automation and protected ops routes
- both entry paths enforce the same `VIEWER / ANALYST / ADMIN` role matrix
- browser sessions now prefer canonical seat-backed credentials, carry a persisted session version, and inactive, revoked, or stale-version seats are denied on the next server-validated request
- OIDC subject/email now flows into the signed session and is persisted into `AdminIdentityBinding`, so reviewer attribution can resolve against a bound `User` before falling back to email / identifier matching
- scoped `AdminAccessGrant` records now provide a default-open, grant-when-present row-level restriction layer for asset, deal, portfolio, and fund operator surfaces

The scheduled queue-draining worker path is now checked in at `.github/workflows/ops-cycle.yml`.

## Prisma Migration

The macro profile registry now depends on the `MacroProfileOverride` table.

Apply the checked-in migration before using `/admin/macro-profiles` in a real environment:

```bash
npm run prisma:generate
npx prisma migrate deploy
```

If local `prisma migrate dev` is blocked by the current Windows/engine setup, the checked-in SQL migration under `prisma/migrations/20260325133000_add_macro_profile_overrides` is the source of truth for deployment.

## Deal Workflow

The admin surface now includes a production-minded deal execution workflow at `/admin/deals`.

Pipeline state machine:

- `sourced`
- `screened`
- `nda`
- `loi`
- `dd`
- `ic`
- `closing`
- `asset_management`

Core entities added for execution work:

- `Deal`
- `Counterparty` deal linkage
- `Task`
- `RiskFlag`
- `ActivityLog`

What the workflow supports:

- deal list with stage, next action, open tasks, and open risks
- active / actionable / archived views on the deal list
- deal detail page for one-operator execution
- deal detail page includes scoped document upload so DD auto-match stays inside the live execution record
- stage updates with activity logging
- stage-specific required checklist with seedable required tasks
- structured DD request tracker with counterparty, due date, received / waived status, automatic document upload matching for single-deal asset workflows, and suggestion fallback with competing-request hints when the match is ambiguous
- bid revision history for first bid, revised bid, BAFO, accepted, or lost pricing paths
- lender quote tracker for term sheets, approved credit, leverage, pricing, and DSCR terms
- negotiation event tracker for seller counters, buyer feedback, and exclusivity clock changes
- closing readiness score covering accepted bid, financing, exclusivity, DD clearance, valuation freshness, and checklist completion
- close probability readout that combines stage, readiness, risks, overdue tasks, and financing / exclusivity certainty
- admin dashboard watchlist for fragile live deals ranked by probability to close
- close probability history on the deal detail page so execution drift, including pending DD suggestion drag, is visible over time
- next action and close date tracking
- overdue / due-soon reminder cues for solo execution
- broker / seller / buyer notes
- counterparty tracking
- task queue
- risk flag queue
- restore from archive when a process needs to be reopened
- combined deal activity + valuation timeline on the detail page
- archive and close-out actions with final summary logging

Required migration for the deal execution workflow:

```bash
npm run prisma:generate
npx prisma migrate deploy
```

The additive SQL migrations are checked in at:

- `prisma/migrations/20260326153000_add_deal_execution_workflow`
- `prisma/migrations/20260328093000_add_deal_document_requests`
- `prisma/migrations/20260328111500_add_deal_bid_revisions`
- `prisma/migrations/20260328124500_add_deal_lender_quotes`
- `prisma/migrations/20260328143000_add_deal_negotiation_events`
- `prisma/migrations/20260331103000_add_deal_request_match_suggestions`
- `prisma/migrations/20260331114500_add_pending_suggested_request_count_to_probability_snapshots`
- `prisma/migrations/20260401103000_add_sequence_counters`

## Scheduled Source Refresh

Near-real-time NASA overlays are now designed to be refreshed by a protected server route:

```bash
curl -X POST http://localhost:3000/api/ops/source-refresh \
  -H "Authorization: Bearer $OPS_CRON_TOKEN"
```

Analysts can also run the same refresh path from `/admin/sources`, where recent `SourceRefreshRun` history is shown alongside stale source systems and stale asset candidates.

Relevant environment variables:

- `OPS_CRON_TOKEN`: required bearer token for the cron trigger route
- `ADMIN_SESSION_SECRET`: required in production to sign browser operator sessions
- `ADMIN_SESSION_TTL_HOURS`: optional session lifetime in hours, default `12`
- browser sessions now carry a persisted seat-backed `sessionVersion`, and revoking sessions from `/admin/security` rotates that version immediately
- `ADMIN_OIDC_ISSUER_URL`: preferred OIDC discovery issuer
- `ADMIN_OIDC_AUTHORIZATION_ENDPOINT`, `ADMIN_OIDC_TOKEN_ENDPOINT`, `ADMIN_OIDC_USERINFO_ENDPOINT`: explicit endpoint overrides when discovery is not used
- `ADMIN_OIDC_CLIENT_ID`, `ADMIN_OIDC_CLIENT_SECRET`: browser SSO client credentials
- `ADMIN_OIDC_REDIRECT_URI`: optional callback override, defaults to `$APP_BASE_URL/api/admin/sso/callback`
- `ADMIN_OIDC_IDENTIFIER_CLAIM`, `ADMIN_OIDC_ROLE_CLAIM`: claim mapping controls
- `ADMIN_OIDC_VIEWER_ROLES`, `ADMIN_OIDC_ANALYST_ROLES`, `ADMIN_OIDC_ADMIN_ROLES`: comma-separated group-to-role mapping
- `ADMIN_BASIC_AUTH_USER`: legacy/shared basic auth username reserved for automation-facing ops paths and bootstrap session login
- `ADMIN_BASIC_AUTH_PASSWORD`: legacy/shared basic auth password reserved for automation-facing ops paths and bootstrap session login
- `ADMIN_BASIC_AUTH_VIEWER_CREDENTIALS`: comma-separated `user:password` viewer credentials
- `ADMIN_BASIC_AUTH_ANALYST_CREDENTIALS`: comma-separated `user:password` analyst credentials
- `ADMIN_BASIC_AUTH_ADMIN_CREDENTIALS`: comma-separated `user:password` admin credentials
- `ADMIN_ALLOW_UNBOUND_BROWSER_SESSION`: optional local-only escape hatch to allow browser sessions without a canonical operator seat
- `/api/*` is now protected by admin auth middleware except the public inquiry endpoint and cron-token ops routes
- `/admin/login` is the interactive session entry point for browser operators
- browser session credentials should map to canonical operator seats whenever possible
- `/api/admin/sso/login` and `/api/admin/sso/callback` are the OIDC browser SSO entry points
- `VIEWER` is read-only for overview, assets, and valuation screens
- `ANALYST` is required for research, review, deals, portfolio, funds, investors, sources, readiness, and other operator workspaces
- `ADMIN` is required for security settings, registry release controls, and approval-only release actions
- `DOCUMENT_UPLOAD_MAX_BYTES`: max upload size in bytes, default `26214400` (25 MB)
- `DOCUMENT_UPLOAD_ALLOWED_TYPES`: comma-separated MIME allowlist for uploads
- `DOCUMENT_STORAGE_BUCKET`: external object storage bucket name when moving off local disk
- `DOCUMENT_STORAGE_ENDPOINT`: S3-compatible object storage endpoint
- `DOCUMENT_STORAGE_ACCESS_KEY_ID`: object storage access key
- `DOCUMENT_STORAGE_SECRET_ACCESS_KEY`: object storage secret
- `SOURCE_REFRESH_STALE_HOURS`: asset re-enrichment threshold, default `24`
- `SOURCE_REFRESH_BATCH_SIZE`: max stale assets refreshed per run, default `4`
- `OPS_CYCLE_RETRY_ATTEMPTS`: retry count for the combined ops worker, default `2`
- `OPS_CYCLE_RETRY_BACKOFF_MS`: linear backoff base for the combined ops worker, default `1000`
- `OPS_ALERT_FAILURE_STREAK`: consecutive failed runs required before security surfaces mark ops as intervention-required, default `2`
- `OPS_ALERT_STALE_HOURS`: freshness window for latest research/source run before security surfaces flag stale ops, default `6`
- `OPS_ALERT_WEBHOOK_URL`: optional primary generic webhook for scheduled ops failure notifications
- `OPS_ALERT_FALLBACK_WEBHOOK_URL`: optional secondary webhook used when primary delivery fails
- `OPS_ALERT_NOTIFY_ON_RECOVERY`: when `true`, retry-recovered ops runs also emit a webhook alert
- `OPS_ALERT_PAGER_WEBHOOK_URL`: optional pager/escalation webhook for failed scheduled ops
- `OPS_QUEUE_MAX_ATTEMPTS`: max retries before queued ops work moves into dead-letter, default `3`
- `OPS_QUEUE_BACKOFF_MS`: linear retry backoff for queued ops work, default `60000`
- `OPS_WORKER_POLL_MS`: poll interval for the always-on queue worker, default `15000`
- `OPS_WORKER_BATCH_SIZE`: max queued items drained per poll, default `10`
- `ADMIN_SCIM_TOKEN`: bearer token required for `/api/admin/scim/*`
- `ADMIN_SCIM_PROVIDER`: persisted provisioning provider label, default `scim`
- `PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS`: must be `true` before hosted mutation suite will run
- `PLAYWRIGHT_ALLOWED_HOST_PATTERN`: hosted mutation suite refuses targets whose hostname does not include this value
- `BLOCKCHAIN_MOCK_MODE`: when `true`, browser mutation E2E uses deterministic mock registry transactions for stage/register/anchor flows

## Market And Macro Data Connectors

The enrichment layer now supports a preferred market API, a preferred macro API, and market-specific public series for the regime engine.

Important reality:

- free macro data is not automatically true realtime
- most official feeds are `release-based` or `near-real-time`
- the platform should store cadence and freshness explicitly, then build regime logic on top of that instead of assuming every source is live

Priority order:

1. `GLOBAL_MARKET_API_URL`
   or `US_MARKET_API_URL`
   Optional `GLOBAL_MARKET_API_KEY` or `US_MARKET_API_KEY`
   Recommended for transaction comps, rent comps, vacancy, cap rates, and market indicator history.

2. `KOREA_MACRO_API_URL`
   or `GLOBAL_MACRO_API_URL`
   Optional `KOREA_MACRO_API_KEY` or `GLOBAL_MACRO_API_KEY`
   Recommended when you can serve normalized macro payloads directly. This can populate:
   `vacancyPct`, `capRatePct`, `debtCostPct`, `discountRatePct`, `policyRatePct`,
   `creditSpreadBps`, `rentGrowthPct`, `transactionVolumeIndex`, `constructionCostIndex`

3. US FRED series for the first global launch market
   Base key:
   `US_FRED_API_KEY`
   Optional:
   `US_FRED_BASE_URL`

   Series IDs are configured per indicator:
   `US_FRED_INFLATION_SERIES_ID`
   `US_FRED_POLICY_RATE_SERIES_ID`
   `US_FRED_CREDIT_SPREAD_SERIES_ID`
   `US_FRED_RENT_GROWTH_SERIES_ID`
   `US_FRED_TRANSACTION_VOLUME_SERIES_ID`
   `US_FRED_CONSTRUCTION_COST_INDEX_SERIES_ID`

   Optional additional direct underwriting inputs:
   `US_FRED_DEBT_COST_SERIES_ID`
   `US_FRED_DISCOUNT_RATE_SERIES_ID`
   `US_FRED_CAP_RATE_SERIES_ID`
   `US_FRED_VACANCY_SERIES_ID`
   `US_FRED_COLOCATION_RATE_SERIES_ID`
   `US_FRED_CONSTRUCTION_COST_PER_MW_SERIES_ID`

4. US BLS series as a second free official macro stack
   Optional API key:
   `US_BLS_API_KEY`
   or `BLS_API_KEY`
   Optional base URL:
   `US_BLS_BASE_URL`

   Series IDs:
   `US_BLS_INFLATION_SERIES_ID`
   `US_BLS_CONSTRUCTION_COST_INDEX_SERIES_ID`
   `US_BLS_RENT_GROWTH_SERIES_ID`

5. US Treasury Fiscal Data endpoints for daily rate proxies
   Optional base URL:
   `US_TREASURY_API_BASE_URL`

   Endpoint and field pairs:
   `US_TREASURY_POLICY_PROXY_ENDPOINT`
   `US_TREASURY_POLICY_PROXY_FIELD`
   Optional `US_TREASURY_POLICY_PROXY_DATE_FIELD`

   `US_TREASURY_DEBT_COST_ENDPOINT`
   `US_TREASURY_DEBT_COST_FIELD`
   Optional `US_TREASURY_DEBT_COST_DATE_FIELD`

   `US_TREASURY_DISCOUNT_RATE_ENDPOINT`
   `US_TREASURY_DISCOUNT_RATE_FIELD`
   Optional `US_TREASURY_DISCOUNT_RATE_DATE_FIELD`

6. ECB Data API for euro-area markets
   Optional base URL:
   `ECB_DATA_API_BASE_URL`

   Flow/key pairs:
   `ECB_INFLATION_FLOW_REF`, `ECB_INFLATION_KEY`
   `ECB_POLICY_RATE_FLOW_REF`, `ECB_POLICY_RATE_KEY`
   `ECB_CREDIT_SPREAD_FLOW_REF`, `ECB_CREDIT_SPREAD_KEY`
   `ECB_RENT_GROWTH_FLOW_REF`, `ECB_RENT_GROWTH_KEY`
   `ECB_TRANSACTION_VOLUME_FLOW_REF`, `ECB_TRANSACTION_VOLUME_KEY`
   `ECB_CONSTRUCTION_COST_INDEX_FLOW_REF`, `ECB_CONSTRUCTION_COST_INDEX_KEY`

7. KOSIS inflation
   `KOREA_KOSIS_INFLATION_USER_STATS_ID`
   or `KOREA_KOSIS_INFLATION_ORG_ID`, `KOREA_KOSIS_INFLATION_TBL_ID`, `KOREA_KOSIS_INFLATION_ITM_ID`

8. KOSIS construction cost
   `KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID`
   or `KOREA_KOSIS_CONSTRUCTION_COST_ORG_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_TBL_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_ITM_ID`

9. KOSIS policy rate
   `KOREA_KOSIS_POLICY_RATE_USER_STATS_ID`
   or `KOREA_KOSIS_POLICY_RATE_ORG_ID`, `KOREA_KOSIS_POLICY_RATE_TBL_ID`, `KOREA_KOSIS_POLICY_RATE_ITM_ID`

10. KOSIS credit spread
   `KOREA_KOSIS_CREDIT_SPREAD_USER_STATS_ID`
   or `KOREA_KOSIS_CREDIT_SPREAD_ORG_ID`, `KOREA_KOSIS_CREDIT_SPREAD_TBL_ID`, `KOREA_KOSIS_CREDIT_SPREAD_ITM_ID`

11. KOSIS rent growth
   `KOREA_KOSIS_RENT_GROWTH_USER_STATS_ID`
   or `KOREA_KOSIS_RENT_GROWTH_ORG_ID`, `KOREA_KOSIS_RENT_GROWTH_TBL_ID`, `KOREA_KOSIS_RENT_GROWTH_ITM_ID`

12. KOSIS transaction volume
   `KOREA_KOSIS_TRANSACTION_VOLUME_USER_STATS_ID`
   or `KOREA_KOSIS_TRANSACTION_VOLUME_ORG_ID`, `KOREA_KOSIS_TRANSACTION_VOLUME_TBL_ID`, `KOREA_KOSIS_TRANSACTION_VOLUME_ITM_ID`

13. KOSIS construction cost index
   `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_USER_STATS_ID`
   or `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ORG_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_TBL_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ITM_ID`

## FX Normalization

The intake form can now accept money inputs in:

- `KRW`
- `USD`
- `EUR`
- `JPY`
- `SGD`
- `GBP`

All money fields are normalized into KRW for the current valuation engine.

Preferred live FX connector:

- `GLOBAL_FX_API_URL`
- Optional `GLOBAL_FX_API_KEY`
- Optional `FX_SOURCE_CACHE_TTL_MINUTES` for cached live-rate freshness

Supported response shapes include:

- `{ "rateToKrw": 1382.4 }`
- `{ "rates": { "KRW": 1382.4 } }`
- `{ "conversion_rates": { "KRW": 1382.4 } }`

Optional FX overrides:

- `FX_USD_KRW`
- `FX_EUR_KRW`
- `FX_JPY_KRW`
- `FX_SGD_KRW`
- `FX_GBP_KRW`

The admin overview and `/admin/sources` surface now show stale adapters and assets that have fallen outside the refresh window.
