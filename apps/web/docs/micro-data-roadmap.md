# Micro Data Roadmap

This document defines the next layer of asset-level data collection for the underwriting and research OS.

The goal is to move from market-aware underwriting to asset-aware underwriting.

Macro data answers:

- what is happening in the market
- what discount rates and cap rates look like
- what construction and financing benchmarks are doing

Micro data answers:

- whether this specific asset is actually financeable
- whether power and permits are real
- whether tenant revenue is durable
- whether hidden title, timing, or capex risks exist

## Core Principle

Do not mix raw evidence with model-ready features.

Use four layers:

1. source and raw record layer
2. normalized asset record layer
3. approved feature layer
4. valuation and quant layer

This repository now supports that shape across asset classes:

- raw and normalized tables in Prisma
- approved feature snapshots via `AssetFeatureSnapshot`
- valuation-ready handoff through curated features and valuation inputs

Implemented now:

- `EnergySnapshot`, `PermitSnapshot`, `OwnershipRecord`, `EncumbranceRecord`, `PlanningConstraint`, and `Lease` carry `reviewStatus`, `reviewedAt`, `reviewedById`, and `reviewNotes`
- manual micro and lease saves default back to `PENDING`
- `/admin/review` and the asset dossier review panel allow approve / reject decisions
- curated feature promotion only promotes approved normalized evidence

## Priority Order

### Priority 1: Site, Permit, And Entitlement Certainty

This remains the highest-signal micro layer for data-center deals, but the same review-gated pattern now applies to office, industrial, and other real-estate assets.

Capture first:

- utility name
- power capacity MW
- target IT load MW
- substation distance km
- interconnection status
- power approval status
- permit stage
- zoning approval status
- environmental review status
- expected approval date
- delay notes

Schema targets:

- `Asset`
- `DataCenterDetail`
- `EnergySnapshot`
- `PermitSnapshot`
- `PlanningConstraint`
- `GeoFeature`

First-round quant features:

- `power.approval_score`
- `power.substation_distance_score`
- `permit.readiness_score`
- `permit.delay_risk_score`
- `site.infrastructure_readiness_score`

### Priority 2: Commercial Revenue Certainty

Capture next:

- tenant count
- anchor tenant present
- leased MW
- preleased MW
- occupancy percent
- weighted average lease term
- monthly rate per kW
- escalation percent
- tenant credit quality label
- downtime months
- renewal probability

Schema targets:

- `Asset`
- `Lease`
- `LeaseStep`
- `MarketSnapshot`
- `DocumentFact`

First-round quant features:

- `revenue.anchor_tenant_flag`
- `revenue.prelease_ratio`
- `revenue.lease_term_score`
- `revenue.contractual_rate_vs_market`
- `revenue.rollover_risk_score`

### Priority 3: Buildability And Delivery Risk

Capture next:

- development stage
- construction progress percent
- EPC / contractor status
- expected delivery date
- change order flags
- contingency percent
- capex line item completeness
- critical path blockers
- construction delay notes

Schema targets:

- `Asset`
- `CapexLineItem`
- `ConstructionProgressObservation`
- `DocumentFact`
- `AiInsight`

First-round quant features:

- `build.progress_score`
- `build.capex_completeness_score`
- `build.contingency_adequacy_score`
- `build.delivery_risk_score`

### Priority 4: Legal And Title Cleanliness

Capture next:

- owner entity
- ownership percent
- encumbrance type
- secured amount
- lien priority rank
- release status
- land use restriction
- planning constraint severity

Schema targets:

- `OwnershipRecord`
- `EncumbranceRecord`
- `Parcel`
- `PlanningConstraint`
- `DocumentFact`

First-round quant features:

- `legal.title_cleanliness_score`
- `legal.encumbrance_risk_score`
- `legal.constraint_severity_score`

### Priority 5: Physical And Site Quality

Capture next:

- flood risk
- wildfire risk
- seismic risk
- road access
- fiber access
- latency profile
- cooling type
- redundancy tier
- renewable availability
- backup fuel hours

Schema targets:

- `SiteProfile`
- `BuildingSnapshot`
- `EnergySnapshot`
- `GeoFeature`
- `HazardObservation`

First-round quant features:

- `site.resiliency_score`
- `site.fiber_quality_score`
- `site.cooling_redundancy_score`
- `site.energy_resilience_score`

## Current Product Position

- `DATA_CENTER` remains a full vertical pack
- `OFFICE` is the first full non-data-center pack
- `INDUSTRIAL / LOGISTICS` is scaffolded on the same universal micro research workflow

## The 30 Micro Fields To Collect First

Start with these before adding more data sources.

