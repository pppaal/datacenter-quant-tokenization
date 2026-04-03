# Hardening Plan

Last updated: 2026-04-03

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
- official-source persistence and research dossier reuse
- typecheck, unit tests, and production build passing

Main remaining gaps:

1. browser-level E2E assurance for seeded operator journeys
2. deeper security and permissioning beyond shared admin credentials
3. background scheduling / orchestration depth for official-source sync
4. deeper domain ETL for public-source parcel / permit / transaction data

## Implementation Order

### Phase 1. E2E Assurance

Objective:

- lock the seeded demo journeys with browser smoke coverage

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
- smoke suite
- documented run command

### Phase 2. Security / Governance Hardening

Objective:

- raise operator and diligence confidence for real institutional use

Scope:

- stronger auth than shared credentials
- user-bound reviewer attribution
- permission matrix by route and mutation type
- clearer audit-log drilldowns

### Phase 3. Sync / Data Ops Hardening

Objective:

- move research/source refresh out of request-path assumptions

Scope:

- scheduler or cron runner
- sync retry policy
- sync failure alerting
- source freshness SLA reporting

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

## Verification Commands

From `apps/web`:

```bash
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run e2e
```

For deterministic browser smoke coverage, reseed before E2E if the local database has drifted:

```bash
npm run prisma:seed
npm run e2e
```
