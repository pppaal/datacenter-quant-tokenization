-- CreateTable
CREATE TABLE "DealExecutionProbabilitySnapshot" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "snapshotReason" TEXT NOT NULL,
    "readinessScorePct" DOUBLE PRECISION NOT NULL,
    "readinessBlockerCount" INTEGER NOT NULL,
    "closeProbabilityPct" DOUBLE PRECISION NOT NULL,
    "closeProbabilityBand" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "openRiskCount" INTEGER NOT NULL,
    "overdueTaskCount" INTEGER NOT NULL,
    "hasAcceptedBid" BOOLEAN NOT NULL DEFAULT false,
    "hasApprovedFinancing" BOOLEAN NOT NULL DEFAULT false,
    "hasLiveExclusivity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealExecutionProbabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealExecutionProbabilitySnapshot_dealId_createdAt_idx" ON "DealExecutionProbabilitySnapshot"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "DealExecutionProbabilitySnapshot_dealId_closeProbabilityBan_idx" ON "DealExecutionProbabilitySnapshot"("dealId", "closeProbabilityBand", "createdAt");

-- AddForeignKey
ALTER TABLE "DealExecutionProbabilitySnapshot" ADD CONSTRAINT "DealExecutionProbabilitySnapshot_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
