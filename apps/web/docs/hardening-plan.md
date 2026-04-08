# Hardening Plan

Last updated: 2026-04-08

This plan turns the current branch from a strong institutional prototype into a more repeatable operator platform without changing the existing product posture:

- `apps/web` stays the only active root
- review-gated evidence stays intact
- blockchain remains registry-only
- files, valuations, extracted text, and decision logic remain offchain

## Current State

Already strong:

- review-gated underwriting and approved-only feature promotion
- first-class research workspace at `/admin/research`
- deal execution, portfolio operations, and capital shell
- committee governance, asset-management initiatives, and controlled investor-report release workflow
- official-source persistence and research dossier reuse
- typecheck, unit tests, and production build passing

Main remaining gaps:

1. mutation-heavy browser E2E assurance for seeded operator journeys
2. deeper security and permissioning beyond shared admin credentials
3. background scheduling / orchestration depth for official-source sync
4. deeper domain ETL for public-source parcel / permit / transaction data

## Implementation Order

### Phase 1. E2E Assurance

Objective:

- lock the seeded demo journeys with browser mutation coverage

Scope:

- `/admin/assets`
- `/admin/assets/[id]`
- `/admin/assets/[id]/reports`
- `/admin/review`
- `/admin/research`
- `/admin/deals`
- `/admin/portfolio`
- `/admin/portfolio/[id]`
- `/admin/funds`
- `/admin/funds/[id]`

Output:

- Playwright config
- mutation suite
- DB and seed preflight runner
- documented run command

Delivered in the current branch:

- `/admin/review` approve / reject coverage
- asset dossier valuation rerun coverage
- document upload coverage
- readiness stage / register / anchor coverage
- deal archive / restore coverage

### Phase 2. Security / Governance Hardening

Objective:

- raise operator and diligence confidence for real institutional use

Scope:

- stronger auth than shared credentials
- user-bound reviewer attribution
- permission matrix by route and mutation type
- clearer audit-log drilldowns

Current branch status:

- session auth and generic OIDC are live
- OIDC provider, subject, and email now flow into the signed browser session
- reviewer attribution now persists provider-subject bindings and resolves to a bound `User` before falling back to email / identifier matching
- unresolved SSO subjects can now be mapped to canonical users from `/admin/security`
- canonical operator seats now have active/inactive lifecycle controls
- browser sessions now validate against a centralized `AdminSession` store with seat-backed session-version revocation
- SCIM-style provisioning and scoped `AdminAccessGrant` rows are now available as enterprise-control shells

### Phase 3. Sync / Data Ops Hardening

Objective:

- move research/source refresh out of request-path assumptions

Scope:

- scheduler or cron runner
- sync retry policy
- sync failure alerting
- source freshness SLA reporting
- recent alert delivery attempts are now persisted, replayable from the security surface, and visible alongside intervention thresholds
- queued ops work now persists outside request handling, can dead-letter after max attempts, and can be requeued from `/admin/security`

### Phase 4. Deeper Official-Source ETL

Objective:

- convert official-source shells into more asset-linked research depth

Scope:

- parcel / cadastral / GIS linkage
- permit / building ledger / planning normalization
- transaction and benchmark ETL by market / submarket / asset class

## Risks

- Playwright smoke relies on seeded assets being present in the local database
- dev-mode E2E is correct for smoke assurance, but not a substitute for full production-hosted E2E
- official-source sync is still partially request-coupled until scheduler work is completed
- security remains demo-safe and controlled-use safe, but not yet SSO-grade
- the new identity binding layer now supports direct operator mapping from unresolved OIDC subjects into canonical users, but it still needs fuller seat lifecycle and row-level permissioning before true enterprise IAM

## Verification Commands

From `apps/web`:

```bash
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run e2e
```

The E2E runner now reseeds automatically before the suite starts. If you want to do it yourself:

```bash
npm run prisma:seed
npm run e2e
```

For local full-browser runs with the checked-in Postgres service:

```bash
npm run e2e:local
```

If you want to inspect the registered suite without launching the app:

```bash
npm run e2e:list
```
