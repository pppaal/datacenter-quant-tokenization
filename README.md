# Korea Real Estate Investment-Firm OS

`apps/web` is the only active product root.

The legacy root Next.js app and the `/web` demo were archived under [`legacy/`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy). New product code should only be built inside [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web).

This platform is an AI-native operating system for a Korean real-estate investment firm. It now spans research, underwriting, deal execution, portfolio operations, and a capital-formation shell, while keeping documents, valuations, extracted text, and underwriting logic offchain. It remains registry-only onchain and it is not a retail token-sale app or investment-advice product.

Browser operators now enter through `/admin/login` using a signed session cookie backed by a persisted `AdminSession` record. Env-configured OIDC / SSO can now be wired through `/api/admin/sso/*`, provider-subject identities can bind back to a persisted `User` for reviewer attribution, and SCIM-style provisioning can populate canonical operators through `/api/admin/scim/*`, including deprovisioning, scoped access grants, and provider-snapshot reconciliation. `/admin/security` now shows unresolved reviewer identities, lets admins map them onto canonical operators, exposes operator seat lifecycle controls, supports targeted session revocation, shows queued and dead-letter ops work, and separates replayable ops-alert intervention items from the underlying delivery log. Browser sessions are validated against canonical seat activity, a persisted seat-backed session version, and the centralized session store, while shared basic auth is now reserved for automation and protected ops paths rather than browser navigation.

## Product Surface

- Public pages: `/`, `/product`, `/sample-report`
- Admin pages: `/admin`, `/admin/research`, `/admin/deals`, `/admin/ic`, `/admin/assets`, `/admin/assets/explorer`, `/admin/assets/new`, `/admin/assets/[id]`, `/admin/review`, `/admin/valuations`, `/admin/documents`, `/admin/sources`, `/admin/portfolio`, `/admin/portfolio/[id]`, `/admin/funds`, `/admin/funds/[id]`, `/admin/investors`, `/admin/registry`
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
- `npm run e2e` runs deterministic Playwright operator mutation coverage, reseeds the demo dataset before the suite starts, and now browser-tests `Property Explorer -> Bootstrap Asset Dossier`
- the local E2E harness now replays the checked-in migration chain against the dedicated scratch database, uses `prisma migrate reset` when the scratch history is stale, and only then runs `prisma db push` to converge remaining legacy schema drift before reseeding
- `npm run e2e:local` starts the checked-in Docker Postgres service and then runs the full local browser mutation suite
- `npm run e2e:list` lists the browser operator suite without launching the app
- `npm run e2e:hosted` runs the hosted smoke suite against `PLAYWRIGHT_BASE_URL`
- `npm run e2e:hosted:mutations` runs the hosted mutation suite against `PLAYWRIGHT_BASE_URL`
- `npm run ops:cycle` runs source refresh then research sync using the same persisted run history used by the admin ops surfaces
- `npm run ops:worker` drains the persisted ops queue and can enqueue an `OPS_CYCLE` job first with `--enqueue-cycle`
- `npm run ops:worker:daemon` runs an always-on poll loop against the persisted ops queue
- `npm run env:preflight -- <target>` validates required environment variables for hosted smoke, hosted mutations, SCIM, or ops worker runs
- `npm run prod:preflight` (run with the production env loaded) hard-fails when secrets, S3 storage, real RPC + signer, or escape-hatch lockdowns are missing — see [`apps/web/docs/production-runbook.md`](./apps/web/docs/production-runbook.md)
- `npm run audit:prune` (or `audit:prune:dry`) prunes `AuditEvent`, `OpsAlertDelivery`, and resolved `Notification` rows past the configured retention window
- `npm run ops:cycle` can also emit failure alerts, and optional retry-recovery alerts, to a generic webhook for scheduled operator monitoring
- `npm run ops:preflight` runs prisma generate, typecheck, unit tests, build, and browser suite registration in one command
- `npm run prisma:generate` generates the Prisma client for `apps/web`
- `npm run prisma:migrate` runs Prisma migrations inside `apps/web`
- `npm run prisma:seed` loads seeded Korean data-center and office demo opportunities

`npm run e2e` now fails fast with a clear message if the local Postgres database is down, reseeds the demo data before the suite, and defaults browser E2E to `BLOCKCHAIN_MOCK_MODE=true` so stage/register/anchor flows can be exercised deterministically.

Seeded Postgres browser smoke CI is checked in at `.github/workflows/web-e2e.yml`. Hosted browser regression is checked in at `.github/workflows/web-e2e-hosted.yml`, and a manual hosted mutation suite is checked in at `.github/workflows/web-e2e-hosted-mutations.yml` with a staging-host guard. The scheduled ops worker path now enqueues `OPS_CYCLE` work and drains the persisted queue from `.github/workflows/ops-cycle.yml`, while `apps/web/scripts/run-ops-worker.ts` and `apps/web/scripts/run-ops-worker-daemon.ts` give the repo both batch and always-on queue-draining entrypoints outside request handling.

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
- Operations runbook: [`apps/web/docs/operations-runbook.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/docs/operations-runbook.md)
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
  - `/admin/research` for macro, market, submarket, asset dossier, portfolio optimization, and coverage-queue research fabric with provenance, freshness, confidence/conflict signals, explicit sync controls, a `source view` vs `house view` split, and admin approval of immutable house-view thesis snapshots
  - `/admin/sources` for source freshness, stale asset queue, and recent source refresh run history
- `Underwriting`
  - review-gated evidence, promoted features, valuation, committee memo, DD checklist, and risk memo
- `Deal Execution`
  - `/admin/deals` for next actions, sourcing score, origination source, relationship coverage, lender quotes, bids, exclusivity state, specialist due-diligence workstreams, lane-level deliverable upload/linking, DD workpaper export, loss taxonomy, and close-probability snapshots
- `IC Governance`
  - `/admin/ic` for scheduled meetings, locked packets, released decision records, committee packaging candidates, specialist DD sign-off visibility, and packet-lock guards that require approved valuation plus supporting DD deliverables
- `Portfolio Operations`
  - `/admin/portfolio` for held-asset KPI history, lease rollover watchlists, covenant tracking, capex vs budget, asset-management initiatives, exit cases, and quantum-inspired scenario exploration
- `Capital Formation Shell`
  - `/admin/funds`, `/admin/funds/[id]`, and `/admin/investors` for fund, vehicle, investor, commitment, call, distribution, controlled report-release workflow, and DDQ shells

## Deliverables In Repo

- Active product: [`apps/web`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web)
- Architecture notes: [`architecture.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/architecture.md)
- Legacy archive: [`legacy`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/legacy)
