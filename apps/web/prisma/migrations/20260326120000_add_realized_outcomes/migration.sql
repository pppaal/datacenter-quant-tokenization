CREATE TABLE "RealizedOutcome" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "occupancyPct" DOUBLE PRECISION,
    "noiKrw" DOUBLE PRECISION,
    "rentGrowthPct" DOUBLE PRECISION,
    "valuationKrw" DOUBLE PRECISION,
    "debtServiceCoverage" DOUBLE PRECISION,
    "exitCapRatePct" DOUBLE PRECISION,
    "notes" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'manual_realized_capture',
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealizedOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealizedOutcome_assetId_observationDate_key" ON "RealizedOutcome"("assetId", "observationDate");
CREATE INDEX "RealizedOutcome_assetId_observationDate_idx" ON "RealizedOutcome"("assetId", "observationDate");

ALTER TABLE "RealizedOutcome"
ADD CONSTRAINT "RealizedOutcome_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
