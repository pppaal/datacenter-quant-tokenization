# Platform Readiness Audit

Last updated: 2026-04-06

This audit records the current state of `apps/web` as an AI-native Korean real-estate investment-firm OS.

It is not a roadmap placeholder. It reflects the current branch after:

- review-gated evidence
- underwriting and report traceability
- deal execution
- portfolio operations
- capital shell
- research workspace and official-source persistence

## Overall Assessment

Current rating:

- `institutional-grade prototype`: yes
- `customer-demo ready`: yes
- `technical diligence ready`: yes
- `full institutional operating system`: not yet

Why:

- the repo now has a coherent shared data fabric across research, underwriting, deals, portfolio, and capital
- review-gated evidence and registry-only anchoring are structurally sound
- tests, mutation-heavy browser coverage, typecheck, and build pass
- but there are still operating-system gaps around auth depth, background jobs, permissions, and model-risk governance

## What Is Already Strong

### 1. Underwriting Core

- review-gated normalized evidence exists and is enforced
- approved-only feature promotion is in place
- valuation, reports, and readiness use approved evidence first
- report traceability is strong enough for screenshots, memo export, and committee use

### 2. Research Fabric

- `/admin/research` is now a first-class operator workspace
- official-source envelopes persist through cache, normalized metrics, research snapshots, and coverage tasks
- every thesis now has a freshness and provenance surface
- the same research fabric is reused by underwriting, deals, portfolio, and fund reporting

### 3. Deal Execution

- one-operator deal execution flow is coherent
- bid, lender, DD request, negotiation, close probability, and archive/restore states are modeled
- this is strong enough for a real single-deal execution workflow

### 4. Portfolio and Capital Shell

- held-asset KPI, rollover, covenant, capex, and exit tracking exist
- fund, investor, commitment, capital call, distribution, DDQ, and investor report shell exists
- operator briefs now turn structured data into decision-ready summaries

### 5. Blockchain Boundary

- onchain scope remains registry-only
- documents, extracted text, valuations, portfolio KPIs, and operator logic stay offchain
- readiness packets are deterministic and auditable without moving core operating data onchain

## Structural Gaps

These are the biggest reasons the repo is not yet a full-scale institutional OS.

### 1. Browser E2E Now Covers Critical Operator Mutations

Current state:

- strong unit and service-level tests
- build and route generation pass
- Playwright mutation coverage is wired into repo commands
- seeded demo path is browser-tested across:
  - asset list -> asset dossier -> report library
  - review queue
  - research workspace
  - deals shell
  - portfolio shell
  - funds shell
- critical operator mutations are covered for:
  - evidence approve/reject
  - valuation rerun
  - readiness stage/register/anchor actions
  - deal archive/restore
  - document upload

Impact:

- materially stronger demo and release confidence
- still not full hosted-environment regression coverage

### 2. Auth / Permission Depth

Current state:

- admin auth is role-aware
- audit trail exists
- security console exists

Missing:

- browser access now supports signed sessions and generic OIDC
- no deeper row-level permission model yet
- reviewer attribution now has a persisted provider-subject identity map, and the security surface shows unresolved bindings explicitly, but it still needs fuller seat lifecycle and row-level permissioning

Impact:

- acceptable for demo and controlled internal use
- not yet ideal for a large multi-seat investment platform

### 3. Background Job Orchestration

Current state:

- protected ops routes exist for source refresh and research sync
- sync runs are auditable

Missing:

- no dedicated scheduler/orchestrator layer in repo
- request-time and ops-route-triggered refresh still do some work that should become background jobs

Impact:

- works for demo and early production
- not yet ideal for scaled research operations

### 4. Official-Source ETL Depth

Current state:

- official-source adapter shells are broad
- normalized metrics now persist with domain-aware keys
- market and dossier views already consume them

Missing:

- not every official source has fully domain-specific ETL
- some datasets still rely on generic or partial extraction
- parcel/building/permit data can go deeper into asset-linked normalization

Impact:

- strong research shell
- not yet full public-data industrialization

### 5. Governance / Model Risk

Current state:

- audit exists
- review gating exists
- valuation approval exists

Missing:

- no formal model registry
- no model approval/version policy
- no committee decision ledger
- no model-risk monitoring surface

Impact:

- acceptable for current underwriting prototype
- below the bar of a mature investment manager platform

## Design / UX Assessment

### Strong

- admin surfaces now read like operator software, not a crypto demo
- research dossier, reports, deals, portfolio, and funds all have focused operator copy
- traceability surfaces are screenshot-friendly
- pending/approved/open states are visible in the right places

### Still Rough

- admin navigation is now broad and can feel crowded
- some detail pages are dense and need stronger executive summaries
- no cross-page action center for “what to do next today” across research, deals, portfolio, and capital

## Testing Assessment

### Strong

- `npm test` passes across 166 tests
- service and decision logic coverage is broad
- report generation, review gating, deal flow, portfolio, capital, and research logic are all covered

### Still Missing

- browser E2E
- visual regression
- PDF/export snapshot regression
- load/performance regression

## Security Assessment

### Strong

- registry-only chain boundary is preserved
- audit logging exists on major mutations
- upload policy and document storage readiness are explicit
- ops routes use bearer token gating

### Main Risks

- shared basic-auth credential model is not ideal long-term
- no SSO / IdP integration
- no formal secrets rotation or environment policy layer in repo
- no explicit rate limiting or abuse controls visible at app edge

## What Would Be Needed To Approach A “Top-Tier AI Investment Firm” Stack

1. stronger permissioning beyond the new provider-subject identity binding layer
2. hosted-environment browser E2E for production-like regression
3. Background sync orchestration with retry and alerting
   - improved further by intervention thresholds and unresolved-identity visibility on `/admin/security`
4. Deeper official-source ETL into asset-linked domain tables
5. Model registry / approval / monitoring
6. Committee decision capture and approval workflow
7. Portfolio-side periodic digests and investor-report production workflow hardening
8. Better daily action center across research, deals, portfolio, and funds

## Practical Conclusion

The current branch is already:

- a strong AI-native underwriting and research operating system
- a credible demo for an institutional Korean real-estate investment firm
- strong enough for customer demos and technical diligence

It is not yet:

- a fully mature Blackstone-scale operating platform

The biggest difference is no longer product concept. It is operating depth:

- auth/permissions
- background jobs
- ETL depth
- governance

## Verification Baseline

Use this exact command set:

```bash
cd apps/web
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run e2e
```
