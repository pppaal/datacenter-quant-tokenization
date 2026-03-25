-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetStage" AS ENUM ('SCREENING', 'LAND_SECURED', 'POWER_REVIEW', 'PERMITTING', 'CONSTRUCTION', 'LIVE', 'STABILIZED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('INTAKE', 'ENRICHING', 'UNDER_REVIEW', 'IC_READY', 'APPROVED', 'DECLINED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('IM', 'POWER_STUDY', 'PERMIT', 'LEASE', 'MODEL', 'SITE_PHOTO', 'GRID_NOTICE', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('FRESH', 'STALE', 'FAILED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RegistryStatus" AS ENUM ('NOT_STARTED', 'READY', 'ANCHORED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'KR',
    "status" "AssetStatus" NOT NULL DEFAULT 'INTAKE',
    "stage" "AssetStage" NOT NULL DEFAULT 'SCREENING',
    "description" TEXT NOT NULL,
    "ownerName" TEXT,
    "sponsorName" TEXT,
    "developmentSummary" TEXT,
    "targetItLoadMw" DOUBLE PRECISION,
    "powerCapacityMw" DOUBLE PRECISION,
    "landAreaSqm" DOUBLE PRECISION,
    "grossFloorAreaSqm" DOUBLE PRECISION,
    "occupancyAssumptionPct" DOUBLE PRECISION,
    "tenantAssumption" TEXT,
    "capexAssumptionKrw" DOUBLE PRECISION,
    "opexAssumptionKrw" DOUBLE PRECISION,
    "financingLtvPct" DOUBLE PRECISION,
    "financingRatePct" DOUBLE PRECISION,
    "currentValuationKrw" DOUBLE PRECISION,
    "lastEnrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "district" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'KR',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "parcelId" TEXT,
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteProfile" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "gridAvailability" TEXT NOT NULL,
    "fiberAccess" TEXT NOT NULL,
    "latencyProfile" TEXT NOT NULL,
    "floodRiskScore" DOUBLE PRECISION,
    "seismicRiskScore" DOUBLE PRECISION,
    "siteNotes" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "zoning" TEXT NOT NULL,
    "buildingCoveragePct" DOUBLE PRECISION,
    "floorAreaRatioPct" DOUBLE PRECISION,
    "grossFloorAreaSqm" DOUBLE PRECISION,
    "structureDescription" TEXT,
    "redundancyTier" TEXT,
    "coolingType" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "permitStage" TEXT NOT NULL,
    "zoningApprovalStatus" TEXT NOT NULL,
    "environmentalReviewStatus" TEXT NOT NULL,
    "powerApprovalStatus" TEXT NOT NULL,
    "timelineNotes" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermitSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergySnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "utilityName" TEXT NOT NULL,
    "substationDistanceKm" DOUBLE PRECISION,
    "tariffKrwPerKwh" DOUBLE PRECISION,
    "renewableAvailabilityPct" DOUBLE PRECISION,
    "pueTarget" DOUBLE PRECISION,
    "backupFuelHours" DOUBLE PRECISION,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "metroRegion" TEXT NOT NULL,
    "vacancyPct" DOUBLE PRECISION,
    "colocationRatePerKwKrw" DOUBLE PRECISION,
    "capRatePct" DOUBLE PRECISION,
    "debtCostPct" DOUBLE PRECISION,
    "inflationPct" DOUBLE PRECISION,
    "constructionCostPerMwKrw" DOUBLE PRECISION,
    "discountRatePct" DOUBLE PRECISION,
    "marketNotes" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationRun" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "runLabel" TEXT NOT NULL,
    "status" "ValuationStatus" NOT NULL DEFAULT 'COMPLETED',
    "engineVersion" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "baseCaseValueKrw" DOUBLE PRECISION NOT NULL,
    "underwritingMemo" TEXT NOT NULL,
    "keyRisks" TEXT[],
    "ddChecklist" TEXT[],
    "assumptions" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValuationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationScenario" (
    "id" TEXT NOT NULL,
    "valuationRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valuationKrw" DOUBLE PRECISION NOT NULL,
    "impliedYieldPct" DOUBLE PRECISION,
    "exitCapRatePct" DOUBLE PRECISION,
    "debtServiceCoverage" DOUBLE PRECISION,
    "notes" TEXT NOT NULL,
    "scenarioOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceLink" TEXT,
    "aiSummary" TEXT,
    "documentHash" TEXT NOT NULL,
    "latestStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sourceLink" TEXT,
    "extractedText" TEXT,
    "aiSummary" TEXT,
    "documentHash" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCache" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "freshnessLabel" TEXT NOT NULL,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceOverride" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "assetId" TEXT,
    "payload" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RwaProject" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "registryStatus" "RegistryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "registryName" TEXT NOT NULL,
    "chainName" TEXT,
    "tokenizationPhase" TEXT NOT NULL,
    "legalStructure" TEXT,
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RwaProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainRecord" (
    "id" TEXT NOT NULL,
    "rwaProjectId" TEXT NOT NULL,
    "documentId" TEXT,
    "recordType" TEXT NOT NULL,
    "txHash" TEXT,
    "chainId" TEXT,
    "status" "RegistryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "payload" JSONB NOT NULL,
    "anchoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnchainRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_slug_key" ON "Asset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Address_assetId_key" ON "Address"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteProfile_assetId_key" ON "SiteProfile"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingSnapshot_assetId_key" ON "BuildingSnapshot"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "PermitSnapshot_assetId_key" ON "PermitSnapshot"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EnergySnapshot_assetId_key" ON "EnergySnapshot"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_assetId_key" ON "MarketSnapshot"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ValuationScenario_valuationRunId_name_key" ON "ValuationScenario"("valuationRunId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCache_sourceSystem_cacheKey_key" ON "SourceCache"("sourceSystem", "cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "SourceOverride_sourceSystem_cacheKey_key" ON "SourceOverride"("sourceSystem", "cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "RwaProject_assetId_key" ON "RwaProject"("assetId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteProfile" ADD CONSTRAINT "SiteProfile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingSnapshot" ADD CONSTRAINT "BuildingSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitSnapshot" ADD CONSTRAINT "PermitSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergySnapshot" ADD CONSTRAINT "EnergySnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationRun" ADD CONSTRAINT "ValuationRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationRun" ADD CONSTRAINT "ValuationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationScenario" ADD CONSTRAINT "ValuationScenario_valuationRunId_fkey" FOREIGN KEY ("valuationRunId") REFERENCES "ValuationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceOverride" ADD CONSTRAINT "SourceOverride_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceOverride" ADD CONSTRAINT "SourceOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RwaProject" ADD CONSTRAINT "RwaProject_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainRecord" ADD CONSTRAINT "OnchainRecord_rwaProjectId_fkey" FOREIGN KEY ("rwaProjectId") REFERENCES "RwaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainRecord" ADD CONSTRAINT "OnchainRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
