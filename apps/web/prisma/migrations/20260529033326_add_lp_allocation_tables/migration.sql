-- Per-LP capital-account allocation tables (optional / additive).
-- Scoped strictly to the new CapitalCallAllocation / DistributionAllocation
-- models. Pre-existing unrelated index-rename drift (DealFlowEntry,
-- DocumentEmbedding, MarketIndicatorSeries, SponsorPriorDeal, TenantDemand,
-- TransactionComp) is intentionally NOT folded in here — it is reconciled
-- separately, per prisma/migrations/20260428080000_reconcile_schema_drift.
-- Guarded with IF NOT EXISTS so the migration is idempotent against drift.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CapitalCallAllocation" (
    "id" TEXT NOT NULL,
    "capitalCallId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "amountKrw" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalCallAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DistributionAllocation" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "amountKrw" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CapitalCallAllocation_investorId_idx" ON "CapitalCallAllocation"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CapitalCallAllocation_capitalCallId_investorId_key" ON "CapitalCallAllocation"("capitalCallId", "investorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DistributionAllocation_investorId_idx" ON "DistributionAllocation"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DistributionAllocation_distributionId_investorId_key" ON "DistributionAllocation"("distributionId", "investorId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CapitalCallAllocation" ADD CONSTRAINT "CapitalCallAllocation_capitalCallId_fkey" FOREIGN KEY ("capitalCallId") REFERENCES "CapitalCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CapitalCallAllocation" ADD CONSTRAINT "CapitalCallAllocation_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
