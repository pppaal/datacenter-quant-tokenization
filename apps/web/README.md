# apps/web

Active product root for the Korea-focused data center RWA underwriting platform.

Use the repository root [`README.md`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/README.md) for setup and command entrypoints. This app contains the App Router UI, Prisma schema, source adapters, valuation engine, and tests.

## Prisma Migration

The macro profile registry now depends on the `MacroProfileOverride` table.

Apply the checked-in migration before using `/admin/macro-profiles` in a real environment:

```bash
npm run prisma:generate
npx prisma migrate deploy
```

If local `prisma migrate dev` is blocked by the current Windows/engine setup, the checked-in SQL migration under `prisma/migrations/20260325133000_add_macro_profile_overrides` is the source of truth for deployment.

## Scheduled Source Refresh

Near-real-time NASA overlays are now designed to be refreshed by a protected server route:

```bash
curl -X POST http://localhost:3000/api/ops/source-refresh \
  -H "Authorization: Bearer $OPS_CRON_TOKEN"
```

Relevant environment variables:

- `OPS_CRON_TOKEN`: required bearer token for the cron trigger route
- `ADMIN_BASIC_AUTH_USER`: basic auth username for `/admin` and admin API routes
- `ADMIN_BASIC_AUTH_PASSWORD`: basic auth password for `/admin` and admin API routes
- `DOCUMENT_UPLOAD_MAX_BYTES`: max upload size in bytes, default `26214400` (25 MB)
- `DOCUMENT_UPLOAD_ALLOWED_TYPES`: comma-separated MIME allowlist for uploads
- `SOURCE_REFRESH_STALE_HOURS`: asset re-enrichment threshold, default `24`
- `SOURCE_REFRESH_BATCH_SIZE`: max stale assets refreshed per run, default `4`

## Market And Macro Data Connectors

The enrichment layer now supports a preferred market API, a preferred macro API, and market-specific public series for the regime engine.

Important reality:

- free macro data is not automatically true realtime
- most official feeds are `release-based` or `near-real-time`
- the platform should store cadence and freshness explicitly, then build regime logic on top of that instead of assuming every source is live

Priority order:

1. `GLOBAL_MARKET_API_URL`
   or `US_MARKET_API_URL`
   Optional `GLOBAL_MARKET_API_KEY` or `US_MARKET_API_KEY`
   Recommended for transaction comps, rent comps, vacancy, cap rates, and market indicator history.

2. `KOREA_MACRO_API_URL`
   or `GLOBAL_MACRO_API_URL`
   Optional `KOREA_MACRO_API_KEY` or `GLOBAL_MACRO_API_KEY`
   Recommended when you can serve normalized macro payloads directly. This can populate:
   `vacancyPct`, `capRatePct`, `debtCostPct`, `discountRatePct`, `policyRatePct`,
   `creditSpreadBps`, `rentGrowthPct`, `transactionVolumeIndex`, `constructionCostIndex`

3. US FRED series for the first global launch market
   Base key:
   `US_FRED_API_KEY`
   Optional:
   `US_FRED_BASE_URL`

   Series IDs are configured per indicator:
   `US_FRED_INFLATION_SERIES_ID`
   `US_FRED_POLICY_RATE_SERIES_ID`
   `US_FRED_CREDIT_SPREAD_SERIES_ID`
   `US_FRED_RENT_GROWTH_SERIES_ID`
   `US_FRED_TRANSACTION_VOLUME_SERIES_ID`
   `US_FRED_CONSTRUCTION_COST_INDEX_SERIES_ID`

   Optional additional direct underwriting inputs:
   `US_FRED_DEBT_COST_SERIES_ID`
   `US_FRED_DISCOUNT_RATE_SERIES_ID`
   `US_FRED_CAP_RATE_SERIES_ID`
   `US_FRED_VACANCY_SERIES_ID`
   `US_FRED_COLOCATION_RATE_SERIES_ID`
   `US_FRED_CONSTRUCTION_COST_PER_MW_SERIES_ID`

4. US BLS series as a second free official macro stack
   Optional API key:
   `US_BLS_API_KEY`
   or `BLS_API_KEY`
   Optional base URL:
   `US_BLS_BASE_URL`

   Series IDs:
   `US_BLS_INFLATION_SERIES_ID`
   `US_BLS_CONSTRUCTION_COST_INDEX_SERIES_ID`
   `US_BLS_RENT_GROWTH_SERIES_ID`

