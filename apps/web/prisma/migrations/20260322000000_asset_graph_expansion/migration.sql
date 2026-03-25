-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "landUseType" TEXT,
    "zoningCode" TEXT,
    "landAreaSqm" DOUBLE PRECISION,
    "officialLandValueKrw" DOUBLE PRECISION,
    "roadAccess" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "buildingIdentifier" TEXT,
    "buildingName" TEXT,
    "useType" TEXT,
    "approvalDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "floorCount" INTEGER,
    "basementCount" INTEGER,
    "grossFloorAreaSqm" DOUBLE PRECISION,
    "rentableAreaSqm" DOUBLE PRECISION,
    "structureType" TEXT,
    "occupancyCertificate" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningConstraint" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "constraintType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "entityType" TEXT,
    "ownershipPct" DOUBLE PRECISION,
    "effectiveDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnershipRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncumbranceRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "encumbranceType" TEXT NOT NULL,
    "holderName" TEXT,
    "securedAmountKrw" DOUBLE PRECISION,
    "priorityRank" INTEGER,
    "effectiveDate" TIMESTAMP(3),
    "releaseDate" TIMESTAMP(3),
    "statusLabel" TEXT,
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncumbranceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionComp" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "market" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "comparableType" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3),
    "priceKrw" DOUBLE PRECISION,
    "pricePerSqmKrw" DOUBLE PRECISION,
    "pricePerMwKrw" DOUBLE PRECISION,
    "capRatePct" DOUBLE PRECISION,
    "buyerType" TEXT,
    "sellerType" TEXT,
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionComp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentComp" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "market" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "comparableType" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3),
    "monthlyRentPerSqmKrw" DOUBLE PRECISION,
    "monthlyRatePerKwKrw" DOUBLE PRECISION,
    "occupancyPct" DOUBLE PRECISION,
    "escalationPct" DOUBLE PRECISION,
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentComp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketIndicatorSeries" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "market" TEXT NOT NULL,
    "region" TEXT,
    "indicatorKey" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIndicatorSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineProject" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "projectName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "region" TEXT,
    "stageLabel" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "expectedPowerMw" DOUBLE PRECISION,
    "expectedAreaSqm" DOUBLE PRECISION,
    "sponsorName" TEXT,
    "sourceLink" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoFeature" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "unit" TEXT,
    "geometryRef" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatelliteScene" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sceneIdentifier" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "cloudCoverPct" DOUBLE PRECISION,
    "resolutionMeters" DOUBLE PRECISION,
    "sceneUrl" TEXT,
    "footprintRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatelliteScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatelliteObservation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "satelliteSceneId" TEXT,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION,
    "metricText" TEXT,
    "unit" TEXT,
    "geometryRef" TEXT,
    "rasterRef" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "freshnessLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SatelliteObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardObservation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "satelliteSceneId" TEXT,
    "hazardType" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "geometryRef" TEXT,
    "rasterRef" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceSceneId" TEXT,
    "freshnessLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HazardObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionProgressObservation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "satelliteSceneId" TEXT,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "progressPct" DOUBLE PRECISION,
    "changeScore" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "method" TEXT NOT NULL,
    "imageRef" TEXT,
    "note" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionProgressObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractionRun" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawOutput" JSONB,
    "structuredOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "embeddingVectorRef" TEXT,
    "pageNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFact" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "documentVersionId" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "factValueText" TEXT,
    "factValueNumber" DOUBLE PRECISION,
    "factValueDate" TIMESTAMP(3),
    "unit" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "extractionRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureNamespace" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureValue" (
    "id" TEXT NOT NULL,
    "assetFeatureSnapshotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "numberValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "jsonValue" JSONB,
    "unit" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "valuationRunId" TEXT,
    "documentVersionId" TEXT,
    "insightType" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "evidence" JSONB,
    "modelName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parcel_assetId_parcelId_idx" ON "Parcel"("assetId", "parcelId");

-- CreateIndex
CREATE INDEX "BuildingRecord_assetId_completionDate_idx" ON "BuildingRecord"("assetId", "completionDate");

-- CreateIndex
CREATE INDEX "PlanningConstraint_assetId_constraintType_idx" ON "PlanningConstraint"("assetId", "constraintType");

-- CreateIndex
CREATE INDEX "OwnershipRecord_assetId_effectiveDate_idx" ON "OwnershipRecord"("assetId", "effectiveDate");

-- CreateIndex
CREATE INDEX "EncumbranceRecord_assetId_encumbranceType_effectiveDate_idx" ON "EncumbranceRecord"("assetId", "encumbranceType", "effectiveDate");

-- CreateIndex
CREATE INDEX "TransactionComp_assetId_transactionDate_idx" ON "TransactionComp"("assetId", "transactionDate");

-- CreateIndex
CREATE INDEX "TransactionComp_market_region_transactionDate_idx" ON "TransactionComp"("market", "region", "transactionDate");

-- CreateIndex
CREATE INDEX "RentComp_assetId_observationDate_idx" ON "RentComp"("assetId", "observationDate");

