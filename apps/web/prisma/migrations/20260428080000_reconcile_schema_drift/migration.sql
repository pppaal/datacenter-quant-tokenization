-- Reconciles long-running drift between schema.prisma and the migration
-- chain that accumulated while the team was iterating with `prisma db push`.
-- Every statement is idempotent so this migration is safe whether the
-- target DB was bootstrapped from the migration chain, from `db push`, or
-- somewhere in between. Source of truth: `prisma migrate diff
-- --from-migrations ... --to-schema-datamodel ...`.

-- ---------------------------------------------------------------------------
-- Asset table additions (assetClass, etc.)
-- ---------------------------------------------------------------------------
ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "assetClass" "AssetClass" NOT NULL DEFAULT 'DATA_CENTER',
  ADD COLUMN IF NOT EXISTS "assetSubtype" TEXT,
  ADD COLUMN IF NOT EXISTS "exitCapRatePct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "holdingPeriodYears" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "purchasePriceKrw" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rentableAreaSqm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stabilizedOccupancyPct" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- Counterparty addition
-- ---------------------------------------------------------------------------
ALTER TABLE "Counterparty" ADD COLUMN IF NOT EXISTS "shortName" TEXT;

-- ---------------------------------------------------------------------------
-- Drop the deprecated SourceCitation linkage from MacroSeries.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "MacroSeries" DROP CONSTRAINT "MacroSeries_citationId_fkey";
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DROP INDEX IF EXISTS "MacroSeries_citationId_idx";

ALTER TABLE "MacroSeries" DROP COLUMN IF EXISTS "citationId";

DROP TABLE IF EXISTS "SourceCitation";

-- ---------------------------------------------------------------------------
-- Drop indexes that were removed from schema.prisma.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "Counterparty_dealId_coverageStatus_lastContactAt_idx";
DROP INDEX IF EXISTS "Deal_originationSource_stage_idx";

-- ---------------------------------------------------------------------------
-- Cosmetic: drop redundant `updatedAt` defaults that Prisma tracks via
-- @updatedAt rather than via a database default.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'AdminIdentityBinding','Budget','BudgetLineItem','BusinessPlan',
    'CapexProject','CapitalCall','Commitment','CovenantTest','CoverageTask',
    'DdqResponse','Distribution','ExitCase','Fund','Investor','InvestorReport',
    'LeaseRollSnapshot','MacroProfileOverride','Mandate','MarketUniverse',
    'MonthlyAssetKpi','Portfolio','PortfolioAsset','ResearchSnapshot',
    'Submarket','Vehicle'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', tbl, 'updatedAt');
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      -- table or column missing -- ignore so the migration stays portable
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Index renames: skip if the new name already exists or the old name is
-- absent (idempotent).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CapexProject_portfolioAssetId_statusLabel_targetCompletionDate_')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CapexProject_portfolioAssetId_statusLabel_targetCompletionD_idx') THEN
    EXECUTE 'ALTER INDEX "CapexProject_portfolioAssetId_statusLabel_targetCompletionDate_" RENAME TO "CapexProject_portfolioAssetId_statusLabel_targetCompletionD_idx"';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MarketIndicatorSeries_market_region_indicatorKey_observationDat')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'MarketIndicatorSeries_market_region_indicatorKey_observatio_idx') THEN
    EXECUTE 'ALTER INDEX "MarketIndicatorSeries_market_region_indicatorKey_observationDat" RENAME TO "MarketIndicatorSeries_market_region_indicatorKey_observatio_idx"';
  END IF;
END $$;