5. US Treasury Fiscal Data endpoints for daily rate proxies
   Optional base URL:
   `US_TREASURY_API_BASE_URL`

   Endpoint and field pairs:
   `US_TREASURY_POLICY_PROXY_ENDPOINT`
   `US_TREASURY_POLICY_PROXY_FIELD`
   Optional `US_TREASURY_POLICY_PROXY_DATE_FIELD`

   `US_TREASURY_DEBT_COST_ENDPOINT`
   `US_TREASURY_DEBT_COST_FIELD`
   Optional `US_TREASURY_DEBT_COST_DATE_FIELD`

   `US_TREASURY_DISCOUNT_RATE_ENDPOINT`
   `US_TREASURY_DISCOUNT_RATE_FIELD`
   Optional `US_TREASURY_DISCOUNT_RATE_DATE_FIELD`

6. ECB Data API for euro-area markets
   Optional base URL:
   `ECB_DATA_API_BASE_URL`

   Flow/key pairs:
   `ECB_INFLATION_FLOW_REF`, `ECB_INFLATION_KEY`
   `ECB_POLICY_RATE_FLOW_REF`, `ECB_POLICY_RATE_KEY`
   `ECB_CREDIT_SPREAD_FLOW_REF`, `ECB_CREDIT_SPREAD_KEY`
   `ECB_RENT_GROWTH_FLOW_REF`, `ECB_RENT_GROWTH_KEY`
   `ECB_TRANSACTION_VOLUME_FLOW_REF`, `ECB_TRANSACTION_VOLUME_KEY`
   `ECB_CONSTRUCTION_COST_INDEX_FLOW_REF`, `ECB_CONSTRUCTION_COST_INDEX_KEY`

7. KOSIS inflation
   `KOREA_KOSIS_INFLATION_USER_STATS_ID`
   or `KOREA_KOSIS_INFLATION_ORG_ID`, `KOREA_KOSIS_INFLATION_TBL_ID`, `KOREA_KOSIS_INFLATION_ITM_ID`

8. KOSIS construction cost
   `KOREA_KOSIS_CONSTRUCTION_COST_USER_STATS_ID`
   or `KOREA_KOSIS_CONSTRUCTION_COST_ORG_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_TBL_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_ITM_ID`

9. KOSIS policy rate
   `KOREA_KOSIS_POLICY_RATE_USER_STATS_ID`
   or `KOREA_KOSIS_POLICY_RATE_ORG_ID`, `KOREA_KOSIS_POLICY_RATE_TBL_ID`, `KOREA_KOSIS_POLICY_RATE_ITM_ID`

10. KOSIS credit spread
   `KOREA_KOSIS_CREDIT_SPREAD_USER_STATS_ID`
   or `KOREA_KOSIS_CREDIT_SPREAD_ORG_ID`, `KOREA_KOSIS_CREDIT_SPREAD_TBL_ID`, `KOREA_KOSIS_CREDIT_SPREAD_ITM_ID`

11. KOSIS rent growth
   `KOREA_KOSIS_RENT_GROWTH_USER_STATS_ID`
   or `KOREA_KOSIS_RENT_GROWTH_ORG_ID`, `KOREA_KOSIS_RENT_GROWTH_TBL_ID`, `KOREA_KOSIS_RENT_GROWTH_ITM_ID`

12. KOSIS transaction volume
   `KOREA_KOSIS_TRANSACTION_VOLUME_USER_STATS_ID`
   or `KOREA_KOSIS_TRANSACTION_VOLUME_ORG_ID`, `KOREA_KOSIS_TRANSACTION_VOLUME_TBL_ID`, `KOREA_KOSIS_TRANSACTION_VOLUME_ITM_ID`

13. KOSIS construction cost index
   `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_USER_STATS_ID`
   or `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ORG_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_TBL_ID`, `KOREA_KOSIS_CONSTRUCTION_COST_INDEX_ITM_ID`

## FX Normalization

The intake form can now accept money inputs in:

- `KRW`
- `USD`
- `EUR`
- `JPY`
- `SGD`
- `GBP`

All money fields are normalized into KRW for the current valuation engine.

Preferred live FX connector:

- `GLOBAL_FX_API_URL`
- Optional `GLOBAL_FX_API_KEY`
- Optional `FX_SOURCE_CACHE_TTL_MINUTES` for cached live-rate freshness

Supported response shapes include:

- `{ "rateToKrw": 1382.4 }`
- `{ "rates": { "KRW": 1382.4 } }`
- `{ "conversion_rates": { "KRW": 1382.4 } }`

Optional FX overrides:

- `FX_USD_KRW`
- `FX_EUR_KRW`
- `FX_JPY_KRW`
- `FX_SGD_KRW`
- `FX_GBP_KRW`

The admin overview and `/admin/sources` surface now show stale adapters and assets that have fallen outside the refresh window.
