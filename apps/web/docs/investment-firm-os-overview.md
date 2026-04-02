# Investment-Firm OS Overview

This document describes the current `apps/web` product as it exists today.

The repo is no longer only an underwriting tool. It is now the foundation of an AI-native Korean real-estate investment-firm operating system with five connected layers:

1. `Research`
2. `Underwriting`
3. `Deal Execution`
4. `Portfolio Operations`
5. `Capital Formation Shell`

The blockchain boundary remains unchanged:

- valuations stay offchain
- documents and extracted text stay offchain
- underwriting logic stays offchain
- only registry identifiers, document hashes, and packet metadata are anchorable onchain

## Active Product Root

- Active product: `apps/web`
- Legacy apps remain archived under `legacy/`

## Core Operating Routes

- `/admin/assets`
  Asset list and dossier entry point
- `/admin/assets/[id]`
  Asset dossier with research, evidence, review, valuation, reports, and readiness actions
- `/admin/review`
  Global review queue for normalized underwriting evidence
- `/admin/valuations`
  Valuation run library and approval flow
- `/admin/deals`
  Deal execution surface for next actions, diligence requests, lender quotes, bids, and close probability
- `/admin/portfolio`
  Portfolio summary across held assets
- `/admin/portfolio/[id]`
  Portfolio command center for KPI history, rollover, debt wall, covenant, capex, and exit tracking
- `/admin/funds`
  Fund shell list
- `/admin/funds/[id]`
  Fund shell detail for commitments, calls, distributions, reporting, DDQ, and operator briefs
- `/admin/investors`
  Investor shell list
- `/admin/sources`
  Source readiness and official adapter visibility
- `/admin/registry`
  Registry-only blockchain status

## Operating Model

### 1. Research

Research reuses existing tables instead of creating a separate parallel system.

Primary persistence:

- `MacroSeries`
- `MacroFactor`
- `MarketIndicatorSeries`
- `TransactionComp`
- `RentComp`
- `PipelineProject`
- `Document`
- normalized micro/legal/lease evidence

Key services:

- `apps/web/lib/services/research/dossier.ts`
- `apps/web/lib/services/research/macro-research.ts`
- `apps/web/lib/services/research/market-research.ts`
- `apps/web/lib/services/research/micro-research.ts`
- `apps/web/lib/services/research/document-research.ts`

### 2. Underwriting

Underwriting remains review-gated and evidence-first.

Workflow:

1. raw / source layer
2. normalized evidence layer
3. approved feature layer
4. valuation / quant layer

Important rules:

- new manual micro, legal, and lease evidence saves as `PENDING`
- only `APPROVED` normalized evidence is promoted into curated feature snapshots
- valuation and reports prefer approved promoted features first
- fallback to raw normalized evidence only happens when approved promoted evidence is missing

Key services:

- `apps/web/lib/services/review.ts`
- `apps/web/lib/services/feature-promotion.ts`
- `apps/web/lib/services/reports.ts`
- `apps/web/lib/services/readiness.ts`

### 3. Deal Execution

Deal execution is not a full CRM. It is a focused operator workflow for moving one institutional deal from sourcing to close.

Primary capabilities:

- pipeline stages
- next actions
- diligence requests
- lender quote tracking
- bid / revision tracking
- negotiation events
- close probability and trend

Key services:

- `apps/web/lib/services/deals.ts`

### 4. Portfolio Operations

Portfolio OS v1 is now in place.

Primary persistence:

- `Portfolio`
- `PortfolioAsset`
- `BusinessPlan`
- `MonthlyAssetKpi`
- `LeaseRollSnapshot`
- `Budget`
- `BudgetLineItem`
- `CapexProject`
- `CovenantTest`
- `ExitCase`

Primary operator outputs:

- hold performance summary
- NOI / occupancy / revenue trend context
- lease rollover watchlist
- debt maturity wall
- covenant status summary
- capex vs budget tracking
- exit case tracker
- AI-native operator briefs

Key service:

- `apps/web/lib/services/portfolio.ts`

### 5. Capital Formation Shell

Capital OS is intentionally a shell in this version. It is institutional data modeling, not a retail interface.

Primary persistence:

- `Fund`
- `Vehicle`
- `Mandate`
- `Investor`
- `Commitment`
- `CapitalCall`
- `Distribution`
- `InvestorReport`
- `DdqResponse`

Primary operator outputs:

- commitments and unfunded capital
- capital call and distribution history
- investor coverage summary
- investor reporting shell
- DDQ shell
- AI-native investor update draft

Key service:

- `apps/web/lib/services/capital.ts`

## Asset-Class Packs

Current packs:

- `DATA_CENTER`
  mature vertical pack
- `OFFICE`
  first full non-data-center pack
- `INDUSTRIAL / LOGISTICS`
  next real playbook, scaffolded for continued expansion
- `LAND / DEVELOPMENT`
  coherent shell playbook

Not yet expanded into native packs in this iteration:

- `RETAIL`
- `HOTEL`
- `MULTIFAMILY`

## Demo Assets

Current seeded demo set:

- `SEOUL-GANGSEO-01`
  Seoul hyperscale data-center case
- `INCHEON-...`
  pending-review data-center style case
- `BUSAN-...`
  earlier-stage case
- `SEOUL-YEOUIDO-01`
  office demo asset

Portfolio and capital shell seed data now connect:

- one held office asset
- one held data-center asset
- one fund shell
- vehicles
- investors
- commitments
- calls / distributions
- investor reporting shell

## Production Boundaries

The product is still intentionally opinionated.

Included:

- institutional research and underwriting
- review-gated evidence
- committee output
- registry-only anchoring
- deal execution
- held-asset operating shell
- capital formation shell

Not included:

- retail token sale
- wallets
- public trading
- investor advice
- onchain valuation or document storage
- generic chatbot surface

## Validation Standard

Use this before closing work:

```bash
cd apps/web
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

## Next Expansion Areas

Highest-value follow-ons from current state:

1. deepen industrial/logistics underwriting and report logic
2. add portfolio-side automated covenant/watchlist digests
3. expand investor-report drafting with portfolio and fund context
4. finish land/development-native entitlement and budget workflows
5. add native packs for retail, hotel, and multifamily when needed
