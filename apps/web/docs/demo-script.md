# Demo Script

This is the recommended demo flow for the current `apps/web` product.

The goal is to show that the repo is no longer only an underwriting app. It now operates as the foundation of an AI-native Korean real-estate investment-firm OS.

## Demo Goal

Show this sequence clearly:

1. research intake
2. evidence review
3. underwriting
4. deal execution
5. portfolio operations
6. capital shell
7. registry-only readiness and document-hash anchoring

## Seed Assets To Use

Primary cases:

- `SEOUL-YEOUIDO-01`
  - office demo asset
- `SEOUL-GANGSEO-01`
  - data-center demo asset

Supporting cases:

- `Incheon` case
  - pending-review style evidence state
- `Busan` case
  - earlier-stage case

Portfolio / capital shell:

- portfolio `KR-INCOME-I`
- fund `HIRF-I`

## 10-Minute Demo Flow

### 1. Start At `/admin/assets`

Message:

> We start with one investment-firm asset library, not a single-purpose valuation spreadsheet.

Show:

- office asset
- data-center asset
- different readiness states

Talking point:

- `OFFICE` and `DATA_CENTER` are both native packs
- the workflow is shared
- evidence gating is shared

### 2. Open `SEOUL-YEOUIDO-01`

Route:

- `/admin/assets/[id]`

Message:

> Every case starts as a structured asset dossier with research, evidence, valuation, reports, and readiness in one place.

Show:

- intake fields
- approved/pending evidence
- research dossier section
- valuation link
- report library
- readiness section

Talking point:

- approved evidence is separated from pending evidence
- operator outputs use approved evidence first

### 3. Open `/admin/review`

Message:

> The product has a review gate between raw/normalized evidence and promoted underwriting features.

Show:

- queue grouped by asset and discipline
- pending items
- approve / reject actions

Talking point:

- this is the institutional middle layer
- no silent promotion from manual evidence straight into valuation

### 4. Return To The Office Asset And Open Reports

Route:

- `/admin/assets/[id]/reports`

Message:

> Reports are not generic exports. They inherit evidence state, valuation traceability, and readiness context.

Show:

- IC memo
- DD checklist
- risk memo
- latest valuation id
- latest document hash
- review packet fingerprint
- optional anchor reference

Talking point:

- DD and risk output distinguish approved coverage, pending items, and open gaps

### 5. Open `/admin/deals`

Message:

> The repo now includes deal execution, not just research and valuation.

Show:

- stage pipeline
- next action
- lender quote coverage
- bid history
- close probability

Talking point:

- this is an operator surface, not a generic CRM

### 6. Open `/admin/portfolio`

Message:

> Once an asset is held, the system moves into portfolio operations rather than stopping at committee approval.

Show:

- portfolio summary
- hold value
- occupancy / NOI summary
- watchlist count

### 7. Open `/admin/portfolio/[id]`

Message:

> Portfolio OS tracks hold performance, covenant risk, lease rollover, capex, and exit planning in the same operating model.

Show:

- asset hold performance
- lease rollover watchlist
- debt maturity wall
- LTV / DSCR / covenant summary
- capex vs budget
- exit case tracker
- portfolio optimization lab
- AI operator brief

Talking point:

- this is the start of an AI-native operating layer, not just a static dashboard
- the optimization lab uses a classical quantum-inspired discrete search heuristic to explore reweighting and stress outcomes without moving any operating data offchain

### 8. Open `/admin/funds/[id]`

Message:

> Capital OS is intentionally a shell today, but it already models the institutional fund and investor side.

## Mutation Assurance Note

The seeded demo path is now browser-tested for the highest-risk operator mutations:

- review approve / reject
- valuation rerun
- document upload into history
- readiness stage / register / anchor
- deal archive / restore

For local runs, `npm run e2e` reseeds the demo path before executing the browser suite.

Show:

- commitments
- calls
- distributions
- vehicles / mandates
- investor reporting shell
- DDQ shell
- investor update draft

Talking point:

- no retail token sale flows
- no wallet onboarding
- no public trading UX
- this is a private investment-firm model

### 9. Close With Registry-Only Readiness

Message:

> The blockchain layer is registry-only. Files, extracted text, valuation logic, and workflows remain offchain.

Show:

- readiness packet fingerprint
- latest document hash
- anchor status

Talking point:

- only registry ids, hashes, and packet metadata are anchored
- the operating system remains offchain and institution-friendly

## Short Investor Demo Framing

Use this if you need a one-minute summary:

> This product is an AI-native Korean real-estate investment-firm OS. It combines research, review-gated underwriting, deal execution, portfolio operations, and a capital-formation shell in one system. Evidence, valuation logic, and workflows stay offchain. Only registry identifiers, packet metadata, and document hashes are anchorable onchain.

## Short Customer Demo Framing

Use this if the audience is an operator:

> The platform replaces fragmented research files, underwriting models, diligence trackers, committee memos, deal notes, and held-asset monitoring with one operating workflow. Approved evidence drives promoted features, reports, readiness, and operating summaries.

## Demo Tips

- Start with the office asset first. It makes the product feel broader than data-center-only.
- Use the data-center asset second to show the vertical-pack concept.
- Keep the blockchain explanation short and explicit.
- Do not lead with tokenization.
- Lead with research, review gating, underwriting, and operating workflows.
