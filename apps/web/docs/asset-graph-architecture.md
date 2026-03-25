# Asset Graph Architecture

This schema layer extends the underwriting platform into a real-estate asset graph. The goal is to store raw registry data, market evidence, satellite observations, document-derived facts, approved feature snapshots, and AI outputs without letting the valuation engine consume unreviewed raw inputs directly.

## Rules

1. Raw data is stored first and is not valuation-ready by default.
2. Extracted facts must remain traceable to a document version, source record, or satellite scene.
3. Approved feature snapshots are the stable interface for underwriting, valuation, and committee output.
4. AI outputs must point to evidence or source references.

## Layers

### Core asset and legal graph

- `Asset`, `Address`
- `Parcel`
- `BuildingRecord`
- `PlanningConstraint`
- `OwnershipRecord`
- `EncumbranceRecord`

Purpose: represent the underlying property, title condition, and planning constraints separately from the live underwriting snapshots.

### Market and comparable graph

- `TransactionComp`
- `RentComp`
- `MarketIndicatorSeries`
- `PipelineProject`

Purpose: collect raw market evidence before promoting it into calibrated comparable sets or approved features.

### Geospatial and satellite graph

- `GeoFeature`
- `SatelliteScene`
- `SatelliteObservation`
- `HazardObservation`
- `ConstructionProgressObservation`

Purpose: preserve time-series observation history for flood, fire, heat, land-use, and construction monitoring rather than only storing the latest risk score.

### Document AI graph

- `DocumentExtractionRun`
- `DocumentChunk`
- `DocumentFact`

Purpose: move from simple AI summaries to evidence-linked extraction for DD, leasing, permitting, and RAG.

### Approved decision layer

- `AssetFeatureSnapshot`
- `FeatureValue`
- `AiInsight`

Purpose: create a controlled handoff from upstream data to valuation, IC memo generation, and investor-facing QA.

## Data Flow

```text
Source adapter / OCR / satellite ingest
-> raw tables
-> extraction and normalization
-> document facts / observations
-> approved feature snapshot
-> valuation engine / IC memo / investor QA
```

## What stays in place

These models remain the operational underwriting surface for now:

- `SiteProfile`
- `BuildingSnapshot`
- `PermitSnapshot`
- `EnergySnapshot`
- `MarketSnapshot`
- `ComparableSet`
- `CapexLineItem`
- `Lease`
- `TaxAssumption`
- `SpvStructure`
- `DebtFacility`
- `ValuationRun`

The new graph models are intended to feed those curated models, not replace them immediately.

## Next steps

1. Build ingestion services for `DocumentExtractionRun`, `DocumentChunk`, and `DocumentFact`.
2. Add raw market loaders for `TransactionComp`, `RentComp`, and `MarketIndicatorSeries`.
3. Persist NASA and future raster/vector overlays into `HazardObservation` and `SatelliteObservation`.
4. Add a feature-promotion service that writes `AssetFeatureSnapshot` and `FeatureValue`.
5. Refactor valuation to prefer `AssetFeatureSnapshot` over mixed snapshot/manual input paths.
