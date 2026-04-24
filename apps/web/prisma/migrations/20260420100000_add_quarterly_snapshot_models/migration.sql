-- CreateEnum
CREATE TYPE "QuarterlyNarrativeStatus" AS ENUM ('DRAFT', 'HUMAN_REVIEWED', 'PUBLISHED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuarterlyMarketSnapshot" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "submarket" TEXT NOT NULL,
    "assetClass" "AssetClass",
    "quarter" TEXT NOT NULL,
    "quarterEndDate" TIMESTAMP(3) NOT NULL,
    "transactionCount" INTEGER,
    "transactionVolumeKrw" BIGINT,
    "medianPriceKrwPerSqm" DECIMAL(18,2),
    "priceChangeQoQPct" DECIMAL(10,4),
    "priceChangeYoYPct" DECIMAL(10,4),
    "vacancyPct" DECIMAL(6,3),
    "rentKrwPerSqm" DECIMAL(12,2),
    "capRatePct" DECIMAL(6,3),
    "newConstructionApprovalsCount" INTEGER,
    "newConstructionApprovalsGfaSqm" DECIMAL(18,2),
    "baseRatePct" DECIMAL(6,3),
    "krwUsd" DECIMAL(12,4),
    "cpiYoYPct" DECIMAL(6,3),
    "gdpYoYPct" DECIMAL(6,3),
    "rawMetrics" JSONB NOT NULL,
    "sourceManifest" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterlyMarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "QuarterlyMarketNarrative" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" "QuarterlyNarrativeStatus" NOT NULL DEFAULT 'DRAFT',
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "headline" TEXT NOT NULL,
    "marketPulse" TEXT NOT NULL,
    "supplyPipeline" TEXT NOT NULL,
    "capitalMarkets" TEXT NOT NULL,
    "outlook" TEXT NOT NULL,
    "overweightList" JSONB NOT NULL,
    "underweightList" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "priorQuarterId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuarterlyMarketNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyMarketSnapshot_market_submarket_assetClass_quarter_key" ON "QuarterlyMarketSnapshot"("market", "submarket", "assetClass", "quarter");

-- CreateIndex
CREATE INDEX "QuarterlyMarketSnapshot_quarter_idx" ON "QuarterlyMarketSnapshot"("quarter");

-- CreateIndex
CREATE INDEX "QuarterlyMarketSnapshot_market_submarket_idx" ON "QuarterlyMarketSnapshot"("market", "submarket");

-- CreateIndex
CREATE INDEX "QuarterlyMarketNarrative_snapshotId_idx" ON "QuarterlyMarketNarrative"("snapshotId");

-- CreateIndex
CREATE INDEX "QuarterlyMarketNarrative_status_idx" ON "QuarterlyMarketNarrative"("status");

-- AddForeignKey
ALTER TABLE "QuarterlyMarketNarrative" ADD CONSTRAINT "QuarterlyMarketNarrative_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "QuarterlyMarketSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