-- CreateIndex
CREATE INDEX "RentComp_market_region_observationDate_idx" ON "RentComp"("market", "region", "observationDate");

-- CreateIndex
CREATE INDEX "MarketIndicatorSeries_assetId_indicatorKey_observationDate_idx" ON "MarketIndicatorSeries"("assetId", "indicatorKey", "observationDate");

-- CreateIndex
CREATE INDEX "MarketIndicatorSeries_market_region_indicatorKey_observationDate_idx" ON "MarketIndicatorSeries"("market", "region", "indicatorKey", "observationDate");

-- CreateIndex
CREATE INDEX "PipelineProject_market_region_expectedDeliveryDate_idx" ON "PipelineProject"("market", "region", "expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "GeoFeature_assetId_featureType_featureKey_idx" ON "GeoFeature"("assetId", "featureType", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "SatelliteScene_sourceSystem_sceneIdentifier_key" ON "SatelliteScene"("sourceSystem", "sceneIdentifier");

-- CreateIndex
CREATE INDEX "SatelliteScene_assetId_capturedAt_idx" ON "SatelliteScene"("assetId", "capturedAt");

-- CreateIndex
CREATE INDEX "SatelliteObservation_assetId_metricKey_observationDate_idx" ON "SatelliteObservation"("assetId", "metricKey", "observationDate");

-- CreateIndex
CREATE INDEX "HazardObservation_assetId_hazardType_observationDate_idx" ON "HazardObservation"("assetId", "hazardType", "observationDate");

-- CreateIndex
CREATE INDEX "ConstructionProgressObservation_assetId_observationDate_idx" ON "ConstructionProgressObservation"("assetId", "observationDate");

-- CreateIndex
CREATE INDEX "DocumentExtractionRun_documentVersionId_taskType_createdAt_idx" ON "DocumentExtractionRun"("documentVersionId", "taskType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentVersionId_chunkIndex_key" ON "DocumentChunk"("documentVersionId", "chunkIndex");

-- CreateIndex
CREATE INDEX "DocumentFact_assetId_factType_factKey_idx" ON "DocumentFact"("assetId", "factType", "factKey");

-- CreateIndex
CREATE INDEX "DocumentFact_documentVersionId_factType_idx" ON "DocumentFact"("documentVersionId", "factType");

-- CreateIndex
CREATE INDEX "AssetFeatureSnapshot_assetId_featureNamespace_snapshotDate_idx" ON "AssetFeatureSnapshot"("assetId", "featureNamespace", "snapshotDate");

-- CreateIndex
CREATE INDEX "FeatureValue_assetFeatureSnapshotId_key_idx" ON "FeatureValue"("assetFeatureSnapshotId", "key");

-- CreateIndex
CREATE INDEX "AiInsight_assetId_insightType_createdAt_idx" ON "AiInsight"("assetId", "insightType", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_valuationRunId_insightType_idx" ON "AiInsight"("valuationRunId", "insightType");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingRecord" ADD CONSTRAINT "BuildingRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningConstraint" ADD CONSTRAINT "PlanningConstraint_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipRecord" ADD CONSTRAINT "OwnershipRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncumbranceRecord" ADD CONSTRAINT "EncumbranceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionComp" ADD CONSTRAINT "TransactionComp_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentComp" ADD CONSTRAINT "RentComp_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketIndicatorSeries" ADD CONSTRAINT "MarketIndicatorSeries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineProject" ADD CONSTRAINT "PipelineProject_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoFeature" ADD CONSTRAINT "GeoFeature_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatelliteScene" ADD CONSTRAINT "SatelliteScene_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatelliteObservation" ADD CONSTRAINT "SatelliteObservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatelliteObservation" ADD CONSTRAINT "SatelliteObservation_satelliteSceneId_fkey" FOREIGN KEY ("satelliteSceneId") REFERENCES "SatelliteScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardObservation" ADD CONSTRAINT "HazardObservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardObservation" ADD CONSTRAINT "HazardObservation_satelliteSceneId_fkey" FOREIGN KEY ("satelliteSceneId") REFERENCES "SatelliteScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionProgressObservation" ADD CONSTRAINT "ConstructionProgressObservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionProgressObservation" ADD CONSTRAINT "ConstructionProgressObservation_satelliteSceneId_fkey" FOREIGN KEY ("satelliteSceneId") REFERENCES "SatelliteScene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractionRun" ADD CONSTRAINT "DocumentExtractionRun_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFact" ADD CONSTRAINT "DocumentFact_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFact" ADD CONSTRAINT "DocumentFact_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFact" ADD CONSTRAINT "DocumentFact_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "DocumentExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFeatureSnapshot" ADD CONSTRAINT "AssetFeatureSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFeatureSnapshot" ADD CONSTRAINT "AssetFeatureSnapshot_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureValue" ADD CONSTRAINT "FeatureValue_assetFeatureSnapshotId_fkey" FOREIGN KEY ("assetFeatureSnapshotId") REFERENCES "AssetFeatureSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_valuationRunId_fkey" FOREIGN KEY ("valuationRunId") REFERENCES "ValuationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
