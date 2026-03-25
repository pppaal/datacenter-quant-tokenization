# Real Estate Generalization Plan

## Goal

Generalize the current data-center-specific underwriting platform into an AI real estate underwriting platform that can support:

- Office
- Industrial / logistics
- Retail
- Multifamily
- Hotel
- Data center

The target is not to delete the current data center workflow.

The target is:

- keep the current workflow working
- extract the common underwriting core
- move asset-class-specific logic into dedicated detail models and valuation strategies

## What Is Coupled Today

### Asset intake

Current intake is effectively data-center-first.

Relevant files:

- `apps/web/lib/validations/asset.ts`
- `apps/web/components/admin/asset-intake-form.tsx`
- `apps/web/prisma/schema.prisma`

Current `Asset` carries several fields that are useful for many asset classes:

- `name`
- `description`
- `status`
- `stage`
- `landAreaSqm`
- `grossFloorAreaSqm`
- `occupancyAssumptionPct`
- `capexAssumptionKrw`
- `opexAssumptionKrw`
- `financingLtvPct`
- `financingRatePct`

But it also carries fields that are clearly data-center-specific:

- `powerCapacityMw`
- `targetItLoadMw`

### Valuation engine

Current valuation logic assumes a data center operating model.

Relevant files:

- `apps/web/lib/services/valuation-engine.ts`
- `apps/web/lib/services/valuation/inputs.ts`
- `apps/web/lib/services/valuation/lease-dcf.ts`
- `apps/web/lib/services/valuation/project-finance.ts`
- `apps/web/lib/services/valuation/types.ts`

Examples of current data-center assumptions:

- pricing based on `monthlyRatePerKwKrw`
- capacity-based revenue derived from `powerCapacityMw`
- PUE and power cost assumptions
- utility / permit impacts flowing into the underwriting case

That logic should remain, but only as the `DATA_CENTER` strategy.

## Target Architecture

The right model is:

1. common asset record
2. asset-class-specific detail record
3. common underwriting run output
4. asset-class-specific valuation strategy

## Proposed Schema Direction

### 1. Introduce a real enum for asset class

Current:

- `assetType` is just a `String`

Target:

```prisma
enum AssetClass {
  OFFICE
  INDUSTRIAL
  RETAIL
  MULTIFAMILY
  HOTEL
  DATA_CENTER
  LAND
  MIXED_USE
}
```

Then on `Asset`:

```prisma
assetClass AssetClass
assetSubtype String?
```

Reason:

- `assetType: String` is too loose for strategy routing
- engine dispatch should not rely on free-text values

### 2. Make `Asset` the common underwriting shell

Keep `Asset` focused on cross-sector fields:

- identifiers
- stage / status
- ownership / sponsor
- location
- size
- generic underwriting assumptions

Recommended common `Asset` fields:

- `assetCode`
- `slug`
- `name`
- `assetClass`
- `assetSubtype`
- `market`
- `status`
- `stage`
- `description`
- `ownerName`
- `sponsorName`
- `developmentSummary`
- `landAreaSqm`
- `grossFloorAreaSqm`
- `rentableAreaSqm`
- `purchasePriceKrw`
- `stabilizedOccupancyPct`
- `holdingPeriodYears`
- `exitCapRatePct`
- `capexAssumptionKrw`
- `opexAssumptionKrw`
- `financingLtvPct`
- `financingRatePct`
- `currentValuationKrw`

Fields to move out of `Asset` over time:

- `powerCapacityMw`
- `targetItLoadMw`

These should live under a data-center-specific detail model.

### 3. Add asset-class-specific detail tables

#### Data center

