# Global Market Rollout Plan

## Goal

Turn the current multi-asset underwriting platform into a global product without trying to solve every country at once.

The principle is simple:

1. Build one global underwriting shell
2. Add region-specific macro adapters
3. Add region-specific market modules
4. Add local document, zoning, and infrastructure logic only after the first two layers work

## Rollout Order

### Phase 1: United States

Reason:
- deepest public macro stack
- most liquid transaction market
- strongest benchmarking environment for underwriting credibility

Priority sources:
- FRED
- Treasury yields
- BLS CPI / labor
- CMBS spread proxies
- broker reports
- comp ingestion from licensed or internal sources

Target asset classes:
- Office
- Industrial
- Multifamily
- Retail
- Data Center

Main product work:
- region-aware macro adapter
- USD handling
- US submarket mapping
- rent growth / vacancy / cap rate modules

### Phase 2: United Kingdom / Europe

Reason:
- strong institutional user base
- relevant for office, logistics, living, and data center

Priority sources:
- ECB
- Bank of England
- Eurostat
- ONS
- broker market reports
- transaction comp ingestion

Main product work:
- currency normalization
- country-level macro overlays
- local market term mapping

### Phase 3: Japan / Singapore

Reason:
- strong APAC gateway markets
- high relevance for logistics and data center underwriting

Priority sources:
- BoJ
- MAS
- official statistics portals
- local bond curves
- local broker reports

Main product work:
- local terminology layer
- power and infrastructure source mapping
- multilingual document extraction support

### Phase 4: Middle East / broader APAC

Reason:
- attractive growth regions
- lower source consistency, so should follow after core markets

Priority sources:
- central bank data
- IMF / World Bank
- local statistics agencies
- broker reports
- partner data rooms

Main product work:
- data confidence scoring
- manual override-heavy workflow
- partner-assisted comp curation

## Architecture Rules

### 1. Keep One Global Underwriting Schema

The product should not fork by country.

Global core:
- asset
- market snapshot
- macro series
- valuation run
- sensitivity
- counterparty credit
- IM

Regional layers should only change:
- source adapters
- term mapping
- default assumptions
- output phrasing

### 2. Separate Macro From Market Data

Macro:
- rates
- spreads
- inflation
- liquidity
- construction cost indices

Market:
- vacancy
- rent growth
- cap rates
- transaction volume
- comps

This keeps the regime engine portable across regions.

### 3. Track Source Confidence By Region

Not every region will have the same public data quality.

Every market launch should define:
- source availability
- refresh cadence
- fallback dependency
- confidence penalty policy

## Immediate Build Priority

1. Add region-aware source planning in admin
2. Abstract macro connector definitions away from Korea-only assumptions
3. Add USD / EUR / JPY normalization in document and valuation flows
4. Start Phase 1 US macro connector plan

## Practical Recommendation

Do not start with “global real estate data platform.”

Start with:

`Global underwriting shell + US launch + Europe next`

That is the shortest path to a credible global product.
