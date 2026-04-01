# Report Generation

This repo includes a document/report layer for small private distressed real estate processes. It reuses existing asset, valuation, document, and traceability data and does not add a new deal pipeline workflow.

## Outputs

- `One-Page Teaser`
  - Audience: investor-facing
  - Uses current asset snapshot, latest valuation, top risks, and versioned documents
- `IC Memo`
  - Audience: operator / investment committee
  - Uses underwriting memo, scenario outputs, pro forma, diligence coverage, and document traceability
- `DD Checklist`
  - Audience: operator
  - Uses approved vs pending lease / comparable / legal / permit / debt coverage and current document room
- `Risk Memo`
  - Audience: operator
  - Uses key risks, approved evidence coverage, pending blockers, mitigants, and document support

## How To Generate

1. Open `/admin/assets/[id]`
2. Click `Reports & Exports`
3. Open the desired output
4. Use `Print` to save PDF, `Download Markdown`, or `Export JSON`

Direct routes:

- Report hub: `/admin/assets/[id]/reports`
- Printable output: `/admin/assets/[id]/reports/[kind]`
- Printable packet: `/admin/assets/[id]/reports/packet/[audience]`
- Export route: `/api/assets/[id]/reports/[kind]?format=md`
- JSON export: `/api/assets/[id]/reports/[kind]?format=json`
- Packet export: `/api/assets/[id]/reports/packet/[audience]?format=md`

Valid `kind` values:

- `teaser`
- `ic-memo`
- `dd-checklist`
- `risk-memo`

Valid packet `audience` values:

- `investor`
- `operator`

Packet behavior:

- `investor`
  - bundles the one-page teaser for external circulation
- `operator`
  - bundles IC memo, DD checklist, and risk memo for internal review

## Traceability

Each report version is derived from:

- latest valuation run id / timestamp
- current document versions and hashes
- approved evidence counts and pending review counts
- latest staged review packet fingerprint when present
- latest linked on-chain anchor state when present

The printable page and markdown export both include:

- deterministic version label
- linked valuation source
- latest document version / hash
- approved evidence count / pending evidence count
- latest valuation run id
- latest staged review packet fingerprint when present
- optional blockchain anchor reference

## Approved vs Pending Evidence

- manual micro, legal, and lease records first enter the normalized layer as `PENDING`
- only `APPROVED` normalized evidence is promoted into curated feature snapshots used by the report layer
- if approved curated features are missing, reports fall back to raw normalized records but visibly call out pending blockers and open gaps
- DD checklist and risk memo now surface approval-state coverage instead of treating all normalized rows as equivalent evidence

## Production-Ready vs Placeholder

Production-ready:

- `One-Page Teaser`
- `IC Memo`

Partial / template-driven:

- `DD Checklist`
  - checklist status is inferred from current data coverage and document categories
- `Risk Memo`
  - severity and mitigation wording are template-driven from current valuation and diligence signals
