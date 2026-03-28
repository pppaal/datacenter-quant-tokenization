-- CreateEnum
CREATE TYPE "DealBidStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'COUNTERED',
  'BAFO',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN'
);

-- CreateTable
CREATE TABLE "DealBidRevision" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "counterpartyId" TEXT,
  "label" TEXT NOT NULL,
  "status" "DealBidStatus" NOT NULL DEFAULT 'DRAFT',
  "bidPriceKrw" DOUBLE PRECISION NOT NULL,
  "depositKrw" DOUBLE PRECISION,
  "exclusivityDays" INTEGER,
  "diligenceDays" INTEGER,
  "closeTimelineDays" INTEGER,
  "submittedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealBidRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealBidRevision_dealId_submittedAt_createdAt_idx" ON "DealBidRevision"("dealId", "submittedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DealBidRevision_dealId_status_updatedAt_idx" ON "DealBidRevision"("dealId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DealBidRevision_counterpartyId_createdAt_idx" ON "DealBidRevision"("counterpartyId", "createdAt");

-- AddForeignKey
ALTER TABLE "DealBidRevision"
ADD CONSTRAINT "DealBidRevision_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealBidRevision"
ADD CONSTRAINT "DealBidRevision_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
