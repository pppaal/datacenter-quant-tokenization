# AI Real Estate & Infrastructure Underwriting OS Roadmap

This roadmap turns the current multi-asset underwriting app into an AI platform that can:

- structure real estate and infrastructure assets
- understand macro conditions
- run micro underwriting by asset class
- perform sensitivity and downside analysis
- read financial statements and assess counterparty risk
- generate investment memos with source-backed assumptions

The target product is:

`AI Real Estate & Infrastructure Underwriting OS`

## Current Baseline

The codebase already supports:

- multi-asset intake for `DATA_CENTER`, `OFFICE`, `INDUSTRIAL`, `RETAIL`, `MULTIFAMILY`
- valuation runs and scenario generation
- document upload and extraction
- promoted feature snapshots
- readiness workflow and IM generation
- admin console and public marketing surface

The next work is not a rewrite. It is a layered expansion.

## Phase 1: Universal Data Foundation

Goal:

Create a stable underwriting data model that can represent most income-producing real estate and infrastructure assets in one system.

### Deliverables

- keep `Asset` as the universal shell
- expand asset-specific detail models where needed
- add macro and credit-oriented data models
- standardize document-derived facts into reusable underwriting fields

### Core schema additions

- `MacroSeries`
  - policy rate
  - inflation
  - government bond yield
  - swap / debt reference curve
  - construction cost index
  - market rent growth index
  - vacancy index
- `FinancialStatement`
  - entity name
  - period end
  - currency
  - statement type
  - audited flag
- `FinancialLineItem`
  - statement id
  - line item key
  - label
  - value
  - unit
- `Counterparty`
  - sponsor
  - operator
  - tenant
  - guarantor
- `CreditAssessment`
  - leverage metrics
  - liquidity metrics
  - coverage metrics
  - risk score
- `SensitivityRun`
  - run type
  - variables
  - breakpoints
  - output matrix

### Code areas

- [schema.prisma](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/prisma/schema.prisma)
- [asset.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/validations/asset.ts)
- [documents.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/documents.ts)
- [feature-promotion.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/feature-promotion.ts)

### Exit criteria

- all supported asset classes can be represented without overloading data-center-specific fields
- macro assumptions have a first-class storage layer
- uploaded financial statements can be stored as structured records

## Phase 2: Macro + Document Structuring Layer

Goal:

Teach the platform to understand the market regime and normalize facts from uploaded documents into a reusable underwriting bundle.

### Deliverables

- macro ingestion adapters
- market assumption builder
- document fact normalizer
- conflict detection between source systems and uploaded documents

### Product behavior

The system should be able to answer:

- what is the current rate environment
- how should discount rate and exit cap move under current macro conditions
- which assumptions came from market data vs uploaded docs vs manual input
- which extracted numbers conflict with the current underwriting model

### Implementation slices

1. `Macro adapters`
- Korea and global benchmark series
- interest rates
- inflation
- cap rate and vacancy reference series

2. `Normalization layer`
- currency normalization
- area normalization
- annual / monthly alignment
- percent / basis point alignment

3. `Document fact mapping`
- lease terms
- rent roll fields
- capex budget fields
- debt terms
- permit milestones
- operator metrics

### Code areas

- [sources.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/sources.ts)
- [valuation/inputs.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/valuation/inputs.ts)
- [document-extraction.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/document-extraction.ts)
- [feature-assumption-mapping.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/valuation/feature-assumption-mapping.ts)

### Exit criteria

- a valuation run can show macro-driven assumptions explicitly
- uploaded documents promote normalized facts into the underwriting input layer
- provenance can identify conflicts and freshness gaps

## Phase 3: Sensitivity and Downside Engine

Goal:

Move from simple base/bull/bear scenarios to real sensitivity testing and downside analysis.

### Deliverables

- one-way sensitivity analysis
- two-way sensitivity matrix
- downside / stress case templates
- break-even analysis
- covenant breach analysis

### Required analytics

- exit cap sensitivity
- rent growth sensitivity
- vacancy sensitivity
- capex overrun sensitivity
- interest rate sensitivity
- refinance stress
- delayed stabilization stress

### Output examples

- IRR vs exit cap matrix
- DSCR vs interest rate and occupancy matrix
- break-even occupancy
- break-even rent
- max capex before equity return drops below target

### Code areas

- new `lib/services/sensitivity/*`
- [valuations.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/valuations.ts)
- [valuation-engine.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/valuation-engine.ts)
- [admin/valuations/[id]/page.tsx](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/app/admin/valuations/[id]/page.tsx)

### UI additions

- sensitivity tables
- tornado chart
- downside flags
- covenant breach warning chips

### Exit criteria

- every valuation run stores structured sensitivity outputs
- the admin valuation detail page shows sensitivity and downside sections
- the IM generator can summarize the top 3 downside drivers

## Phase 4: Financial Statement + Credit Engine

Goal:

Enable AI to read sponsor, tenant, operator, and guarantor financials and assess counterparty strength.

### Deliverables

- financial statement ingestion
- line item extraction
- ratio engine
- counterparty credit summary
- tenant / sponsor risk scoring

### Required statement support

- income statement
- balance sheet
- cash flow statement

### Core ratios

- revenue growth
- EBITDA margin
- net debt / EBITDA
- debt / equity
- interest coverage
- current ratio
- cash runway
- free cash flow conversion

### Product behavior

The system should be able to say:

- whether the sponsor can support additional capex
- whether the tenant is creditworthy enough for projected rent assumptions
- whether refinancing depends on an overstretched balance sheet
- whether the operator has enough liquidity to support ramp-up and downtime

### Code areas

- new `lib/services/financials/*`
- [documents.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/documents.ts)
- [openai.ts](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/ai/openai.ts)
- new admin credit views

### Exit criteria

- uploaded financial statements become structured line items
- credit ratios are persisted and shown in the admin UI
- IM output includes a counterparty credit section

## Phase 5: AI Investment Committee Copilot

Goal:

Turn the platform from a calculation engine into a full underwriting copilot.

### Deliverables

- memo generation with section templates by asset class
- source-backed recommendation
- diligence gap detection
- assumption challenge mode
- committee question generator

### Core AI behaviors

- explain why value moved
- identify weak assumptions
- flag unsupported claims
- recommend diligence priorities
- generate IC-ready summary and appendix

### Required memo sections

- investment summary
- asset overview
- market context
- underwriting assumptions
- return profile
- sensitivity summary
- credit view
- key risks
- diligence checklist
- recommendation

## Delivery Order

Recommended implementation order:

1. Phase 1 schema and data foundation
2. Phase 2 macro and document normalization
3. Phase 3 sensitivity engine
4. Phase 4 financial statement and credit layer
5. Phase 5 AI committee copilot

## Recommended Immediate Next Tasks

These are the best next coding tasks from the current codebase:

1. add `MacroSeries` and `SensitivityRun` models to Prisma
2. create `lib/services/sensitivity/engine.ts`
3. add a first sensitivity table to valuation detail UI
4. add a `FinancialStatement` upload path and parser skeleton
5. extend the IM prompt to include macro and sensitivity sections

## Success Criteria

The platform is on the right track when it can do all of the following in one workflow:

- ingest an asset and its documents
- normalize macro and micro assumptions
- run valuation and downside analysis
- read sponsor / tenant financials
- explain risks and assumption sensitivity
- generate a committee-ready memo with provenance
