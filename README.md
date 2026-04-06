# Korea Real Estate Investment-Firm OS

`apps/web` is the only active product root.

The legacy root Next.js app and the `/web` demo were archived under [`legacy/`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy). New product code should only be built inside [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web).

This platform is an AI-native operating system for a Korean real-estate investment firm. It now spans research, underwriting, deal execution, portfolio operations, and a capital-formation shell, while keeping documents, valuations, extracted text, and underwriting logic offchain. It remains registry-only onchain and it is not a retail token-sale app or investment-advice product.

Browser operators now enter through `/admin/login` using a signed session cookie. Env-configured OIDC / SSO can now be wired through `/api/admin/sso/*`. Shared basic auth remains available for automation, protected cron routes, and browser smoke coverage.

## Product Surface

- Public pages: `/`, `/product`, `/sample-report`
- Admin pages: `/admin`, `/admin/research`, `/admin/deals`, `/admin/assets`, `/admin/assets/new`, `/admin/assets/[id]`, `/admin/review`, `/admin/valuations`, `/admin/documents`, `/admin/sources`, `/admin/portfolio`, `/admin/portfolio/[id]`, `/admin/funds`, `/admin/funds/[id]`, `/admin/investors`, `/admin/registry`
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
- `npm run e2e` runs Playwright smoke coverage and auto-seeds the demo dataset when the local database is reachable but seed records are missing
- `npm run e2e:list` lists the browser smoke suite without launching the app
- `npm run ops:cycle` runs source refresh then research sync using the same persisted run history used by the admin ops surfaces
- `npm run ops:preflight` runs prisma generate, typecheck, unit tests, build, and browser suite registration in one command
- `npm run prisma:generate` generates the Prisma client for `apps/web`
- `npm run prisma:migrate` runs Prisma migrations inside `apps/web`
- `npm run prisma:seed` loads seeded Korean data-center and office demo opportunities

`npm run e2e` now fails fast with a clear message if the local Postgres database is down, and it will auto-run `npm run prisma:seed` if the database is reachable but the seeded demo records are missing.

Seeded Postgres browser smoke CI is checked in at `.github/workflows/web-e2e.yml`. The first scheduled ops worker path is checked in at `.github/workflows/ops-cycle.yml`.

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
- Investment-firm operating overview: [`apps/web/docs/investment-firm-os-overview.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/investment-firm-os-overview.md)
- Demo script: [`apps/web/docs/demo-script.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/demo-script.md)
- Platform readiness audit: [`apps/web/docs/platform-readiness-audit.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/platform-readiness-audit.md)
- Hardening plan: [`apps/web/docs/hardening-plan.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/hardening-plan.md)
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
- `INDUSTRIAL / LOGISTICS` is the next playbook under active expansion
- `LAND / DEVELOPMENT` now has a coherent shell playbook
- other real-estate asset classes continue to share the same review-gated research, valuation, report, and readiness workflow

## Investment-Firm Operating Layers

- `Research`
  - `/admin/research` for macro, market, submarket, asset dossier, portfolio optimization, and coverage-queue research fabric with provenance, freshness, and explicit sync controls
  - `/admin/sources` for source freshness, stale asset queue, and recent source refresh run history
- `Underwriting`
  - review-gated evidence, promoted features, valuation, committee memo, DD checklist, and risk memo
- `Deal Execution`
  - `/admin/deals` for next actions, lender quotes, bids, diligence requests, and close-probability snapshots
- `Portfolio Operations`
  - `/admin/portfolio` for held-asset KPI history, lease rollover watchlists, covenant tracking, capex vs budget, exit cases, and quantum-inspired scenario exploration
- `Capital Formation Shell`
  - `/admin/funds`, `/admin/funds/[id]`, and `/admin/investors` for fund, vehicle, investor, commitment, call, distribution, reporting, and DDQ shells

## Deliverables In Repo

- Active product: [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web)
- Architecture notes: [`architecture.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/architecture.md)
- Legacy archive: [`legacy`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy)
