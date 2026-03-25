# Data Ingestion Roadmap

## Current State

The Prisma schema already contains the core data structures needed for a serious data center underwriting workflow.

The immediate bottleneck is not schema coverage. It is data coverage and data freshness.

In other words:

- The app can already model assets.
- The app can already run valuations and generate IMs.
- The app does not yet have enough breadth and depth of live market data to make those outputs strong at scale.

## What Already Exists In Schema

### Core asset dossier

- `Asset`
- `Address`
- `SiteProfile`
- `BuildingSnapshot`
- `PermitSnapshot`
- `EnergySnapshot`
- `MarketSnapshot`

These tables cover the base asset record plus infrastructure, permit, and market overlays.

### Return analysis and underwriting

- `ValuationRun`
- `ValuationScenario`
- `ComparableSet`
- `ComparableEntry`
- `CapexLineItem`
- `Lease`
- `LeaseStep`
- `TaxAssumption`
- `SpvStructure`
- `DebtFacility`
- `DebtDraw`

These tables cover the current modeling stack for assumptions, scenarios, debt, lease-up, and committee memo generation.

### External market / reference datasets

- `TransactionComp`
- `RentComp`
- `MarketIndicatorSeries`
- `PipelineProject`

These are the most important tables to scale next because they let the engine move from seeded demo cases to broader underwriting coverage.

### Structured diligence and geospatial overlays

- `Parcel`
- `BuildingRecord`
- `PlanningConstraint`
- `OwnershipRecord`
- `EncumbranceRecord`
- `GeoFeature`
- `SatelliteScene`
- `SatelliteObservation`
- `HazardObservation`
- `ConstructionProgressObservation`

These tables are already available for deeper diligence workflows.

### Documents and extraction

- `Document`
- `DocumentVersion`
- `DocumentExtractionRun`
- `DocumentChunk`
- `DocumentFact`
- `AiInsight`

These support the document room, extraction pipeline, and IM evidence trail.

## Priority Order

### Priority 1: Comparable market coverage

Populate these first:

- `ComparableEntry`
- `TransactionComp`
- `RentComp`
- `MarketIndicatorSeries`

Why this comes first:

- Return analysis is only as strong as the market calibration.
- IM quality improves immediately when the base case can cite real comps and real market moves.
- These tables directly improve valuation confidence.

Target coverage:

- 20 to 50 comparable observations per major market cluster
- Seoul
- Incheon
- Busan
- Daegu / southeast backup markets

Required fields to fill reliably:

- date
- region
- power capacity
- area
- rent level or transaction value
- cap rate
- source link
- source system

### Priority 2: Power and permit certainty

Populate and refresh:

- `EnergySnapshot`
- `PermitSnapshot`
- `PlanningConstraint`
- `GeoFeature`

Why:

- In data center underwriting, power and permit timing often dominate value more than generic real estate comps.
- These directly influence scenario downside and committee recommendation.

Key fields:

- utility name
- substation distance
- power approval status
- permit stage
- zoning status
- environmental review status
- timeline notes

### Priority 3: Commercial assumptions

Populate and standardize:

- `Lease`
- `LeaseStep`
- `MarketSnapshot`

Why:

- The model needs better lease-up assumptions, pricing ramps, and occupancy timing.
- This is where NOI, DSCR, and exit values become credible.

Key fields:

- leased kW
- base rate per kW
- escalation
- probability
- downtime
- occupancy ramp

### Priority 4: Diligence evidence layer

Populate and link:

- `Document`
- `DocumentVersion`
- `DocumentFact`
- `AiInsight`

Why:

- A strong IM needs to point back to real diligence artifacts.
- This is the bridge between raw documents and committee-ready narrative.

Good early document types:

- power study
- permit package
- market report
- financial model
- sponsor materials
- environmental memo

### Priority 5: Advanced differentiation

Populate once the base pipeline is working:

- `SatelliteScene`
- `SatelliteObservation`
- `HazardObservation`
- `ConstructionProgressObservation`
- `PipelineProject`

Why:

- These are high-signal differentiators.
- They are not the first blocker for valuation quality, but they can materially improve risk overlays and product defensibility.

## What To Do Next In Practice

### Step 1

Build a repeatable ingestion flow for:

- transaction comps
- rent comps
- market indicators

Even a CSV import path is enough to start.

### Step 2

Add a lightweight admin workflow to:

- review new comps
- approve or reject them
- assign confidence score
- attach source links

### Step 3

Backfill seeded assets with:

- more comparable observations
- more document records
- more market history

### Step 4

Use the enriched data to improve:

- valuation assumptions
- confidence score logic
- generated IM narrative

## Practical Conclusion

Do not start by adding more schema.

Start by filling the schema that already exists, in this order:

1. `ComparableEntry`, `TransactionComp`, `RentComp`, `MarketIndicatorSeries`
2. `EnergySnapshot`, `PermitSnapshot`, `PlanningConstraint`
3. `Lease`, `LeaseStep`, `MarketSnapshot`
4. `Document`, `DocumentFact`, `AiInsight`

That is the fastest path from demo-quality underwriting to something closer to production-quality investment review.
