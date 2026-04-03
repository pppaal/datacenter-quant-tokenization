CREATE TABLE "MarketUniverse" (
  "id" TEXT NOT NULL,
  "marketKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'KR',
  "assetClass" "AssetClass",
  "thesis" TEXT,
  "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketUniverse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketUniverse_marketKey_key" ON "MarketUniverse"("marketKey");
CREATE INDEX "MarketUniverse_country_assetClass_updatedAt_idx" ON "MarketUniverse"("country", "assetClass", "updatedAt");

CREATE TABLE "Submarket" (
  "id" TEXT NOT NULL,
  "marketUniverseId" TEXT NOT NULL,
  "submarketKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "city" TEXT,
  "district" TEXT,
  "assetClass" "AssetClass",
  "thesis" TEXT,
  "statusLabel" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Submarket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Submarket_marketUniverseId_submarketKey_key" ON "Submarket"("marketUniverseId", "submarketKey");
CREATE INDEX "Submarket_assetClass_city_updatedAt_idx" ON "Submarket"("assetClass", "city", "updatedAt");

CREATE TABLE "ResearchSnapshot" (
  "id" TEXT NOT NULL,
  "snapshotKey" TEXT NOT NULL,
  "assetId" TEXT,
  "marketUniverseId" TEXT,
  "submarketId" TEXT,
  "snapshotType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "sourceSystem" TEXT,
  "freshnessStatus" "SourceStatus",
  "freshnessLabel" TEXT,
  "metrics" JSONB,
  "provenance" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResearchSnapshot_snapshotKey_key" ON "ResearchSnapshot"("snapshotKey");
CREATE INDEX "ResearchSnapshot_assetId_snapshotType_snapshotDate_idx" ON "ResearchSnapshot"("assetId", "snapshotType", "snapshotDate");
CREATE INDEX "ResearchSnapshot_marketUniverseId_snapshotType_snapshotDate_idx" ON "ResearchSnapshot"("marketUniverseId", "snapshotType", "snapshotDate");
CREATE INDEX "ResearchSnapshot_submarketId_snapshotType_snapshotDate_idx" ON "ResearchSnapshot"("submarketId", "snapshotType", "snapshotDate");

CREATE TABLE "CoverageTask" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "marketUniverseId" TEXT,
  "submarketId" TEXT,
  "taskType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "sourceSystem" TEXT,
  "freshnessLabel" TEXT,
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoverageTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoverageTask_status_priority_dueDate_idx" ON "CoverageTask"("status", "priority", "dueDate");
CREATE INDEX "CoverageTask_assetId_status_updatedAt_idx" ON "CoverageTask"("assetId", "status", "updatedAt");
CREATE INDEX "CoverageTask_marketUniverseId_status_updatedAt_idx" ON "CoverageTask"("marketUniverseId", "status", "updatedAt");
CREATE INDEX "CoverageTask_submarketId_status_updatedAt_idx" ON "CoverageTask"("submarketId", "status", "updatedAt");

ALTER TABLE "Submarket" ADD CONSTRAINT "Submarket_marketUniverseId_fkey" FOREIGN KEY ("marketUniverseId") REFERENCES "MarketUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_marketUniverseId_fkey" FOREIGN KEY ("marketUniverseId") REFERENCES "MarketUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_submarketId_fkey" FOREIGN KEY ("submarketId") REFERENCES "Submarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoverageTask" ADD CONSTRAINT "CoverageTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoverageTask" ADD CONSTRAINT "CoverageTask_marketUniverseId_fkey" FOREIGN KEY ("marketUniverseId") REFERENCES "MarketUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoverageTask" ADD CONSTRAINT "CoverageTask_submarketId_fkey" FOREIGN KEY ("submarketId") REFERENCES "Submarket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
