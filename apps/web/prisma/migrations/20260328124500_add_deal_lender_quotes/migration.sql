-- CreateEnum
CREATE TYPE "DealLenderQuoteStatus" AS ENUM (
  'INDICATED',
  'TERM_SHEET',
  'CREDIT_APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'CLOSED'
);

-- CreateTable
CREATE TABLE "DealLenderQuote" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "counterpartyId" TEXT,
  "status" "DealLenderQuoteStatus" NOT NULL DEFAULT 'INDICATED',
  "facilityLabel" TEXT NOT NULL,
  "amountKrw" DOUBLE PRECISION NOT NULL,
  "ltvPct" DOUBLE PRECISION,
  "spreadBps" DOUBLE PRECISION,
  "allInRatePct" DOUBLE PRECISION,
  "dscrFloor" DOUBLE PRECISION,
  "termMonths" INTEGER,
  "ioMonths" INTEGER,
  "quotedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealLenderQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealLenderQuote_dealId_quotedAt_createdAt_idx" ON "DealLenderQuote"("dealId", "quotedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DealLenderQuote_dealId_status_updatedAt_idx" ON "DealLenderQuote"("dealId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "DealLenderQuote_counterpartyId_createdAt_idx" ON "DealLenderQuote"("counterpartyId", "createdAt");

-- AddForeignKey
ALTER TABLE "DealLenderQuote"
ADD CONSTRAINT "DealLenderQuote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealLenderQuote"
ADD CONSTRAINT "DealLenderQuote_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
