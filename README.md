# Korea Real Estate Underwriting & Research OS

`apps/web` is the only active product root.

The legacy root Next.js app and the `/web` demo were archived under [`legacy/`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy). New product code should only be built inside [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web).

This platform is an institutional underwriting and research operating system for Korean real estate opportunities. It supports intake, source enrichment, evidence review, valuation, diligence workflows, document management, and a registry-only blockchain layer. It is not a retail token-sale app and it does not provide personalized investment advice.

## Product Surface

- Public pages: `/`, `/product`, `/sample-report`
- Admin pages: `/admin`, `/admin/assets`, `/admin/assets/new`, `/admin/assets/[id]`, `/admin/review`, `/admin/valuations`, `/admin/documents`, `/admin/sources`, `/admin/registry`
- Core models: `Asset`, `SiteProfile`, `Address`, `BuildingSnapshot`, `PermitSnapshot`, `EnergySnapshot`, `MarketSnapshot`, `ValuationRun`, `ValuationScenario`, `Document`, `Inquiry`, `User`, `RwaProject`, `OnchainRecord`

## Quick Start

```bash
cd apps/web
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

Or from the repository root:

```bash
npm install --prefix apps/web
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

## Commands

- `npm run dev` starts the active product in `apps/web`
- `npm run build` builds `apps/web`
- `npm run test` runs the required unit tests in `apps/web`
- `npm run prisma:generate` generates the Prisma client for `apps/web`
- `npm run prisma:migrate` runs Prisma migrations inside `apps/web`
- `npm run prisma:seed` loads seeded Korean data-center and office demo opportunities

## Environment

Copy [`apps/web/.env.example`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/.env.example) to `.env` and set at minimum:

- `DATABASE_URL`
- `OPENAI_API_KEY` if you want live memo and document-summary generation
- Any source adapter endpoints and API keys you want to wire for geospatial, building, energy, macro, or climate overlays

Official adapter paths currently supported in code:

- Juso address API for Korean address normalization and coordinate lookup
- KOSIS OpenAPI for macro and benchmark series when `userStatsId` values are configured
- NASA POWER climatology plus daily near-real-time API as a free climate overlay source
- Optional NASA GPM IMERG precipitation and NASA FIRMS hotspot overlays for satellite risk screening
- Python valuation engine under [`apps/web/services/valuation_python`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/services/valuation_python) with TypeScript fallback

Valuation variable reference:

- [`apps/web/docs/valuation-variables.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/valuation-variables.md)
- Micro data roadmap: [`apps/web/docs/micro-data-roadmap.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/micro-data-roadmap.md)
- Report generation notes: [`apps/web/docs/report-generation.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/report-generation.md)
- Blockchain registry wiring guide: [`docs/blockchain-integration.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/docs/blockchain-integration.md)

## Review-Gated Underwriting Flow

The underwriting workflow now follows the repo roadmap literally across asset classes:

1. source and raw record layer
2. normalized asset record layer
3. approved feature layer
4. valuation and quant layer

In practice:

- manual micro, legal, and lease rows now save as `PENDING`
- `/admin/review` and the asset-level review panel are used to approve or reject normalized evidence
- only `APPROVED` energy, permit, ownership, encumbrance, planning, and lease rows are promoted into curated feature snapshots
- valuation, DD checklist, risk memo, and readiness packaging prefer approved promoted features first and only fall back to raw normalized rows when approved curated features are missing
- readiness staging now creates a deterministic offchain review packet manifest / fingerprint while anchoring only registry metadata and document hashes onchain

The current product stance is:

- `DATA_CENTER` remains a full vertical pack
- `OFFICE` is now the first full non-data-center underwriting pack
- `INDUSTRIAL / LOGISTICS` is scaffolded for the next pass
- other real-estate asset classes continue to share the same review-gated research, valuation, report, and readiness workflow

## Deliverables In Repo

- Active product: [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web)
- Architecture notes: [`architecture.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/architecture.md)
- Legacy archive: [`legacy`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy)