```prisma
model DataCenterDetail {
  id                    String   @id @default(cuid())
  assetId               String   @unique
  powerCapacityMw       Float?
  targetItLoadMw        Float?
  pueTarget             Float?
  utilityName           String?
  substationDistanceKm  Float?
  renewablePct          Float?
  redundancyTier        String?
  coolingType           String?
  fiberAccess           String?
  latencyProfile        String?
  asset                 Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Office

```prisma
model OfficeDetail {
  id                     String   @id @default(cuid())
  assetId                String   @unique
  officeGrade            String?
  parkingStalls          Int?
  averageFloorPlateSqm   Float?
  serviceChargePerSqmKrw Float?
  fitOutAllowanceKrw     Float?
  rolloverExposurePct    Float?
  asset                  Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Industrial / logistics

```prisma
model IndustrialDetail {
  id                     String   @id @default(cuid())
  assetId                String   @unique
  clearHeightMeters      Float?
  dockDoorCount          Int?
  yardAreaSqm            Float?
  trailerParkingCount    Int?
  automationReadiness    String?
  asset                  Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Retail

```prisma
model RetailDetail {
  id                     String   @id @default(cuid())
  assetId                String   @unique
  centerType             String?
  anchorTenantName       String?
  turnoverRentPct        Float?
  footTrafficIndex       Float?
  parkingStalls          Int?
  asset                  Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Multifamily

```prisma
model MultifamilyDetail {
  id                     String   @id @default(cuid())
  assetId                String   @unique
  unitCount              Int?
  avgUnitSizeSqm         Float?
  affordablePct          Float?
  renovationScope        String?
  amenityScore           Float?
  asset                  Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Hotel

```prisma
model HotelDetail {
  id                     String   @id @default(cuid())
  assetId                String   @unique
  keyCount               Int?
  brandFlag              String?
  adrKrw                 Float?
  occupancyPct           Float?
  revparKrw              Float?
  managementFeePct       Float?
  asset                  Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

### 4. Split market intelligence into common and asset-class layers

Current `MarketSnapshot` has data-center-specific fields such as:

- `colocationRatePerKwKrw`
- `constructionCostPerMwKrw`

That should become:

#### Common market snapshot

```prisma
model MarketSnapshot {
  id                     String       @id @default(cuid())
  assetId                String       @unique
  metroRegion            String
  vacancyPct             Float?
  capRatePct             Float?
  debtCostPct            Float?
  inflationPct           Float?
  discountRatePct        Float?
  marketRentPerSqmKrw    Float?
  constructionCostPerSqmKrw Float?
  marketNotes            String?
  sourceStatus           SourceStatus @default(MANUAL)
  sourceUpdatedAt        DateTime?
  asset                  Asset        @relation(fields: [assetId], references: [id], onDelete: Cascade)
}
```

#### Data center market detail

```prisma
model DataCenterMarketDetail {
  id                      String   @id @default(cuid())
  marketSnapshotId        String   @unique
  colocationRatePerKwKrw  Float?
  constructionCostPerMwKrw Float?
  aiDemandIndex           Float?
  utilityQueueMonths      Float?
  marketSnapshot          MarketSnapshot @relation(fields: [marketSnapshotId], references: [id], onDelete: Cascade)
}
```

This lets office / logistics / retail use the same `MarketSnapshot` without forcing kW-specific pricing into every asset class.

### 5. Keep `Lease`, `DebtFacility`, `CapexLineItem`, `Document`, `ValuationRun`

These are already generic enough to survive the transition.

They should remain the shared underwriting core.

Only minor additions are needed.

#### Suggested additions

For `Lease`:

- `leasedAreaSqm`
- `baseRentPerSqmKrw`
- `expenseRecoveriesPct`

For `ValuationRun`:

- `assetClassSnapshot`
- `recommendation`
- `icSummary`

The existing `underwritingMemo` can stay.

## Validation Layer Refactor

Current file:

- `apps/web/lib/validations/asset.ts`

Current issue:

- one flat schema mixes common and data-center-specific fields

Target:

- shared base schema
- asset-class-specific extension schemas

Suggested structure:

```ts
baseAssetSchema
officeAssetSchema
industrialAssetSchema
retailAssetSchema
multifamilyAssetSchema
hotelAssetSchema
dataCenterAssetSchema
```

Then:

```ts
assetIntakeSchema = z.discriminatedUnion('assetClass', [...])
```

This is the cleanest way to support dynamic forms and strategy selection.

## Valuation Engine Refactor

Current file:

- `apps/web/lib/services/valuation-engine.ts`

Current issue:

- the engine is effectively the data center engine

Target structure:

```ts
lib/services/valuation/
  strategies/
    office.ts
    industrial.ts
    retail.ts
    multifamily.ts
    hotel.ts
    data-center.ts
  shared/
    debt.ts
    scenario.ts
    memo.ts
    risk.ts
```

Suggested interface:

```ts
type AssetClassValuationStrategy = {
  prepareInputs(bundle: UnderwritingBundle): PreparedInputs
  runScenarios(inputs: PreparedInputs): UnderwritingAnalysis
}
```

Dispatch layer:

```ts
getValuationStrategy(asset.assetClass)
```

### What stays shared

- scenario orchestration
- debt schedule logic
- capex aggregation
- memo generation pipeline
- provenance handling
- run persistence

### What becomes asset-class-specific

- revenue model
- market pricing anchor
- utilization assumptions
- operating cost model
- risk flags
- memo framing

## Memo Generation Refactor

Current file:

- `apps/web/lib/ai/openai.ts`

Current issue:

- memo prompt is data-center-specific

Target:

- shared memo generator
- asset-class-specific prompt instructions

Suggested shape:

```ts
generateInvestmentMemo({
  assetClass,
  analysis,
  template
})
```

Prompt behavior should vary by asset class:

- office: lease rollover, tenant concentration, market rent gap
- logistics: clear height, location premium, tenant covenant
- retail: anchor risk, sales linkage, foot traffic
- multifamily: rent growth, renovation upside, turnover
- hotel: ADR, occupancy, seasonality, operator risk
- data center: power, permits, cooling, demand density

## Migration Sequence

Do not do this as one big bang.

### Phase 1: Introduce structure without breaking current product

1. Add `AssetClass` enum
2. Add `assetClass` to `Asset`
3. Backfill all current assets as `DATA_CENTER`
4. Add `DataCenterDetail`
5. Copy current data-center-specific fields into `DataCenterDetail`

Keep existing fields temporarily so current code does not break.

### Phase 2: Refactor intake and engine routing

1. Add asset-class-aware intake schema
2. Add strategy dispatcher
3. Move current logic into `data-center` strategy

At this stage, the product still supports only data centers in practice, but the architecture is now extensible.

### Phase 3: Add second and third asset classes

Recommended order:

1. `OFFICE`
2. `INDUSTRIAL`
3. `DATA_CENTER` remains as the advanced specialist path

Office and industrial are the easiest to support next because their underwriting logic is still close to lease/cash-flow real estate.

### Phase 4: Remove obsolete direct fields from `Asset`

After all readers are migrated:

- deprecate `powerCapacityMw`
- deprecate `targetItLoadMw`
- move any other sector-specific fields fully into detail tables

## Concrete Recommendation

If the goal is "AI that can review the profitability of all real estate assets," then the next engineering move should be:

1. add `AssetClass`
2. create `DataCenterDetail`
3. refactor intake into a discriminated union by asset class
4. split valuation engine into strategy modules
5. add `OfficeDetail` and `IndustrialDetail`

Do not start by rewriting the UI first.

Do not start by deleting data-center logic.

Start by extracting the common underwriting shell from the current data-center implementation.
