-- Submarket × tier × asset-class taxonomy on the cap-rate-bearing rows.
--
-- Without these columns, MarketIndicatorSeries and TransactionComp can
-- carry only a free-text `region` and (TransactionComp) a free-text
-- `comparableType` — neither of which the SQL aggregator can group on
-- to produce CBRE-style "Yeouido Prime 4.6%, Grade A 5.1%, Grade B 5.8%"
-- output.
--
-- Both columns are nullable: legacy rows ingested before this round
-- carry no tier metadata, and not every datapoint maps cleanly to
-- a Prime / Grade A / Grade B / Strata bucket. The admin page treats
-- NULL tier as "Untiered" so unclassified data still surfaces.
--
-- assetClass mirrors the Prisma enum value (DATA_CENTER, OFFICE, ...);
-- assetTier is a free string for now ('PRIME', 'GRADE_A', 'GRADE_B',
-- 'STRATA', etc.) so we don't have to backfill an enum migration when
-- the taxonomy expands.

ALTER TABLE "TransactionComp"
  ADD COLUMN IF NOT EXISTS "assetClass" "AssetClass",
  ADD COLUMN IF NOT EXISTS "assetTier"  TEXT;

ALTER TABLE "MarketIndicatorSeries"
  ADD COLUMN IF NOT EXISTS "assetClass" "AssetClass",
  ADD COLUMN IF NOT EXISTS "assetTier"  TEXT;

-- Aggregator queries group by (market, region, assetClass, assetTier),
-- so a covering composite index keeps the cap-rate dashboard cheap.
CREATE INDEX IF NOT EXISTS "TransactionComp_market_region_class_tier_idx"
  ON "TransactionComp"("market", "region", "assetClass", "assetTier", "transactionDate");

CREATE INDEX IF NOT EXISTS "MarketIndicatorSeries_market_region_class_tier_idx"
  ON "MarketIndicatorSeries"("market", "region", "assetClass", "assetTier", "indicatorKey", "observationDate");
