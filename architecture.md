# Korea Real Estate Underwriting & Research OS Architecture

## External Data

- Korean geospatial and parcel inputs: address normalization, latitude/longitude, parcel identifiers, grid and fiber context
- Korean building and permit inputs: zoning, permit stage, environmental review status, power approval status
- Korean energy inputs: utility service, tariff estimates, renewable availability, and PUE-related assumptions
- Korean macro and rates inputs: cap rates, debt cost, inflation, transaction, and construction cost benchmarks
- Optional climate overlay: site-specific resiliency notes used for diligence support, with NASA POWER available as a free climatology source

These are pulled through adapter services in [`apps/web/lib/sources/adapters`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/sources/adapters). Each adapter supports env-based configuration, retries, rate-limit tolerant fetching, cache persistence, freshness metadata, and fallback behavior.

## Manually Entered Data

- Asset intake fields: asset code, asset name, owner and sponsor, development summary, area, rent or capacity drivers, occupancy assumptions, capex, opex, and financing assumptions
- Address inputs: line 1, district, city, province, and parcel references when known at intake time
- Analyst notes: site notes, extracted document text, inquiry content, and manual source overrides
- Registry workstream notes: legal structure, next-action notes, and future anchoring readiness

This data enters through admin intake and document workflows in [`apps/web/app/admin`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/app/admin).

## Derived Data

- `SiteProfile`, `BuildingSnapshot`, `PermitSnapshot`, `EnergySnapshot`, and `MarketSnapshot` records after enrichment
- `ValuationRun` and `ValuationScenario` outputs from the internal underwriting engine
- Underwriting memo text, key risks, DD checklist, and confidence score
- Document AI summaries and document hashes
- Source provenance arrays stored with valuation runs
- Research kernels reusing `MacroSeries`, `MacroFactor`, `MarketIndicatorSeries`, `TransactionComp`, `RentComp`, `RealizedOutcome`, and `PipelineProject`

Derived values are built by:

- Enrichment workflow: [`apps/web/lib/services/assets.ts`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/assets.ts)
- Valuation engine: [`apps/web/lib/services/valuation-engine.ts`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/valuation-engine.ts)
- Document service: [`apps/web/lib/services/documents.ts`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/lib/services/documents.ts)

## Future Onchain Data

- `RwaProject` status for registry preparation
- `OnchainRecord` entries for document-hash anchoring and future asset-registry events
- Optional future asset-registry contract state and any later share-token extension

The current platform keeps files, diligence logic, underwriting workflows, valuation logic, and research outputs offchain. The intended onchain surface remains limited to institutional registry functions such as asset identifiers, packet metadata, and document-hash anchoring.

## Storage Boundaries

- PostgreSQL via Prisma stores domain records, cache rows, registry status, documents, and valuation outputs
- Local document storage stores uploaded files under `DOCUMENT_STORAGE_DIR`
- OpenAI is optional and only used for memo and document-summary generation when `OPENAI_API_KEY` is present

## Provenance Rules

- External source outputs are cached in `SourceCache`
- Manual corrections can be persisted in `SourceOverride`
- Valuation runs store field-level provenance for major assumptions and source-backed inputs
- Documents carry a current hash plus version history for future registry anchoring
