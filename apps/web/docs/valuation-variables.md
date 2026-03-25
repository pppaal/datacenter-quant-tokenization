# Valuation Variables

Institutional underwriting variables are grouped into external, manual, derived, and policy-adjusted fields.

## Asset Identity

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `assetCode` | string | Manual | Internal case identifier |
| `name` | string | Manual | Asset name |
| `assetType` | string | Manual | Data center, colocation, edge campus |
| `market` | string | Manual | Default `KR` |
| `stage` | enum | Manual | Screening through stabilized |
| `status` | enum | Manual | Intake through approved/declined |

## Site and Physical Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `address.line1` | string | Manual / Juso | Normalized site address |
| `address.city` | string | Manual / Juso | City or metro name |
| `address.province` | string | Manual / Juso | Province / metro province |
| `address.latitude` | number | Juso / geospatial | Coordinate for climate overlays |
| `address.longitude` | number | Juso / geospatial | Coordinate for climate overlays |
| `address.parcelId` | string | Juso / parcel service | Parcel or synthesized site identifier |
| `landAreaSqm` | number | Manual | Land size |
| `grossFloorAreaSqm` | number | Manual / building record | GFA |
| `powerCapacityMw` | number | Manual / energy review | Installed or planned power |
| `targetItLoadMw` | number | Manual | IT load target |
| `energySnapshot.pueTarget` | number | Manual / energy review | PUE assumption |
| `buildingSnapshot.coolingType` | string | Manual / building review | Cooling design |
| `buildingSnapshot.redundancyTier` | string | Manual / building review | Tier target |

## Development and Permit Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `permitSnapshot.permitStage` | string | External / manual | Planning or permitting milestone |
| `permitSnapshot.zoningApprovalStatus` | string | External / manual | Zoning clearance state |
| `permitSnapshot.environmentalReviewStatus` | string | External / manual | EIA / community review |
| `permitSnapshot.powerApprovalStatus` | string | External / manual | Utility allocation state |
| `developmentSummary` | string | Manual | Analyst summary of project path |
| `ownerName` | string | Manual | Legal owner / control party |
| `sponsorName` | string | Manual | Sponsor / platform |

## Market Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `marketSnapshot.colocationRatePerKwKrw` | number | Manual / market data | Monthly recurring revenue benchmark |
| `marketSnapshot.capRatePct` | number | Manual / market data | Exit cap rate benchmark |
| `marketSnapshot.discountRatePct` | number | Manual / market data | DCF discount rate |
| `marketSnapshot.debtCostPct` | number | External / manual | Financing cost benchmark |
| `marketSnapshot.inflationPct` | number | KOSIS / manual | Inflation input |
| `marketSnapshot.constructionCostPerMwKrw` | number | KOSIS / manual | Replacement-cost benchmark |
| `marketSnapshot.vacancyPct` | number | Manual / market data | Local vacancy assumption |

## Operating Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `occupancyAssumptionPct` | number | Manual | Stabilized lease-up assumption |
| `tenantAssumption` | string | Manual | Anchor / tenant mix notes |
| `opexAssumptionKrw` | number | Manual | Annual opex assumption |
| `capexAssumptionKrw` | number | Manual | Total project capex |
| `financingLtvPct` | number | Manual | Debt ratio |
| `financingRatePct` | number | Manual | Project financing rate |
| `energySnapshot.tariffKrwPerKwh` | number | External / manual | Utility tariff |
| `energySnapshot.renewableAvailabilityPct` | number | External / manual | Green procurement availability |
| `energySnapshot.backupFuelHours` | number | External / manual | Generator autonomy |

## Risk Adjusters

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `siteProfile.floodRiskScore` | number | NASA / external / manual | Site resilience input |
| `siteProfile.seismicRiskScore` | number | External / manual | Resilience input |
| `siteProfile.gridAvailability` | string | External / manual | Utility context |
| `siteProfile.fiberAccess` | string | External / manual | Telecom depth |
| `siteProfile.latencyProfile` | string | External / manual | Workload suitability |
| `siteProfile.siteNotes` | string | NASA / analyst | Climate or diligence note |

