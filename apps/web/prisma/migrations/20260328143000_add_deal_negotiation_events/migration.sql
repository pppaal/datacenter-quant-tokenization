-- CreateEnum
CREATE TYPE "DealNegotiationEventType" AS ENUM (
  'SELLER_COUNTER',
  'BUYER_FEEDBACK',
  'EXCLUSIVITY_GRANTED',
  'EXCLUSIVITY_EXTENDED',
  'PROCESS_UPDATE'
);

-- CreateTable
CREATE TABLE "DealNegotiationEvent" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "counterpartyId" TEXT,
  "bidRevisionId" TEXT,
  "eventType" "DealNegotiationEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealNegotiationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealNegotiationEvent_dealId_effectiveAt_createdAt_idx" ON "DealNegotiationEvent"("dealId", "effectiveAt", "createdAt");

-- CreateIndex
CREATE INDEX "DealNegotiationEvent_dealId_eventType_updatedAt_idx" ON "DealNegotiationEvent"("dealId", "eventType", "updatedAt");

-- CreateIndex
CREATE INDEX "DealNegotiationEvent_counterpartyId_createdAt_idx" ON "DealNegotiationEvent"("counterpartyId", "createdAt");

-- CreateIndex
CREATE INDEX "DealNegotiationEvent_bidRevisionId_createdAt_idx" ON "DealNegotiationEvent"("bidRevisionId", "createdAt");

-- AddForeignKey
ALTER TABLE "DealNegotiationEvent"
ADD CONSTRAINT "DealNegotiationEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealNegotiationEvent"
ADD CONSTRAINT "DealNegotiationEvent_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealNegotiationEvent"
ADD CONSTRAINT "DealNegotiationEvent_bidRevisionId_fkey" FOREIGN KEY ("bidRevisionId") REFERENCES "DealBidRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