1. `powerCapacityMw`
2. `targetItLoadMw`
3. `utilityName`
4. `substationDistanceKm`
5. `powerApprovalStatus`
6. `permitStage`
7. `zoningApprovalStatus`
8. `environmentalReviewStatus`
9. `expectedApprovalDate`
10. `timelineNotes`
11. `tenantCount`
12. `anchorTenantPresent`
13. `leasedMw`
14. `preleasedMw`
15. `occupancyPct`
16. `weightedAverageLeaseTermYears`
17. `monthlyRatePerKwKrw`
18. `annualEscalationPct`
19. `tenantCreditQuality`
20. `downtimeMonths`
21. `constructionProgressPct`
22. `expectedDeliveryDate`
23. `contingencyPct`
24. `capexLineItemCoveragePct`
25. `ownerName`
26. `encumbranceCount`
27. `seniorSecuredAmountKrw`
28. `floodRiskScore`
29. `fiberAccess`
30. `redundancyTier`

## Storage Mapping

Map source data into the existing schema before creating any new tables.

### Power and permits

- `Asset.powerCapacityMw`
- `Asset.targetItLoadMw`
- `DataCenterDetail.utilityName`
- `EnergySnapshot.utilityName`
- `EnergySnapshot.substationDistanceKm`
- `PermitSnapshot.powerApprovalStatus`
- `PermitSnapshot.permitStage`
- `PermitSnapshot.zoningApprovalStatus`
- `PermitSnapshot.environmentalReviewStatus`
- `PermitSnapshot.timelineNotes`

### Revenue and leasing

- `Lease.tenantName`
- `Lease.leasedKw`
- `Lease.baseRatePerKwKrw`
- `Lease.annualEscalationPct`
- `Lease.termYears`
- `Lease.probabilityPct`
- `Lease.downtimeMonths`
- `OfficeDetail.weightedAverageLeaseTermYears` for office assets
- `DocumentFact` for extracted lease facts that are not yet approved into a curated lease record

### Build and capex

- `CapexLineItem`
- `ConstructionProgressObservation.progressPct`
- `ConstructionProgressObservation.confidenceScore`
- `AiInsight` for qualitative risk synthesis from documents

### Legal

- `OwnershipRecord`
- `EncumbranceRecord`
- `PlanningConstraint`
- `Parcel`

### Site quality

- `SiteProfile.floodRiskScore`
- `SiteProfile.wildfireRiskScore`
- `SiteProfile.seismicRiskScore`
- `SiteProfile.fiberAccess`
- `SiteProfile.latencyProfile`
- `BuildingSnapshot.redundancyTier`
- `BuildingSnapshot.coolingType`
- `EnergySnapshot.renewableAvailabilityPct`
- `EnergySnapshot.backupFuelHours`

## Ingestion Rules

Each micro record should carry:

- source system
- source link where possible
- observation date or source updated at
- freshness status
- confidence or approval state if manually reviewed

Do not let raw extracted facts flow directly into valuation without review.

Instead:

1. ingest raw source
2. normalize into schema
3. review and approve
4. promote into `AssetFeatureSnapshot`
5. consume in valuation and quant layers

## Feature Engineering Rules

All quant features should be:

- bounded
- explainable
- attributable to evidence
- easy to recompute when a source changes

Recommended feature families:

- readiness features
- revenue durability features
- legal cleanliness features
- resiliency features
- delivery and capex risk features

Example transformations:

- `power.approval_score`: map permit labels into a 0-100 scale
- `revenue.prelease_ratio`: `preleasedMw / powerCapacityMw`
- `revenue.contractual_rate_vs_market`: `signed_rate / market_rate`
- `build.progress_score`: normalized from construction progress and delivery confidence
- `legal.encumbrance_risk_score`: weighted by count, priority, and secured amount
- `site.resiliency_score`: weighted blend of flood, wildfire, seismic, and backup systems

## What To Build Next

### Phase 1

Implemented:

- admin ingestion and review paths for `PermitSnapshot`, `EnergySnapshot`, `Lease`, `OwnershipRecord`, `EncumbranceRecord`, and `PlanningConstraint`
- approved-only promotion into `power_micro`, `permit_inputs`, `revenue_micro`, `legal_micro`, and `site_micro`

### Phase 2

Improve document extraction coverage for:

- lease economics
- permit dates
- power allocation status
- capex and contingency facts
- legal restriction facts

### Phase 3

Add feature-promotion jobs that create these namespaces:

- `power_permit_micro` or compatible split namespaces
- `revenue_micro`
- `build_micro`
- `legal_micro`
- `site_micro`

Implemented currently:

- `power_micro`
- `permit_inputs`
- `revenue_micro`
- `legal_micro`
- `site_micro`
- `readiness_legal`

### Phase 4

Refactor quant and valuation preparation to read those promoted features first and fall back to snapshots only when approved features are missing.

Implemented currently:

- valuation preparation still prefers curated feature snapshots first
- because promotion is now approval-gated, approved evidence is naturally preferred before raw fallback

## Practical Recommendation

Do not chase every possible micro dataset.

For this product, the highest-return first move is:

1. power and permit certainty
2. leasing and revenue durability
3. legal cleanliness

Those three layers will improve valuation confidence and investment defensibility faster than adding more broad but shallow market feeds.