## Comparable Calibration Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `comparableSet.name` | string | Manual | Named comp set used in committee cases |
| `comparableEntry.location` | string | Manual / market data | Market reference for the comparable |
| `comparableEntry.powerCapacityMw` | number | Manual / market data | Size normalization field |
| `comparableEntry.valuationKrw` | number | Manual / market data | Transaction or indicated value |
| `comparableEntry.monthlyRatePerKwKrw` | number | Manual / market data | Pricing reference |
| `comparableEntry.capRatePct` | number | Manual / market data | Yield reference |
| `comparableEntry.discountRatePct` | number | Manual / market data | DCF calibration point |
| `comparableEntry.weightPct` | number | Manual | Relative weight in calibration |

## Capex Breakdown Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `capexLineItem.category` | enum | Manual | Land, shell/core, electrical, mechanical, IT fit-out, soft cost, contingency |
| `capexLineItem.amountKrw` | number | Manual / cost plan | Line-item cost amount |
| `capexLineItem.spendYear` | integer | Manual | Construction draw timing |
| `capexLineItem.isEmbedded` | boolean | Manual | Marks already-spent or embedded cost |

## Lease-by-Lease Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `lease.tenantName` | string | Manual | Tenant or pipeline label |
| `lease.status` | enum | Manual | Pipeline, signed, active, expired |
| `lease.leasedKw` | number | Manual | Contracted power load |
| `lease.startYear` | integer | Manual | Lease start relative to underwriting year 1 |
| `lease.termYears` | integer | Manual | Primary term |
| `lease.baseRatePerKwKrw` | number | Manual | Starting rent |
| `lease.annualEscalationPct` | number | Manual | Contract or modeled escalator |
| `lease.probabilityPct` | number | Manual | Pipeline to paper confidence |
| `lease.renewProbabilityPct` | number | Manual | Renewal assumption |
| `lease.fitOutCostKrw` | number | Manual | Tenant-specific fit-out cost |
| `leaseStep.ratePerKwKrw` | number | Manual | Step rent or staged ramp rent |
| `leaseStep.occupancyPct` | number | Manual | Sub-ramp occupancy or utilization assumption |

## Tax, SPV, and Debt Inputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `taxAssumption.propertyTaxPct` | number | Manual / tax counsel | Annual property tax load |
| `taxAssumption.corporateTaxPct` | number | Manual / tax counsel | Corporate tax rate used in the equity waterfall |
| `taxAssumption.exitTaxPct` | number | Manual / tax counsel | Exit tax leakage |
| `spvStructure.managementFeePct` | number | Manual / legal | Asset manager fee |
| `spvStructure.performanceFeePct` | number | Manual / legal | Performance or carry fee |
| `spvStructure.reserveTargetMonths` | number | Manual / financing | Operating or debt reserve target |
| `debtFacility.commitmentKrw` | number | Manual / lender | Facility size |
| `debtFacility.interestRatePct` | number | Manual / lender | Pricing |
| `debtFacility.amortizationProfile` | enum | Manual / lender | IO, mortgage, sculpted, bullet |
| `debtFacility.sculptedTargetDscr` | number | Manual / lender | DSCR target for sculpted cases |
| `debtDraw.amountKrw` | number | Manual / lender | Draw schedule for project finance |

## Derived Valuation Outputs

| Variable | Type | Source | Notes |
| --- | --- | --- | --- |
| `costApproachValueKrw` | number | Derived | Replacement-cost floor |
| `incomeApproachValueKrw` | number | Derived | Stabilized NOI / cap rate |
| `dcfValueKrw` | number | Derived | Discounted cash-flow case |
| `weightedValueKrw` | number | Derived | Blended value before scenario weights |
| `baseCaseValueKrw` | number | Derived | Stored base case value |
| `bull/base/bear` | number | Derived | Scenario valuations |
| `leveredEquityValueKrw` | number | Derived | Tax and debt adjusted equity value |
| `enterpriseEquivalentValueKrw` | number | Derived | Equity bridge converted back to enterprise value |
| `confidenceScore` | number | Derived | Coverage and data quality score |
| `underwritingMemo` | string | Derived | Internal memo text |
| `keyRisks` | string[] | Derived | Committee risk summary |
| `ddChecklist` | string[] | Derived | Diligence actions |
| `provenance` | json | Derived | Field-level source provenance |

## Python Service Contract

The Python engine consumes a normalized JSON payload containing:

- asset identity and stage
- address and site metrics
- permit, energy, and market snapshots
- manual underwriting assumptions

The engine returns:

- `baseCaseValueKrw`
- `confidenceScore`
- `keyRisks`
- `ddChecklist`
- `assumptions`
- `scenarios`

Memo generation remains in TypeScript so OpenAI usage stays inside the web application runtime.
