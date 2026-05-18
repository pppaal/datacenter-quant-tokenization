-- Reconciles five models that drifted into schema.prisma without an
-- accompanying migration: DataCenterDetail, OfficeDetail,
-- DataCenterMarketDetail, MacroSeries, MacroFactor. Each statement uses
-- IF NOT EXISTS so the migration is safe to apply against a database that
-- was bootstrapped with `prisma db push`.

-- DataCenterDetail
CREATE TABLE IF NOT EXISTS "DataCenterDetail" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "powerCapacityMw" DOUBLE PRECISION,
    "targetItLoadMw" DOUBLE PRECISION,
    "pueTarget" DOUBLE PRECISION,
    "utilityName" TEXT,
    "substationDistanceKm" DOUBLE PRECISION,
    "renewablePct" DOUBLE PRECISION,
    "redundancyTier" TEXT,
    "coolingType" TEXT,
    "fiberAccess" TEXT,
    "latencyProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataCenterDetail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataCenterDetail_assetId_key" ON "DataCenterDetail"("assetId");

DO $$ BEGIN
  ALTER TABLE "DataCenterDetail"
    ADD CONSTRAINT "DataCenterDetail_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OfficeDetail
CREATE TABLE IF NOT EXISTS "OfficeDetail" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "stabilizedRentPerSqmMonthKrw" DOUBLE PRECISION,
    "otherIncomeKrw" DOUBLE PRECISION,
    "vacancyAllowancePct" DOUBLE PRECISION,
    "creditLossPct" DOUBLE PRECISION,
    "tenantImprovementReserveKrw" DOUBLE PRECISION,
    "leasingCommissionReserveKrw" DOUBLE PRECISION,
    "annualCapexReserveKrw" DOUBLE PRECISION,
    "weightedAverageLeaseTermYears" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficeDetail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfficeDetail_assetId_key" ON "OfficeDetail"("assetId");

DO $$ BEGIN
  ALTER TABLE "OfficeDetail"
    ADD CONSTRAINT "OfficeDetail_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DataCenterMarketDetail
CREATE TABLE IF NOT EXISTS "DataCenterMarketDetail" (
    "id" TEXT NOT NULL,
    "marketSnapshotId" TEXT NOT NULL,
    "colocationRatePerKwKrw" DOUBLE PRECISION,
    "constructionCostPerMwKrw" DOUBLE PRECISION,
    "aiDemandIndex" DOUBLE PRECISION,
    "utilityQueueMonths" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataCenterMarketDetail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataCenterMarketDetail_marketSnapshotId_key"
    ON "DataCenterMarketDetail"("marketSnapshotId");

DO $$ BEGIN
  ALTER TABLE "DataCenterMarketDetail"
    ADD CONSTRAINT "DataCenterMarketDetail_marketSnapshotId_fkey"
    FOREIGN KEY ("marketSnapshotId") REFERENCES "MarketSnapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MacroSeries
CREATE TABLE IF NOT EXISTS "MacroSeries" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "market" TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "observationDate" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'manual',
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MacroSeries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MacroSeries_market_seriesKey_observationDate_assetId_key"
    ON "MacroSeries"("market", "seriesKey", "observationDate", "assetId");
CREATE INDEX IF NOT EXISTS "MacroSeries_market_seriesKey_observationDate_idx"
    ON "MacroSeries"("market", "seriesKey", "observationDate");

DO $$ BEGIN
  ALTER TABLE "MacroSeries"
    ADD CONSTRAINT "MacroSeries_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MacroFactor
CREATE TABLE IF NOT EXISTS "MacroFactor" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "market" TEXT NOT NULL,
    "factorKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "direction" TEXT NOT NULL,
    "commentary" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'macro-factor-engine',
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MacroFactor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MacroFactor_market_factorKey_observationDate_assetId_key"
    ON "MacroFactor"("market", "factorKey", "observationDate", "assetId");
CREATE INDEX IF NOT EXISTS "MacroFactor_market_factorKey_observationDate_idx"
    ON "MacroFactor"("market", "factorKey", "observationDate");

DO $$ BEGIN
  ALTER TABLE "MacroFactor"
    ADD CONSTRAINT "MacroFactor_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
